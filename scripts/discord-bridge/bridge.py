"""
FounderFirst Discord bridge — the dumb relay.

The bridge has zero opinions about voice, prompts, retrieval, or who a user is.
All of that lives in the Cloudflare Worker (site-bubble/worker). This file just:

  1. Listens to Discord gateway events.
  2. POSTs them to the Worker with a shared secret.
  3. Posts whatever the Worker replies back to Discord.
  4. Creates per-user private channels when the Worker asks.

If you find yourself adding a system prompt, an LLM client, or a Supabase
query in this file, stop. That belongs in the Worker.

Env vars (see .env.example):
  WORKER_BASE_URL                 https://bubble.founderfirst.one
  BRIDGE_SECRET                   same value as `wrangler secret put DISCORD_BRIDGE_SECRET`
  DISCORD_BOT_TOKEN               your bot token
  DISCORD_GUILD_ID                snowflake of the FounderFirst server
  DISCORD_USER_CHANNEL_PARENT_ID  category id where per-user channels live
  ADMIN_POLL_INTERVAL_SECONDS     (optional, default 15) — how often to poll
                                  for admin replies that need posting
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Any

import discord
import httpx
from discord import app_commands

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

WORKER_BASE_URL = os.environ["WORKER_BASE_URL"].rstrip("/")
BRIDGE_SECRET = os.environ["BRIDGE_SECRET"]
DISCORD_BOT_TOKEN = os.environ["DISCORD_BOT_TOKEN"]
DISCORD_GUILD_ID = int(os.environ["DISCORD_GUILD_ID"])
DISCORD_USER_CHANNEL_PARENT_ID = int(os.environ["DISCORD_USER_CHANNEL_PARENT_ID"])
ADMIN_POLL_INTERVAL_SECONDS = int(os.environ.get("ADMIN_POLL_INTERVAL_SECONDS", "15"))

AUTH_HEADERS = {"Authorization": f"Bearer {BRIDGE_SECRET}"}
HTTP_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("bridge")

# ---------------------------------------------------------------------------
# Discord client
# ---------------------------------------------------------------------------

intents = discord.Intents.default()
intents.message_content = True
intents.dm_messages = True
intents.guild_messages = True
intents.guilds = True
intents.members = True

client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)
http = httpx.AsyncClient(timeout=HTTP_TIMEOUT)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def worker_post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """POST to the Worker, raise on non-2xx, return JSON."""
    r = await http.post(f"{WORKER_BASE_URL}{path}", headers=AUTH_HEADERS, json=payload)
    if r.status_code >= 400:
        log.error("worker %s -> %s %s", path, r.status_code, r.text[:300])
        r.raise_for_status()
    return r.json()


def is_user_private_channel(ch: discord.abc.Messageable) -> bool:
    """True if this is one of our per-user private text channels."""
    if not isinstance(ch, discord.TextChannel):
        return False
    parent = ch.category_id
    return parent == DISCORD_USER_CHANNEL_PARENT_ID


async def ensure_user_channel(user: discord.User, email: str) -> discord.TextChannel:
    """
    Create a private channel for this user under the configured parent
    category, then tell the Worker about the channel id so future
    routing can target it.
    """
    guild = client.get_guild(DISCORD_GUILD_ID)
    if guild is None:
        raise RuntimeError(f"bot not in guild {DISCORD_GUILD_ID}")
    parent = guild.get_channel(DISCORD_USER_CHANNEL_PARENT_ID)
    if parent is None or not isinstance(parent, discord.CategoryChannel):
        raise RuntimeError(f"parent category {DISCORD_USER_CHANNEL_PARENT_ID} missing")

    overwrites: dict[Any, discord.PermissionOverwrite] = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        user: discord.PermissionOverwrite(
            view_channel=True, send_messages=True, read_message_history=True,
        ),
        guild.me: discord.PermissionOverwrite(
            view_channel=True, send_messages=True,
            manage_channels=True, manage_messages=True,
        ),
    }
    safe = email.split("@")[0].lower().replace(".", "-")[:24]
    safe = "".join(c for c in safe if c.isalnum() or c == "-") or "user"
    name = f"p-{safe}-{user.id % 10000}"

    channel = await guild.create_text_channel(
        name=name,
        category=parent,
        overwrites=overwrites,
        topic=f"Penny <-> {email} -- private. Disconnect with /disconnect.",
    )

    await worker_post("/discord/attach-channel", {
        "discord_user_id": str(user.id),
        "discord_channel_id": str(channel.id),
    })

    await channel.send(
        f"Hey <@{user.id}> — this is your private line with Penny. "
        f"Only you and the team can see what we discuss here."
    )
    return channel


# ---------------------------------------------------------------------------
# Inbound message handling
# ---------------------------------------------------------------------------

@client.event
async def on_ready():
    log.info("logged in as %s (id=%s); syncing slash commands", client.user, client.user.id if client.user else None)
    try:
        guild_obj = discord.Object(id=DISCORD_GUILD_ID)
        tree.copy_global_to(guild=guild_obj)
        await tree.sync(guild=guild_obj)
    except Exception:
        log.exception("slash command sync failed")
    # TODO: enable once /discord/admin-replies/* endpoints exist on the Worker.
    # For now, admin replies still flow through the legacy path. The relay
    # below + the on_message handler are the cutover-critical pieces.
    # client.loop.create_task(_admin_reply_poller())


@client.event
async def on_message(msg: discord.Message):
    if msg.author.bot:
        return
    if msg.content.startswith("/"):
        # Slash commands handled by app_commands tree; skip prefix-style.
        return

    is_dm = isinstance(msg.channel, discord.DMChannel)
    if not (is_dm or is_user_private_channel(msg.channel)):
        return  # ignore public channel chatter

    try:
        res = await worker_post("/discord/dm", {
            "discord_user_id": str(msg.author.id),
            "discord_username": str(msg.author),
            "message": msg.content,
            "channel_id": str(msg.channel.id),
            "is_dm": is_dm,
        })
    except Exception:
        log.exception("worker /discord/dm failed for user=%s", msg.author.id)
        await msg.channel.send(
            "Sorry — something's off on our end. Try again in a minute."
        )
        return

    reply = res.get("reply") or "(no reply)"
    kind = res.get("kind")
    target: discord.abc.Messageable = msg.channel

    # Linked user, first message in DM, no per-user channel yet → spin one up.
    if kind == "ok" and is_dm and res.get("discord_channel_id") is None and res.get("email"):
        try:
            target = await ensure_user_channel(msg.author, res["email"])
        except Exception:
            log.exception("could not create per-user channel for %s", msg.author.id)
            # Fall back to the DM so the user still gets a reply.

    await target.send(reply)


# ---------------------------------------------------------------------------
# Slash commands
# ---------------------------------------------------------------------------

@tree.command(description="Disconnect Penny from your FounderFirst account")
async def disconnect(interaction: discord.Interaction):
    try:
        await worker_post("/discord/disconnect", {
            "discord_user_id": str(interaction.user.id),
        })
    except Exception:
        log.exception("worker /discord/disconnect failed for %s", interaction.user.id)
        await interaction.response.send_message(
            "Couldn't reach the server — try again in a minute.",
            ephemeral=True,
        )
        return
    await interaction.response.send_message(
        "Done — I've forgotten your FounderFirst account. "
        "Send me a message anytime to reconnect.",
        ephemeral=True,
    )


# ---------------------------------------------------------------------------
# Poller — pick up admin replies and post them
# ---------------------------------------------------------------------------

async def _admin_reply_poller():
    """
    Every N seconds, ask the Worker if there are admin replies that need
    posting to Discord. The Worker tracks delivery state in Supabase.
    """
    while True:
        try:
            res = await worker_post("/discord/admin-replies/pending", {})
            for reply in res.get("replies", []):
                channel_id = int(reply["discord_channel_id"])
                ch = client.get_channel(channel_id)
                if ch is None:
                    ch = await client.fetch_channel(channel_id)
                msg = await ch.send(reply["body"])
                await worker_post("/discord/admin-replies/ack", {
                    "delivery_id": reply["delivery_id"],
                    "discord_message_id": str(msg.id),
                })
        except Exception:
            log.exception("admin reply poller failed")
        await asyncio.sleep(ADMIN_POLL_INTERVAL_SECONDS)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main():
    if not DISCORD_BOT_TOKEN:
        print("DISCORD_BOT_TOKEN missing", file=sys.stderr)
        sys.exit(1)
    client.run(DISCORD_BOT_TOKEN, log_handler=None)


if __name__ == "__main__":
    main()
