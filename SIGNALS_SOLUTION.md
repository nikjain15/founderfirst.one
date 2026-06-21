# Signals — Solution Design

> Social listening + outreach for FounderFirst. This is the source-of-truth design
> doc. The **strategy** (the "what/why") lives in `SOCIAL_LISTENING_STRATEGY.md`;
> this doc is the **how**. Update this as decisions change.

**Admin tab:** `Signals` · **Route:** `/admin/signals`
**Status:** Phase 1 built (worktree `feat/signals`), pending deploy · **Last updated:** 2026-06-21
**Build progress:** Step 1 (migration) ✅ · Step 2 (intake edge fn + extension + admin UI) ✅ ·
Step 3 (VM worker) ✅ · Step 4 (admin UI, in Step 2) ✅ · Step 5 (daily digest) ✅
**Remaining:** deploy (functions + migrations), Vault secrets, install Ollama on the VM,
load the extension, run the score-model eval.

---

## 1. Plain-English summary

A factory line with four stations. A social post about bookkeeping pain comes in
one end; a ready-to-send, human-approved reply comes out the other.

1. **Catch posts** — a browser button (capture from a Facebook group) + a paste-a-link
   box in the admin. (Later: a paid service auto-fetches Reddit/X/LinkedIn.)
2. **Sort junk from gold (the "brain")** — runs on our VM. Keyword filter → "does this
   sound like our customer's pain?" → a small local AI rates intent 0–100 and tags the
   pain + any competitor named. High scorers become **leads**; the rest are archived.
3. **Write the reply** — a first-draft, brand-voice message about *that person's*
   problem, written by the hosted AI we already use.
4. **Approve & send** — the lead appears in the Signals tab. A human edits the draft,
   copies it, replies natively on the platform, and marks it sent. **Nothing is ever
   auto-sent.** A daily email digests new high-intent leads.

**Key property:** the entire loop is provable with **zero paid signups** — the browser
button + paste box alone exercise brain → lead → draft → approve. Paid auto-fetch is
added only after the loop is proven.

---

## 2. Locked decisions

| Topic | Decision | Notes |
|---|---|---|
| Tab name / route | **Signals** / `/admin/signals` | Sub-tabs: Feed, Pipeline, Lead detail, Keywords, Quick-Add |
| Tech stack | **Same as founderfirst.one/admin** | Supabase + RLS + `is_admin()` RPCs + edge functions + React admin + Resend + pg_cron. No new platforms except the VM worker. |
| The brain — hosting | **Our existing VM** (Lima VM on Mac: 2 vCPU, 4 GiB, CPU-only, no GPU) | Always-on, pulls work — no inbound ports, Ollama stays private |
| The brain — split | **Local AI scores; hosted AI drafts** | VM is too small for good draft-writing. Scoring is high-volume/low-stakes → free local; drafting is customer-facing → hosted (pennies/day). One swappable interface; can go all-local later. |
| Local models | `gemma2:2b` or `llama3.2:3b` (scoring) + `nomic-embed-text` (embeddings) | Final pick via a ~20-post eval once real captures exist. 8B won't fit 4 GiB. |
| Collection (Phase 1) | **Manual only** — browser extension (Facebook first) + Quick-Add paste box | No provider account needed to start |
| Collection (Phase 2) | **API Direct** (pay-per-request, no monthly fee) for Reddit/HN/X/public LinkedIn | Keys live on the VM |
| Outreach | **Copy-by-default; human sends natively.** API-send seam stubbed for one safe platform later (Phase 2) | Never auto-send |
| Email — internal/digest | **Resend** (already wired via `notify-content-change`) | System emails to admins; free at our volume |
| Email — outreach to leads | **Brevo** (already set up for nik@ / lindsay@) | Sends as the real founder → personal, higher reply rate; open/click tracking stored on the lead. Gmail rejected (no real tracking, not transactional). **Phase 2** — and how Brevo sending is wired (API key vs SMTP) is unconfirmed; verify before building. |
| Extension | **Unpacked dev extension**, internal (2 founders) | Shared-secret auth baked in — acceptable for internal use |
| Volume | **Dozens of posts/day** — tune for precision over coverage | CPU scoring is plenty fast at this volume |
| Dedup (Phase 1) | **By post URL only** | Author/similarity dedup is Phase 3 |
| Leads | **Post-centric** (post + author handle/URL), data-minimized per GDPR section | |

---

## 3. Architecture

