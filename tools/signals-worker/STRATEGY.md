# Social Listening & Outreach — Strategy

> Pure strategy (the "what" and "why"). Architecture/implementation is designed
> separately — see the **Claude Code prompt** at the end to kick that off.

---

## 1. Goal

Give FounderFirst a near-real-time view of where founders, small-business owners,
and freelancers voice **bookkeeping & accounting pain** across social media —
track it, score it, summarize it daily, and reach out about each person's
*specific* problem. **Problem-driven solutioning, not hard sales.**

---

## 2. What we're building

A single loop, fed by two intake pipes:

1. **Automated collection** — a usage-based data provider pulls public-platform
   posts matching our keywords (Reddit, Hacker News, X, public LinkedIn).
2. **Manual capture** — a **browser extension** lets a logged-in human grab posts
   from closed communities (Facebook private groups, LinkedIn Groups, Discord,
   Slack, Skool, WhatsApp) that no provider can reach.

Both feed one **self-hosted scoring "brain" (Ollama + open-source embeddings)**
that flags genuine pain + buying intent, which surfaces qualified people as
**leads in the FounderFirst admin CRM**, where the system **drafts a
problem-specific, brand-voice outreach message that a human reviews and sends.**

---

## 3. Locked decisions

| Topic | Decision |
|---|---|
| Platforms | **Reddit, Hacker News, X, public LinkedIn** (automated); **FB private groups, LinkedIn Groups, Discord/Slack/Skool/WhatsApp** (manual). |
| Collection | **Usage-based, pay-per-request data provider** — no direct per-platform APIs/scrapers maintained by us. |
| The "brain" | **Self-hosted Ollama** (LLM) + open-source embeddings. Small managed spend allowed as fallback. |
| Manual capture | **Browser extension.** |
| Outreach | **Draft + human approve. Never auto-send.** |
| Cadence / users | **Near-real-time, small team.** |
| CRM | **FounderFirst admin is the system of record.** |
| Stack | **Same as founderfirst.one/admin** — Supabase + React admin (see prompt). |

---

## 4. Platforms — access reality

Visibility decides everything: publicly viewable → provider can pull it;
members-only → only a logged-in human (the extension) can.

| Platform | Approach |
|---|---|
| Reddit, Hacker News, X, **public** LinkedIn posts | **Automated** via provider |
| FB private groups, LinkedIn Groups, Discord, Slack, Skool, WhatsApp | **Manual** via browser extension |

---

## 5. Collection provider

**Primary: API Direct.** The only usage-based provider with **no monthly fee** —
pure pay-per-request, one unified API across all our platforms, raw data out so
our own brain/CRM sit on top.

- No subscription, no minimum; 50 free requests/endpoint/month; billed only on
  success.
- Per-request: Reddit $0.003, X $0.006/page, LinkedIn search $0.006 / post $0.002,
  YouTube $0.005.
- Unified JSON (`title, url, date, author, source, snippet`).
- Known limit: returns **snippets**, not always full post body; default 3
  concurrent requests/endpoint.

**Fallback options (only if a proven gap appears):**

| Gap | Fallback | Why |
|---|---|---|
| Need **full post text** for scoring (snippet too short) | **Bright Data** (Web Scraper API) | No monthly fee, pay-as-you-go (~$1.50/1K records); returns full content. Fetch full body for *promoted* leads only — cost stays tiny. |
| **LinkedIn coverage** from API Direct proves weak | **Octolens** | Strong LinkedIn; accept its monthly fee only if needed. |

Everything sits behind one normalizer, so any provider is swappable with no
lock-in.

---

## 6. The scoring "brain" (conceptual)

Every item — provider-fed or manually captured — runs the same self-hosted funnel:

1. **Keyword prefilter** — drop obvious noise (and keep provider cost down).
2. **Relevance** — semantic similarity vs. reference examples of our ICP's pain,
   to catch posts that express the problem without our exact words.
3. **Intent judgment** — the LLM rates how strongly the person needs a bookkeeping
   solution *now*, tags the specific pain, flags any competitor named.
