# BACKLOG — the build loop's single source of truth

> Status: **active** · 2 Jul 2026 · Owner: Nik

Rules: builders claim the top `unclaimed` card whose `blocked-by` is clear, set
`claimed:<session-tag>`, work ONLY that card in their own worktree, and exit by setting
`pr:#NNN` or `blocked:<reason>`. Cards with `decision-needed` are SKIPPED by builders and
surfaced to Nik. Never deploy; never merge; migrations write-don't-deploy. Full operating
rules: docs/plans/FULL_BOOKKEEPING_ROADMAP.md §4 + docs/STRESS_TEST_TRACKER.md common rules.

⚠️ **Baseline: worktrees branch from `main` (== prod). `deploy-finish` is STALE for app IA —
never build on it** (apps/app/APP_PRINCIPLES.md §0). Local git history hangs; verify prod
state via `gh api`. All app-UI cards build into the APP_PRINCIPLES nav (owner: Home · Review ·
Reports · Connections + Advanced; CPA: Practice home + workflow tabs) — read that doc first.

⭐ **Usability gate (standing principle #1 — Nik):** functionality is easy; keeping each
persona's workflow simple is the hard part and it is GATED. Every user-facing card/PR must
carry a `workflow:` line (persona · job · steps/taps) and pass Roadmap §4.4's usability gate:
walkthrough in the PR (red-team drives it), no new top-level nav / onboarding question /
owner-facing accounting vocabulary without Nik, feature nests under an existing job, owner
interruptions honest against the ≤5 asks/week budget.

⭐ **Centralization gate (standing principle #3):** no inline hex/px, brand/site strings,
baked-in Penny language, or magic-number thresholds — everything cross-cutting comes from its
registry source (Roadmap principles table: tokens.css · live personas · SITE · seed data ·
platform_config). Missing source = `decision-needed`, never an inline workaround. Tuning the
product must be an edit (token/persona/config row), not a PR.

Status values: `unclaimed` · `claimed:<tag>` · `pr:#NNN` · `red-teamed` · `merged` · `blocked:<reason>`

---

## LOOP-1 · Build dashboard (/admin → Build tab)
status: unclaimed
goal: Nik tracks the whole loop from ONE page, ≤15-min freshness, never hops between chats.
spec: Roadmap §4.7. Tables `loop_runs` + `loop_events` (migration, write-don't-deploy) +
  heartbeat edge fn (bearer-token auth: a shared secret `LOOP_HEARTBEAT_TOKEN` set as a
  Supabase fn secret and checked in the fn — the same env-secret pattern the other fns use;
  loop sessions read it from `~/.config/founderfirst/secrets.env`, so no per-session token
  minting) + admin tab under ⚙️ Settings beside Quality. Sections: Waiting-on-Nik (top) · now-running w/ current step · cards by status ·
  last-24h shipped · regression status. React Query polling 60s.
acceptance:
  - [ ] A session posting heartbeats appears live; >30-min-stale beat shows as ⚠ dead
  - [ ] Waiting-on-Nik lists open decision-needed cards + PRs awaiting merge
  - [ ] Responsive on the full width ladder; tokens only; ADMIN_PRINCIPLES followed
tests: Vitest for status derivation; Admin E2E screenshot of the tab
touches: apps/admin (new route + nav), supabase/migrations, supabase/functions (SHARED nav — declare)
decision-needed: none

## REG-1 · Regression scenario pack v1 (back-fill the 15 stress features)
status: unclaimed
goal: every finding in docs/STRESS_TEST_TRACKER.md + docs/stress/* + LEARNINGS.md becomes a
  permanent automated scenario; nightly full-suite run; product can never silently re-break.
spec: Roadmap §4.2 regression-engineer role. Extend existing pgTAP (supabase/tests) +
  apps/app Vitest + Playwright E2E; scenario ids map to finding ids (e.g. SYNC-F1, CAT-F4).
  Nightly workflow (new .github/workflows/regression.yml) against a fresh seeded local stack:
  `supabase start` → `supabase db reset` (applies all migrations + `supabase/seed.sql`) →
  per-test scenario fixtures created in-suite (namespaced) and torn down after. If no shared
  `supabase/seed.sql` exists yet, this card adds one — do NOT seed against prod.
acceptance:
  - [ ] ≥1 scenario per confirmed P0/P1 from all 15 stress features (double-reversal,
        close-vs-post TOCTOU, LIKE-wildcard poisoning, 1000-row truncation, opening-balance
        silent-drop, forged-actor RPC, CSV dates, COA cycle/currency, re-engage/no-demote…)
  - [ ] Suite green on main; red report artifact on failure
  - [ ] SCENARIOS.md index: finding → scenario file → status
touches: supabase/tests, apps/app tests, .github/workflows (SHARED CI — declare)
decision-needed: none

## IA-1 · Owner lens nav restructure (APP_PRINCIPLES Phase 1)
status: pr:#174  ← LAND FIRST among app-UI cards (touches the shared files everything builds into)
goal: owner navigates by plain-language jobs: Home · Review · Reports · Connections +
  de-emphasized Advanced (Journal · CoA · Periods); "+ New organization" → org switcher.
workflow: owner · "find anything I need" · any job reachable in ≤2 taps from Home; zero
  accounting vocabulary in the 4 primary tabs
spec: apps/app/APP_PRINCIPLES.md §2 + §8 Phase 1 (the authoritative spec; decisions log §7
  is locked — do not reverse). New Connections view absorbs Import tab + InviteCpa aside.
  Review tab hosts the categorize/pending queue (trust-tiered items land here later).
acceptance:
  - [ ] 4 tabs + Advanced render per spec on the width ladder; no orphaned old tabs
  - [ ] Connections: bank/connector/import/invite all reachable; old routes redirect
  - [ ] New-org lives in the switcher only; removed from page body (routes/Home.tsx)
  - [ ] CPA + staff lenses untouched (test proves no regression)
tests: App E2E nav walk per lens; REG scenario
touches: OwnerLens.tsx, Ledger.tsx, Topbar.tsx, routes/Home.tsx (ALL SHARED — declare; other
  app-UI cards are blocked-by this one)
decision-needed: none (decisions locked 1 Jul w/ Nik)

## IA-2 · CPA Practice home + workflow tabs — MERGED WITH W1.4 (one card, see W1.4)

## IA-3 · Internal admin console (penny.../admin mirror)
status: **DEFERRED until after Wave 1 ships (Nik, 3 Jul)** — do not card the migration plan
  yet; `founderfirst.one/admin` stays as-is. Revisit once the Wave-1 tax-filing chain is done,
  then draft the plan for approval (parallel-run, additive, never break `/admin`, APP_PRINCIPLES §4).
decision-needed: none until Wave 1 closes (then: Nik approves the migration plan)

## CENTRAL-1 · Centralize apps/app copy, Penny language, and behavior thresholds
status: pr:#176 (stacked on #174/IA-1)
blocked-by: IA-1 (do the copy sweep once, on the NEW nav, not twice)
goal: change voice/copy/thresholds without code changes (standing principle #3) — the three
  ❌ rows in the roadmap registry.
workflow: Nik/admin · "tune the product" · edit a persona/setting in admin → live everywhere,
  no redeploy (same as the Discord persona pattern today)
spec: (1) apps/app strings catalog — sweep all owner/CPA-facing copy into one module
  (content-table upgrade later if runtime editing is wanted); (2) Penny's in-app language
  reads a live surface-keyed persona ('app' key in penny_outreach_persona-style table, ~60s
  cache + baked fallback — the proven bubble/Discord pattern), covering categorize rationale
  framing + future Review/thread copy; (3) `platform_config` (+ org_settings overrides) for
  trust-tier confidence cutoffs, asks/week budget, auto-propose limit, digest cadence —
  admin-visible, migration write-don't-deploy.
acceptance:
  - [ ] Zero user-facing string literals left in apps/app components (lint/grep check in CI)
  - [ ] Editing the 'app' persona changes Penny's in-app language live, no redeploy (test)
  - [ ] Trust-tier thresholds read from config; changing a row changes behavior (test)
tests: Vitest + E2E; grep gate wired into CI; REG scenario
touches: apps/app broadly (SHARED — sequence right after IA-1, before feature cards pile on)
decision-needed: none

## CENTRAL-2 · Knowledge kernel schema + seeds (entities · sectors · filing calendar · vendor priors · connector registry)
status: pr:#177 (schema + idempotent loader + seeds + one consumer + 3 CI gates + pgTAP)
blocked-by: — (schema card; W1.3-B, W2.4, W3.3 BUILD AGAINST these tables — land the schema
  before those cards start, or they'll each invent their own)
scope note (Nik, 3 Jul, LOCKED): the seed TARGET is **every sector/persona we build ×
  US federal + all 50 states** (`jurisdictions` = federal + 50 states; `industries` = all
  built sectors). Schema + loader ship first; the rows fill in progressively as pure data
  (federal + all-sector first, states demand-first to all 50) — no code changes to add a
  state/sector. See tax-mapping-research "Scope decision".
goal: business knowledge is seed data every app projects from (Roadmap principle 3b): add a
  sector/entity/deadline/country in ONE place → onboarding, CoA seeding, categorize hints,
  tax engine, coming-up cards, marketing, Signals all update.
workflow: Nik/admin · "add a sector" or "change a deadline" · edit one seed file / row →
  every surface reflects it, zero feature-code changes
spec: migrations (write-don't-deploy) + idempotent seed loader + seed files for:
  `entity_types` (labels, plain-language descriptions, diagnostic Qs, draw/officer-comp
  treatment, forms filed) · `industries` (port + extend demo industries.json: CoA template
  ref, payment methods, vendor priors, tax quirks, marketing blurb, signals queries) ·
  `filing_obligations` (jurisdiction × entity × year: form due dates, quarterly estimates,
  1099 issuance, extensions) · `vendor_priors` (platform-level vendor→category, separate
  from org rules) · connector registry rows (qbo/xero/plaid: name, logo, capabilities).
  Tax tables themselves stay in W1.3-B (same principle, already specced) — this card must
  align keys with the research doc (jurisdiction/entity/tax-year keys, stable line_keys).
acceptance:
  - [ ] Seed loader is idempotent + linted in CI (like migrations-unique)
  - [ ] Adding a test sector via seed alone surfaces it in onboarding + CoA template (test)
  - [ ] filing_obligations drives at least one real consumer (coming-up card or email nudge)
  - [ ] No app hardcodes an entity/industry/deadline list anymore (grep gate)
  - [ ] Law-derived rows are effective-dated (effective_from/to) + citation column; a
        superseding row changes behavior for new periods while OLD periods still compute
        under old law (test proves both) — Roadmap principle 3c
  - [ ] Law-literal lint: CI flags law-looking literals ($ thresholds/%/deadlines) in app code
tests: pgTAP on schema, Vitest on loader, REG scenario
touches: supabase/migrations + seeds; consumers land in their own cards
decision-needed: none (design follows tax-research keys; Nik reviews the seed format in the PR)

## LOOP-2 · Regulatory-watcher routine (law changes → reviewed seed PRs)
status: **PR open** · branch loop/loop-2-regulatory-watcher
blocked-by: ~~CENTRAL-2~~ RESOLVED — effective-dated filing_obligations +
  supersede_filing_obligation() / filing_obligations_for() are on main
goal: a tax-law/deadline change becomes ONE reviewed seed PR that updates every app on
  merge — never a code sweep, never hardcoded (Roadmap principle 3c).
workflow: Nik/CPA · "a law changed" · watcher PR arrives w/ citation + affected-consumer
  list → review → merge = live everywhere; zero feature-code edits
spec: scheduled loop routine (weekly; daily Jan–Apr) with a source list (IRS newsroom,
  form-instruction revision pages, state DOR feeds, trade press); on detection: draft
  effective-dated superseding seed rows + citation + consumer-impact list as a PR flagged
  `decision-needed`; NEVER self-merge; false-positive-safe (no detection = no PR, log only).
acceptance:
  - [x] Replay test: feeding it the 2026 OBBBA 1099 change produces the correct seed-diff PR
    (scripts/regulatory-watcher/replay-test.ts · `pnpm check:reg-watcher` — 22 assertions green)
  - [x] PR template carries citation, effective dates, affected consumers (pr.ts prBody() +
    the new "Law change" section in .github/PULL_REQUEST_TEMPLATE.md)
  - [x] Cannot merge without human approval (watcher opens a DRAFT PR labelled
    `decision-needed`, never self-merges; supersede is service_role-only — pgTAP proves it)
build: scripts/regulatory-watcher/ (sources.json registry · detect.ts pure core · fetch.ts
  probe+inject · pr.ts body · run.ts CLI) + .github/workflows/regulatory-watcher.yml
  (weekly + daily Jan–Apr cron) + loop2_regulatory_watcher_test.sql + AUDIT ledger row.
decision-needed: none to build; every PR it produces IS a decision for Nik. Follow-up
  decision-needed for Nik: turn on automated free-text/LLM extraction (today the routine
  probes sources + accepts human/agent-confirmed changes via REG_WATCHER_SIGNALS — safest
  default; auto-extraction adds an inference dep + a false-positive budget, Nik's call).

## W1.3-A · Tax mapping RESEARCH (report + architecture spec — NO build)
status: **✅ SIGNED OFF (Nik, 3 Jul)** — all 8 questions resolved (see the doc's "Decisions"
  section); **W1.3-B is UNBLOCKED**. report: docs/plans/research/tax-mapping-research.md
  (6-table data-driven schema, year-versioned forms, CPA-override layer, M-1 adjustments).
  Locked scope: **all US entity types (incl. C-corp) × federal + 50 states, CPA-lens-gated**;
  exports = generic CSV/PDF **+ per-suite serializers (Drake/UltraTax) at launch**; CPAs edit
  mappings (owners view); Penny proposes M-1 as drafts (human approves); **fixed-asset/
  depreciation subledger BUILT (Penny computes depreciation) — its own card W1.3-C**; year-end
  package included in subscription; US-only launch (Canada = paper proof). Build order in doc.
goal: a well-researched, Nik-approved spec for a data-driven, country-extensible tax mapping
  engine. Explicitly NOT a port of apps/demo/util/irs-lookup.js (demo = one input at most).
spec: Roadmap §W1.3. Deliverables: (A) research report — per-form CPA needs (Sch C, 1120-S,
  1120, 1065, K-1s, officer comp, capital accounts), competitor teardown (QBO/Xero/Bench/
  Digits/FreshBooks tax-mapping + exports + CPA complaints), Signals demand mapping;
  (B) schema spec: tax_jurisdictions → tax_forms → tax_form_lines → account mapping rules AS
  DATA, seed-file format, per-account assignment UX sketch, year-end package contents; prove
  extensibility by dry-mapping Canada T2125 on paper with zero code change.
acceptance:
  - [ ] docs/plans/research/tax-mapping-research.md (cited) + spec section
  - [ ] Nik sign-off recorded on the card before W1.3-B is unblocked
decision-needed: Nik reviews output (that IS the gate)

## W1.2 · Report exports (TB / P&L / BS / GL detail → CSV + PDF)
status: unclaimed
blocked-by: IA-1 (builds into the new Reports tab; shares Ledger.tsx)
goal: CPA downloads a period-stamped financial package clean enough to hand to tax software.
workflow: CPA · year-end handoff · Reports → pick period → Download = 3 taps, one file
spec: export buttons on Reports tab; CSV exact-tie to on-screen numbers; PDF simple + branded
  (tokens); GL detail = full entry/line dump with running balances; period + as-of scoped;
  entity-stamped header; audit-logged; works for read_only CPA. Pagination discipline from
  the RPTTEST truncation fix (.range() paging — ANY report-feeding select must paginate).
acceptance:
  - [ ] All four reports export CSV + PDF, period-scoped, tie to the cent (test proves it)
  - [ ] 10k-entry org exports completely (no 1000-row truncation)
  - [ ] Audit-log row per export; read_only CPA can export, cannot mutate
tests: Vitest serialization + tie-out; E2E download; scenario added to REG pack
touches: apps/app/src/ledger/* (SHARED — declare)
decision-needed: none

## W1.6 · Learned-rules management UI
status: unclaimed
blocked-by: IA-1 (shares Ledger/Categorize surfaces)
goal: owner/CPA sees every categorization rule Penny has learned and can delete bad ones.
workflow: CPA (primary) · "stop a bad rule" · Categorize → Rules → delete + confirm = 3 taps;
  owner reaches it via Advanced, never prompted
spec: table (pattern · target account · learned-from · hit count) in Categorize tab; delete
  w/ confirm ("Penny will stop applying it"); ESCAPE-hardened LIKE handling per CAT-F4;
  audit-logged deletes; VOICE.md copy.
acceptance:
  - [ ] Rules list + delete works for owner and full-access CPA; read_only sees, can't delete
  - [ ] Deleting a rule stops future auto-proposals from it (test)
tests: Vitest + pgTAP on the delete RPC path; REG scenario
touches: apps/app/src/ledger/Categorize.tsx, categorize fn (SHARED — declare)
decision-needed: none

## W1.1 · Bank reconciliation
status: unclaimed
blocked-by: IA-1 (surfaces in CPA workflow tabs + owner Advanced). ⚠️ NO `reconciliations`
  table exists today (prod has only `import_batches` / `import_rows` / `ai_reconcile_runs`) —
  this card CREATES the reconciliation schema (write-don't-deploy migration), it does not
  extend an existing one.
goal: per-account, per-period statement-vs-ledger match with an unmatched queue; the #1 CPA
  trust feature. Keep the UI dead simple: pick account + period → auto-match → resolve the
  short unmatched list → "Reconciled ✓" statement.
workflow: CPA · monthly close · account+period → auto-match → resolve leftovers → ✓; a clean
  month is 2 taps + confirm. Owner never does this — they just see "Reconciled ✓" on Home
spec: auto-match on amount+date window (exact first, fuzzy second), manual match/unmatch,
  create-missing-entry shortcut into categorize, reconciliation report (opening/cleared/
  outstanding/closing), lock reconciled matches. Source lines from `import_rows` (exists
  today); `bank_transactions` is the Plaid-fed source W2.3 adds — until it lands, reconcile
  against `import_rows`.
acceptance:
  - [ ] Reconcile a CSV-imported month end-to-end; report ties to the cent
  - [ ] Unmatched items resolvable without leaving the flow
  - [ ] Reconciled period survives reversals correctly (reversal reopens the match)
tests: Vitest matcher; pgTAP on match RPCs; E2E happy path; REG scenarios
touches: apps/app/src/ledger/* + new fn (SHARED — declare)
decision-needed: none

## W1.4 · CPA Practice home (= IA-2, merged) — ranked workqueue across clients
status: unclaimed
blocked-by: IA-1
goal: CPA's firm-level landing (APP_PRINCIPLES §3): one ranked list across clients — pending
  review · uncategorized · unreconciled · flagged · upcoming closes — clearable in ≤2 taps;
  switcher = client list with "+ Add client"; per-client workflow tabs (Journal · Categorize ·
  CoA · Reports · Periods).
workflow: CPA · "what needs me across all clients?" · open app → Practice home IS the landing
  → top item actionable in ≤2 taps
spec: apps/app/APP_PRINCIPLES.md §3 + §8 Phase 2 (nav) + demo WorkQueue.jsx (interaction
  reference), rebuilt on real data; counts on the client switcher; resolved archive.
acceptance:
  - [ ] Queue ranks correctly across ≥2 clients (seeded test)
  - [ ] Every item type resolvable in ≤2 taps from the queue
  - [ ] read_only CPA sees queue, gets no mutate affordances
tests: E2E across 2 seeded orgs; REG scenarios
touches: apps/app/src/lenses/CpaLens.tsx (SHARED — declare)
decision-needed: none

## W1.5 · CPA collaboration primitives (flag · note · add-txn · reclass suggestion)
status: unclaimed
blocked-by: W1.4 (surfaces in the workqueue + owner needs-a-look)
goal: CPA can flag+annotate entries, add missing transactions (owner acknowledges), and
  suggest reclassifications the owner approves — all audit-logged.
spec: demo Books.jsx overlays = interaction reference; owner sees CPA activity as trust-tiered
  items (suggestion = medium tier, pending_review); learned rule created on approved reclass.
acceptance:
  - [ ] Full round-trip: CPA suggests → owner approves → entry recategorized + rule learned
  - [ ] Every action writes ledger_audit; nothing posts without the required approval
tests: pgTAP on RPCs; E2E round-trip; REG scenarios
decision-needed: none

## W2.1 · Catch-up mode
status: unclaimed
blocked-by: W1.1 (reconciliation proves the catch-up is right)
goal: the #1 Signals wedge — years-behind owners get organized without shame or a $10k quote.
workflow: owner · "get me caught up" · drop files → Penny works → owner answers only batched
  questions → per-year ✓; owner effort measured in minutes per year of backlog, not hours
spec: multi-file/multi-period import queue; backlog auto-categorize in batches (trust-tiered:
  bulk-approve high confidence); per-year progress meter ("2023 ✓ · 2024 in progress");
  VOICE.md shame-free copy throughout; ends in a per-year reconciled + exportable package.
decision-needed: none — **RESOLVED (Nik, 3 Jul): flat price per year of backlog** (a set
  per-catch-up-year fee; directly answers the "$10k quote, nobody will take my job" Signals
  pain). Marketing page states the flat per-year number; the exact dollar figure is a
  go-to-market detail for the marketing card, not a build blocker.
acceptance:
  - [ ] 3 years of CSVs land categorized + reconciled per year in one guided flow
  - [ ] Interruption budget respected even at 5k backlog txns (batch approvals)
  - [ ] Priced as flat-per-year (billing/packaging reflects it)

## W2.2 · QBO migration (one-click, with history)
status: unclaimed
blocked-by: Wave 0 done — the sync provider-commit + per-row dedup fixes are on `main`
  (migration `20260630161500_sync_provider_commit_and_dedup.sql`, deployed). NB: PR #142
  itself closed UNMERGED; its fixes were re-landed via the reconcile PRs, so verify connector
  state on `main`, not on #142.
goal: "I'd love historic data in the new system" — pull CoA + full history, verify side-by-side.
spec: existing qbo-import path extended to historical pull → import batches per year → account
  mapping review → TB comparison vs QBO's TB (the trust moment) → cutover date set.
acceptance:
  - [ ] Sandbox QBO company migrates fully; TB matches QBO to the cent, differences explained
  - [ ] Idempotent re-pull (ext:<source>:<external_id> keys) — no double-posts
decision-needed: none (OAuth consent = human step at run time)

## W2.3 · Plaid bank feeds
status: in-review (PR loop/w2-3-plaid-feeds) — sandbox build complete; production app-review is a Nik step before >10 live users. ✅ Nik created the Plaid account 2 Jul; keys in
  `~/.config/founderfirst/secrets.env` (PLAID_CLIENT_ID / PLAID_SECRET_SANDBOX /
  PLAID_SECRET_PRODUCTION / PLAID_ENV=sandbox). Integrator sets Supabase fn secrets at
  deploy time. Build sandbox-only; file the production application early (review lead time).
goal: transactions flow in without CSVs. Full 6-step path in Roadmap §W2.3.
decision-needed: none for sandbox build
acceptance:
  - [x] Sandbox item links; txns land in categorize queue exactly once (webhook replay-safe)
  - [x] Pending→posted, removed, modified txns handled via reversal-based corrections

# Wave 3 — the human Penny layer (owner-experience; demo parity)

> Roadmap §Wave-3. This wave makes the real app *feel* like the demo for the OWNER: a
> conversational Penny, autonomy that respects the ≤5-asks/week budget, a 3-step onboarding,
> a plain-English Home, and receipt capture. Everything surfaces inside the owner nav locked
> in APP_PRINCIPLES §2 (Home · Review · Reports · Connections + Advanced) — **no new
> top-level tab** (usability gate). All Penny language reads the live 'app' persona and all
> thresholds read `platform_config` (both from CENTRAL-1); all business knowledge (entities,
> industries, filing deadlines) reads the kernel (CENTRAL-2). No card here invents a source
> of truth or hardcodes a list.

**Wave-3 build order (dependency-sorted; matches LOOP_PROMPT build-order style).**
Blocked on Wave-1 IA + CENTRAL cards landing first (owner nav, live 'app' persona,
`platform_config`, knowledge kernel). Within Wave 3:

1. **W3.2 Trust-tiered autonomy** — lands FIRST; it reworks the Review queue + adds the
   "Penny did this" feed + digest that W3.1 and W3.4 both surface. It's the shared spine of
   owner-experience, exactly as IA-1 is the shared spine of the nav. Everything else reads
   what it establishes.
2. **W3.1 Penny thread** (blocked-by W3.2) — the conversational surface that shows the
   activity feed + asks the low-confidence questions the tiering produces.
3. **W3.4 Owner Home/dashboard** (blocked-by W3.2) — hangs the "Penny did this" feed +
   digest + coming-up deadlines off Home; reuses existing ledger/kernel data only.
   **Disjoint from W3.1** once W3.2 lands (thread ≠ Home surface) → the two can build in
   **parallel** after W3.2 merges.
4. **W3.3 3-step onboarding** (blocked-by CENTRAL-2 only, NOT W3.2) — reads entity/industry
   from the kernel; touches the create-org flow, not the Review/Home surfaces. **Fully
   disjoint** → can build in parallel with W3.2 from the start.
5. **W3.5 Receipts** (blocked-by W3.2) — a receipt becomes a trust-tiered item, so it needs
   the tiering pipeline; otherwise self-contained (new capture surface + parse fn). Builds
   after W3.2, **parallel with W3.1/W3.4**.

Parallelism summary: **W3.3 is disjoint from day one**; after **W3.2** merges, **W3.1 ·
W3.4 · W3.5** are disjoint enough to run in parallel (thread surface vs Home surface vs
capture surface — they only share the tier pipeline W3.2 already established). Do NOT run
W3.1/W3.4/W3.5 before W3.2 — they'd each re-invent the feed/tier plumbing.

## W3.2 · Trust-tiered autonomy (the ≤5-asks/week approval rework)
status: unclaimed  ← LAND FIRST among Wave-3 cards (establishes the tier pipeline + feed the others read)
blocked-by: IA-1 (Review tab is the surface), CENTRAL-1 (tier thresholds + asks/week budget
  live in `platform_config`; "Penny did this" copy in the 'app' persona), CENTRAL-2 (vendor
  priors feed the high-confidence path). NB: reuses the trust-tier CONFIG already built in
  Wave 1 — do not re-create it; read it from config.
goal: the demo's ask-about-everything model becomes homework at scale — instead Penny acts on
  what she's sure of, batches the maybes, and only interrupts the owner for true unknowns,
  honestly capped at ≤5 asks/week/org.
workflow: owner · "don't make me do bookkeeping homework" · open Review → high-confidence work
  is already done (visible in a "Penny did this" feed w/ 1-tap undo) · medium items
  batch-approve · low items answered one at a time — a clean week is ≤5 asks total, most weeks 0
spec: Roadmap §W3.2 (Nik decision, 1 Jul). Three tiers, thresholds read from `platform_config`
  (CENTRAL-1), never inline:
  (1) **High confidence** (learned rule / repeat vendor / kernel vendor-prior): Penny posts it
      herself → shows in a **"Penny did this" activity feed** (hangs off Home per W3.4) with
      1-tap **undo** (reversal under the hood — reuse the reversal path, never edit posted
      entries) + a weekly digest. No card.
  (2) **Medium confidence**: posts as `pending_review` (the workflow already exists) → appears
      in the Review queue (APP_PRINCIPLES §2), **batch-approvable**.
  (3) **Low confidence / unknown**: an approval card in Review. Port ONLY the variants real
      events produce — low-confidence, owner's draw, rule proposal, CPA suggestion (W1.5 feeds
      this). Income celebration lives in the digest, NOT a card.
  **Interruption budget: ≤5 asks/week per org**, measured from `ai_decisions`, budget value
  from config; when the week's budget is spent, additional would-be low-confidence items defer
  to the digest rather than interrupt (deferral rule read from config). All Penny-facing copy
  reads the live 'app' persona (VOICE.md — no shame, action-first).
acceptance:
  - [ ] High-confidence categorization posts automatically + shows in the feed with working
        1-tap undo (undo reverses via the reversal path, ledger stays balanced — test)
  - [ ] Medium items land in Review as `pending_review` and batch-approve in ≤2 taps
  - [ ] Low items render as approval cards (only the 4 real variants); income is NEVER rendered
        as an approval card — a low-confidence income event defers to the digest, and a
        high-confidence income event may auto-post to the feed (auto-post is fine — Nik). The
        invariant is only that no income *card* is ever created (test asserts no income card)
  - [ ] Owner asks/week never exceeds the `platform_config` budget for a seeded high-volume org;
        changing the budget row changes the interruption count with no redeploy (test)
  - [ ] All tier cutoffs + budget read from `platform_config` — zero magic-number thresholds in
        component/fn code (grep gate); all copy from the 'app' persona (no inline strings)
tests: Vitest on tier-assignment + budget accounting; pgTAP on the auto-post + undo/reversal
  RPC path; E2E: seed a week of txns → assert feed/queue/card split + asks-count ≤ budget; REG
  scenario (budget-overflow-defers-to-digest; undo-reverses-cleanly)
touches: apps/app/src/ledger/Categorize.tsx + Review surface (OwnerLens/Review), categorize fn,
  new "Penny did this" feed component, `ai_decisions` reads (ALL SHARED — declare; W3.1/W3.4/
  W3.5 build on this feed + tier pipeline)
decision-needed: none (Roadmap §W3.2 locked the tier model + ≤5 budget). If any additional
  approval-card VARIANT beyond the 4 named seems needed → `decision-needed: Nik` (don't invent)

## W3.1 · Penny thread in-app (conversational activity + Q&A on real books)
status: unclaimed
blocked-by: W3.2 (the thread shows the "Penny did this" feed + asks the low-confidence
  questions the tiering produces), CENTRAL-1 (the 'app' persona is Penny's in-app language —
  live, no redeploy, the proven bubble/Discord pattern)
goal: Penny feels alive on the owner's real books — greets, narrates what she did, answers
  grounded questions about the actual ledger, and raises the few things that need the owner —
  the demo's aliveness, on real data.
workflow: owner · "just tell me what's going on / ask Penny a question" · open the thread →
  read Penny's plain-English activity + ask a question → grounded answer in 1 turn; the thread
  is where the ≤5 weekly asks appear, not a separate inbox
spec: Roadmap §W3.1. A chat surface on real books: greeting, activity narration (reads the
  W3.2 feed), Q&A **grounded on the org's actual ledger** (same grounding discipline as
  categorize — never ungrounded generation about numbers), idle voice. Reuse the demo's intent
  architecture + the bubble-worker live-prompt pattern (persona from CENTRAL-1's 'app' key,
  ~60s cache + baked fallback). Surfaces inside the owner nav (Home pulse + Review), **not a
  new top-level tab** (usability gate) — decision-needed if a dedicated entry point seems
  required. No accounting vocabulary to the owner.
acceptance:
  - [ ] Penny answers a factual books question (e.g. "how much did I spend on software in Q2?")
        grounded on the real ledger, tying to the reports to the cent (test)
  - [ ] Thread narrates the W3.2 activity feed + surfaces the week's low-confidence asks; asking
        counts against the ≤5/week budget and says so honestly
  - [ ] Penny's language comes 100% from the live 'app' persona — editing it changes the thread
        with no redeploy (test); no inline prompt/copy literals (grep gate)
  - [ ] No hallucinated numbers: an out-of-scope question is declined/deferred, never invented
        (adversarial test)
tests: Vitest on intent routing + grounding-scope guard; E2E: ask a grounded question, assert
  tie-out + no ungrounded numeric claim; persona-live-edit test; REG scenario (grounding-scope
  refusal)
touches: apps/app (new thread surface in OwnerLens/Home), a grounded-Q&A edge fn (reuses
  categorize's grounding pattern), the 'app' persona table (SHARED with W3.2/W3.4 — declare)
decision-needed: whether the thread gets any nav entry point beyond Home/Review → **Nik**
  (no new top-level tab without sign-off; default is to nest it in Home)

## W3.3 · Minimal 3-step onboarding (name → entity → industry; rest in-journey)
status: unclaimed
blocked-by: CENTRAL-2 (entity_types + industries seeds — onboarding READS the kernel, no
  hardcoded lists), CENTRAL-1 ('app' persona for the diagnostic/step copy). NOT blocked-by
  W3.2 — fully disjoint surface (create-org flow), builds in parallel.
goal: replace the demo's 8-step quiz with 3 steps that get an owner into real books fast, and
  ask everything else at the moment it matters — never an upfront interrogation.
workflow: owner · "get me started without a quiz" · business name → entity (with a 2-question
  "not sure" diagnostic) → industry tile → in books; 3 screens, everything else deferred
spec: Roadmap §W3.3 (Nik decision, 1 Jul). Exactly 3 steps: (1) **business name**;
  (2) **entity type** — tiles + labels + the "not sure" **2-question diagnostic**, ALL read
  from the `entity_types` kernel seed (CENTRAL-2), never a hardcoded enum; (3) **industry** —
  tiles from the `industries` kernel seed, and selecting one **seeds the CoA template** for
  that sector (kernel-driven, the 10 demo personas ported into CENTRAL-2). Everything else is
  asked **in-journey**: bank connect offered right after (skippable, via Connections),
  payment methods when the first unknown income source appears, check-in cadence after week 1
  — never as upfront questions. Adding a step, an entity, or an industry is a seed/config
  edit, not code. **No new onboarding QUESTION beyond these 3** without Nik (usability gate).
acceptance:
  - [ ] Onboarding is exactly 3 steps; entity + industry options render from the kernel seeds
        (adding a test entity/industry via seed alone makes it appear — test)
  - [ ] "Not sure" runs the 2-question diagnostic from the seed and resolves to an entity (test)
  - [ ] Selecting an industry seeds the matching CoA template (kernel-driven, no hardcoded map)
  - [ ] Bank connect is OFFERED post-onboarding and is skippable; no other upfront questions
  - [ ] Zero hardcoded entity/industry/diagnostic lists in the onboarding code (grep gate);
        step copy from the 'app' persona
tests: Vitest on step flow + diagnostic resolution; E2E: complete onboarding → land in seeded
  books with the right CoA; kernel-seed-drives-options test; REG scenario
touches: apps/app create-org / onboarding flow (routes/Home.tsx setup cards + a new onboarding
  view), reads entity_types/industries seeds + CoA-template seeding (SHARED create-org path —
  declare). Does NOT touch Review/Home feed surfaces (disjoint from W3.2)
decision-needed: none (3-step scope + in-journey deferral locked). Any 4th onboarding question
  → **Nik**

## W3.4 · Owner Home / dashboard upgrade (am-I-okay pulse)
status: unclaimed
blocked-by: W3.2 (Home hosts the "Penny did this" feed + weekly digest the tiering produces),
  CENTRAL-2 (coming-up deadlines read `filing_obligations`; no hardcoded dates), CENTRAL-1
  (summary copy from the 'app' persona). Disjoint from W3.1 → parallel after W3.2.
goal: Home answers "am I okay?" at a glance (APP_PRINCIPLES §2) — cash position, what needs
  the owner, upcoming filing deadlines, what's reconciled, catch-up progress — reusing data
  that already exists; no new source of truth.
workflow: owner · "am I okay?" · open app → Home is the answer in one screen: cash, "needs you"
  count (links to Review), coming-up deadlines, Reconciled ✓, plain-English monthly summary — 0
  taps to the pulse, ≤2 taps to act on anything
spec: Roadmap §W3.4. Home upgraded to: cash position + comparative/plain-English monthly
  summary (theme #8), **needs-a-look** count (links into the W3.2 Review queue), **coming-up
  filing deadlines** read from the kernel's `filing_obligations`/`upcoming_filing_deadlines`
  (CENTRAL-2 — never a hardcoded calendar), **Reconciled ✓** status (from W1.1 reconciliation),
  **catch-up progress** (from W2.1 when present), the **"Penny did this" feed + weekly digest**
  (from W3.2). Tax-readiness % / estimated-taxes strip **only if** W2.4 (quarterly assistant)
  has landed — otherwise omit, don't fake it. All numbers reuse existing ledger/report data
  (pagination discipline per RPTTEST — any report-feeding select paginates). No accounting
  vocabulary; no new top-level tab (this IS Home).
acceptance:
  - [ ] Home shows cash, needs-you count (→ Review), coming-up deadlines (from
        `filing_obligations`), Reconciled ✓, and the "Penny did this" feed — all from existing
        sources (no new store; test asserts numbers tie to Reports/kernel)
  - [ ] Coming-up deadlines come from the kernel — changing a `filing_obligations` row changes
        Home with no code edit (test); zero hardcoded dates/thresholds (grep gate)
  - [ ] Estimated-taxes strip present ONLY if W2.4 is live, else cleanly absent (no stub number)
  - [ ] Plain-English summary copy from the 'app' persona; responsive on the full width ladder
tests: Vitest on the summary/tie-out derivations; E2E Home render w/ seeded org (deadlines +
  feed + reconciled ✓); kernel-deadline-drives-Home test; REG scenario
touches: apps/app OwnerLens Home (routes/Home.tsx), reads reconciliation (W1.1), kernel
  deadlines (CENTRAL-2), the W3.2 feed (SHARED Home surface — declare; disjoint from the W3.1
  thread surface)
decision-needed: none (reuses existing data + kernel). If Home wants a metric with no existing
  source (e.g. a new "tax-readiness %" formula not derivable from current data) → **Nik**

## W3.5 · Receipt capture + match
status: built (loop/w3-5-receipts) — PR open
blocked-by: W3.2 (a parsed receipt becomes a trust-tiered item — high-confidence auto-matches
  + shows in the feed, low-confidence becomes an approval card), CENTRAL-1 ('app' persona for
  capture/confirm copy)
goal: an owner snaps or forwards a receipt and it attaches to the right transaction with no
  bookkeeping — closing the "where's the receipt for this charge?" gap (audit-trail trust).
workflow: owner · "keep my receipts with my books" · photo or text a receipt → Penny parses +
  matches to a transaction → high-confidence auto-attaches (feed), else a 1-tap confirm card;
  ≤2 taps per receipt
spec: Roadmap §W3.5. **Photo/text first (voice later — not this card).** Capture → parse
  (vendor/amount/date) → **match to an existing transaction** on amount+date window (reuse the
  W1.1 reconciliation matcher discipline — exact first, fuzzy second); the match result flows
  through the **W3.2 tier pipeline** (high = auto-attach + feed, low = approval card in Review).
  Store the receipt asset + link to the ledger entry (audit-logged). No new top-level tab —
  capture entry lives in Home/Review + the transaction row. Parse via the existing AI inference
  layer (grounded, records to `ai_decisions`); no new hosted service (stack rule).
acceptance:
  - [ ] A photo receipt parses to vendor/amount/date and matches the correct transaction; high
        confidence auto-attaches + shows in the feed, low confidence yields an approval card
  - [ ] Attached receipt is stored + linked to the ledger entry and audit-logged; visible on the
        transaction (test)
  - [ ] Unmatched receipt lands in a short queue resolvable without leaving the flow (reuses the
        W1.1 unmatched pattern)
  - [ ] Match confidence uses the W3.2 tiers/config (no inline thresholds — grep gate); copy
        from the 'app' persona; no new hosted service introduced
tests: Vitest on parse→match; pgTAP on the attach/link RPC + audit row; E2E: upload receipt →
  auto-attach happy path + low-confidence card path; REG scenario (mismatch/duplicate receipt)
touches: apps/app (new capture surface in Home/Review + transaction row), a receipt-parse edge
  fn (existing AI layer), storage for the asset, the W3.2 tier pipeline (SHARED — declare)
decision-needed: none for photo/text. **Voice + email-in capture are explicitly OUT of this
  card** (Roadmap: voice later) — if wanted, a separate `decision-needed: Nik` card. Receipt
  asset storage location (Supabase Storage bucket) confirmed in the PR, not invented per-file