```
            ┌─ Browser extension (Facebook group) ─┐
            │   "Capture to FounderFirst" button    │
  INTAKE ◄──┤                                        ├──► edge fn: listening-intake
            │   Quick-Add (admin pastes a URL)       │      (verify_jwt=false, shared
            └─ API Direct poll (Phase 2, from VM) ───┘       secret, normalizes, inserts
                                                              status='pending')
                                                                    │
                                                                    ▼
                                            listening_items  (Postgres, RLS deny-all)
                                                                    │  status='pending'
                       VM PULL-WORKER  (always-on service, no inbound ports)
                       claim_pending_items() ───────────────────────┤
                         1. keyword prefilter (drop noise)           │
                         2. embed → pgvector cosine vs ICP refs → relevance
                         3. Ollama gemma2:2b → {intent, pain_tags, competitor}
                         4. promote → lead; draft via HOSTED AI + get_live_voice()
                       submit_score() / promote_to_lead() ──────────► writes back
                                                                    │
                                                                    ▼
              /admin/signals   (Feed · Pipeline · Lead · Keywords · Quick-Add)
                   human edits draft → Copy → replies natively → Mark sent
                                                                    │
              pg_cron daily ──► edge fn: listening-digest ──► Resend email to admins
```

### Each piece maps to something the admin already does

| New piece | Existing pattern it mirrors |
|---|---|
| `listening_items` etc. tables + RLS + RPCs | `20260620120000_discord_links.sql` |
| `listening-intake` edge function | `supabase/functions/notify-content-change` |
| Daily digest email | The "Penny brain published" Resend email |
| Scheduling | `pg_cron` (already in repo) + `pg_net` (as `publish_notify`) |
| `/admin/signals` route + tabs | Existing lazy routes via `named()` in `App.tsx` |
| Typed RPC wrappers | `listTickets` / `getTicket` in `src/lib/supabase.ts` |
| Brand voice in drafts | existing `get_live_voice()` RPC / `VOICE.md` |

The **only** new moving part is the VM pull-worker — a small Node/Python service run
by systemd that loops every ~60s.

### The normalizer
One module maps every source (`extension` / `quick_add` / `api_direct` / later
`bright_data` / `octolens`) into a single common shape:

```
{ platform, external_url, author_handle, author_url, title, body, posted_at,
  captured_via, raw }
```

Provider code never touches the DB directly — it produces this shape and POSTs to
intake. Swapping or adding a provider = writing one new mapper. No lock-in.

### The brain interface (swappable)
```
interface Brain {
  embed(text): vector            // nomic-embed-text (local)
  score(item): { intent, pain_tags, competitor }   // gemma2:2b (local)
  draft(lead, voice): string     // hosted AI (Anthropic key we already use)
}
```
`OllamaBrain` is the default for embed/score; drafting uses the managed call. Bumping
the VM to 8 GiB later lets drafting move local with a one-line swap.

---

## 4. Data model

All tables: **RLS deny-all**, access only via **security-definer RPCs** gated on the
existing `is_admin()` helper, mutations audited via `log_admin_action`. Requires the
**pgvector** extension (Supabase supports it).

| Table | Purpose | Key columns |
|---|---|---|
| `listening_sources` | Configured searches/communities | `platform, query, captured_via, enabled, cadence_minutes` |
| `listening_items` | Normalized intake (raw catch) | `external_url` **UNIQUE** (dedup), `status pending\|scored\|archived\|promoted`, `captured_via`, `raw jsonb` |
| `listening_scores` | Brain output (1:1 with item) | `item_id, relevance, intent, pain_tags[], competitor, model, scored_at` |
| `leads` | Outreach pipeline | `item_id, stage, assignee, draft, send_method, sent_at, outcome` |
| `lead_events` | Audit trail of a lead | stage/draft/send changes |
| `icp_pain_examples` | Reference set for relevance | `text, embedding vector` |
| `listening_keywords` | Prefilter terms | pain phrases + competitor names |

**Lead stages:** `New → Reviewing → Drafted → Sent → Replied → Won / Dead`

### RPCs
- **Admin (is_admin gated):** `list_listening_items`, `list_leads`, `get_lead`,
  `update_lead_stage`, `save_lead_draft`, `mark_lead_sent`, `list_sources`,
  `upsert_source`, `list_keywords`, `upsert_keyword`, `add_icp_example`,
  `quick_add_item`.
- **Worker (service-role only, not is_admin):** `claim_pending_items(limit)`,
  `submit_score(...)`, `promote_to_lead(...)`.

---

## 5. The Signals tab (UI)

Route `/admin/signals`, lazy-loaded via `named()` in `App.tsx`, nav `<Link>` added.
Tokens only (no inline hex / magic px / one-off font sizes). Obey `RESPONSIVE.md`
(fluid first, ≥44px tap targets, tables in `.table-wrap`, ≥16px inputs, no horizontal
scroll across the width ladder).

