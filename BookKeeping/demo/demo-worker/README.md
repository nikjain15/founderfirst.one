# demo-worker — Cloudflare Worker proxy (source)

This folder holds the **source** of the Cloudflare Worker that the Penny
demo browser client talks to. The deployed Worker runs at
`https://penny-api.nikjain1588.workers.dev`.

The Worker exists for one reason: **the Anthropic API key must not ship to
the browser.** Every `renderPenny` call from the client hits this Worker,
which validates the demo token, forwards to Anthropic, and streams the
response back.

---

## Responsibilities

1. **Hold the Anthropic API key** as a Cloudflare secret. Never exposed to
   the client.
2. **Validate the demo token** — `X-Demo-Token: ff-demo-2026`. Reject any
   request missing it or with the wrong value.
3. **Rate limit** by IP and token. The demo is public; abuse protection is
   essential. Target: 60 requests per minute per IP, 1,000 per day per
   token.
4. **Forward to Anthropic** `/v1/messages` with the client's model,
   system prompt, and user message.
5. **Log** — request id, model, token count, latency, status. No bodies.
6. **CORS** — allow the demo's deployed origin only.

---

## File layout (to be added by the person deploying)

```
demo-worker/
├── README.md           ← this file
├── wrangler.toml       ← Cloudflare config (name, routes, secret bindings)
├── src/
│   └── worker.ts       ← the Worker source
└── package.json
```

## Secrets

Set via `wrangler secret put`:

- `ANTHROPIC_API_KEY` — the Anthropic key.
- `DEMO_TOKEN` — currently `ff-demo-2026`. Rotate freely.

## Deploy

```bash
wrangler deploy
```

## Local dev against a local Worker

```bash
wrangler dev
```

Then override `window.PENNY_CONFIG.workerUrl` in the browser console to
`http://127.0.0.1:8787` before clicking anything.

---

## Why source lives here

The browser demo would work fine without the Worker source being in the
repo. But anyone auditing the demo or forking it to run their own copy
needs to see what the Worker does. Keeping it adjacent to the client
means the contract between them never drifts.
