"""
FounderFirst Discord support bridge.

Listens for messages on Discord, forwards them to Dify's chat API, and posts
Dify's reply back. Also polls Supabase every few seconds for admin replies on
tickets that originated in Discord, and pushes those replies back to the
originating channel as Discord embeds.

Triggers:
  - any message in DISCORD_SUPPORT_CHANNEL_ID
  - any @-mention of the bot anywhere
  - any DM

State:
  - Per-conversation Dify conversation_id (preserves multi-turn memory) is
    persisted to disk so it survives bridge restarts.
  - Ticket → Discord channel routing lives in Supabase: the bridge passes
    channel + channel_thread_ref + discord identity to Dify as inputs, and
    those land on the ticket. No in-memory mapping needed for ticket replies.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path

import discord
import httpx

# --- Config (from env) -------------------------------------------------------
DISCORD_BOT_TOKEN          = os.environ["DISCORD_BOT_TOKEN"]
DISCORD_SUPPORT_CHANNEL_ID = int(os.environ["DISCORD_SUPPORT_CHANNEL_ID"])
DIFY_API_KEY               = os.environ["DIFY_API_KEY"]
DIFY_BASE_URL              = os.environ.get("DIFY_BASE_URL", "http://host.docker.internal/v1").rstrip("/")
SUPABASE_URL               = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ADMIN_POLL_INTERVAL        = float(os.environ.get("ADMIN_POLL_INTERVAL", "3"))

STATE_DIR = Path(os.environ.get("BRIDGE_STATE_DIR", "/app/data"))
CONVERSATION_MAP_PATH = STATE_DIR / "conversation_map.json"

DISCORD_MAX_MESSAGE_CHARS = 1900   # Discord caps at 2000; leave headroom for plain text.
DISCORD_EMBED_DESC_LIMIT  = 4000   # Discord embed description limit is 4096; leave headroom.
FOUNDERFIRST_INK_COLOR    = 0x0a0a0a  # var(--ink) from the design system

# --- Logging -----------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
log = logging.getLogger("discord-bridge")

# --- Discord client ----------------------------------------------------------
intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)

# Maps "<channel_id>-<user_id>" → Dify conversation_id. Preserves multi-turn
# memory. Persisted to disk so restarts don't drop context.
conversation_map: dict[str, str] = {}


# --- Persistence -------------------------------------------------------------
def _load_conversation_map() -> None:
    global conversation_map
    if not CONVERSATION_MAP_PATH.exists():
        return
    try:
        data = json.loads(CONVERSATION_MAP_PATH.read_text())
        if isinstance(data, dict):
            conversation_map = {str(k): str(v) for k, v in data.items()}
            log.info("Loaded %d conversation(s) from disk.", len(conversation_map))
    except (json.JSONDecodeError, OSError):
        log.exception("Failed to load conversation_map; starting fresh.")


def _save_conversation_map() -> None:
    """Atomic write to avoid partial files on crash."""
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        # Write to a temp file in the same dir, then rename — atomic on POSIX.
        with tempfile.NamedTemporaryFile(
            "w", dir=STATE_DIR, delete=False, prefix=".conversation_map.", suffix=".tmp"
        ) as tmp:
            json.dump(conversation_map, tmp)
            tmp_path = Path(tmp.name)
        tmp_path.replace(CONVERSATION_MAP_PATH)
    except OSError:
        log.exception("Failed to persist conversation_map.")


# --- Dify call ---------------------------------------------------------------
async def call_dify(
    query: str,
    *,
    channel_key: str,
    discord_channel_id: int,
    discord_user_id: int,
    discord_username: str,
    user: str,
) -> str:
    """POST to Dify's chat-messages endpoint, return the answer string."""
    conv_id = conversation_map.get(channel_key, "")
    payload = {
        "inputs": {
            "channel": "discord",
            "channel_thread_ref": str(discord_channel_id),
            "discord_user_id": str(discord_user_id),
            "discord_username": discord_username,
        },
        "query": query,
        "response_mode": "blocking",
        "conversation_id": conv_id,
        "user": user,
    }
    headers = {
        "Authorization": f"Bearer {DIFY_API_KEY}",
        "Content-Type": "application/json",
    }
    url = f"{DIFY_BASE_URL}/chat-messages"

    async with httpx.AsyncClient(timeout=120) as http:
        try:
            r = await http.post(url, json=payload, headers=headers)
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            log.exception("Dify returned %s: %s", e.response.status_code, e.response.text[:500])
            return _fallback_reply()
        except httpx.HTTPError:
            log.exception("Dify call failed")
            return _fallback_reply()

    data = r.json()
    new_conv_id = data.get("conversation_id")
    if new_conv_id and conversation_map.get(channel_key) != new_conv_id:
        conversation_map[channel_key] = new_conv_id
        _save_conversation_map()

    answer = data.get("answer", "").strip()
    if not answer:
        log.warning("Dify returned empty answer. Payload keys: %s", list(data.keys()))
        return _fallback_reply()
    return answer


def _fallback_reply() -> str:
    return (
        "I'm having trouble reaching the team's brain right now. "
        "Give it a minute and try again, or someone from FounderFirst "
        "will pick it up here shortly."
    )


