# FounderFirst — audit rubric

The concrete sub-attributes each `/audit` dimension checks, tailored to this
repo (Astro marketing site `apps/web`, React admin SPA, unified authed app
`apps/app`, Preact Penny widget, Supabase + edge functions, Cloudflare Worker,
Fly Discord bridge, Signals worker). This is the **what to check**;
`.claude/commands/audit.md` is the **how to run**. Every finding is `file:line` + why + fix, severitied P0/P1/P2.

**Severity key:** P0 = broken, security hole, data loss, or silent failure ·
P1 = guideline breach / UX regression / real risk · P2 = polish.
**Score per dimension:** `max(0, 100 − 25·P0 − 8·P1 − 2·P2)`; overall = mean.

---

## Trust cluster — findings here are ALWAYS P0/P1, never P2

### 1. security
- **RLS** enabled on every `public` table; policies exist and are correct for
  each operation; nothing unintentionally world-readable; admin-only tables gated
  by `is_admin()`.
- **SECURITY DEFINER functions** set `search_path`, validate inputs, avoid
  dynamic SQL injection, grant least privilege.
- **`service_role` key** never reaches a browser — grep `apps/*/dist` + source;
  only the `anon` key is client-side. Workers/edge functions hold the service
  key server-side only.
- **Edge-function / worker auth** actually enforced in code, matching intent
  (e.g. changelog digest: `remind`=cron secret, `send`/`preview`=admin JWT;
  `verify_jwt` setting consistent with the in-code check).
- **Secrets hygiene** — none committed (scan for `sbp_`, `sk_`, `service_role`,
  private keys, bearer tokens); `.env*` ignored; rotated via GH secrets / Vault.
- **Server-side authorization** — every privileged RPC re-checks `is_admin()`;
  the UI gate is never the only gate.
- **Injection / XSS** — no unsanitised `dangerouslySetInnerHTML`; user input
  escaped; rendered markdown sanitised.
- **CORS / rate limiting** — worker CORS scoped to known origins; public
  endpoints (waitlist signup, Penny) have abuse protection.
- **Auth redirect allow-list** correct (prod + localhost), no open redirect.
- **Dependencies** — `pnpm audit` shows no high/critical; no risky postinstall.

### 2. privacy
- **Retention disclosed** — anything personal that's stored (Discord DMs after
  `/disconnect`, waitlist data, Penny chat logs) is described in the privacy
  policy; copy matches actual behaviour (LEARNINGS Rule 8).
- **Erasure path** — a real delete/erase route exists for each store of personal
  data, separate from soft-delete/archive.
- **No PII in logs** — emails, Discord handles, message bodies not written to
  `wrangler tail` / `flyctl logs` / console in plaintext beyond what's needed.
- **Minimisation** — only collect fields the product uses; no silent
  fingerprinting; analytics respects consent (cookie banner) before identifying.
- **Consent** — captured before storing personal data; revocable.
- **Third-party data flow** — what leaves to Resend / PostHog / GA / Discord is
  intended and disclosed.

### 3. reliability
- **Every fetch/RPC has three states** — loading, empty, and error — rendered,
  not blank or crashing.
- **Graceful degradation** — a failing *secondary* call never takes a page down
  (pattern: inbox swallows a broken analytics RPC and still renders tickets).
- **No unhandled rejections / floating promises** — awaited or `.catch()`ed;
  worker `waitUntil` used for background work.
- **Idempotent writes** — retries/double-clicks don't double-insert; dedupe keys
  where needed (e.g. one audit row per sign-in).
- **Error boundaries** — routes wrapped so one component crash doesn't white-screen
  the admin.
- **Timeouts / retries** on network calls to flaky externals (Discord, Resend).
- **Optimistic UI rolls back** on failure; forms re-enable after error.

### 4. data_integrity
- **One source of truth** — no two tables/flags/stores meaning the same thing
  (the `admins` vs `admin_users` incident, Rule 6).
- **`supabase/migrations/` authoritative** — no parallel `SCHEMA-*.sql`; schema
  fully in git; no hand-written squashed dumps.
- **Migrations are forward-only & consistent** — every referenced table/column/
  function exists; FKs + `on delete` behaviour intentional; constraints/checks
  present; indexes on hot columns.
