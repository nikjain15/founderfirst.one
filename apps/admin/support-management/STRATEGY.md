# Support Management — Strategy

**Purpose.** Give FounderFirst users one place to ask anything, get an answer, and reach a human when they need to. Same voice as Penny: warm, direct, plain English.

---

## What it does

- A chat widget on `founderfirst.one` and a Discord bot. Same brain behind both.
- Answers grounded in FounderFirst docs. No made-up facts.
- Hard questions become tickets — prioritized, visible, mine to handle.
- I work them from `founderfirst.one/admin/support` and reply once. The reply lands back in the channel the user came from.

---

## Stack

| Layer | Choice |
|---|---|
| AI brain | Dify (self-hosted, Python) |
| Model | Claude — Sonnet for answers, Haiku for classify |
| Channels | Web widget + Discord bot |
| Database + Auth | Supabase (existing free tier) |
| Admin UI | React app in `apps/admin/`, deployed under `founderfirst.one/admin/` via existing GitHub Pages pipeline |
| Hosting (Dify + Discord bridge) | AWS Lightsail 2 GB, $10/mo |


---

## Architecture

```
Web widget ──┐
             ├──► Dify (Lightsail) ──► Claude
Discord bot ─┘         │
                       └──► Supabase (tickets, contacts, messages)
                                 ▲
                                 │ anon key + RLS
                                 │
                  founderfirst.one/admin/support
                  (React in apps/admin, GH Pages)
```

---

## What Dify gives natively
Web widget, RAG over docs, visual workflow builder, native Claude, full observability.

## What we build on top
1. **Discord bridge.** ~80 lines of Python (`discord.py` → Dify API). Runs as a second Docker container next to Dify.
2. **Supabase schema.** `tickets`, `contacts`, `messages`. RLS so the browser-side anon key can only act on my own admin session.
3. **Dify workflow.** Classify (Haiku) → retrieve docs → answer (Sonnet, FounderFirst voice + guardrails) → on low confidence, HTTP node writes a ticket to Supabase.
4. **Admin UI.** New app at `apps/admin/`. Vite + React, base path `/admin/`. Dashboard with tiles (Support live; Users/Billing/Analytics added later as need shows up). Magic-link login via Supabase Auth.

---

## Design + tone — non-negotiables

This is a FounderFirst surface, so it follows existing rules.

**Visual.**
- Consumes `@ff/design-system` tokens. No redeclared colors, type, radii.
- Reuses existing components (`p-mark`, `penny-bubble`, button, waitlist-form patterns) where they fit. New variants are added to the design system, not copied into the admin app.
- App-only layout (admin shell, ticket table) lives in `apps/admin/`. Anything reusable graduates back to `@ff/design-system`.

**Voice (applies to both the bot's replies and the admin UI copy).**
- Plain English. No jargon, no "unfortunately," no corporate hedging.
- Founder-facing, not accountant-facing. Short sentences.
- Acknowledge the user's goal first, then answer.
- Same Penny warmth: direct, calm, never pushy. Always end with the next clear step.

The bot's system prompt is version-controlled in this folder so the voice doesn't drift.

---

## Security rule

Browser code uses the Supabase **anon key** only. Service-role key never leaves the server. RLS enforces per-row access. This is what lets the admin UI ship as a static site on GitHub Pages with zero new infrastructure.

---

## Build order

1. Lightsail VM up. Dify installed. Anthropic key wired. Verified in Dify's playground.
2. FounderFirst docs uploaded to a Dify knowledge base. Chunking tuned (by heading / Q&A). Hybrid search + rerank on. System prompt written in FF voice with guardrails.
3. Web widget embedded on `founderfirst.one` via existing marketing app.
4. Supabase tables + RLS. Dify HTTP node creates tickets on escalation.
5. Discord bridge container.
6. `apps/admin/` scaffolded (Vite + React, `base: '/admin/'`). `build-all.ts` updated to build it and copy to `dist/admin/`. Magic-link auth. Support inbox: priority-sorted list, ticket detail, reply box. Reply routes back through Dify to the original channel.

---

## Explicitly deferred

Email channel, SLA timers, multi-agent routing, CSAT surveys, mobile app, analytics dashboard. We add these only when real volume demands them — same principle as everything else FounderFirst ships.

---

## Files in this folder (planned)

- `STRATEGY.md` — this doc.
- `SYSTEM-PROMPT.md` — the version-controlled Dify system prompt (FF voice + guardrails).
- `WORKFLOW.md` — Dify workflow graph documented (nodes, branches, models per step).
- `SCHEMA.sql` — Supabase tables + RLS policies.
- `DISCORD-BRIDGE.md` — bridge service spec and deployment notes.

The admin React app lives one level up at `apps/admin/`. This subfolder is documentation + the operational artifacts that define how the bot behaves.