4. **Promotion** — items clearing both thresholds become **leads**; the rest are
   archived. Thresholds tunable for precision vs. volume.

---

## 7. Outreach approach

Drafted per lead around *their* stated problem, always human-reviewed before
sending, and **channel-aware**:

- **Public channels** (Reddit, HN, public X/LinkedIn) — a direct but problem-led
  reply/message is fine.
- **Closed communities** — **helpful reply first, no pitch.** Answer the actual
  question, build credibility, escalate to a solution mention only if receptive.
  Cold-pitching here gets you banned.

System drafts in our brand voice; human edits, approves, sends manually. No
auto-send anywhere.

---

## 8. Manual capture (closed communities)

A **browser extension**: while reading a group as a logged-in member, a "Capture
to FounderFirst" button grabs the post's text, author, community, and link in one
click and sends it into the same pipeline as automated sources. One tool covers
FB private groups, LinkedIn Groups, Discord, Slack, Skool, and WhatsApp Web.

---

## 9. Compliance & guardrails

- **No auto-send** — always human-approved.
- **Respect closed-community rules** — most forbid solicitation; default to
  helpful-reply mode.
- **Only capture what we can legitimately see** as a member; never republish
  others' private content.
- **Data minimization / GDPR** — store the minimum (post text, public handle, URL,
  timestamp); support deleting a lead + its source data; no PII unless publicly
  volunteered.
- **Provider terms** — use data within ToS; keep keys server-side.

---

## 10. Starter ICP & keywords

**ICP:** early-stage founders, solopreneurs, freelancers, small-agency owners who
do their own books or are frustrated with their tool/bookkeeper.

**Pain phrases:** "behind on my books," "bookkeeping nightmare," "hate QuickBooks,"
"QuickBooks too expensive / too complicated," "need a bookkeeper," "catch-up
bookkeeping," "categorize / reconcile transactions," "year-end tax scramble," "DIY
accounting spreadsheet," "1099 mess."

**Competitors:** QuickBooks, Xero, Wave, FreshBooks, Pilot, Puzzle, Digits — and
**Bench** (shut down late 2024; stranded customers = high-intent segment).

**Communities — automated:** r/smallbusiness, r/Bookkeeping, r/Accounting,
r/Entrepreneur, r/freelance, r/startups, r/tax, r/QuickBooks, r/SaaS; Hacker News;
public LinkedIn & X keyword streams.
**Communities — manual:** FB small-business / bookkeeper groups, LinkedIn Groups,
founder Discord/Slack/Skool servers. *(Specific list TBD.)*

---

## 11. Phasing

- **Phase 1 — the full loop.** API Direct collection (Reddit + HN + X + public
  LinkedIn) + browser-extension capture → Ollama scoring → admin CRM →
  human-approved outreach. Prove end-to-end.
- **Phase 2 — tune & fill gaps.** Add Bright Data for full-text on promoted leads
  if needed; add Octolens if LinkedIn is weak; tune thresholds; expand keywords.
