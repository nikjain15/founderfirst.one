# Signals worker (the "brain")

Always-on pull-worker for FounderFirst Signals. It pulls pending posts from
Supabase, scores them locally with Ollama, and drafts promoted leads with the
managed model. No inbound ports — it only makes outbound calls. Part of the
Signals system — see `SIGNALS_SOLUTION.md`.

## What it does each cycle

1. Embeds any new ICP reference examples (`nomic-embed-text`).
2. Claims a batch of `pending` items (atomic — flips them to `scoring`).
3. Per item: keyword prefilter → embed + relevance (cosine vs ICP set) → LLM
   intent score (`gemma2:2b`) → promote or archive.
4. Promoted leads get a brand-voice outreach draft (Anthropic, using the live
   `VOICE.md` via `get_live_voice`).

## Setup on the VM (Lima, aarch64, 4 GiB, CPU-only)

```bash
# 1. Install Ollama + pull the models (small, CPU-friendly)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull gemma2:2b          # ~1.6 GB — scoring
ollama pull nomic-embed-text   # ~0.3 GB — embeddings

# 2. Get this folder onto the VM, install deps
cd signals-worker
npm install

# 3. Configure
cp .env.example .env           # fill SUPABASE_SERVICE_ROLE_KEY + ANTHROPIC_API_KEY

# 4. Run once to test, then as a service
npm run once                   # single cycle, prints what it scored
sudo cp signals-worker.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now signals-worker
journalctl -u signals-worker -f
```

> 4 GiB is tight: `gemma2:2b` + `nomic-embed-text` + Node fit, but don't run a
> larger score model without bumping the VM. To choose the score model, run the
> eval described in `SIGNALS_SOLUTION.md` §8 and set `OLLAMA_SCORE_MODEL`.

## Deploying changes to the live host

The worker isn't in CI — it runs from `~/signals-worker` under launchd
(`one.founderfirst.signals-worker`). To ship changes, run:

```bash
./tools/signals-worker/deploy.sh
```

It syntax-checks, copies the worker files (index/brain/optimizer/providers),
reinstalls deps only if `package.json` changed, appends the sha to
`~/signals-worker/DEPLOYED`, and restarts the service. Logs live in
`~/Library/Logs/founderfirst/signals-worker.{log,err}`.

## Tuning

All thresholds are env vars (`.env`): `REL_THRESHOLD`, `INTENT_THRESHOLD`,
`REL_FLOOR`, `BATCH`, `POLL_INTERVAL_SECONDS`. Raise thresholds for precision,
lower for volume. Keyword and voice edits in the admin are picked up within a
few idle cycles (caches clear when a cycle finds no work).

## Swapping models

Drafting provider/model and Ollama models are all env-driven (`brain.mjs` is the
only file that talks to a model). Bump the VM to 8 GiB and you can move drafting
local too — change the draft path in `brain.mjs`; nothing else changes.

## AI email drafting (compose-server)

> **Status: LIVE (set up 24 Jun 2026).** `COMPOSE_SECRET` is in
> `~/.config/founderfirst/secrets.env` + Supabase; `compose-server` runs under
> launchd `one.founderfirst.compose-server` (127.0.0.1:8787); the named tunnel
> `ff-compose` (`one.founderfirst.compose-tunnel`, KeepAlive) serves
> `https://compose.founderfirst.one`; `COMPOSE_ENDPOINT_URL` is set in Supabase.
> The button works whenever this Mac is awake. The steps below are the original
> one-time setup, kept for reference / rebuilds.
> Gotcha: `cloudflared tunnel login` must be run **interactively by a human** —
> its localhost cert-callback fails from an automated/detached shell.

Powers the **Draft with AI** button in the admin (Settings → Emails → + New
email). The admin can't reach Ollama directly, so the path is:

```
admin (browser, signed-in)
  → email-compose Supabase function (verifies you're an admin)
  → compose-server.mjs on this host, over a Cloudflare Tunnel (shared secret)
  → local Ollama (qwen2.5) → JSON email fields
```

`compose-server.mjs` is a tiny localhost HTTP service (no deps). It reuses the
same Ollama as the scorer. One-time setup on the host:

1. **Pick a shared secret** and add it to `~/.config/founderfirst/secrets.env`:
   ```
   COMPOSE_SECRET=<a long random string>
   # optional: COMPOSE_PORT=8787  OLLAMA_COMPOSE_MODEL=qwen2.5:7b-instruct-q4_K_M
   ```

2. **Run the service** (it reads the secrets file itself):
   ```
   node compose-server.mjs            # foreground test — visit /health
   # or install the launchd agent:
   cp one.founderfirst.compose-server.plist ~/Library/LaunchAgents/
   launchctl load -w ~/Library/LaunchAgents/one.founderfirst.compose-server.plist
   ```

3. **Expose it with a Cloudflare Tunnel** (stable hostname, e.g.
   `compose.founderfirst.one`) pointing at `http://localhost:8787`:
   ```
   cloudflared tunnel create ff-compose
   # route a hostname to it, then in the tunnel config:
   #   ingress:
   #     - hostname: compose.founderfirst.one
   #       service: http://localhost:8787
   #     - service: http_status:404
   cloudflared tunnel run ff-compose
   ```

4. **Tell Supabase where it is** (the function holds the secret, never the
   browser):
   ```
   supabase secrets set COMPOSE_ENDPOINT_URL=https://compose.founderfirst.one
   supabase secrets set COMPOSE_SECRET=<the same long random string>
   ```

Until those two Supabase secrets are set, the **Draft with AI** button returns a
friendly "isn't set up yet" message; everything else in the editor works. Test
end to end with `curl https://compose.founderfirst.one/health`.
