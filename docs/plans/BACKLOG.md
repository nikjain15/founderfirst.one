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
status: unclaimed
blocked-by: CENTRAL-2 (needs the effective-dated tables to write diffs against)
goal: a tax-law/deadline change becomes ONE reviewed seed PR that updates every app on
  merge — never a code sweep, never hardcoded (Roadmap principle 3c).
workflow: Nik/CPA · "a law changed" · watcher PR arrives w/ citation + affected-consumer
  list → review → merge = live everywhere; zero feature-code edits
spec: scheduled loop routine (weekly; daily Jan–Apr) with a source list (IRS newsroom,
  form-instruction revision pages, state DOR feeds, trade press); on detection: draft
  effective-dated superseding seed rows + citation + consumer-impact list as a PR flagged
  `decision-needed`; NEVER self-merge; false-positive-safe (no detection = no PR, log only).
acceptance:
  - [ ] Replay test: feeding it the 2026 OBBBA 1099 change produces the correct seed-diff PR
  - [ ] PR template carries citation, effective dates, affected consumers
  - [ ] Cannot merge without human approval (branch protection / decision-needed flow)
decision-needed: none to build; every PR it produces IS a decision for Nik

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

## W3.x cards (thread · trust-tiered cards · 3-step onboarding · dashboard · receipts)
status: not yet carded — carded after Wave 1 ships; decisions already locked:
trust-tiered autonomy (≤5 asks/week budget) · onboarding = name + entity (+ not-sure
diagnostic) + industry, everything else in-journey · Penny voice per VOICE.md.
