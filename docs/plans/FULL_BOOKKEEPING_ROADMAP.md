# Full-bookkeeping roadmap — gap audit, demand triangulation, autonomous build loop

> Status: **active** · 2 Jul 2026 · Owner: Nik

*Compiled 1 Jul 2026 from three parallel audits: the demo apps (`apps/demo`), the real product
(`apps/app` @ penny.founderfirst.one), and 1,593 prod Signals items (297 high-intent).*

**North star:** a CPA can open a client in Penny and file their taxes directly from it —
no re-keying into other software, no "are these numbers real?" doubt.

**Standing principles (Nik, 1 Jul):**
1. **Usability is the hard part — treat it that way.** Building functionality is easy;
   keeping each user's workflow simple and focused is hard, so usability gets engineered
   and gated, not assumed. Every feature is designed *from a persona's workflow inward*
   (owner: "am I okay / what needs me?"; CPA: record → categorize → reconcile → close →
   report), nests under an existing job (APP_PRINCIPLES §1 — never a new top-level tab
   without Nik), and must make its workflow *shorter or calmer*, never longer. Complexity
   lives in Penny, not the UI.
2. **Never breaks** — every incident, stress finding, and LEARNINGS rule becomes a permanent
   automated scenario; the regression suite only grows.
3. **Centralized — scale and change without code changes.** Every cross-cutting aspect has
   ONE source of truth; changing it is an edit in one place (ideally admin-editable at
   runtime, no redeploy), never a code sweep. The registry:

   | Aspect | Single source | Status |
   |---|---|---|
   | Design (color/space/type/radius) | `packages/design-system/tokens.css` | ✅ enforced |
   | Brand voice (all surfaces) | `VOICE.md` + live personas (`penny_voice`, `penny_outreach_persona`, `penny_discord_persona` — admin-editable, no redeploy) | ✅ pattern proven |
   | Site constants (URL/email/brand/social) | `apps/web/src/lib/site.ts` (`SITE`) | ✅ enforced |
   | Nav/IA per lens | `apps/app/APP_PRINCIPLES.md` | ✅ spec'd |
   | Tax jurisdictions/forms/lines/mappings | seed data (tax research Part B) | ✅ designed as data |
   | Industry personas → CoA templates/categories | seed tables (from demo `industries.json`) | 🔨 W3.3 builds as data |
   | **Penny's in-app language/prompts** | live surface-keyed persona (same pattern as Discord/outreach) — **never baked into `apps/app` or edge fns** | ❌ card CENTRAL-1 |
   | **Owner/CPA-facing copy in `apps/app`** | one strings catalog (module now; content table when Penny-editable copy matters) | ❌ card CENTRAL-1 |
   | **Behavior thresholds** (trust-tier confidence cutoffs, ≤5 asks/week budget, auto-propose limits, digest cadence) | `platform_config` / `org_settings` rows, admin-tunable | ❌ card CENTRAL-1 |

   Loop rule: a builder adding a color, a voice line, a threshold, a brand string, or a
   tax/industry rule **inline in a feature file** is a gate failure — it goes in the
   registry's source instead (and if the source doesn't exist yet, that's a `decision-needed`
   flag, not an inline workaround).

   **3b. The platform kernel — centralize the KNOWLEDGE, not just the style (Nik, 1 Jul).**
   Every app (apps/app, apps/web, apps/admin, bubble, emails, Signals, demo — and any future
   app) is a **projection of one shared kernel**. Two layers:

   **Knowledge kernel — business/domain facts as seed data (add a row, every app updates):**

   | Knowledge | Table/seed | Who consumes it |
   |---|---|---|
   | **Entity types** (label, plain-language "what am I?", diagnostic questions, owner-draw treatment, officer-comp rules, which forms they file) | `entity_types` seed | onboarding, tax engine, Penny explanations, marketing/compare pages, quarterly estimator |
   | **Sectors/industries** (CoA template, typical payment methods, vendor priors, tax quirks like COGS/booth-rent, marketing blurb, Signals search queries) | `industries` seed (supersedes demo `industries.json`) | onboarding tiles + CoA seeding, categorize hints, per-sector landing pages, **Signals source generation** |
   | **How they file: filing obligations + calendar** (per jurisdiction × entity × year: forms due, quarterly-estimate dates, 1099 issuance, extensions) | `filing_obligations` seed | "Coming up" cards, email nudges, tax package checklist, content calendar for blog/podcast |
   | **Tax structure** (jurisdictions → forms → lines → mapping rules; year-keyed params: 1099 threshold, meals %, mileage) | tax research Part B tables | tax engine, exports, estimator, 1099 report |
   | **Vendor → category priors** (platform-level: "AWS→cloud hosting"; distinct from per-org learned rules, no cross-tenant leakage) | `vendor_priors` seed | categorization first-guess everywhere (app, catch-up, imports) |
   | **Connector registry** (provider name/logo/scopes/capabilities behind ONE provider interface) | `external_connections` + registry seed | Connections tab, marketing "works with" strip, import flows — adding Shopify = one interface impl + one row |
   | **Plans & entitlements** (what each plan unlocks) | data on `subscriptions` plans | app gating, pricing page, admin — pricing change = row edit |

   **Capability kernel — shared rails every app calls (already largely built):**
   design system (`tokens.css` + typography/header pattern) · live voice personas ·
   copy/content tables · money/minor-units formatting (promote `money.ts` to a shared
   package the day a second app needs it) · auth/tenancy predicates (`can_access_org` /
   `can_write_org_as`) · audit log · AI inference layer (`ai_decisions` + the quality/cost
   plan) · outbound comms rail (`email_schedules` dispatcher) · analytics wrappers.

   **The test:** "add a sector" = one seed row → onboarding tile, CoA template, categorize
   hints, landing page, and Signals queries all exist. "Add a country" = seed files only.
   "Change a deadline" = one row, and every reminder/card/checklist moves. If adding a
   knowledge fact requires touching more than one app, the kernel is missing a table —
   file it, don't fork it.

   **3c. When laws change — the regulatory lifecycle (Nik, 1 Jul).** A tax-law change must
   reach every app as a DATA change with a review gate, never a code sweep:
   1. **Law is effective-dated, versioned data.** Every law-derived row (form line, mapping
      rule, threshold, %, deadline) carries `effective_from`/`effective_to` (not just a
      tax-year key — some changes hit mid-year) plus a **source citation** (IRS rev-proc /
      bill / instruction URL). Nothing is overwritten: a change is a new row superseding the
      old. **Old periods compute under old law** — essential for catch-up mode (2022 books
      use 2022 rules) and for never silently re-stating a filed year.
   2. **Apps only look up, never know.** No app or edge fn contains a law-derived literal
      ($ threshold, %, date, line number) — they query the kernel ("1099 threshold for tax
      year X in jurisdiction Y"). Enforced by the centralization gate + a lint that flags
      law-looking literals in feature code.
   3. **A Regulatory-watcher loop role** monitors official sources (IRS newsroom, form
      instruction revisions, state DOR feeds) + trade press, and when it detects a change,
      **drafts the seed-diff as a PR** with the citation and a list of affected consumers
      (estimator, 1099 report, coming-up cards…). It NEVER self-merges.
   4. **Human review gate:** Nik (later: a reviewing CPA) approves the law PR — law changes
      are always `decision-needed` class. Merge → idempotent seed loader → **every app is
      updated in one go**.
   5. **Propagation is itself kernel-driven:** on activation, affected artifacts recompute
      (estimates, deadlines) and the comms rail can notify affected orgs ("the 1099-K
      threshold changed — here's what it means for you"), with Penny explaining from the
      stored citation. Law changes become a trust + content moment, not a fire drill.
   Proof-of-shape already in hand: the 2026 OBBBA 1099 change ($600→$2,000) is modeled in
   the tax research as a year-keyed seed param — under this lifecycle it would have been
   one reviewed seed PR, live everywhere at once.

4. **Follow the existing tech stack — never change it silently (Nik, 2 Jul).** The stack is
   settled: pnpm monorepo · React + Vite (`apps/app`, `apps/admin`) · Astro + React islands
   (`apps/web`) · Preact (bubble) · Supabase (Postgres + RLS + Deno edge fns + Auth) ·
   Cloudflare (Pages/Workers/DNS/Tunnel) · Fly.io (bridge, Kokoro) · GitHub Actions CI ·
   pgTAP / Vitest / Playwright · design-system tokens. Builders solve every card **within**
   this stack. A new framework, language, database, ORM, state library, CSS system, queue,
   or hosted service — or a major-version migration — is NEVER a builder's call: it's a
   `decision-needed` card for Nik with the problem it solves and the in-stack alternative
   considered. New npm utility deps are allowed but minimal, pinned, and named in the PR.

---

## 1. Where we actually are

The real app is **not a broken demo — it's a solid foundation missing its top half.**

**Shipped and stress-tested (Phases 0–3, all 15 features adversarially tested; 15/15 fully
closed and deployed as of 2 Jul — live board: docs/STRESS_TEST_TRACKER.md, findings ledger:
docs/AUDIT.md):**
tenancy + RLS isolation, append-only double-entry ledger (balanced, idempotent, reversal-based
corrections), chart of accounts, accounting periods with close-lock, CSV + opening-balance import
(the CSV `safe_to_date` migration `20260702020000` is now live in prod, so all 15 are closed),
QBO/Xero OAuth connectors (deployed; Xero awaiting re-consent), Penny categorize
(rules-first → grounded AI, learns on approval), owner/CPA/staff lenses, invites + engagements,
TB / P&L / Balance-sheet on screen, GDPR export, break-glass staff console.

**The demo promised, the product doesn't yet have:**

| Demo capability | Real app today |
|---|---|
| 8-step personalized onboarding (entity, industry, banks, cadence) | Bare create-org form |
| Penny chat thread: greeting, proactive approval cards, idle voice, Q&A | No chat; categorize is a form with a confidence % |
| 9 approval-card variants (income celebration, owner's draw, rule proposal, recurring, CPA suggestion…) | One propose/approve flow |
| Receipt capture: photo / voice / text / email | Not built |
| Bank feeds (10 banks shown) | CSV import only; Plaid not wired |
| Invoicing (designer + recurring send) | Not built |
| Books dashboard: tax-readiness %, needs-a-look, coming-up deadlines, estimated taxes | Overview with health flags only |
| P&L grouped by IRS line, entity-aware (Sch C / 1120-S / 1065) | Generic P&L, no tax mapping |
| Cash-flow statement (GAAP indirect) | Not built |
| CPA work queue (reclass, pending adds, flags, Penny questions) | Not built (Phase 5) |
| CPA flag/annotate/add-transaction with founder approval loop | Not built |
| Learned-rules management table | Rules learned but no manage/delete UI |
| Multi-client CPA dashboard with per-client tax readiness | Basic org switcher |
| PDF/CSV exports | Not built (stub even in demo) |
| 10 industry personas seeding categories/banks/vendors | Generic chart of accounts |

**The tax-filing chain and where it breaks:**

```
bank data in → reconciled → categorized → tax-line mapped → CPA adjusts → period closed → export package
   CSV only      ❌ no UI       ✅ works        ❌ none         ⚠️ no queue     ✅ works       ❌ none
```

Reconciliation, tax-line mapping, CPA workqueue, and exports are the four missing links.
Everything else in the chain already works.

---

## 2. What customers are asking for (Signals, prod)

297 high-intent items analyzed (data caveat: ~120 empty-body Facebook captures inflate tag
counts; themes below are from the ~180 posts with real text; 0 sent/replied/won leads yet, so
this is expressed demand, not conversion data).

| Rank | Theme | Signal | Product implication |
|---|---|---|---|
| 1 | **Catch-up / cleanup bookkeeping** (months–years behind) | ~55 explicit; humans quote $10k+ and refuse the work | Catch-up onboarding wedge: bulk history import + backlog auto-categorize + flat price + shame-free framing |
| 2 | **QuickBooks rage** (~200 mentions: price hikes, forced online migration, "AI categorization correct <10% of the time") | switching intent with "I'd love historic data in the new system" verbatim | One-click QBO migration with history (connectors already live) |
| 3 | **"Need a bookkeeper", $200–350/mo anchor** | spec repeated verbatim: reconcile + categorize + monthly P&L/cash flow + responsive | This IS Penny's core bundle; validates pricing |
| 4 | **Tax filing / quarterly estimates / 1099 confusion** | missed deadlines, penalty anxiety, 95-contractor 1099 mess | Quarterly estimate + set-aside guidance; 1099 tracking; year-end CPA package |
| 5 | **Provider-collapse rescues + AI distrust** (Bench, Heard; "no hallucination-prone model near my taxes") | trust is the moat, not automation | Show verification: tie-outs, audit trail, export guarantee — grounded-AI positioning |
| 6 | **E-commerce mess** (Shopify/Stripe/Etsy fee & refund splitting; "8–10 hrs/mo reconciling") | clearest vertical with money | Channel payout integrations, fee/refund separation, COGS |
| 7 | Reconciliation + categorization drudgery | "I always forget to export the CSV" | Validates bank feeds + the categorize core |
| 8 | **"Are my numbers real?"** cash-flow/reporting clarity | even an $18M-revenue owner | Plain-English monthly summary, comparative P&L, tie-out statement |
| 9 | Invoicing / AR chasing ($30k overdue) | also "I use Square/ADP, don't force a suite" | Modular invoicing later; never bundle-force |
| 10 | Lender/investor-ready books | lost-funding horror stories | "Due-diligence package" artifact + marketing moment |

**Verticals by volume:** e-commerce/resellers ≫ freelancers/creators > healthcare/therapists >
food/beauty > trades/auto/trucking > real estate/STR > agencies/professional services.
Maps almost 1:1 onto the demo's 10 industry personas — the demo config is reusable as-is.

**Don't build:** payroll (integrate Gusto — 6 mentions, all horror stories about *others*),
multi-currency (post-pilot, guard already enforces), forced suite bundling.

---

## 3. The triangulated feature list (waves = merge order)

Each item below gets a spec card in `docs/plans/BACKLOG.md` (format in §4.3) before a build
session touches it.

### Wave 0 — hygiene (partly IN FLIGHT in the integrator chat — do not duplicate)
- **W0.1 ✅ DONE (2 Jul, via #156):** #131/#139 prod-ahead-of-main drift closed — prod fn
  bodies captured on `main`, approve guard restored, unique index live.
- **W0.2–W0.3 — status per the 2 Jul pre-launch audit:** #143 (CSV) is **MERGED** — F3
  delimiter fixed, and the `safe_to_date` migration `20260702020000` is **deployed to prod**
  (verified: `add_import_rows` calls `safe_to_date`). The new migration-ledger drift is
  **RESOLVED** — prod ↔ `main` are in perfect sync (115 = 115, same max version). The pgTAP
  gate is green. **Prod fixture purge ✅ DONE (2 Jul, Nik-authorized):** all 134 `[…TEST]`/
  harness orgs removed — `organizations` = 0, append-only guards intact, global tables
  untouched (backup taken first per LEARNINGS #4; `TRUNCATE organizations CASCADE` was the
  clean tool — it skips row-level delete triggers). **Still open:** CSV **F4 dedup = Nik
  decision** (does not block builds); 113 orphaned test `auth.users` (optional). Prod is a
  clean base for `[LOOP-*]` fixtures.
- **W0.4 ✅ DONE (PR #157 deployed):** Signals worker guard against empty-body items being
  promoted + auto-drafted.
- **W0.5 Land the finalized spec docs on `main`** ← added 1 Jul (Nik); **done in the 2 Jul
  audit PR.** These SEVEN files were uncommitted on the STALE `deploy-finish` tree and had to
  reach `main` or loop builders (who branch from `main`) would never see them:
  `apps/app/APP_PRINCIPLES.md` (new — the IA spec + decisions log) ·
  `docs/plans/ARCHITECTURE.md` (nav §1c + admin-absorb §4.2 edits) ·
  `apps/admin/ADMIN_PRINCIPLES.md` (scope note) · `docs/plans/FULL_BOOKKEEPING_ROADMAP.md` ·
  `docs/plans/BACKLOG.md` · `docs/plans/research/tax-mapping-research.md` ·
  `docs/plans/LOOP_PROMPT.md`.
  **NOT re-landed:** `docs/STRESS_TEST_TRACKER.md` — the integrator chat already landed the
  newer v2 operating-model version on `main` (PR #159); carrying the stale `deploy-finish`
  copy would REGRESS it. **How:** docs-only branch off `main` → PR → merge (never commit via
  `deploy-finish`; CLAUDE.md is gitignored so its edits stay local by design).

### Wave 1-IA — the navigation frame (from apps/app/APP_PRINCIPLES.md, merged 1 Jul)

A parallel session locked the app's IA redesign with Nik — **every feature below builds into
this frame, not the old tab set** (avoids double work):
- **IA-1 Owner lens**: Home ("am I okay?") · **Review** (the single decision queue — this IS
  where trust-tiered items land) · Reports · **Connections** (bank/connectors/import/invite —
  absorbs the Import tab; Plaid W2.3 + QBO migration W2.2 land here) + de-emphasized
  **Advanced** (Journal · CoA · Periods). "+ New organization" moves into the org switcher.
- **IA-2 CPA lens**: firm-level **Practice home** (ranked needs-review/uncategorized/
  unreconciled/deadlines across all clients — **this IS W1.4, merged**) + per-client
  workflow tabs (Journal · Categorize · CoA · Reports · Periods); switcher = client list.
- **IA-3 Internal admin console** (`penny.../admin` mirroring `founderfirst.one/admin`):
  **plan-only until Nik signs off the migration plan**; parallel-run, additive, never break
  `/admin`.
- ⚠️ **Baseline discipline**: `main` == prod (grouped nav already live); `deploy-finish` is
  STALE for app IA — all builders branch worktrees from `main`. Local git history commands
  hang; verify prod state via `gh api`.
- Sequencing: **IA-1 goes first** — it touches `Ledger.tsx`/`OwnerLens.tsx`, shared with
  nearly every Wave-1 UI card; landing it early prevents a week of merge conflicts.

### Wave 1 — the CPA tax-filing chain (the north star; this is "what's missing")
- **W1.1 Bank reconciliation UI** — match ledger entries to statement lines per account/period;
  unmatched-item queue; reconciliation report. **New schema** — the card creates the
  `reconciliations` + match tables (no such table exists today; prod has only
  `import_batches` / `import_rows` / `ai_reconcile_runs`). *The single biggest trust gap for
  CPAs (Signals #3, #5, #7).*
- **W1.2 Exports** — TB / P&L / BS / GL detail as CSV + PDF; per-period; entity-stamped.
  Without this a CPA literally cannot hand off to tax software.
- **W1.3 Tax mapping engine — RESEARCH-FIRST (Nik: do NOT port the demo's irs-lookup.js;
  it's one input at most).** *Status: research (A) ✅ DONE —
  docs/plans/research/tax-mapping-research.md, awaiting Nik sign-off on its 8 open
  questions; build (B) blocked until then.* Two deliverables before any build:
  - **(A) Research report:** what a CPA actually needs from client books to file each US
    return (Sch C, 1120-S, 1120, 1065 + the K-1/officer-comp/capital-account wrinkles);
    how QBO/Xero/Bench/Digits/FreshBooks structure books→tax mapping and where CPAs say
    they fail; what our Signals corpus demands (quarterly estimates, 1099s, set-aside
    guidance, "did I miss the deadline" anxiety).
  - **(B) Architecture spec:** a **data-driven mapping layer** — `tax_jurisdictions` →
    `tax_forms` → `tax_form_lines` → account-mapping rules stored as **data** (seed files
    per jurisdiction + entity type), never hardcoded. **Scope (Nik, 3 Jul, LOCKED): every
    sector/persona we build × US federal + all 50 states** — the seed matrix `sector ×
    entity_type × jurisdiction(federal + 50 states) × tax_year`, all rows, shipped as data
    (federal + all-sector first, states seeded in demand-first to all 50). All book-derived
    taxes (income/franchise returns, 1099s, estimates + sales-tax liability tracking); sales-tax
    rate/nexus via integration, payroll via Gusto. See tax-mapping-research "Scope decision".
    Extensibility proven by dry-mapping one foreign form on paper (Canada T2125) with **zero
    code changes**. Adding a state/country/sector = inserting rows.
  - Spec reviewed by Nik before a builder touches it. Then: P&L grouped by tax-form section,
    per-account tax-line assignment UI (CPA-editable), **year-end tax package** export.
- **W1.4 CPA workqueue = IA-2 Practice home** (merged with the IA redesign) — firm-level
  landing ranked across clients: pending-review, uncategorized, unreconciled, flagged,
  upcoming closes; demo's WorkQueue interaction model (view/categorize/resolve/answer).
- **W1.5 CPA collaboration primitives** — flag transaction + note, CPA-adds-transaction with
  owner acknowledgment, reclass suggestion → owner approval card, adjusting-entry workpaper
  notes; all audit-logged (demo has the full interaction spec).
- **W1.6 Learned-rules management** — table view + delete, per demo `LearnedRules.jsx`.

### Wave 2 — demand wedges (what wins customers; Signals-driven)
- **W2.1 Catch-up mode** — multi-file/multi-year import flow, backlog auto-categorize with
  batch approval, progress meter ("2022 ✓ 2023 ✓ 2024 in progress"), shame-free copy
  (VOICE.md), marketing page + flat price. *Signals theme #1.*
- **W2.2 QBO migration** — one-click: pull CoA + full history via existing connector, map
  accounts, land as import batches, side-by-side TB verification vs QBO's. *Theme #2.*
- **W2.3 Bank feeds (Plaid)** — not yet integrated; full path (removes the CSV chore, theme #7):
  1. ✅ **DONE (2 Jul):** Plaid account created; client_id + sandbox/production secrets in
     `~/.config/founderfirst/secrets.env` (builder copies to Supabase fn secrets at build).
  2. Edge fns `plaid-link-token` + `plaid-exchange` (public_token → access_token stored in
     `external_connections`, same pattern as QBO/Xero); Plaid Link in the Import tab.
  3. Sync via `/transactions/sync` cursor + a `plaid-webhook` receiver fn → raw rows into
     `bank_transactions` → posted into the categorize queue with per-row idempotency keys
     (`ext:plaid:<transaction_id>` — the exact dedup discipline from the QBO/Xero F1 fix).
  4. Handle Plaid's mutating history (pending→posted, removed, amount-modified) via
     reversal-based corrections — never edit posted entries.
  5. Red-team pass: webhook replay, CSV-overlap double-post, token revocation, item error
     states, cursor loss/reset.
  6. **Start Plaid production application early** (their review has lead time); run
     limited-production before general availability.
- **W2.4 Quarterly tax assistant** — estimated-tax calc from real P&L + entity type,
  set-aside %, deadline "coming up" cards, penalty warnings. *Theme #4.*
- **W2.5 1099 contractor tracking** — vendor tagging, payment-method capture, year-end
  1099-NEC summary in the tax package.

### Wave 3 — the human Penny layer (demo parity; what made the demo feel alive)
- **W3.1 Penny thread in-app** — chat surface on real books: greeting, Q&A grounded on the
  org's actual ledger (same grounding discipline as categorize), idle voice. Reuse the demo's
  intent architecture + VOICE.md; bubble-worker pattern already proves the live-prompt approach.
- **W3.2 Trust-tiered autonomy (Nik decision, 1 Jul) — the user-lens rework of approval
  cards.** The demo's ask-about-everything model becomes homework at scale; instead:
  - **High confidence** (learned rule / repeat vendor): Penny **posts it herself** → shows in
    a "Penny did this" activity feed with 1-tap undo (reversal under the hood) + a weekly
    digest. No card.
  - **Medium confidence**: posts as `pending_review` (workflow already exists) → appears in
    needs-a-look, batch-approvable.
  - **Low confidence / unknown**: becomes an approval card — port only the variants real
    events actually produce (low-confidence, owner's draw, rule proposal, CPA suggestion);
    income celebration lives in the digest, not a card.
  - **Interruption budget: ≤5 asks/week per org** — measured from `ai_decisions`, thresholds
    tuned until the budget holds.
  - **Surface: the owner's Review tab** (APP_PRINCIPLES §2) — the single decision queue;
    the "Penny did this" feed and digest hang off Home.
- **W3.3 Minimal onboarding (Nik decision, 1 Jul) — 3 steps, not the demo's 8.**
  Business name → entity type (with the "not sure" 2-question diagnostic) → industry
  (seeds the CoA template from the 10 demo personas). Everything else is asked **in-journey
  at the moment it matters**: bank connect offered right after (skippable), payment methods
  when the first unknown income source appears, check-in cadence after the first week,
  never as an upfront quiz.
- **W3.4 Books dashboard upgrade** — tax-readiness %, needs-a-look, coming-up deadlines,
  plain-English monthly summary + comparative P&L (theme #8), estimated taxes strip.
- **W3.5 Receipt capture** — photo/text first (voice later) → parsed → approval card.

### Wave 4 — vertical + expansion
- **W4.1** E-commerce payout splitting (Shopify/Stripe first: fees, refunds, COGS) — theme #6.
- **W4.2** Cash-flow statement (GAAP indirect; demo `util/cash-flow.js` is the spec) — theme #8.
- **W4.3** Invoicing + AR nudges (modular, opt-in) — theme #9.
- **W4.4** Lender/DD-ready package — theme #10.
- **W4.5** Rescue-migration landing pages (Bench/Heard-style events) — marketing, feeds Signals.

---

## 4. The autonomous build loop ("Claude runs day and night")

### 4.1 What we already proved
The stress-test program (docs/STRESS_TEST_TRACKER.md) already ran **15 parallel autonomous
sessions** against prod with zero incidents, because of its operating rules: one session per
feature in its own worktree, namespaced fixtures, write-don't-deploy migrations, PR-only
output, integrator merges in waves. **The build loop is the same machine pointed at features
instead of bugs.**

Lessons encoded from real incidents (LEARNINGS.md + memory):
- The 9×/night admin-hardening cron leaked sessions (never exited → SIGBUS, drifting main).
  → every scheduled session gets a hard timeout, a single task, and must end by opening a PR
  or posting a blocked-report. No session ever commits to `main`.
- Two parallel sessions fixed the same P0 twice (PRs #132/#139). → backlog items carry a
  **claim marker**; the integrator dedupes; shared-file touches must be declared in the PR.
- Fixes deployed to prod but never merged (#131/#139 drift). → the loop's rule is inverted:
  builders never deploy; only the integrator deploys, and only from `main`.

### 4.2 Roles (each is a scheduled Claude session with a fixed prompt pack)

| Role | Cadence | Does | Never does |
|---|---|---|---|
| **Builder** (×2–3 parallel) | nightly | Claims top unclaimed backlog card → own worktree → reads CLAUDE.md/LEARNINGS.md/area spec → implements + tests (pgTAP/Vitest/E2E) → `tsc` + build green → opens PR with spec-card checklist | merge, deploy, touch another claim, schema-push |
| **Red-team** | nightly, offset | Takes yesterday's builder PRs → adversarial stress per STRESS_TEST_TRACKER common rules (namespaced fixtures, verify-every-mutation, cleanup.sql) → findings + fixes pushed to the same PR | merge, deploy, delete data |
| **Integrator** | daily (morning) | Reviews PRs, sequences merges (shared-file conflicts), merges green+stress-passed PRs, deploys migrations-then-functions in one wave, verifies from the system (logs + re-query), updates tracker + backlog, files follow-ups | invent scope, skip verification |
| **Regression engineer** | nightly | Converts every stress finding, LEARNINGS.md rule, and audit finding into **permanent automated scenarios** (pgTAP / Vitest / Playwright E2E) in a versioned scenario pack; runs the FULL suite nightly against a fresh seeded environment; files a red report on any regression. The suite only ever grows — nothing that broke once can break silently again | delete/weaken a scenario without a retro decision |
| **Regulatory watcher** | weekly (daily in season) | Monitors IRS/state sources for law + form changes; drafts effective-dated, cited seed-diff PRs listing affected consumers (principle 3c) | self-merge — law PRs are always `decision-needed` (Nik / reviewing CPA) |
| **Auditor** | weekly (exists) | `/audit` cloud agent → Quality dashboard (`/admin/quality`, audit_runs) | — |
| **Retro** | weekly | Reads the week's PRs + incidents → proposes LEARNINGS.md/backlog updates as a PR | edit LEARNINGS.md directly |

Builder PRs must **ship scenarios for their acceptance list** — the regression engineer
back-fills history (yesterday's 15 stress features first), builders keep it current.

### 4.3 Backlog = the loop's fuel (single source of truth)
`docs/plans/BACKLOG.md`, one **spec card** per feature, written before any builder touches it:

```markdown
## W1.2 Exports (TB/P&L/BS/GL → CSV + PDF)
status: unclaimed | claimed:<session> | pr:#NNN | merged
goal: CPA downloads a period-stamped financial package good enough for tax software.
workflow: <REQUIRED — persona · the job this serves · the walkthrough in steps/taps,
  e.g. "CPA · year-end handoff · Reports → period → Download package = 3 taps">
spec: <what exactly; link demo file if porting>
acceptance:
  - [ ] CSV + PDF for all four reports, period-scoped, entity-stamped
  - [ ] Numbers tie to on-screen reports to the cent (test proves it)
  - [ ] Works for read_only CPA; audit-logged
guardrails: BLOG n/a; RESPONSIVE ladder; tokens only; VOICE for any copy
tests: Vitest on report serialization; E2E download; pgTAP if any RPC
touches: apps/app/src/ledger/* (SHARED — declare in PR)
decision-needed: none | <question for Nik>
```

Cards with `decision-needed` are skipped by builders and surfaced to Nik by the integrator —
product decisions stay human.

### 4.4 Gates every PR must pass
CI (all already exist): App E2E · Admin E2E · Responsive gate · db-tests (pgTAP) ·
migrations-unique · build.
Loop rules: tests added for the acceptance list, VOICE lint for copy, tokens-only styling,
migrations written-not-deployed, shared-file declaration, cleanup manifest for any prod fixture.

**Usability gate (standing principle #1 — every PR with a user-facing surface):**
- **Workflow walkthrough in the PR body**: persona → entry point → numbered steps to complete
  the job, with the tap count, and the before/after ("this job was N steps, now M" or
  "new job, M steps"). Red-team verifies the walkthrough is honest by actually driving it (E2E).
- **Simplicity budget**: no new top-level nav item, no new required onboarding question, and
  no new owner-facing accounting vocabulary — any of these = `decision-needed`, goes to Nik.
- **Nests under an existing job** (APP_PRINCIPLES §1): the PR names which tab/job the feature
  lives in; features that "need" their own tab get redesigned, not shipped.
- **Interruption honesty**: anything that pings/asks the owner counts against the ≤5 asks/week
  budget and says so in the PR.
- The demo's copy discipline applies (no shame, action-first, plain words for owners,
  accounting vocabulary only in CPA/Advanced surfaces).

**Centralization gate (standing principle #3):** the PR introduces no inline hex/px, no
hardcoded brand/site strings, no baked-in Penny language or prompt text, no magic-number
thresholds, and no per-file config — each comes from its registry source (§ principles).
New cross-cutting values ship as data (seed rows / settings / tokens), so tuning them later
is an edit, not a PR.

**Wave gate — full audit after every wave / major functionality (Nik, 1 Jul).** A wave is
not "done" when its cards merge; it's done when it survives the same treatment the platform
got on 30 Jun–1 Jul:
1. **Full-surface audit** per the docs/AUDIT.md rubric (14 dimensions, P0/P1/P2 scoring) scoped
   to what the wave touched + its blast radius.
2. **Adversarial stress pass** on the wave's features, per the v2 operating model in
   docs/STRESS_TEST_TRACKER.md (orchestrator fans out finder → verifier → fixer; namespaced
   fixtures; verify-every-mutation; findings ledgered in docs/AUDIT.md).
3. **Coverage ratchet:** every finding — including the near-misses — becomes a permanent
   scenario in the regression pack (edge cases + negative paths + concurrency, not just
   happy paths), and new rules land in LEARNINGS.md via the retro PR. Coverage only ever
   grows; each wave starts from a stricter baseline than the last.
4. **Gate:** the next wave's builders don't scale up until the wave audit is green
   (P0s fixed + verified, P1s fixed or explicitly accepted by Nik).

### 4.5 Human checkpoints (the irreducible minimum, ~30 min/day)
1. **Integrator's merge/deploy wave** — approve or run it (can graduate to standing
   authorization once the loop earns trust, with rollback always one step away).
2. **`decision-needed` cards** (e.g. CSV F4 re-import dedup policy, catch-up pricing).
3. **OAuth/consents/keys** (Plaid signup, Xero re-consent, spend approvals).
Everything else — building, testing, red-teaming, verifying — is the loop's job.

### 4.6 How to physically run it — day + night continuous (Nik decision, 1 Jul)
- **Cadence:** rolling sessions around the clock — ~3 builders at any time (a new one starts
  when one finishes), red-team follows each PR, regression suite at 03:00, integrator wave
  every morning 08:30, retro Sunday. Scheduled via Claude Code routines (`/schedule`), one
  prompt pack per role naming its single task source (BACKLOG.md / open PRs) and hard rules.
- **Mac never sleeps:** `sudo pmset -a sleep 0 disksleep 0` (+ `caffeinate` in the launchd
  wrappers); display can sleep, the machine can't. Set up at loop launch.
- **Isolation:** every session `EnterWorktree` first (existing rule) — **worktrees branch
  from `main` (== prod), never `deploy-finish` (stale for app IA)**; prod fixtures namespaced
  `[LOOP-<card>]`.
- **Watchdog (session-leak lesson):** hard per-session timeout; every session must exit by
  opening a PR or posting a blocked-report; integrator unclaims any card stale >24h; cap ≤3
  concurrent builders.
- **Kill switch:** pausing the routines stops the loop; nothing merges or deploys on its own
  until the integrator step, which is the human-reviewed choke point.

### 4.7 The single dashboard — `/admin` → Build tab (no chat-hopping)
One place to be up to speed in 15 minutes or less; Nik never tracks agents across chats.
- **Plumbing:** two tables (`loop_runs`: session, role, card, phase, status, pr_url,
  blocked_reason, last_beat; `loop_events`: timestamped step log). Every loop session
  heartbeats every ≤10 min via a tiny edge fn; a beat >30 min stale = flagged dead.
- **The tab shows:** now-running sessions with current step · cards by status
  (unclaimed / building / red-teaming / PR-open / merged) · **"Waiting on Nik"** queue
  (merge waves + decision-needed cards, top of page) · last-24h shipped list ·
  regression-suite status (green/red + failing scenario) · token/cost per day if available.
- Follows ADMIN_PRINCIPLES (jobs-not-tools: the job is "am I up to speed and what needs
  me"), lives beside Quality under ⚙️ Settings.

### 4.8 First cycle (gated on Wave 0 finishing in the integrator chat)
1. Wave 0 confirmed done → loop launch: set Mac no-sleep, create the scheduled routines.
2. `docs/plans/BACKLOG.md` spec cards: done (Wave 1 + W2.1–W2.3 + LOOP/REG infrastructure).
3. Tax-mapping research (W1.3-A) runs immediately — it blocks nothing and its spec card
   needs Nik's review anyway.
4. First builds, in parallel (no shared files): **LOOP-1 (Build dashboard)** + **REG-1
   (regression pack v1)** — the loop instruments itself first — and **IA-1 (owner lens
   nav)**, which must land before other app-UI cards (it touches the shared
   Ledger/OwnerLens files everything else builds into).
4b. Then **CENTRAL-1** (copy/Penny-language/threshold centralization — blocked-by IA-1, so
   the sweep runs once on the NEW nav) and **CENTRAL-2** (knowledge-kernel schema + seeds —
   land the schema before W1.3-B / W2.4 / W3.3 build against it). This matches the one-line
   build order in `LOOP_PROMPT.md`.
5. Then W1.2 (exports) + W1.6 (rules UI) into the new nav; then IA-2/W1.4 (Practice home)
   and the full Wave-1 spine once the first wave lands clean.
6. **Wave 1 closes with the full wave audit (§4.4 wave gate)** — docs/AUDIT.md rubric + stress
   pass + coverage ratchet — before Wave 2 scales up.
7. Nik actions, anytime: create Plaid sandbox account; decide CSV F4 dedup policy; answer
   the tax research's 8 questions.

> **The one-page operating prompt that launches all of this:** `docs/plans/LOOP_PROMPT.md`.