- **Phase 3 — intelligence.** Trend/competitor alerts (e.g. "spike in QuickBooks
  complaints"), cross-post lead de-duplication.

---

## 12. Open items (resolve during architecture/build)

1. **Specific communities** to seed (subreddits, FB groups, Discord/Slack/Skool).
2. **API Direct checks:** is the snippet enough text for scoring (else Bright
   Data), and is LinkedIn coverage good enough (else Octolens)?
3. **Ollama model(s)** for scoring vs. drafting, plus the embedding model — chosen
   on quality vs. local hardware.

---

## 13. Prompt for Claude Code

> Paste the block below into Claude Code, run from the repo root. It asks for an
> architecture/solution design **first**, matching the existing admin stack —
> before any code.

```text
You are working in the FounderFirst pnpm monorepo (founderfirst.one). I want you to
design the architecture and solution for a Social Listening & Outreach system, BEFORE
writing any implementation code. Read CLAUDE.md and apps/admin/RESPONSIVE.md first and
follow every convention there.

GOAL
Build a near-real-time pipeline that finds founders/small-business owners voicing
bookkeeping/accounting pain on social media, scores them for intent, surfaces them as
leads in the admin CRM, and drafts problem-driven, human-approved outreach. Full
strategy is in tools/signals-worker/STRATEGY.md — this file (read it).

WHAT TO BUILD (two intake pipes, one engine)
1. Automated collection from a usage-based provider (API Direct — pay-per-request,
   no monthly fee) covering Reddit, Hacker News, X, public LinkedIn.
   Fallbacks (design for, don't build yet): Bright Data for full post text on
   promoted leads; Octolens if LinkedIn coverage is weak.
2. Manual capture via a browser extension for closed communities (FB private groups,
   LinkedIn Groups, Discord/Slack/Skool/WhatsApp) — posts the extension grabs POST
   into the same intake endpoint.
3. One normalizer → a self-hosted scoring brain (Ollama LLM + open-source embeddings):
   keyword prefilter → semantic relevance vs ICP pain → LLM intent score + pain tags +
   competitor flag → promote to leads.
4. Lead CRM + pipeline in the admin (system of record), channel-aware (public vs
   private_group) outreach drafting using the live VOICE.md (via the existing
   get_live_voice RPC), draft → human approve → mark sent. No auto-send.
5. Daily digest of new high-intent leads + trends.

MATCH THE EXISTING STACK (study these files and mirror their patterns exactly)
- DB: supabase/migrations/<timestamp>_*.sql. Idempotent (create ... if not exists),
  RLS deny-all, access only via security-definer RPCs gated on the existing is_admin()
  helper, audit via log_admin_action. Model on 20260620120000_discord_links.sql.
- Edge functions: supabase/functions/<name>/index.ts, Deno + Deno.serve, CORS,
  shared-secret header auth, secrets via `supabase secrets set`, verify_jwt=false in
  config.toml for webhook-invoked functions. Model on functions/notify-content-change.
- Scheduling: pg_cron for polling + the daily digest. Real-time UI via Supabase
  Realtime. Triggers/notifications via pg_net (as publish_notify already does). Email
  via Resend (as notify-content-change already does).
- Frontend: apps/admin — React 18 + react-router-dom v6, lazy routes via the named()
  helper in src/App.tsx (add a nav <Link> there), thin typed RPC wrappers in
  src/lib/supabase.ts (mirror listTickets/getTicket), reuse src/lib/charts.tsx and
  src/lib/icons.tsx. New route: /admin/listening with tabs Feed, Pipeline (Kanban),
  Lead detail (draft/approve/mark-sent), Keywords, Quick-Add.
- Styling: ONLY tokens from packages/design-system/tokens.css (no inline hex / magic
  px / one-off font sizes). Obey RESPONSIVE.md (fluid first, >=44px tap targets, tables
  in .table-wrap, >=16px inputs); verify no horizontal scroll across the width ladder.
- Embeddings/LLM behind a single swappable interface (Ollama default; managed
  fallback). Providers (API Direct / Bright Data / Octolens) behind one normalizer so
  they're swappable.

CONSTRAINTS
- Don't git commit unless I explicitly ask. Don't add planning .md files.
- Keep all API keys / secrets server-side (Supabase secrets), never in the client.
- Use preview_start (not bash) for dev servers.

DELIVERABLE FOR THIS FIRST PASS (design only, no app code yet)
A. A short architecture doc: data flow, the normalizer + intake endpoint, the scoring
   pipeline, scheduling, the admin route/components, the browser-extension contract,
   and the secrets/config needed.
B. The proposed data model (tables, RLS, RPC signatures) described — not yet migrated.
C. A phased build plan with Phase 1 acceptance criteria.
D. Call out the open questions (API Direct snippet sufficiency, LinkedIn coverage,
   Ollama model choice) and how the design stays swappable.
Wait for my approval on the design before implementing.
```
