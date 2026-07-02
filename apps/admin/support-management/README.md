# Support management — what's live, what's where

> Status: **live system** · Last verified: 2026-07-01

The support stack: Discord gateway → thin bridge relay (Fly.io,
`scripts/discord-bridge/`) → **Worker brain** (`site-bubble/worker/src/discord.ts`)
→ Supabase (tickets, consent, CSAT). Tickets surface in the admin at `/support`.

## Docs in this folder

- **[DISCORD-BRIDGE-SPEC.md](DISCORD-BRIDGE-SPEC.md)** — the authoritative spec for
  the bridge relay. Current.
- **[CSAT-INTEGRATION.md](CSAT-INTEGRATION.md)** — CSAT prompts/reactions + admin
  analytics wiring. Current.
- **[TOPICS-VOCABULARY.md](TOPICS-VOCABULARY.md)** — ticket topic taxonomy
  (mirrored in `apps/admin/src/lib/topics.ts`). Current.
- **[VOICE-MAINTAINERS.md](VOICE-MAINTAINERS.md)** — how the voice canon is
  maintained. Current.
- **[knowledge-base/](knowledge-base/)** — **Phase-2 seed content, not live.** The
  admin KB sub-tab is flagged off; when it ships, these seed the DB (or get deleted
  in favor of admin-authored articles).

## Where the live words actually live (not in this folder)

The bot's runtime prompt/voice/persona are **admin-editable in the database, no
redeploy**: admin → Penny → `#prompt` / `#voice` / `#discord` persona. Repo files
are seeds/fallbacks only. Two Dify-era docs (the original strategy + pasted system
prompt) were superseded by the Worker migration and are archived at
`docs/archive/2026-06-support-dify-*.md`.
