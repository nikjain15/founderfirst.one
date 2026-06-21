# Discord bridge — deploy + publish

The bridge is a thin relay between Discord's gateway WebSocket and the
Cloudflare Worker. No opinions about voice or context — all of that lives in
the Worker (`site-bubble/worker`). See
`../../apps/admin/support-management/DISCORD-BRIDGE-SPEC.md` for the why; this
README is just the how.

Single implementation: `bridge.ts` (discord.js / TypeScript), built by
`Dockerfile`, deployed to Fly.io as app `founderfirst-discord-bridge`.

## What you'll need

- `flyctl` authed to the account that owns `founderfirst-discord-bridge`.
- The Discord bot token + your server's guild id.
- A Discord **category** id where per-user private channels live
  (e.g. `── Penny private ──`).
- The bridge secret set on the Worker with
  `wrangler secret put DISCORD_BRIDGE_SECRET` — the same value goes on the app.

## Secrets (set once on the Fly app)

```
flyctl secrets set -a founderfirst-discord-bridge \
  DISCORD_BOT_TOKEN=... \
  DISCORD_GUILD_ID=... \
  DISCORD_USER_CHANNEL_PARENT_ID=... \
  BRIDGE_SECRET=...
```

`WORKER_BASE_URL` and `ADMIN_POLL_INTERVAL_SECONDS` are non-secret and live in
`fly.toml [env]`.

## Deploy / update

```
cd scripts/discord-bridge
npm install          # if dependencies changed
npm run typecheck    # must pass
flyctl deploy        # remote build; the running machine is replaced
```

Watch `flyctl logs -a founderfirst-discord-bridge` — you should see
`logged in as <bot-name>; syncing slash commands` within a few seconds.

## Smoke test

From your own Discord account (a member of the server):

1. DM the bot anything. You should get a reply asking you to click a link.
2. Click the link. Confirm your email on the connect page.
3. DM the bot again. A per-user private channel appears in the configured
   category; the bot's reply lands there.
4. Try `/disconnect` in that channel. The bot acknowledges; future DMs
   restart the link flow.

Then check the admin: `/admin/users` → Discord tab. Your row should show
status `confirmed`. Revoke it from the UI and the next message restarts the
link flow.

## When something looks wrong

| Symptom | Where to look |
|---|---|
| Bot doesn't come online | `flyctl logs` — token or guild id wrong? |
| Every reply is "Hi, happy to help…" | Link row never confirmed. Check the admin Discord tab. |
| Worker returns 401 in the logs | `BRIDGE_SECRET` mismatch between the app and the Worker. Re-set on both. |
| Per-user channel visible to everyone | Bot lacks `Manage Channels` on the parent category, or the `view_channel=false` overwrite was dropped. |
| `/disconnect` doesn't appear | Slash sync runs at startup against `DISCORD_GUILD_ID`. Wait ~60s after first launch; redeploy if still missing. |

## Rollback

`flyctl releases -a founderfirst-discord-bridge` lists prior versions;
`flyctl deploy --image <previous-image>` (or `flyctl releases rollback`)
reverts. Nothing in the Worker or DB changes with a bridge deploy, so a
rollback is clean.