# --- Send helpers ------------------------------------------------------------
def _chunk(text: str, limit: int = DISCORD_MAX_MESSAGE_CHARS) -> Iterable[str]:
    if len(text) <= limit:
        yield text
        return
    remaining = text
    while remaining:
        if len(remaining) <= limit:
            yield remaining
            return
        split_at = remaining.rfind("\n", 0, limit)
        if split_at < limit // 2:
            split_at = limit
        yield remaining[:split_at].rstrip()
        remaining = remaining[split_at:].lstrip()


async def _send_reply_to_message(message: discord.Message, text: str) -> None:
    chunks = list(_chunk(text))
    for i, chunk in enumerate(chunks):
        if i == 0:
            await message.reply(chunk, mention_author=False)
        else:
            await message.channel.send(chunk)


async def _send_admin_embed(channel: discord.abc.Messageable, body: str) -> None:
    """Render the admin reply as a Discord embed so it's visually distinct
    from bot turns. Truncates if absurdly long."""
    description = body if len(body) <= DISCORD_EMBED_DESC_LIMIT else (body[:DISCORD_EMBED_DESC_LIMIT - 16] + "\n…(truncated)")
    embed = discord.Embed(
        description=description,
        color=FOUNDERFIRST_INK_COLOR,
        timestamp=datetime.now(timezone.utc),
    )
    embed.set_author(name="FounderFirst team")
    embed.set_footer(text="Replied via the admin inbox")
    await channel.send(embed=embed)


# --- Event handlers ----------------------------------------------------------
@client.event
async def on_ready():
    log.info(
        "Connected as %s (id=%s). Watching channel %s for messages, @-mentions everywhere, "
        "and polling Supabase every %.1fs for admin replies.",
        client.user, client.user.id if client.user else "?", DISCORD_SUPPORT_CHANNEL_ID, ADMIN_POLL_INTERVAL,
    )
    client.loop.create_task(_admin_reply_poller())


@client.event
async def on_message(message: discord.Message):
    if client.user and message.author.id == client.user.id:
        return
    if message.author.bot:
        return

    in_support_channel = message.channel.id == DISCORD_SUPPORT_CHANNEL_ID
    is_mention = client.user is not None and client.user in message.mentions
    is_dm = isinstance(message.channel, discord.DMChannel)
    if not (in_support_channel or is_mention or is_dm):
        return

    query = message.content
    if client.user is not None:
        for pattern in (f"<@{client.user.id}>", f"<@!{client.user.id}>"):
            query = query.replace(pattern, "")
    query = query.strip()

    if not query:
        await message.reply("What's the question?", mention_author=False)
        return

    log.info("query | channel=%s author=%s text=%r", message.channel.id, message.author.id, query[:200])

    conversation_key = f"{message.channel.id}-{message.author.id}"
    username = f"{message.author.name}"

    async with message.channel.typing():
        answer = await call_dify(
            query,
            channel_key=conversation_key,
            discord_channel_id=message.channel.id,
            discord_user_id=message.author.id,
            discord_username=username,
            user=f"discord-{message.author.id}",
        )

    await _send_reply_to_message(message, answer)


# --- Admin reply poller ------------------------------------------------------
async def _fetch_undelivered() -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/rpc/fetch_undelivered_admin_messages"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.post(url, json={}, headers=headers)
        r.raise_for_status()
        data = r.json()
        if not isinstance(data, list):
            log.warning("Unexpected RPC payload: %r", data)
            return []
        return data


async def _push_admin_message(row: dict) -> None:
    body = (row.get("body") or "").strip()
    if not body:
        return

    if (row.get("channel") or "") != "discord":
        log.info(
            "admin-push | skipped | message_id=%s channel=%s reason=not-discord",
            row.get("message_id"), row.get("channel"),
        )
        return

    ref = row.get("channel_thread_ref") or ""
    try:
        discord_channel_id = int(ref)
    except ValueError:
        log.warning(
            "admin-push | skipped | message_id=%s ref=%r reason=ref-not-int",
            row.get("message_id"), ref,
        )
        return

    channel = client.get_channel(discord_channel_id)
    if channel is None:
        log.warning(
            "admin-push | skipped | message_id=%s channel_id=%s reason=channel-not-found",
            row.get("message_id"), discord_channel_id,
        )
        return

    try:
        await _send_admin_embed(channel, body)
        log.info(
            "admin-push | delivered | message_id=%s channel_id=%s len=%d",
            row.get("message_id"), discord_channel_id, len(body),
        )
    except discord.DiscordException:
        log.exception(
            "admin-push | failed | message_id=%s channel_id=%s",
            row.get("message_id"), discord_channel_id,
        )


async def _admin_reply_poller() -> None:
    log.info("admin-reply poller started.")
    await asyncio.sleep(2)
    while not client.is_closed():
        try:
            rows = await _fetch_undelivered()
            for row in rows:
                await _push_admin_message(row)
        except httpx.HTTPError:
            log.exception("admin-reply poller: HTTP error during fetch")
        except Exception:
            log.exception("admin-reply poller: unexpected error")
        await asyncio.sleep(ADMIN_POLL_INTERVAL)


# --- Entry point -------------------------------------------------------------
def main() -> None:
    log.info("Starting FounderFirst Discord support bridge.")
    log.info("Dify base URL: %s", DIFY_BASE_URL)
    log.info("Supabase URL: %s", SUPABASE_URL)
    log.info("State dir: %s", STATE_DIR)
    _load_conversation_map()
    client.run(DISCORD_BOT_TOKEN, log_handler=None)


if __name__ == "__main__":
    main()
