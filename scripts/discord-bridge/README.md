# Discord bridge — deploy + publish

The bridge is a thin relay between Discord's gateway WebSocket and the
Cloudflare Worker. No opinions about voice or context. See
`../../apps/admin/support-management/DISCORD-BRIDGE-SPEC.md` for the why;
this README is just the how.

## Two implementations (mid-migration)

| File | Runtime | Status |
|---|---|---|
| `bridge.py` + `Dockerfile` | Python / discord.py | **live** (default in `fly.toml`) |
| `bridge.ts` + `Dockerfile.node` | TypeScript / discord.js | new port, not yet live |

The two are behaviourally identical. The TypeScript port exists so the whole
backend is one language (TS, matching the Worker + admin). **Cut over with the
parallel-run steps at the bottom — do not just delete `bridge.py`.**

## What you'll need

- SSH access to the Lightsail VM that runs the existing Dify-based bridge.
- The Discord bot token + your server's guild id.
- A Discord **category** id where per-user private channels will live.
  Create one in Discord first (e.g. `── Penny private ──`) and copy its id.
- The bridge secret you set on the Worker with `wrangler secret put
  DISCORD_BRIDGE_SECRET` — the same value goes into the bridge's `.env`.

## First-time setup on the VM

1. SSH in.
2. Pull this repo (or just `scp` the `scripts/discord-bridge/` folder up):
   ```
   scp -r scripts/discord-bridge ubuntu@<lightsail-ip>:/home/ubuntu/
   ```
3. On the VM:
   ```
   cd ~/discord-bridge
   cp .env.example .env
   nano .env       # fill in the values
   docker build -t ff-bridge .
   ```
4. Start it (replace `dify-bridge` with whatever the old container is
   called — `docker ps` to see):
   ```
   docker stop dify-bridge 2>/dev/null || true
   docker run -d --restart unless-stopped --name ff-bridge --env-file .env ff-bridge
   docker logs -f ff-bridge
   ```
   You should see `logged in as <bot-name>; syncing slash commands` within
   a few seconds.

## Subsequent updates

```
scp -r scripts/discord-bridge ubuntu@<lightsail-ip>:/home/ubuntu/
ssh ubuntu@<lightsail-ip>
cd ~/discord-bridge
docker build -t ff-bridge .
docker stop ff-bridge && docker rm ff-bridge
docker run -d --restart unless-stopped --name ff-bridge --env-file .env ff-bridge
docker logs -f ff-bridge
```

## Smoke test

From your own Discord account (one that's a member of the server):

1. DM the bot anything. You should see a reply asking you to click a link.
2. Click the link. Log in / enter your email on the connect page.
3. DM the bot again. A new private channel appears in the configured
   category. The bot's reply lands there, not in DMs.
4. Try `/disconnect` in that channel. The bot acknowledges; future DMs
   restart the link flow.

Then check the admin: `/admin/users` → Discord tab. Your row should be
listed with status `confirmed`. Revoke it from the UI and the next
message you send should go back to the link flow.

## When something looks wrong

| Symptom | Where to look |
|---|---|
| Bot doesn't come online | `docker logs ff-bridge` — token wrong or guild id wrong? |
| Every reply is "Hi, happy to help…" | Link row never confirmed. Check the admin Discord tab. |
| Worker returns 401 in the logs | `BRIDGE_SECRET` mismatch. Re-set on both sides. |
| Per-user channel is visible to everyone | Bot lacks `Manage Channels` permission on the parent category, OR the `view_channel=False` overwrite was dropped. |
| Slash command `/disconnect` doesn't appear | Sync runs at startup against `DISCORD_GUILD_ID`. Wait ~60s after first launch; restart if still missing. |

## After it runs cleanly for a week

Decommission Dify:

```
docker ps                       # find the Dify containers
docker stop dify dify-worker dify-sandbox ...
docker rm   dify dify-worker dify-sandbox ...
```

You can then shrink the Lightsail VM to the cheapest tier — the bridge
is tiny — or move it to Fly.io's free tier with the same Dockerfile.

## Cutting over from Python to TypeScript (safe, reversible)

The Discord gateway only lets **one** connection per bot token at a time, so
you can't run both bots against the same token simultaneously — the cutover is
a fast swap, not a true parallel run. De-risk it by validating the TS image
first, then swapping with the Python image one command away as rollback.

1. **Validate the TS build locally** (no live connection):
   ```
   cd scripts/discord-bridge
   npm install
   npm run typecheck        # must pass
   docker build -f Dockerfile.node -t ff-bridge-ts .   # must build
   ```
2. **(Optional) Dry-run with a second test bot token** in a test server to see
   it log in, reply, create a channel, and handle `/disconnect`. This is the
   only way to exercise it without touching the live token.
3. **Swap on the host** during a quiet moment:
   ```
   # point fly.toml (or the VM build) at the Node image
   #   build = { dockerfile = "Dockerfile.node" }
   fly deploy            # or: docker build -f Dockerfile.node ... && docker run ...
   ```
   Stopping the Python container frees the token; the TS one connects within
   seconds. Watch `logged in as ...` in the logs.
4. **Smoke test** (same checklist as above): DM the bot, confirm reply,
   per-user channel creation, `/disconnect`, and the admin Discord tab.
5. **Rollback** if anything is off: repoint to the Python `Dockerfile` and
   redeploy. Nothing in the Worker or DB changes, so rollback is clean.
6. **After a week clean**, delete `bridge.py`, `Dockerfile`, `requirements.txt`
   and rename `Dockerfile.node` → `Dockerfile`.