- **No orphaned data paths** — every reader and writer routes through the same
  canonical store.

---

## Experience cluster

### 5. performance — REAL BROWSER CHECK
- **Core Web Vitals** via Lighthouse (`web-perf` skill) on marketing home + 2–3
  key admin pages: LCP < 2.5s, INP < 200ms, CLS < 0.1.
- **Bundle** — no unexpectedly large route chunks; code-split heavy routes;
  no duplicate deps.
- **Images** — sized, lazy-loaded, modern formats; no multi-MB hero PNGs.
- **DB queries** — no N+1; indexes on filtered/ordered columns; RPCs return only
  needed columns.
- **Render** — no obvious waterfalls; memoisation on hot lists; no layout thrash.

### 6. responsive — REAL BROWSER CHECK
- **Width ladder** (320·360·375·414·480·540·640·768·834·1024·1280·1440·1920):
  `documentElement.scrollWidth > innerWidth` is **false** at every width.
- **No hardcoded px widths** in horizontal layouts — `clamp()`/`minmax()`/
  `flex-wrap`/`grid auto-fit` instead.
- **Tables** inside `.table-wrap` (scroll + edge fade).
- **Tap targets** ≥ 44×44 (`--tap-min`); **inputs** ≥ 16px (no iOS zoom).
- **Fixed elements** (Penny bubble, cookie banner) don't cover CTAs at any width.
- Breakpoints only where layout must change shape (nav→hamburger).

### 7. accessibility — REAL BROWSER CHECK
- **axe scan** clean on key pages (admin support/audience/quality, marketing,
  Penny widget).
- **Keyboard** — full Tab traversal, visible `:focus-visible`, dropdowns/drawers
  close on Esc + outside-click, no focus traps, logical order.
- **Semantics** — landmarks/roles, `label`↔input association, button vs link
  used correctly.
- **Contrast** — text meets WCAG AA against its token background.
- **Images/icons** — alt text / `aria-hidden` as appropriate.
- **Motion / reduced-motion** respected.

### 8. design_system
- **No inline hex / `rgba()`** — colours come from `tokens.css`.
- **No magic px font-sizes** — `--fs-*` tokens only.
- **No undefined CSS vars** — every `var(--x)` resolves in tokens.css/admin css.
- **Radius / spacing** from tokens, not literals.
- **Icons** via shared `lib/icons` components, not emoji/glyphs.
- **Typography / weights** from `--fw-*`; one type scale.

### 9. ia_ux
- **Primary nav** ≤ 4 tabs + Settings menu; every item leads somewhere real;
  active states correct.
- **No dead/stub/"coming soon"** destinations shipped (the KB stub).
- **No duplicate destinations** — each job has exactly one home (the dup Support
  KPI case); deep-links/redirects wired (`/users → /audience#web`).
- **Labels match content** — tab name, URL, and page agree.
- **No orphan routes** — everything reachable from nav or an intended deep link.
- **Depth** — any task in ≤ 2–3 clicks; sub-tabs not confusingly nested.
- **Consistency** — drawers/toolbars/modals reuse one pattern across pages.
- **States** — helpful empty states, loading states, and destructive-action
  confirmations everywhere they're needed.
- **Orientation** — page title/eyebrow tells you where you are; mobile nav +
  Settings menu reachable.

---

## Operability & hygiene cluster

### 10. observability
- **Error reporting** — client + worker errors surface somewhere a human sees
  (PostHog/console/log), not swallowed silently.
- **Logs reachable** — `wrangler tail` (Worker), `flyctl logs` (bridge) produce
  the expected lines; correlation/ids where useful.
- **Audit trail** — privileged admin actions logged (`log_admin_action`) with
  enough context.
- **Health / alerts** — a way to know the Worker/bridge/Signals worker is down;
  cron jobs report success/failure.

### 11. tests
- **Critical paths covered** — auth gate, waitlist signup RPC, admin RPC
  authorization, Penny message flow, Signals scoring.
- **Tests run & pass** in CI; no perma-skipped specs.
- **Manual-only flows flagged** — anything only checkable by hand is called out
  as a coverage gap.

### 12. copy_docs
- **No stale tool names** — copy/READMEs/prompts don't reference dropped tools
  (e.g. Dify) or contradict current behaviour (Rule 7).