Sub-tabs use **plain nouns matching the existing admin** (Support, Users, Analytics,
Content, Audit, Admins) — no CRM/sales jargon. Detail opens on click, like
Inbox → TicketDetail.

| Sub-tab | Does |
|---|---|
| **Posts** | All caught items + scores; filter by status / platform / intent |
| **Leads** | Promoted items; stages shown as columns (`New → Reviewing → Drafted → Sent → Replied → Won/Dead`) |
| **Keywords** | Manage pain phrases, competitors, ICP reference examples, sources |
| **Capture** | Paste a URL/text → into the pipeline (the zero-signup intake) |

**Lead detail** (opens from Leads, not a top tab): post + author + scores; editable
draft; **Copy** button + link to original; channel + **Mark sent**; for email-channel
leads, shows tracking (opened/clicked) from Resend webhooks.

### Outreach channels
- **On-platform (default, most leads)** — a Reddit comment, Facebook reply, LinkedIn
  DM. No automated tracking exists; "did they reply" is a **manual toggle**.
- **Email (Phase 2; only when we have the lead's email)** — sent via **Brevo as the
  founder** (nik@ / lindsay@) for a personal touch; open/click/bounce arrive on a
  webhook and are stored against the lead, shown as "opened 2×, clicked once" in lead
  detail. The only channel with real tracking. *Pre-req: confirm Brevo is reachable via
  a transactional API key + enable webhooks (currently unverified).*
- **Daily digest to admins** — internal email via **Resend** (reuses the existing path).

---

## 6. Secrets / config

| Secret | Where | Purpose |
|---|---|---|
| `LISTENING_INTAKE_SECRET` | edge fn + extension | authenticate intake POSTs |
| `SUPABASE_SERVICE_ROLE_KEY` | VM worker | call worker-only RPCs |
| `ANTHROPIC_API_KEY` | VM worker | draft writing (hosted AI) |
| `API_DIRECT_KEY` | VM worker (Phase 2) | auto-fetch |
| `RESEND_API_KEY` | already present | digest email |

Local models pulled on the VM: `gemma2:2b` (or `llama3.2:3b`) + `nomic-embed-text`.

---

## 7. Phasing

### Phase 1 — the full loop, no paid accounts
1. Migration: tables + RLS + RPCs + pgvector + seed keywords/ICP examples
   (mirror `20260620120000_discord_links.sql`).
2. `listening-intake` edge function + browser extension (Facebook) + Quick-Add.
3. VM pull-worker: prefilter → embed/relevance → score → promote → draft.
4. `/admin/signals` with all five sub-tabs.
5. `listening-digest` daily email.

**Phase 1 acceptance:** capture (or paste) a real Facebook post → within ~1 min it
appears scored in Feed → a high-intent one auto-creates a lead with a brand-voice
draft → human edits, copies, marks sent → next day's digest lists it. All with no
provider account.

### Phase 2 — tune & fill gaps
- API Direct polling in the worker (Reddit/HN/X/public LinkedIn).
- Bright Data full-text on promoted leads if snippets prove too short.
- Octolens if LinkedIn coverage is weak.
- One safe API-send (likely Reddit) via the stubbed `send_method` seam.
- **Email outreach via Brevo** as nik@ / lindsay@, with open/click tracking on the
  lead. First confirm Brevo's sending path (transactional API key vs SMTP) + enable
  webhooks — currently unverified.
- Run the model eval; tune thresholds; expand keywords.

### Phase 3 — intelligence
- Competitor-spike alerts ("surge in QuickBooks complaints").
- Cross-post dedup by author / content similarity.

---

## 8. Open questions (all confirmed 21 Jun 2026 — kept swappable, none blocking)

1. **API Direct snippet sufficiency** ✅ confirmed approach — if snippets are too short
   for scoring, the normalizer gains a Bright Data full-text step for promoted leads
   only; nothing else changes.
2. **LinkedIn coverage** ✅ confirmed approach — Octolens drops in as another normalizer
   mapper if API Direct's LinkedIn is weak.
3. **Local model choice** ✅ **decided from real captures** — pick via a ~20-post eval
   (`gemma2:2b` vs `llama3.2:3b` vs `qwen2.5:3b`) once we have actual captured posts.
   One config value; swap is one line.
4. **First closed community** ✅ **Facebook group** confirmed; LinkedIn/Discord/Slack/
   Skool follow by adding per-site selector modules to the extension template.

---

## 9. Guardrails (from strategy §9)

- No auto-send — always human-approved.
- Respect closed-community rules; default to helpful-reply mode in private groups.
- Only capture what we can legitimately see as a member; never republish private content.
- Data minimization / GDPR — store the minimum; support deleting a lead + its source.
- Keep all provider/API keys server-side (VM or Supabase secrets), never in the client.
