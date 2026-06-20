# Discord Bridge — handoff spec (the dumb relay)

After SCHEMA-014 + the `/discord/*` endpoints on the Cloudflare Worker land,
the brain moves out of Dify and into the Worker. The Python bridge on
Lightsail keeps existing for one reason only: Discord's gateway needs a
persistent WebSocket connection, which Workers can't hold.

So the bridge becomes ~50 lines of glue:

- Listens to Discord gateway events (DMs, slash commands, reactions, the
  per-user channel creation requests it gets back from the Worker).
- Forwards events to the Worker over HTTPS with a shared secret.
- Posts whatever the Worker replies back to Discord.
- Has zero opinions about voice, prompts, or context. If you find yourself
  adding a `system_prompt = …` or a `tickets_table` query here, stop —
  that belongs in the Worker.

---

## Environment

```
WORKER_BASE_URL=https://bubble.founderfirst.one
BRIDGE_SECRET=<paste same secret as `wrangler secret put DISCORD_BRIDGE_SECRET`>
DISCORD_BOT_TOKEN=<existing>
DISCORD_GUILD_ID=<existing>
DISCORD_USER_CHANNEL_PARENT_ID=<category id where per-user channels live>
```

The `BRIDGE_SECRET` is the one piece the Worker checks before serving any
`/discord/*` endpoint. Rotate it on either side and the bot goes silent
until the other side matches.

---

## Events the bridge handles

### 1. Inbound DM (or message in a per-user channel)

```python
@client.event
async def on_message(msg):
    if msg.author.bot: return
    if not (isinstance(msg.channel, discord.DMChannel) or is_user_channel(msg.channel)):
        return

    res = httpx.post(f"{WORKER_BASE_URL}/discord/dm",
        headers={"Authorization": f"Bearer {BRIDGE_SECRET}"},
        json={
            "discord_user_id":  str(msg.author.id),
            "discord_username": str(msg.author),         # for logging only
            "message":          msg.content,
            "channel_id":       str(msg.channel.id),
        },
        timeout=30,
    ).json()

    if res["kind"] == "needs_link":
        # First time we've seen this user. Send the magic link.
        await msg.author.send(res["reply"])
        return

    # Linked user. Post the reply.
    target = msg.channel
    # If we don't yet have a per-user channel, create one now and tell the Worker.
    if res.get("discord_channel_id") is None and isinstance(msg.channel, discord.DMChannel):
        target = await ensure_user_channel(msg.author, res["email"])
    await target.send(res["reply"])
```

Key invariants:

- We pass `msg.author.id` straight from the gateway payload. **Never** pull
  identity from message text. That's the cross-user leak guard.
- The bridge does no caching. Every message re-asks the Worker, which
  re-asks Supabase, which re-checks the link row. Revoke takes effect on
  the very next message.

### 2. Creating a per-user private channel

When a linked user has no `discord_channel_id` yet, the bridge creates a
private channel in `DISCORD_USER_CHANNEL_PARENT_ID`, grants the user read
+ send + view-history permissions, and tells the Worker the channel id.

```python
async def ensure_user_channel(user, email):
    guild = client.get_guild(int(DISCORD_GUILD_ID))
    parent = guild.get_channel(int(DISCORD_USER_CHANNEL_PARENT_ID))

    overwrites = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        user:               discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True),
        guild.me:           discord.PermissionOverwrite(view_channel=True, send_messages=True, manage_channels=True),
    }
    safe = email.split("@")[0].lower().replace(".", "-")[:24]
    channel = await guild.create_text_channel(
        name=f"p-{safe}-{user.id % 10000}",
        category=parent,
        overwrites=overwrites,
        topic=f"Penny ↔ {email} — private. Disconnect with /disconnect.",
    )

    httpx.post(f"{WORKER_BASE_URL}/discord/attach-channel",
        headers={"Authorization": f"Bearer {BRIDGE_SECRET}"},
        json={"discord_user_id": str(user.id), "discord_channel_id": str(channel.id)},
        timeout=10,
    )
    await channel.send(f"Hey <@{user.id}> — this is your private line. Only you and the team can see it.")
    return channel
```

Notes:

- `view_channel=False` on `@everyone` is the key line. Without it the channel
  is visible to the whole server.
- The Worker stores the channel id so future messages can be routed to it
  (e.g. when an admin replies through the inbox, the bridge poller picks
  up the reply and posts to this channel).

### 3. `/disconnect` slash command

```python
@tree.command(description="Disconnect Penny from your account")
async def disconnect(interaction):
    httpx.post(f"{WORKER_BASE_URL}/discord/disconnect",
        headers={"Authorization": f"Bearer {BRIDGE_SECRET}"},
        json={"discord_user_id": str(interaction.user.id)},
        timeout=10,
    )
    await interaction.response.send_message(
        "Done — I've forgotten your FounderFirst account. Send me a message anytime to reconnect.",
        ephemeral=True,
    )
```

### 4. CSAT reactions (existing — unchanged)

The Discord-side CSAT prompt + reaction handling in `CSAT-INTEGRATION.md`
keeps working as-is. It posts to `submit_feedback` directly. We did not
move that into the Worker because it's already simple and the existing
in-memory `csat_prompt_map` lives here naturally.

---

## What to delete from the bridge

Once this is wired:

- The Dify HTTP call. Gone.
- Any system-prompt or voice file in the bridge repo. Gone.
- Any direct Supabase calls *except* `submit_feedback` for CSAT. Gone.
- The `DIFY_*` env vars. Gone.

Then shrink the Lightsail VM to the cheapest tier, or move the relay to
Fly.io's free tier. Dify itself can be decommissioned after a week of
parallel run.

---

## Migration playbook (don't do this on a Friday)

1. Apply `SCHEMA-014` in Supabase SQL editor.
2. `wrangler secret put DISCORD_BRIDGE_SECRET` (generate fresh).
3. Deploy the updated Worker. Test `/connect-discord` and `/discord/dm`
   with curl using the bridge secret — confirm the unlinked path returns
   a `needs_link` reply.
4. Build the new bridge from the snippets above. Deploy it next to the
   existing one, **pointed at a test channel only**.
5. From the test channel: DM the bot. Click the link. Confirm email.
   Verify a follow-up DM gets a context-aware reply.
6. Cut over: stop the old (Dify-based) bridge. Start the new one on the
   real channel/DM scope.
7. Watch for 24h. If quiet, decommission Dify.

---

## Failure modes worth knowing

| Symptom | Likely cause |
|---|---|
| Bot replies with "Hi — happy to help. So I can pull up…" on every message | Link row was never confirmed, OR was revoked. Check `admin_list_discord_links` in admin UI. |
| Worker returns 401 on every bridge call | `DISCORD_BRIDGE_SECRET` mismatch. Re-set on both sides. |
| Per-user channel is visible to the whole server | `view_channel=False` on `@everyone` was dropped from `overwrites`. |
| Bot answers user A using user B's data | This shouldn't happen — Worker scopes context to the verified `discord_user_id`. If it does, the bridge is sending the wrong author id; check `msg.author.id` is being passed straight, not parsed from message text. |