- **Self-description matches behaviour** — Penny's prompt, UI copy, privacy
  policy, How-it-works guide reflect what the system actually does now.
- **READMEs current** — setup/deploy docs match reality; `CLAUDE.md` /
  `LEARNINGS.md` references valid.

### 13. dead_code
- **Unused exports / files** (ts-prune-style) removed or justified.
- **No shipped placeholders** — "coming soon" UI behind flags, not in prod.
- **TODO/FIXME** triaged — real ones tracked, stale ones removed.
- **No large commented-out blocks** or orphaned assets.

### 14. seo
- **Marketing + blog**: unique `<title>` / meta description / canonical per page;
  Open Graph + Twitter card tags; `sitemap.xml` + `robots.txt` present and
  correct; structured data where relevant.
- **Semantic HTML** — one `<h1>`, sensible heading order, `<main>`/`<nav>`.
- **Image alt text** for content images.
- **Admin is `noindex`** — excluded from this dimension (don't penalise it).

---

*Refine a dimension's checklist here when a run surfaces a sub-attribute worth
making explicit. Keep it stack-specific and checkable.*

---

# Audit ledger

Every audit we run is recorded here: **what was tested, what broke, where the fix
landed, and — most importantly — what it did NOT cover.** Newest program first.
Live PR/deploy status is in [docs/STRESS_TEST_TRACKER.md](docs/STRESS_TEST_TRACKER.md);
full per-feature reports are in `docs/stress/<feature>/`. This ledger is the durable
record; the tracker is the working board.

**How to read a row:** `P0/P1/P2` = confirmed defects by severity · `Status` =
where the fix is (🟢 live+on-main · 🔵 live-not-on-main / PR-open · ⬜ untested).

## The loop — how coverage grows with the product

Audits are not one-time events. Every new feature enters this cycle, so the
ledger above always answers "what is tested, what is not" for the *current*
product — not the product as it was when the last big sweep ran.

**1. Before building** — read the rubric (top of this file) and the ledger rows
nearest the surface you're touching, plus the LEARNINGS entries they graduated
into. The failure modes recorded there are design constraints, not history:
row locks on read-then-write RPCs (#15), "the trial balance still ties" is not
proof of correctness (#16), report/export queries paginate (#18), migrations
are the only schema path (#2/#17).

**2. While building** — the PR template
([.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md))
carries the audit gate as a checklist. It is filled in honestly or the PR
doesn't merge. CI enforces the machine-checkable part: `pgtap`, `app-e2e`,
`admin-e2e`, `responsive`, `unique-timestamps`. **Never merge over a red
gate** (#14) — fix the gate first, even if the failure "isn't yours".

**3. At merge — declare the coverage delta.** New functionality = new attack
surface. The PR adds or updates a ledger row for its surface, starting at
⬜ untested, and updates the "NOT covered" table if it opens a standing gap.
A feature is not *done* when it ships; it's done when its row exists.

**4. After shipping — stress it.** ⬜ rows are scheduled as stress passes in
[STRESS_TEST_TRACKER.md](STRESS_TEST_TRACKER.md) (the v2 operating model there:
one orchestrator fans out finder → verifier → fixer). A row leaves ⬜ only via
an adversarial pass — negative inputs, concurrency, cross-tenant, failure
injection — not via the happy-path e2e.

**5. Recurring — the weekly `/audit` agent** runs the rubric, writes
`audit_runs` (admin → Settings → Quality), and flags **coverage drift**:
features merged since the last run that have no ledger row, and ⬜ rows older
than two weeks with no scheduled stress pass.

**6. Graduate.** A finding class that recurs across features becomes a
LEARNINGS.md entry, and — wherever possible — a machine gate (a CI check, a
pgTAP suite, a lint script) so the class can't recur silently. The sweep-1
examples: pagination (#18) → Vitest in `apps/app`; timestamp collisions →
`unique-timestamps` CI; tenant predicate → `check:tenant`.

## Program 2 — Wave 1 (full-bookkeeping loop, 2 Jul 2026)

The build loop's first wave: the top-half of the product ([FULL_BOOKKEEPING_ROADMAP.md](plans/FULL_BOOKKEEPING_ROADMAP.md)
Wave 1 + the CENTRAL/LOOP/REG infra cards in [plans/BACKLOG.md](plans/BACKLOG.md)), composed onto
`loop/wave1-integration` (draft PR #185). 12 new surfaces shipped. Each landed with a happy-path /
acceptance test **and a per-PR adversarial red-team pass** (all 13 Wave-1 defects were red-teamed and
fixed before merge), but **not yet a dedicated post-merge stress pass** — so every row below is
⬜ by this program's rule (a row leaves ⬜ only via the formal adversarial stress program, § The loop
step 4), with the per-PR red-team noted. All 12 are queued in
[STRESS_TEST_TRACKER.md](STRESS_TEST_TRACKER.md).

**How to read a row:** `Test` = the permanent happy-path/acceptance test that ships with the surface ·
`Status` = ⬜ untested-by-the-formal-stress-program (red-team pass done per PR, dedicated stress pass
pending) · 🔵 live-not-on-main / PR-open · 🟢 live+on-main.

| # | Surface | Permanent test | Status |
|---|---|---|---|
| LOOP-1 | Build dashboard (/admin → Build tab) | `loop_build_dashboard_test.sql` + `apps/admin/src/lib/loopStatus.test.ts` | ⬜ red-teamed; stress-pass pending |
| REG-1 | Regression scenario pack v1 (back-fills the 15 stress features) | `regression_pack_test.sql` (+ `regression_coa_integrity_test.sql`) | ⬜ red-teamed; stress-pass pending |
| IA-1 | Owner lens nav restructure (Home · Review · Reports · Connections + Advanced) | `apps/app/src/ledger/nav.test.ts` + app-e2e nav walk | ⬜ red-teamed; stress-pass pending |
| CENTRAL-1 | Centralized apps/app copy · Penny 'app' persona · behavior thresholds | `central1_persona_config_test.sql` + CI grep/gate scripts | ⬜ red-teamed; stress-pass pending |
| CENTRAL-2 | Knowledge kernel schema + seeds (entities · industries · filing calendar · vendor priors · connector registry) | `central2_knowledge_kernel_test.sql` | ⬜ red-teamed; stress-pass pending |
| W1.2 | Report exports (TB / P&L / BS / GL detail → CSV + PDF) | `apps/app/src/ledger/export.test.ts` + app-e2e download | ⬜ red-teamed; stress-pass pending |
| W1.6 | Learned-rules management UI | `w16_learned_rules_test.sql` | ⬜ red-teamed; stress-pass pending |
| W1.4 | CPA Practice home — ranked cross-client workqueue | `w1_4_cpa_practice_queue_test.sql` | ⬜ red-teamed; stress-pass pending |
| W1.5 | CPA collaboration primitives (flag · note · add-txn · reclass suggestion) | `w1_5_cpa_collaboration_test.sql` | ⬜ red-teamed; stress-pass pending |
| W1.1 | Bank reconciliation (new `reconciliations` schema; match against `import_rows`) | `w1_1_reconciliation_test.sql` | ⬜ red-teamed; stress-pass pending |
| W1.3-B | Tax mapping engine (data-driven jurisdiction × form × line, CPA-lens-gated) | `tax_mapping_engine_test.sql` | ⬜ red-teamed; stress-pass pending |
| W1.3-C | Fixed-asset / depreciation subledger (Penny computes depreciation) | `fixed_asset_depreciation_test.sql` | ⬜ red-teamed; stress-pass pending |
| W3.5 | Receipt capture + match (photo/text → parse → match → W3.2 tier → attach/queue; private `receipts` bucket) | `apps/app/src/ledger/receiptMatch.test.ts` + `w3_5_receipts_test.sql` + app-e2e `verifyReceiptCapture` | ⬜ red-teamed; stress-pass pending |
| LOOP-2 | Regulatory-watcher routine (law change → cited effective-dated seed-diff PR, decision-needed, never self-merge; false-positive-safe) | `scripts/regulatory-watcher/replay-test.ts` (`pnpm check:reg-watcher`, OBBBA 1099 replay + idempotency/no-op/stale-date guards) + `loop2_regulatory_watcher_test.sql` (supersede + old/new-law lookup + service_role-only) | ⬜ red-teamed; stress-pass pending |

**Coverage delta:** +12 ledger rows, all ⬜ (baseline + per-PR red-team, formal stress pass pending).
Wave 1 **invalidates the standing "whole top-half not built yet" gap** from Program 1 — reconciliation,
tax-line mapping, CPA workqueue, exports, and depreciation now exist and are stress-queued (see the
refreshed NOT-covered table below). Migrations for these surfaces are **write-don't-deploy** (per BACKLOG
rules) — the ledger records the surface, not a prod deploy.

### P2 advisory items from the Wave-1 red-team (tracked gaps, not blockers)
- **Depreciation (W1.3-C)** — TS-preview can under-depreciate vs. the DB raise in edge cases (preview ≠
  authoritative DB computation); disposal-convention book-value vs. default-convention mismatch. Track
  toward the W1.3-C stress pass.
- **CPA collaboration UI (W1.5)** — CollabUI missing some `aria-` labels (accessibility polish). Track
  toward the W1.5 stress pass / next `/audit` a11y dimension.

## Program 1 — feature stress-test sweep (30 Jun – 2 Jul 2026)

15 features adversarially stress-tested on live prod (negative inputs, edge cases,
concurrency, failure injection, security), each in its own worktree, fix-and-PR,
integrator merges in waves. Baseline = `main` after pre-onboarding #1–#15.

| # | Feature | P0 | P1 | Headline finding | Status | PR |
|---|---|----|----|---|---|---|
| 1 | Tenant isolation / RLS / IDOR | 1 | 1 | 22 `p_actor`-first SECURITY DEFINER RPCs were EXECUTE-granted to anon+authenticated → forge `p_actor`, write any tenant. Revoked to service_role. | 🟢 | [#138](../../pull/138) |
| 2 | Journal entries & reversals | 1 | 0 | `reverse_journal_entry` lock-free TOCTOU → concurrent reversals over-cancel balances; **TB still ties = silent**. 14 API calls → 10 reversals live. `FOR UPDATE` + unique index. | 🟢 #156 | [#139](../../pull/139) |
| 3 | Financial reports tie-out | 1 | 0 | `useEntries` had no pagination + prod `max_rows=1000` → orgs >1000 entries silently dropped oldest; reports tied but WRONG. `.range()` paging. | 🟢 | [#129](../../pull/129) |
| 4 | Accounting periods | 1 | 2 | close-vs-post TOCTOU lands entry in closed period (`FOR SHARE`); approve-into-closed back-door; reverse bricked after close. | 🟢 #156 | [#131](../../pull/131) |
| 5 | Categorization + CPA feedback | 2 | 1 | double-reversal + double-categorize races; LIKE-wildcard rule poisoning (`a%z`→"alcatraz"@100%, fixed w/ ESCAPE). | 🟢 | [#132](../../pull/132) |
| 6 | CSV / bank import | 0 | 1 | one impossible calendar date (`02/30`) aborts the whole batch — 0 of N rows stage. Calendar validation + delimiter auto-detect. | 🔵 on-main; migration `20260702020000` (safe_to_date) pending prod deploy | [#143](../../pull/143) |
| 7 | Opening balances import | 0 | 1 | opening-balance row missing an account silently folds into the OBE plug → "balanced" but wrong, success shown. | 🟢 | [#135](../../pull/135) |
| 8 | Chart of accounts | 0 | 2 | unvalidated `account.currency` → malformed `char(3)` crashes `Intl.NumberFormat` → books view dies; cross-tenant `parent_id`. ISO constraint + cycle guard. | 🟢 | [#137](../../pull/137) |
| 9 | Auth, session & routing | 0 | — | passed hardening; micro-fixes only. | 🟢 | [#133](../../pull/133) |
| 10 | Invites & engagements | 0 | 1 | invite accept was token-only, not email-bound; re-engage/no-demote lifecycle gaps. | 🟢 | [#134](../../pull/134) |
| 11 | CPA lens / access scope | 0 | 1 | approval-settings write path missing; read-only CPA scope otherwise held. | 🟢 | [#141](../../pull/141) |
| 12 | QBO / Xero connect & sync | 1 | 3 | provider-commit DEAD ON ARRIVAL (qbo/xero source hit opening-balance branch → `no_cutover_date`); double-post on re-pull; JPY ×100. | 🟢 | [#142](../../pull/142) |
| 13 | Onboarding & org creation | 0 | 1 | org-create not atomic (partial org on failure). `create_org_atomic`. | 🟢 | [#136](../../pull/136) |
| 14 | Data export & erasure (GDPR) | 0 | 1 | export truncated at 1000 rows (same paging class as #3). Paginated to 1500+. | 🟢 | [#130](../../pull/130) |
| 15 | Platform-staff / break-glass | 0 | 1 | `open_break_glass` not gated on editor tier. Gated + audit-logged. | 🟢 | [#140](../../pull/140) |

**Totals:** 8 P0, ~19 P1 confirmed and fixed. 12/15 fully closed (live + on `main`);
2 (#131, #139) captured onto `main` + prod-reconciled by **[#156](../../pull/156)**; 1 (#143)
partially landed.

### Cross-cutting themes (graduated into LEARNINGS.md)
- **Silent corruption that still balances** — every ledger P0 (#2, #4, #5) left the
  trial balance tying to the cent while the underlying data was wrong. A debits==credits
  check is necessary but not sufficient. → LEARNINGS #16.
- **TOCTOU on read-then-write RPCs** — the same lock-free-`SELECT`-then-mutate shape
  recurred across reverse / recategorize / approve / close. → LEARNINGS #15.
- **Prod-ahead-of-main drift** — fixes deployed straight to prod but never merged; a
  fresh `db push` regresses them. → LEARNINGS #17.
- **Unbounded reads truncate silently** — any select feeding a report/export must
  paginate (#3, #14). → LEARNINGS #18.

## What this program did NOT cover — standing gaps

Carry these into the next audit cycle; they are the backlog for coverage, not defects.

| Gap | Why it matters | Owner action |
|---|---|---|
| **Multi-currency** anything beyond the single-currency guard | guard blocks it today, but the moment we enable it the whole ledger/report/FX path is untested | test when multi-currency is scheduled (post-pilot) |
| **UI click-through** of periods, categorize, import | all 15 audits were API/RPC-level; no browser walk of the actual screens | add an E2E-driven UI audit pass |
| **Isolation F3** — `can_access_org` SECURITY DEFINER per-row seqscan on `journal_lines` (anon GET ~3s) | DoS surface; flagged, not fixed | index / rewrite the access check |
| **CSV F4** — re-importing the same file double-posts (no dedup) | real user footgun | **RESOLVED** — policy = skip dupes; same-source content-key (CSV re-upload) + **cross-source** content-hash dedup (`20260704040000`, W2 gate fix) so the same real txn from CSV+Plaid posts once |
| **Load / volume** — behavior at 10k–100k entries, concurrent orgs | only correctness tested, not scale | perf audit with seeded large orgs |
| ~~**The whole top-half of the product**~~ — reconciliation UI, tax-line mapping, CPA workqueue, exports, depreciation | **BUILT in Wave 1** (Program 2 above); no longer "not built yet" | now ⬜ ledger rows, per-PR red-teamed, **stress-pass pending** — scheduled in [STRESS_TEST_TRACKER.md](STRESS_TEST_TRACKER.md) |
| **Wave 2 not built** — catch-up mode (W2.1), QBO one-click migration (W2.2), Plaid bank feeds (W2.3), Penny in-app thread + trust-tiered cards (W3.x) | genuinely not built yet → nothing to stress-test | see [FULL_BOOKKEEPING_ROADMAP.md](plans/FULL_BOOKKEEPING_ROADMAP.md) Waves 2–4 |
| **W1.3-B CPA mapping-edit UI deferred** | the tax-mapping *engine* shipped (W1.3-B); the CPA per-account mapping-edit *UI* was deferred | build + stress the edit UI when carded |
| **Disposal JE (W1.3-C)** — fixed-asset disposal journal-entry path, if still open | disposal-convention book-vs-default mismatch flagged (P2 above); the disposal JE itself is thin | close under the W1.3-C stress pass |

## Program 0 — platform audit (30 Jun 2026)
53 findings (4 P0 / 20 P1). 6 "shipped baseline" items were actually broken
(invite email-bind, pgTAP-in-CI, single-currency guard, GDPR fn, app error boundary,
`ledger_audit` table). Sprint-1 fixes folded into the pre-onboarding baseline (#122).
Superseded as a coverage record by Program 1.
