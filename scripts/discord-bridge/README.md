# Discord bridge — deploy + publish

The bridge is a thin Python relay between Discord's gateway WebSocket
and the Cloudflare Worker. ~250 lines, no opinions about voice or
context. See `../../apps/admin/support-management/DISCORD-BRIDGE-SPEC.md`
for the why; this README is just the how.

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
