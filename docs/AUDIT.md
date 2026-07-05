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
- **Tab strips / horizontal nav** at narrow widths either **wrap** (all items
  visible) or scroll **with a visible affordance** (edge-fade / indicator). A
  hidden-scrollbar `overflow-x` strip passes the overflow check while clipping
  items invisibly — that's a FAIL (PENNY-UX-3/F3; `.ledger-tabs` carries the
  `.table-wrap` edge-fade at ≤640px and the app-e2e PENNY-UX-3 check gates it
  at 375px).
- **Tables** inside `.table-wrap` (scroll + edge fade).
- **Tap targets** ≥ 44×44 (`--tap-min`); **inputs** ≥ 16px (no iOS zoom).
- **Fixed elements** (Penny bubble, cookie banner) don't cover CTAs at any width.
- Breakpoints only where layout must change shape (nav→hamburger).

### 7. accessibility — REAL BROWSER CHECK
- **axe scan** clean on key pages (admin support/audience/quality, marketing,
  Penny widget) **and every authed owner surface of `apps/app`** — the `app-e2e`
  gate injects axe-core on the real authed DOM (Home · Review · Reports incl.
  cash-flow + lender package · Connections incl. invoicing · Journal · Reconcile)
  and fails on any serious/critical WCAG 2.0/2.1 A+AA violation. Since PENNY-UX-5
  the Reports scan clicks through **all 7 report sub-views** (P&L · Trial balance ·
  Balance sheet · Cash flow · General ledger · 1099-NEC · Lender package), not just
  the tab default — sub-views behind a switcher are otherwise invisible to the gate.
- **Scrollable regions** (`.table-wrap`, any `overflow: auto` container without
  focusable children) carry `tabindex="0"` + `role="region"` + a copy-catalog
  `aria-label`, so keyboard users can reach and arrow-scroll them
  (axe `scrollable-region-focusable`, PENNY-UX-5/F5).
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

## Program 7 — roadmap-v2 Wave 1 — wave-gate audit (4 Jul 2026)

The roadmap-v2 Wave-1 pre-deploy gate (LOOP_PROMPT rule 9): the 14-dimension rubric
+ an adversarial cross-PR stress pass, run on a **COMBINED integration branch** (not
per-PR) so failures that only appear in combination are caught before the loop ramps.
MODE=safe — this program **audits and reports only; it does not merge or deploy.**

**Wave under gate (4 PRs):** **#231** `loop/connector-enablement-plaid-qbo-xero`
(Plaid env/secret wiring: `PLAID_SECRET_{SANDBOX,PRODUCTION}` selection, prod-missing =
fail-loud; QBO/Xero authorize-URL tests) · **#232** `loop/rv2-a1-filing-worksheet`
(RV2-A1 return worksheet per form, per-line drill-down to journal entries, tie-out) ·
**#233** `loop/ia3-admin-console-scaffold` (internal admin console at `penny…/admin`,
staff-gated, additive parallel-run) · **#234** `loop/rv2-e-production-readiness`
(soak/load harness + observability + DR runbook). **#230**
`loop/w41cd-square-paypal-api` (Square/PayPal API sync) is **quarantined** (open product
decision) — audited here ONLY for isolation.

### GATE VERDICT: 🟢 GO — 0 P0, **1 P1 (non-blocking)**, 2 P2.

The combined branch **built and tested clean as a unit.** All four branches merged off
`origin/main` with **zero conflicts** — the overlapping files (`copy/strings.ts`,
`styles.css`, `App.tsx`, `docs/AUDIT.md`) are genuinely additive and git auto-resolved
them; every addition was verified present post-merge (no silent drop). On the combined
tree: `tsc --noEmit` clean; **386 apps/app Vitest pass (38 files)**; **20 soak-harness
Vitest pass**; **11 deno shared-fn tests pass** (Plaid secret selection incl. the
prod-fail-loud case + QBO/Xero authorize URLs + observability); and every static gate is
green — `check:css-vars` (868 refs resolve, the F2 regression net), `check:app-strings`
(no user-facing literals), `check:law-literals` (232 files, none), `check:tenant`,
`check:kernel-seed`, `check:css`, and `loop-preflight` (no migration-timestamp
collisions). No failure appears only in combination.

The **one P1** is a single-line accessibility regression on the new (staff-only, noindex)
admin console — the exact PENNY-UX-5/F5 pattern (`scrollable-region-focusable`)
re-introduced on one surface that the app-e2e axe gate doesn't walk. It carries **no data
risk and touches no owner/CPA surface**, so it does not block deploy — but per the trust
cluster (a11y is never P2) it is P1 and should be fixed before or immediately after merge.

### Per-dimension summary (Wave-1 blast radius, combined branch)

| Dimension | Verdict | Notes |
|---|---|---|
| **security** | 🟢 pass | Admin console reuses the SAME `is_platform_staff()` DB control as `/staff` (`App.tsx:91` `useIsPlatformStaff`), and the client gate is **fail-closed**: `adminRouteView` (`admin/nav.ts:73`) returns `loading`/`error` — never `console` — until the check RESOLVES true; a transient error is NEVER conflated with "not staff" (unit-tested, `admin/nav.test.ts`). Overview data comes from the existing `staff_list_orgs` RPC (server re-checks). Plaid secret selection **fails loud in production** when `PLAID_SECRET_PRODUCTION` is absent — never falls back to a bare/sandbox key (`plaid.ts`, deno-tested). Soak driver holds the service-role key **server-side only** (never imported by app code, `driver.ts:6`). No forged-actor / world-readable surface introduced. |
| **data_integrity** | 🟢 pass | Filing worksheet is a **projection, never a write** (`worksheet.ts:7`); each line's amount == Σ of its traced source-entry contributions (`worksheetTiesOut`, `worksheet.ts:208`), asserted by Vitest incl. `RV2A1-WORKSHEET-TIEOUT`. **Red-team P0 already fixed in-PR:** the worksheet is tax-year-scoped (`taxYearDateFilter`, applied at `Filing.tsx:40`) — WITHOUT it, other years' activity rolls onto the return while still "tying out" (a review-ready lie); regression-locked (`RV2A1-WORKSHEET-PERIOD-SCOPE`). Soak harness proves **no double-post** under concurrency (`created == distinct idempotency keys`) + tie-out + Plaid `(org,external_id)` dedup (CI smoke green). |
| **performance** | 🟢 pass | Filing consumes the SAME fully-paginated `useEntries(org.id)` that feeds Reports (`Ledger.tsx:123,252`) — no `max_rows=1000` truncation cliff (LEARNINGS #18). Worksheet build is a single O(entries×lines) pass, memoised. Soak harness is the explicit load-testing surface (10k–100k deferred to a live sandbox run). |
| **ia_ux / usability gate** | 🟢 pass | Filing nests under **Advanced** (owner) / a review tab (CPA) — **no new top-level nav**. Admin console is a NEW top-level `/admin` route but staff-only + additive parallel-run (founderfirst.one/admin stays authoritative) — no owner/CPA IA change. Console tabs: Overview live-wired, four are honest parallel-run placeholders linking to the live admin (no dead "coming soon" owner-facing destination). |
| **copy / voice / centralization** | 🟢 pass | **Zero exclamation marks, zero competitor names** in the new filing/admin copy (grep clean). All strings via `COPY`/`copy/strings.ts` (`check:app-strings` green); **no law literals** in the tax surface (`check:law-literals` green — facts come from the seeded engine). |
| **design_system** | 🟢 pass | **No inline hex, no magic-px font-size, no fixed-px `grid-template-columns`** in the new `styles.css` blocks (filing + admin console) — grep clean; console CSS is explicitly tokens-only. **`check:css-vars` green** (F2 net): every new `var(--x)` resolves. |
| **responsive** | 🟢 pass | New tables scroll inside `.table-wrap` (fluid-first, no fixed-px horizontal layout). Admin console tab strip reuses `.ledger-tabs` — inherits the PENNY-UX-3 edge-fade discoverability affordance for free. |
| **a11y** | 🟨 **1 P1** | Filing worksheet tables all carry `tabindex={0}` + `role="region"` + `aria-label` (the F5 pattern, correct on all 3). **F-WG1 (P1):** the admin console Overview `.table-wrap` (`AdminConsole.tsx:155`) is the ONLY `.table-wrap` in the entire app missing that treatment — an `axe scrollable-region-focusable` (serious) violation on narrow widths. Contained to a staff-only surface the app-e2e axe gate doesn't walk. |
| **reliability / observability** | 🟢 pass | Admin route wrapped in the pathname-keyed error boundary; access-check error renders a recoverable `role="alert"` retry, not a white-screen. New `observability.ts` (`slog`/`timed`) emits one structured JSON line per event with fn/event/level (deno-tested). Loop-heartbeat fn added. |
| **tests** | 🟢 pass | +new Vitest: `worksheet.test.ts`, `admin/nav.test.ts` (15), soak `config`/`observability`/`soak` (20); +deno `connectors.test.ts` (8, incl. prod-fail-loud) + `observability.test.ts` (3). All green on the combined tree. |
| **copy_docs / seo** | 🟢 pass | Both new surfaces are noindex (authed app). DR runbook (`docs/plans/production-readiness-runbook.md`) + soak README added; ledger rows added for RV2-A1 and RV2-E (see below). |
| **dead_code** | 🟢 pass | Console placeholders are intentional, labelled parallel-run tabs linking to live admin — not shipped "coming soon" stubs. No orphaned exports introduced. |

### Ranked findings (verified on the combined branch — `file:line` + repro)

**F-WG1 · P1 · The internal admin console's Overview table is the one scrollable region
in the app missing keyboard access — `axe scrollable-region-focusable` (serious).**
`apps/app/src/admin/AdminConsole.tsx:155` renders `<div className="table-wrap">` with **no**
`tabIndex={0}` / `role="region"` / `aria-label`, while **every other** `.table-wrap` in
`apps/app/src` (Invoicing, LearnedRules, Ledger ×3, ReconcileView ×2, Filing ×3,
MigrationFlow) carries all three — this is the graduated PENNY-UX-5/F5 fix, and the console
is the sole regression. The inner `<table>` has an `aria-label` but axe flags the **scroll
container**, not the table. **Repro:** open `/admin` as staff, narrow to a width where the
org table overflows horizontally → a keyboard-only user cannot focus/arrow-scroll it; an axe
scan reports the serious violation. It slips CI because the app-e2e axe walk covers owner
surfaces, not the staff console. **Why non-blocking:** staff-only, noindex, no data risk,
does not touch any owner/CPA surface. **Fix (one line):** add
`tabIndex={0} role="region" aria-label={C.overview.tableAria}` to the `.table-wrap` (reuse
the existing `tableAria` string), and extend the app-e2e axe walk to `/admin` so the class
can't recur on the console.

**F-WG2 · P2 · The four admin-console job tabs are parallel-run placeholders (by design)
but link out to the still-authoritative live admin.** `apps/app/src/admin/nav.ts:30-36`
marks Support/Audience/Analytics/Penny `live:false`. This is intentional and honest for the
Phase-0 scaffold (documented `ia-3-admin-console-migration.md §3`), not a shipped dead
destination — flagged only so the ledger row tracks that these tabs are NOT yet wired to
real data (coverage boundary), and the migration must flip them before founderfirst.one/admin
is retired.

**F-WG3 · P2 · Soak harness at 10k–100k volume is not yet exercised — CI runs the smoke
model only.** `packages/soak-harness/` proves no-double-post + tie-out under concurrency
against a faithful in-memory model of `post_journal_entry` (CI-safe smoke, green); the live
sandbox driver runs the SAME runner against the real RPC but is **operator-run** and has not
been driven at volume. This is the intended scope of the PR (the harness lands; the live soak
is a follow-up), but the "load/volume at 10k–100k" standing gap in the NOT-covered table stays
open until a live sandbox soak runs. No defect — a coverage boundary.

### Merge-sequencing & combined-branch integration

- **Merge order is FREE — no serialization required.** All four branches fast-forward /
  merge off `origin/main` with **zero conflicts**; the shared-file edits
  (`copy/strings.ts`, `styles.css`, `App.tsx`, `docs/AUDIT.md`) are strictly additive and
  were verified intact after the combined merge (filing + admin string keys present, both
  filing and admin CSS blocks present, both `App.tsx` route imports present, both new ledger
  rows present). **Recommended sequence (lowest-risk first): #231 → #234 → #232 → #233**
  — infra/wiring before UI, but any order is safe. Re-run the combined `tsc` + Vitest after
  the last merge as the belt-and-braces check.
- **No non-trivial (semantic) conflict found** — nothing to escalate to the integrator.

### #230 isolation (quarantine confirmed)

**#230 shares ZERO files** with the four wave PRs (`comm -12` on the two changed-file sets is
empty). Its registry change (`connectors.json` / `_generated.sql`: adds the `api_sync`
capability to the existing square/paypal rows) is additive and touched by no wave PR — #231
edits only `plaid.ts` + a test and does **not** touch the registry. #230's migration
(`20260707020000`) is later than main's max and collides with nothing in the wave.
**Conclusion: the four PRs can merge and deploy without #230, and nothing in them silently
breaks if #230 stays quarantined.** #230 remains held on its open product decision.

### GO / NO-GO

**🟢 GO to deploy the wave** (#231, #232, #233, #234). The combined branch built and tested
clean as a unit; the trust cluster (security / data-integrity) is materially clean — the
worksheet is projection-only with an enforced tax-year scope and cent-level tie-out, the
admin gate is fail-closed on the same DB control as `/staff`, the Plaid prod secret fails
loud, and the soak fence fails closed on a prod URL even when mislabelled "sandbox". The lone
P1 (F-WG1) is a one-line staff-only a11y fix with no data risk and does not block deploy —
land it in the same wave if trivial, otherwise as an immediate fast-follow, and extend the
app-e2e axe walk to `/admin`. **Safe merge sequence:** #231 → #234 → #232 → #233 (any order
works). **Deploy blockers: none.**

### Coverage delta — Wave-1 ledger rows

| # | Surface | Permanent test | Status |
|---|---|---|---|
| WG.231 | Connector env/secret wiring (Plaid sandbox/prod secret selection; QBO/Xero authorize URLs) | `connectors.test.ts` (8, incl. prod-fail-loud) | 🟢 wave-gated; no defect |
| WG.232 | RV2-A1 Filing worksheet (per-form, per-line ledger drill-down, tie-out, tax-year scope) | `worksheet.test.ts` (REG `RV2A1-WORKSHEET-TIEOUT` + `-PERIOD-SCOPE`) | 🟢 wave-gated; no defect (red-team P0 fixed in-PR) |
| WG.233 | Internal admin console scaffold (staff-gated, fail-closed, parallel-run) | `admin/nav.test.ts` (15) | 🟨 wave-gated; **F-WG1 P1 a11y** (staff-only, non-blocking) |
| WG.234 | Load/soak harness + observability + DR runbook | soak `config`/`observability`/`soak` Vitest (20) + `observability.test.ts` (3) | 🟢 wave-gated; live 10k–100k soak = open coverage boundary (F-WG3) |
| ia3-console | Internal admin console — Support tab (slice 1): wired to the SAME `list_tickets` RPC the live founderfirst.one/admin inbox reads (one source of truth, no fork), staff-gated, no bare `<h1>` | `admin/support.test.ts` (5: same-RPC/no-fork, admin TicketRow shape parity, staff-gate, honest live-wiring, no-bare-h1) + `admin/nav.test.ts` (updated: overview+support live) | 🟢 tests green (app vitest 493/493). Read-only mirror — replies still land in the live admin; apps/admin untouched (empty diff). Later slices: Audience/Analytics/Penny tabs. |
| IQ-1 | QBO connection hardening (tokens-at-rest encryption · 429/5xx retry+backoff · reactive 401→refresh→retry · disconnect revokes at Intuit · OAuth state TTL · unknown classification → holding, not silent 'expense') | pgTAP `iq1_qbo_token_encryption_test.sql` (13: enc/dec roundtrip, set_qbo_tokens nulls plaintext, dual-read legacy rows, `authenticated` can't reach decrypt/secrets/token-cols) + deno `qbo.test.ts` (+8: 429→backoff→success, bounded backoff, 401→refresh→retry, no-refresh-loop, revoke, classification→null) | 🟢 tests green (deno 11/11 local); pgTAP runs in CI (no local Docker) — verify before merge. Encryption reversible + dual-read (no live-connection break). |

### What this gate did NOT cover (standing gaps)
- **Live 10k–100k sandbox soak** — CI ran the in-memory smoke model only (F-WG3).
- **Admin console browser/axe walk** — the app-e2e axe gate does not visit `/admin`; F-WG1
  was found by static analysis + the graduated-pattern comparison, not a live axe run.
- **QBO/Xero/Plaid OAuth completion** — authorize URLs tested; full OAuth is not automatable
  (LEARNINGS #10), covered separately by SYNCTEST.
- **#230 Square/PayPal API sync** — quarantined; isolation verified, functionality not audited.

## Program 6 — PENNY-UX findings (Jul 2026)

Card **PENNY-UX-0**: a rigorous browser audit of the LIVE app at `penny.founderfirst.one`
— every lens (owner / CPA / staff) × every tab/route/report view × the full
RESPONSIVE.md width ladder (320→1920), on real authed sessions (minted via the
documented generate-link → verify → hash-URL flow), with a live axe-core WCAG A/AA
scan, per-surface console/network capture, tap-target measurement, and connector
probes — plus static design-system greps of `apps/app/src`. Audit-only: no fixes in
this card. **Every mutation stayed inside clearly-namespaced audit fixtures**
(created through the normal app flows — onboarding, journal form, invite form,
org switcher):

- audit orgs: `PENNYUX-AUDIT Books` `00330666-2bc9-4118-af5b-5554c9aaeb21` (business,
  18 kernel-seeded accounts + 2 UI-posted entries), `PENNYUX-AUDIT Firm`
  `05ddd4c6-07d6-4679-bc01-3669117c9a36` (firm) — **purge after the fix cards land**
- audit users: `pennyux-audit-owner@e2e.founderfirst.test`
  (`5ad81a7d-d489-47ba-9a5e-a1fa7cece26d`), `pennyux-audit-cpa@e2e.founderfirst.test`
  (`932fc16b-60ca-4f78-91a2-81cc67bee44a`); plus read-only use of the seeded
  `e2e1-maria` / `e2e1-staff` accounts. No real customer org touched.

**Verdict: 1 P0, 4 P1, 7 P2.** The product is in strong shape on the machine-gated
dimensions — **zero horizontal overflow at all 13 ladder widths on every surface
audited, zero console/page errors on every route** (only the benign Cloudflare
`/cdn-cgi/rum` beacon abort), onboarding → seeded books → posted entries → reports →
CSV export all work end-to-end live, and the Penny thread answered a grounded
question correctly. The P0 is a dead cross-persona flow the happy-path gates don't
walk: **the invite-your-accountant link 404s into onboarding**, so an owner cannot
actually share their books.

### Per-surface status (all live-authed, desktop + width ladder + axe)

| Lens · surface | Status | Notes |
|---|---|---|
| Owner · Home (pulse + Penny thread + feed) | 🟢 working | KPIs, deadlines, thread answers grounded Q; axe clean; no overflow |
| Owner · Home (empty books — e2e1-maria) | 🟢 working | correct setup nudge + invite nudge; Penny declines gracefully |
| Owner · Review (suggestions + categorize + receipts) | 🟢 working | real empty states; photo/paste capture renders |
| Owner · Reports — P&L / TB / BS / CF / GL / 1099 / package | 🟢 working | all 7 views render; CSV download delivers period-stamped file; **GL view has a serious axe violation (F5)** |
| Owner · Connections (catch-up · import · Plaid · QBO/Xero · payouts · invoicing · invite) | 🟢 working | all 8 sections render; catch-up advances to drop-files; **invite link broken (F1)**; payout tiles all live — 5 providers via file-import (F11 closed by W4.1-B) |
| Owner · Connections → broken-connection health (banner · Reconnect · in-app support, IQ-2) | 🟢 stress pass | apps/app UI only (reads existing `external_connections.status`/`last_error` — no migration/edge-fn). When a connection lands in `status='error'`/`revoked` an honest amber banner surfaces on the Connections choose-view (broken-only — healthy orgs render nothing); OAuth providers (QBO/Xero) get a one-click **Reconnect** that re-runs the existing `*-connect` path (`connectProvider` → `authorize_url` → `window.open`), bank feeds (Plaid) fall back to an honest manual line. Always-reachable `ContactSupport` resolves to `SITE.email` (centralization — no hardcoded address) on the banner + error states. Copy from `COPY` (no exclamation marks, VOICE-clean); amber tokens + `.section-h` (no bare `<h1>`); banner flex-wraps with `min-width:0` so no h-scroll 320→1920. Vitest `connectionHealth.test.ts` (11): broken-only detection, qbo/xero reconnectable vs plaid manual, support resolves to SITE.email, banner source-invariants (Reconnect CTA wired to OAuth, gated on broken, no `<h1>`). |
| Owner · Connections → Paying bills (ap-billpay, RV2-D1) | ⬜ untested → stress pass | AP / bill-pay TRACKING ONLY (never moves money): opt-in off by default; capture bill → enter (Dr Expense / Cr AP) → record payment (Dr AP / Cr Cash) → paid; AP aging + per-vendor. Vendors REUSED from the 1099 store (no dup). pgTAP `rv2_d1_ap_bill_pay_test.sql` (25 assertions) proves the lifecycle ties to the ledger + to 1099 vendor totals, idempotency, cross-tenant isolation, and the NO-FUND-MOVEMENT invariant; Vitest `billMath.test.ts` locks the preview math + scans source for any money-movement surface. UI responsive pass on the width ladder still pending. |
| Owner · Advanced — Journal / CoA / Reconcile / Periods / Rules | 🟢 working | posting via the form works; real empty states; **clipped off-screen on phones (F3)** |
| Owner · Settings (`/settings`) | 🟢 working | invite + approval toggle; axe clean |
| Owner + CPA · Security (`/security`, SEC-1) | ⬜ untested → stress pass | new: personal two-factor authentication — TOTP enrol/challenge/disable runs entirely against Supabase Auth's native factor API (no schema of ours); one-time recovery codes are our own hashed store (`mfa_recovery_codes`/`security_audit`, `mfa` edge fn, Admin-API factor clear on redeem). Login-time step-up (`MfaChallengeGate`, wraps every authed route) blocks any account with a verified factor until aal2; per-org "require two-factor" policy (`MfaRequiredSetting` in Settings) blocks org access via `OrgMfaGate` until the member enrols — Settings/Security stay reachable so a blocked member can fix it. pgTAP `sec1_mfa_test.sql` (24 assertions) proves one-time-use + cross-user isolation + service_role-only RPCs; Vitest proves both gate decision functions pure. UI responsive/axe pass on the width ladder still pending. |
| Onboarding (3 steps, kernel tiles) | 🟢 working | full walk created the audit org + 18-account CoA; axe clean at each step; **no accountant/practice path (F10)** |
| Org switcher · + New organization · account menu | 🟢 working | business/practice types both create; **F4 FIXED (PENNY-UX-4):** firm contexts also show "+ Add client" (guided request flow; app-e2e gated) |
| CPA · client books — Overview / Categorize(+Rules) / Books(Journal·Accounts·Import·Reconcile·Periods) / Reports | 🟢 working | reached only via the corrected accept URL (F1); every sub renders; axe clean; **F8 FIXED (PENNY-UX-7):** takeaway now counts entries |
| CPA · Practice home (firm) | 🟢 working | renders queue empty state; **F4 FIXED (PENNY-UX-4):** empty copy now names the real "+ Add client" switcher affordance (app-e2e asserts copy⇄affordance match) |
| CPA · invite accept (`/accept?token=`) | 🟢 working | route itself works — only the *generated link* is wrong (F1) |
| CPA · Filing — return worksheet per form (RV2-A1) | 🟨 unit-tested | new surface: per-form worksheet (Schedule C / 1120-S / 1065), every line drills down to the exact ledger entries; tie-out to the cent covered by Vitest (`worksheet.test.ts`, REG `RV2A1-WORKSHEET-TIEOUT`). **Red-team P0 fixed:** worksheet had NO tax-year scoping — every year's activity leaked onto the selected form's lines while still "tying out" (a review-ready lie); `Filing.tsx` now applies `taxYearDateFilter(tax_year)`, REG `RV2A1-WORKSHEET-PERIOD-SCOPE`. Multi-currency mis-sum is a non-issue (books single-currency by DB trigger, per reports.ts). Still needs a live stress pass (unmapped surfacing, drill-down UX, width-ladder). Structured export / e-file are deferred later steps. |
| Owner · Advanced — Filing (view) | ⬜ untested | same worksheet, owner-view, nested under Advanced (no new top-level nav); stress pass pending |
| Staff · `/staff` console | 🟢 working | org directory + entry counts; break-glass NOT exercised (mutating, audited) |
| Staff wall for non-staff · unknown routes · login | 🟢 working | owner at `/staff` gets the wall; unknown route → `/`; login wall clean; **F9 FIXED (PENNY-UX-7):** heading on `.page-title` |

Empty/placeholder tabs: **none found** — every tab renders real content or an
intentional, actionable empty state.

### PENNY-UX-9 — second (post-Wave-2) IA/design-conformance pass (Jul 2026)

The scope-decision (Nik, 4 Jul) was to revisit the LIVE app from the owner + CPA
lenses now that all four Wave-2/3 surfaces shipped (tax export, month-end close,
AP/Bills, multi-currency, MFA) and bring the whole app to the `founderfirst.one/admin`
standard: `.eyebrow` + `.page-title` on every authed page (never a bare billboard
`<h1>`), all font/color/spacing/radius from `tokens.css`, real content in every tab,
no width-ladder horizontal scroll.

**Re-audit result — the IA is already conformant** (the PENNY-UX-0..8 passes plus the
Wave-2 builders landed it): every authed header (`Ledger`, `PracticeHome`, `Settings`,
`Security`, `AdminConsole`, `StaffHome`, `Onboarding`, `Login`) leads with `.eyebrow`
+ `<h1 className="page-title">`; **grep found zero inline hex** in `apps/app/src`
(only token-referencing comments); **`check:css-vars` green** (1048 refs across 142
files resolve); the new Wave-2 surfaces are **nested under existing jobs, no new
top-level nav** — Invoicing / **Bills (AP)** / payout-split under **Connections**
(`Ledger.tsx:296–320`), **Filing** under owner **Advanced** and as a CPA workflow tab
(`nav.ts`), multi-currency + MFA under **Settings** (`MultiCurrencySetting` /
`MfaRequiredSetting`). No empty or duplicative tabs. **No restructure needed** — so no
new top-level nav was added (usability gate respected).

**Coverage delta (what this pass added — guards, not code churn):**
- **`check:authed-headings`** (`scripts/check-authed-headings.ts`, wired into
  `centralization.yml`): fails the build on any authed `<h1>` lacking `.page-title`
  (billboard-scale regression, LEARNINGS #14 silent-failure family). Comment-aware so
  the "never a bare `<h1>`" note in `Login.tsx` doesn't false-positive.
- **`designConformance.test.ts`** (app suite, REG): asserts (a) no bare authed `<h1>`
  and (b) no inline hex color (`: #hex`) in `apps/app/src` — locks the `/admin` design
  pattern per-page, complementing `nav.test.ts` which locks the per-lens tab SETS.
- Together these convert "the app matches the /admin standard" from a manual review
  into two standing CI gates. Responsive (width ladder) stays covered by
  `responsive.yml`; this pass made **zero CSS/layout changes**, so no new scroll risk.

### Ranked findings (live-reproduced; `file:line` from a fresh `origin/main` worktree)

**F1 · P0 · The "invite your accountant" accept link is dead — the whole owner→CPA
sharing flow fails end-to-end on the live app.**
`supabase/functions/invites/index.ts:104` returns
`accept_path: '/app/accept?token=…'` — the app's *old* base. The app now lives at
`penny.founderfirst.one` with base `/` (`apps/app/src/App.tsx:136`), so the link the
owner copies (`InviteCpa.tsx:26` = `window.location.origin + accept_path` =
`https://penny.founderfirst.one/app/accept?token=…`) hits the router's catch-all
(`App.tsx:122`) → silent redirect to `/` → token never consumed, never stashed.
**Repro (live):** Connections → Share with your accountant → invite → open the shown
link as the invitee → lands on *onboarding*, no engagement created. Navigating the
same token to `/accept?token=…` accepts fine and the full CPA lens renders — proving
the path string is the only break. **Fix:** return `/accept?token=${token}` (and add
an app-e2e assertion that the *generated* link resolves to the Accept route).

**F2 · P1 · Nine undefined CSS variables in the app stylesheet — receipt, migration,
catch-up, onboarding and thread surfaces silently lose their intended styles.**
`apps/app/src/styles.css` uses vars that resolve nowhere (no fallback, not in
`packages/design-system/tokens.css` nor the app sheet): `--fs-sm` (107, 1058),
`--fs-xs` (111, 1154), `--fs-caption` (1123), `--ink-1` (1007, 1051, 1057, …),
`--r-sm` (569), `--radius-1` (1114, 1121), `--radius-2` (1082, 1087, 1093),
`--surface` (1083, 1105), `--surface-2` (1088, 1094, 1117). Effect: `border-radius`
→ 0, `background` → transparent, `font-size` → inherited body size on the receipt
capture/queue/chips, migration TB table, onboarding tiles, thread turns. Violates
rubric §8 ("no undefined CSS vars") and the tokens-only rule. **Fix:** map each to a
real token (`--fs-label`/`--fs-ui`, `--ink`/`--ink-2`, `--r-card`/`--r-ctl`,
`--paper`/`--white`); consider a CI grep that every `var(--x)` in app CSS resolves.

**F3 · P1 · On phones the Advanced tab is clipped off-screen with no scroll
affordance — the accountant-grade ledger is undiscoverable for owners on mobile.**
`apps/app/src/styles.css:350-353` — `.ledger-tabs { display:flex; overflow-x:auto }`
with `white-space:nowrap` tabs and no edge-fade/indicator. Measured live at 375px:
`Advanced` sits at `right=432px` (viewport 375), `stripScrollable:true` — invisible
on iOS-style hidden scrollbars. The overflow *gate* passes (the strip scrolls, the
page doesn't), which is exactly why no CI catches it. Same class applies to the CPA
Books sub-strip. **Repro:** owner org at 375px → tab row ends at "Connections".
**Fix:** wrap to a second row at narrow widths (`flex-wrap`) or add the `.table-wrap`
edge-fade affordance to `.ledger-tabs`. **FIXED (PENNY-UX-3):** `.ledger-tabs` (sub-strip
included — shared class) carries the `.table-wrap` edge-fade at ≤640px, fade covers keyed
to `var(--paper)` (the body background, so no cover artifact); the app-e2e PENNY-UX-3
check (`verifyTabStripDiscoverability`) is the regression net — at 375px a strip that
overflows without a *rendered* fade (computed `background-image`) fails the gate, and
`#ltab-advanced` must stay reachable.

**F4 · P1 · A CPA cannot actually add a client — the promised "+ Add client" job
doesn't exist, and the Practice-home empty state points at it.**
APP_PRINCIPLES §3/§5 pin `"+ Add client" lives in the switcher`; the switcher only
offers `+ New organization` (`apps/app/src/components/OrgSwitcher.tsx:128`,
`copy/strings.ts:77`), which creates an org the CPA *owns* (owner lens) — not a
client engagement. Meanwhile the Practice home empty state says "Add your first
client from the switcher above" (`lenses/PracticeHome.tsx:51-52`,
`copy/strings.ts:705-707`) — a dead-end instruction, since engagements are
owner-initiated invites. **Repro:** create a firm → Practice home → follow its own
instruction. **Fix (decision-needed):** either an "+ Add client" switcher item for
firm contexts (e.g. a "send your client this request" flow) or honest copy telling
the CPA to have the client invite them from *their* Connections tab.
**FIXED (PENNY-UX-4, 4 Jul — Nik chose BUILD):** "+ Add client" now lives in the
switcher for firm contexts only, as a guided flow honest about the machinery: it
produces a **request link** (`/settings?invite_cpa=<CPA email>`) + a send-along
message; the client's owner opens it and their existing invite-your-accountant form
arrives **pre-filled** (strictly validated, never auto-submitted, review notice
shown) — owner still picks access and sends, CPA accepts, authorization unchanged
(engagements stay owner-invited; no new server path, no migration). Practice-home
empty copy now names this affordance. Gated by app-e2e (firm switcher shows the
item · panel renders the link · owner form pre-fills · submit reaches the `invites`
fn 201) + Vitest (`org/addClientRequest.test.ts` producer/resolver round-trip +
copy⇄affordance match). **Residual (not covered):** a client NOT yet on Penny loses
the `invite_cpa` param through onboarding (they land on setup, not the invite form)
— the send-along message carries manual steps for that path.

**F5 · P1 · Serious axe violation on the General-ledger report: scrollable region
not keyboard-accessible.** `apps/app/src/ledger/Ledger.tsx:1178` — the GL `.table-wrap`
(`styles.css:445`, `overflow-x:auto`) has no `tabindex`/role, so keyboard users
cannot scroll the widest report. axe: `scrollable-region-focusable` (serious),
live on the audit org's GL view. It slipped because the `app-e2e` a11y gate scans the
Reports *tab default* (P&L) but never clicks through the report sub-views. **Fix:**
`tabindex="0"` + `role="region"` + `aria-label` on scrollable `.table-wrap`s (same
pattern as the tabpanels), and extend the app-e2e axe walk across all 7 report views.

**F6 · P2 · Systemic sub-44px touch targets on authed surfaces.** Measured live at
1280 and unchanged at phone widths: Books/Advanced sub-tabs 38px
(`styles.css:367` `min-height:2.4rem` overrides `--tap-min`), `.ghost.sm` buttons
36px (New entry, Download CSV/PDF, Close period, Connect a bank/QBO/Xero, staff
"Open →"), `.report-seg` buttons 36px, top-bar brand link 30px, thread suggestion
chips 36px. RESPONSIVE.md rule 3 (`≥44×44`) is met by the *primary* tab strip and
inputs but not these. **Fix:** lift `min-height` to `var(--tap-min)` on sub-tabs /
`sm` variants / seg buttons (padding, not font, so density holds).

**F7 · P2 · Cloudflare RUM beacon noise.** `POST /cdn-cgi/rum` aborts
(`net::ERR_ABORTED`) on route transitions on every page — benign (Web-Analytics
beacon), but it pollutes every console capture and can mask real failures in
debugging sessions. Advisory: consider disabling RUM for the app zone or accepting
the noise knowingly.

**F8 · P2 · Dishonest "no activity" takeaway with posted entries.** — **CLOSED by
PENNY-UX-7 (pr:#228)**: `hasActivity` now derives from the same entries the
Latest-activity panel renders (pure `hasLedgerActivity` in `ledger/overview.ts`,
unit-tested with a balance-sheet-only fixture), so the takeaway can only claim
"no activity" when the panel shows "No entries yet." Original finding: CPA/owner
Overview showed "No activity yet — import your history or post your first entry to
get started" (`copy/strings.ts:177`) while the same panel listed 2 posted entries —
`hasActivity` was derived from P&L income/expense only (`Ledger.tsx:381,471-473`), so
balance-sheet-only books (opening balances, transfers) read as "no activity".

**F9 · P2 · Login heading uses the billboard type scale on a bare `<h1>`.** —
**CLOSED by PENNY-UX-7 (pr:#228)**: the heading now uses the shared `.page-title`
(the restrained authed scale from design-system typography.css); the per-card
`--fs-h2` font-size rule is gone (only a margin tighten remains). Original finding:
`apps/app/src/routes/Login.tsx:50` + `styles.css:47` (`--fs-h2`, measured 44px).
The design-system reserves `--fs-h1/2/3` for public heroes; authed/app screens use
`.page-title`. Contained (the auth card is the one pre-authed screen, and it *is*
styled — not the raw 64px), but it was the only heading in the app off-pattern.

**F10 · P2 · First-run onboarding has no accountant path.** Onboarding hard-codes
`type:"business"` (`apps/app/src/onboarding/Onboarding.tsx:68-71`) and asks "What's
your business called?" — a CPA signing up cold (no invite, e.g. after F1 bites) can
only create a *business* or must discover switcher → New organization → "CPA
practice". Fine for the current owner-first funnel; worth an explicit "I'm an
accountant" link when CPA acquisition starts. (Decision-needed; usability gate —
no new onboarding question without Nik.)

**F11 · P2 · "COMING SOON" stub tiles shipped in the payout splitter.** — **CLOSED
by W4.1-B** (Nik 4 Jul: integrate the majors now): PayPal / Square / Amazon got real
report parsers + registry rows flipped to `available`, so the tiles are live upload
flows. Enablement is registry-driven (`status='available'` + `hasPayoutParser`), the
hardcoded `PARSEABLE` list is gone, and `regression.payout-providers.test.ts` guards
the registry⇄parser contract so an available-but-parserless (dead) tile can't recur.
Original finding: `PayoutUpload.tsx:54-58` rendered the three as disabled `coming
soon` tiles (`copy/strings.ts:547`) against rubric §9.

**F12 · P2 · APP_PRINCIPLES baseline drift.** — **CLOSED by PENNY-UX-7 (pr:#228)**:
§0, §2's Advanced row, and §3 now state the shipped `ledger/nav.ts` reality
(`OWNER_TABS` = Home · Review · Reports · Connections + Advanced with Journal ·
CoA · Reconcile · Periods · Rules; `CPA_TABS` = Overview · Categorize(+Rules) ·
Books(5 subs) · Reports) and point nav edits at `nav.ts` + this doc. Original
finding: `apps/app/APP_PRINCIPLES.md` §0 still described `main` as the grouped
`MAIN_TABS = Overview · Categorize · Books · Reports` nav for *both* lenses;
live/`main` owner nav is Home · Review · Reports · Connections + Advanced (with
Rules/Reconcile subs), CPA is Overview · Categorize(+Rules) · Books(5 subs) ·
Reports via `ledger/nav.ts` — and §3's flat five-tab CPA list never shipped
(LEARNINGS #7: change behavior → update what the system says about itself).

### Connector status matrix (live-probed, sandbox; no production OAuth filed)

| Connector | Real status | Evidence (live) |
|---|---|---|
| **Plaid** (bank feeds) | 🟢 wired, sandbox — link-token + Link UI verified; exchange/sync not completed in this audit | `plaid-link-token` fn → 200 `link-sandbox-…` token; Plaid Link iframe renders. Ongoing sync/webhook paths not exercised (would post to the ledger) |
| **QuickBooks** (import/migrate) | 🟢 wired — OAuth reachable; end-to-end sync covered by SYNCTEST (PR #142 fixes on main) | `connect` fn returns a valid `authorize_url` → real Intuit sign-in for the app's client id opens |
| **Xero** (import/migrate) | 🟢 wired — OAuth reachable ("to continue to FounderFirst") | `connect` fn → `login.xero.com` authorize page for the app's client id. Awaiting re-consent per the granular-scopes change |
| **Stripe** (payout splitting) | 🟢 working — upload-a-payout-report parser (no OAuth by design) | provider tile enabled; W4.1 Vitest/pgTAP cover the split math |
| **Shopify** (payout splitting) | 🟢 working — same upload model | provider tile enabled |
| **PayPal** (payout splitting) | 🟢 built (W4.1-B CSV + W4.1-C/D API sync, sandbox read-only) — transaction-CSV parser (signed-fee polarity) + Transaction-Search API; **exactly-once anchor = transfer-to-bank (withdrawal) txn id on BOTH paths (Option A, RT-230 resolved)**; a not-yet-withdrawn window is skipped, not posted | tile registry-driven (`status='available'` + `hasPayoutParser`); `payouts.paypal.test.ts` + `apiSync*.test.ts` cover split/reconcile/exactly-once/skip/injection; needs a live stress pass with a real export |
| **Square** (payout splitting) | 🟢 built (W4.1-B) — payout-details-CSV parser (signed-fee polarity), file-import first; API sync = follow-up | same registry-driven tile; `payouts.square.test.ts`; needs a live stress pass with a real export |
| **Amazon** (payout splitting) | 🟢 built (W4.1-B) — V2 flat-file settlement parser (tab-delimited; summary-row reconcile), file-import first; API sync = follow-up | same registry-driven tile; `payouts.amazon.test.ts` incl. truncated-file reconcile failure; needs a live stress pass with a real settlement file |

OAuth completion is not automatable from the harness (LEARNINGS #10) — statuses above
are judged from the live UI + captured fn/network responses + the code paths, per the
card. No dead buttons found: every connector button either works or opens the real
provider flow.

### Proposed fix cards — PENNY-UX-1..8 (sequenced per LEARNINGS #24)

Shared-file collision map: `styles.css` (UX-2 → UX-3 → UX-6 serialize),
`Ledger.tsx` (UX-5 → UX-7 serialize), `copy/strings.ts` (UX-4/UX-7 coordinate).
UX-1, UX-2, UX-5 are mutually disjoint — start in parallel.

| Card | Goal | Scope / touches | Blocked by |
|---|---|---|---|
| **PENNY-UX-1** (P0) | Invite accept link resolves: `accept_path` → `/accept?token=…`; app-e2e asserts the generated link reaches the Accept route and the engagement renders | `supabase/functions/invites/index.ts` (deploy fn per LEARNINGS #23), `tools/app-e2e/run.mjs` | — |
| **PENNY-UX-2** (P1) | Zero unresolved CSS vars: map the 9 undefined vars to real tokens; add a `check:css-vars` grep gate so the class can't recur | `apps/app/src/styles.css`, `package.json` script, CI | — |
| **PENNY-UX-3** (P1) | Mobile nav discoverability: `.ledger-tabs` wraps (or edge-fades) at ≤640px so Advanced/subs are visibly reachable; ladder-walk screenshot diff in app-e2e | `apps/app/src/styles.css` | UX-2 |
| **PENNY-UX-4** (P1, **decision-needed**) | The CPA "add a client" job exists or the copy stops promising it: "+ Add client" switcher affordance for firm contexts, or honest Practice-home empty copy | `components/OrgSwitcher.tsx`, `lenses/PracticeHome.tsx`, `copy/strings.ts` | Nik decision on mechanism |
| **PENNY-UX-5** (P1) | Keyboard-accessible scroll regions + full-report a11y coverage: `tabindex`/`role`/label on scrollable `.table-wrap`s; app-e2e axe walk clicks all 7 report views | `apps/app/src/ledger/Ledger.tsx`, `tools/app-e2e/run.mjs` | — |
| **PENNY-UX-6** (P2) | Touch targets ≥44px on sub-tabs, `sm`/seg buttons, brand link (padding-led, density kept) | `apps/app/src/styles.css` | UX-3 |
| **PENNY-UX-7** (P2) — **CLOSED (pr:#228)** | Copy/pattern honesty batch: activity takeaway counts entries (F8); Login heading on the app scale (F9); APP_PRINCIPLES §0/§3 refreshed to `nav.ts` reality (F12) | `ledger/Ledger.tsx`, `ledger/overview.ts(+test)`, `routes/Login.tsx`, `styles.css`, `APP_PRINCIPLES.md` | UX-5 (Ledger.tsx), UX-6 (styles.css) — both merged |
| **PENNY-UX-8** (P2) — **CLOSED by W4.1-B** | Stub payout tiles: resolved by Nik's 4-Jul "integrate the majors now" — PayPal/Square/Amazon got real parsers and the tiles went live (F11 closed); no flag-off needed | `ecommerce/payouts.ts`, `ecommerce/PayoutUpload.tsx` | — |

Post-fix cleanup (not a card): purge the `PENNYUX-AUDIT` orgs + `pennyux-audit-*`
users listed above once UX-1's e2e assertion covers the invite path.

### What this audit did NOT cover (standing gaps)
- **Break-glass open/close** — read-only discipline: opening a grant writes
  `break_glass_grants`/`admin_audit`; the console UI around it is verified, the flow isn't.
- **Plaid exchange → categorize** end-to-end (needs Link completion; ledger-mutating).
- **QBO/Xero OAuth completion + pull** (LEARNINGS #10; covered separately by SYNCTEST).
- **read_only CPA engagement UI** — only a `full` engagement was walked; read-only
  affordance-hiding is unit/pgTAP-covered but not browser-walked here.
- **Keyboard-only traversal** beyond axe (roving tabindex reviewed in code, not driven).
- **Real-device rendering** (iOS Safari scrollbar behavior asserted from spec, headless Chromium used).

## Program 5 — Wave 4 wave-gate audit (money-in + reporting layer, 3 Jul 2026)

The Wave-4 gate (LOOP_PROMPT hard-rule #8): the 14-dimension rubric + an adversarial
stress pass over the Wave-4 blast radius (all merged + deployed to prod), run before the
loop ramps further. Blast radius: **W4.1** e-commerce payout splitting (provider-agnostic
framework; Stripe/Shopify parsers; `post_ecommerce_payout` / `reverse_ecommerce_payout`
RPCs; `ext:<provider>:payout:<id>` idempotency; reconcile-not-plug guard), **W4.2**
cash-flow statement (GAAP indirect; `cf` report kind; ties to the BS cash delta), **W4.3**
invoicing + AR (invoices/lines/payments; Dr AR / Cr Revenue on send, Dr Cash / Cr AR on
pay; aging; opt-in nudges via `invoicing` edge fn + Resend), **W4.4** lender / due-diligence
package (`pkg` report kind; statements + aging + comparatives + cover), **W4.5** rescue
landing page (`apps/web/src/pages/rescue.astro`) — plus a merge-integration re-check of the
shared files (`export.ts` / `Ledger.tsx` / `api.ts` / `reports.ts`) that W4.1–W4.4 all
touched via conflict-resolved merges.

**GATE VERDICT: 🟢 CLEAR — 0 P0, 0 P1.** Only three P2s found (below): a payment-input UX
gap (server-enforced, no data risk), two different-by-design AR-aging bucket schemes shown
to the owner (consistency), and a narrow CSV-injection edge (leading-whitespace-before-
formula). None blocks the wave; all are polish/consistency. **The trust cluster (security /
data-integrity) is materially clean and is the strongest-built part of the wave:** every new
write RPC is `can_write_org_as(p_actor,…)`-gated, SECURITY DEFINER + `SET search_path=public`,
revoked-from-public + service_role-only EXECUTE; every posting funnels through
`post_journal_entry` with a stable `ext:`/`invoice:` idempotency key (no double-post);
corrections go through the reversal path (append-only); `send_invoice` / `apply_invoice_payment`
/ `void_invoice` all take `SELECT … FOR UPDATE` (LEARNINGS #15); the payout reconcile check
*rejects* a non-tying split rather than plugging (LEARNINGS #16); the report/package feed
paginates all rows via `useEntries` `.range()` loop (LEARNINGS #18); CSV export has a
formula-injection neutralizer (new hardening this wave). All 5 W4 PRs (#205–#209) are
CI-green; 61 W4 Vitest tests + the W4.1/W4.3 pgTAP suites pass.

### Per-dimension summary (blast radius)

| Dimension | Verdict | Notes |
|---|---|---|
| security (RLS/isolation/actor/SECDEF) | 🟢 pass | new tables org-scoped + RLS `nowrite`/`can_access_org`; every write RPC `can_write_org_as(p_actor,…)` + `SET search_path` + service_role-only EXECUTE; `invoice_ar_aging` (authed read) embeds `can_access_org` in its WHERE. No forged-`p_actor` surface. |
| data_integrity (append-only/reversal/idempotency/ties) | 🟢 pass | all postings via `post_journal_entry` (balanced, period-aware); stable idempotency keys (`ext:<prov>:payout:<id>`, `invoice:send:<id>`, `invoice:pay:<payid>`) — re-import/re-send return the original, no double-post; corrections = reversal path; `FOR UPDATE` on invoice send/pay/void; overpayment rejected server-side; payout reconcile rejects non-tying split. |
| performance (pagination) | 🟢 pass | cash-flow + package are pure functions over the fully-paginated `useEntries` (`api.ts:73-88` `.range()` loop until exhausted, hard cap raises); no `max_rows=1000` cliff (proven by `export.test.ts` 10k-row case). |
| ia_ux / usability gate | 🟢 pass (1 P2) | invoicing nests under Connections (opt-in, OFF by default — no new top-level nav ✔); cash-flow/package are report tabs. **F3 (P2):** owner sees a 5-bucket AR aging (invoice view) and a 4-bucket AR aging (lender package) — different by design (due-date vs entry-date) but visually inconsistent. |
| copy / voice / centralization | 🟢 pass | nudge cadence is DATA (`platform_config.invoice_nudge_cadence_days=7`, mirrored in `CONFIG_DEFAULTS`); no rate/threshold/fee-% literals in W4 code; rescue page: 0 exclamations, no competitor names, no guarantees, uses `SITE`. |
| design_system | 🟢 pass | no inline hex / magic px in new components; rescue uses `Base` layout + tokens. |
| responsive | 🟢 pass | no fixed-px horizontal layouts in the new tabs/rescue; **the auth-walled width-ladder gap is now CLOSED** — `app-e2e` sweeps every owner surface overflow-free across 320→1920 on the real authed DOM. |
| a11y | 🟢 pass | invoicing table/pay-row use labels; **the auth-walled a11y gap is now CLOSED** — `app-e2e` runs a live axe-core WCAG A/AA scan on every owner surface, failing on serious/critical. |
| reliability / observability | 🟢 pass | send posts books first, emails after (email failure never un-posts — comment + code order confirmed); aging returns a stable 5-bucket shape even when empty. |
| tests | 🟢 pass | 61 Vitest (payouts/cashFlow/package/invoiceMath/export) + `w4_1_ecommerce_payouts_test.sql` (16) + `w4_3_invoicing_test.sql` (21) — idempotency, tie-out, reconcile-guard, overpayment, void/reversal, auth-gate, aging, config-driven nudge all covered. |
| copy_docs / seo | 🟢 pass | rescue.astro has unique title/description via `Base`; admin/app surfaces noindex (excluded). |
| dead_code | 🟢 pass | no shipped stubs; PayPal/Square/Amazon are `status='planned'` registry rows (not shipped UI) — intentional extensibility, not a "coming soon" destination. |

### Findings (ranked, verified — `file:line` + repro)

**F1 · P2 · Payment input has no client-side overpayment cap (server-enforced).**
`apps/app/src/ledger/Invoicing.tsx:184-190`. The pay-row `<input>` passes any typed amount
straight to `payInvoice(orgId, inv.id, minor)` with `parseMoneyToMinor(amt) ?? balance` — no
`Math.min(minor, balance)`, no disabled-on-over-amount, no inline validation, though `balance`
is in scope (line 154). **Repro:** open a sent invoice's pay row, type more than the
outstanding balance, click Apply. **No data-integrity risk:** `apply_invoice_payment` rejects
it server-side (`20260706070000_…sql:361-363`, `overpayment` `check_violation`, under
`FOR UPDATE`) — so the books are safe; the user just gets a raw error toast instead of a
guarded button. UX polish. **Fix:** cap/validate client-side and disable Apply when the amount
exceeds `balance`. → regression stub REG-W4-F1 (asserts the client caps at balance).

**F2 · P2 · CSV formula-injection neutralizer misses leading-whitespace-before-formula.**
`apps/app/src/ledger/export.ts:82-85`. `neutralize()` prefixes a tab to cells whose *first
char* is `= + - @ \t \r`, but a cell like `" =HYPERLINK(…)"` (leading space, then `=`) is not
caught — the classic guard trims first, then checks. Account names / invoice memos are
user-controlled. **Repro:** an account named `" =2+2"` exports un-neutralized; a spreadsheet
that trims leading spaces on open then evaluates the formula. Low likelihood (leading-space +
formula is unusual) + affects only a downloaded file the owner opens ⇒ P2. **Fix:** check
`/^\s*[=+\-@]/` (or trim before the leading-char test), keeping the pure-number exemption.
→ regression stub REG-W4-F2 (leading-space formula is neutralized).

**F3 · P2 · Two divergent AR-aging bucket schemes surfaced to the same owner.**
`apps/app/src/ledger/invoiceMath.ts:35-44` (invoice view: `current / 1-30 / 31-60 / 61-90 /
90+`, aged by **due date**, 5 buckets — matches SQL `invoice_ar_aging`) vs.
`apps/app/src/ledger/reports.ts:459-464` (`AGING_BUCKETS`, lender package: `Current(0–30) /
31–60 / 61–90 / 90+`, aged by **entry date**, 4 buckets). They measure genuinely different
things (invoice-level due-date aging vs. GL-line entry-date aging) so it is **not** a strict
one-source-of-truth violation — but an owner comparing the invoicing screen to the lender
package sees two AR aging tables with different bucket counts and totals for overlapping
receivables. **Repro:** enable invoicing, send an overdue invoice, open both the invoicing AR
aging and the W4.4 package aging → different buckets/splits. Consistency/UX ⇒ P2. **Fix:**
either unify the two schemes or label each explicitly (due-date vs. transaction-date aging) so
the difference is intentional and legible. → regression stub REG-W4-F3 (documents/locks the two
schemes' boundaries so a future edit can't silently diverge further).

**Advisory (P2/robustness, no stub):** `invoiceMath.ts:63` `Math.max(cadenceDays, 1)` silently
floors a 0/negative nudge cadence to 1 day rather than surfacing a misconfiguration — defensive
but hides a bad `platform_config` value; the mirrored fallback (`CONFIG_DEFAULTS`) must stay in
sync with the migration seed (both currently 7 — verified).

### W4.5 rescue-page + merge-integration sanity-check
- **Rescue page** (`apps/web/src/pages/rescue.astro`): voice-clean (0 `!`, no competitor names,
  no unsubstantiated guarantees/compliance claims), imports `SITE` (no hardcoded email/URL),
  renders via `Base` layout with a unique title + description. No findings.
- **Shared-file merges** (`export.ts` / `reports.ts` / `Ledger.tsx` / `api.ts`, touched by
  W4.1–W4.4 via conflict-resolved merges): app typechecks clean, no timestamp collisions
  (`uniq -d` empty), all 5 PRs CI-green, 61 Vitest pass — no merge-integration regression. The
  `cf` / `pkg` export kinds and the cash-flow/package tabs wire through the same paginated
  `useEntries`.

### Coverage delta — Wave-4 ledger rows (this program)

New surfaces enter the ledger. A row leaves ⬜ only via this formal adversarial pass; each
below got the pass (finder → verifier); those with findings carry the finding id.

| # | Surface | Permanent test | Status |
|---|---|---|---|
| W4.1 | E-commerce payout splitting (provider-agnostic; Stripe/Shopify; post/reverse RPCs) | `w4_1_ecommerce_payouts_test.sql` (16) + `apps/app/src/ecommerce/payouts.test.ts` (12) | 🟢 stress-passed; no defect |
| W4.1-C/D | Square + PayPal **API payout sync** (sandbox, read-only) — API JSON → same split as CSV; posts via `post_ecommerce_payout` | `apiSync.test.ts` + `apiSync.redteam.test.ts` + `commerceApi.{test,redteam.test}.ts` (Deno) + `regression.api-sync.test.ts` | 🟢 stress-passed; **RT-230 PayPal exactly-once (P0) RESOLVED** (see below); multi-currency skip + genuine reconcile intact |
| W4.2 | Cash-flow statement (GAAP indirect, `cf` kind) | `apps/app/src/ledger/cashFlow.test.ts` (13) + `export.test.ts` CF tie-out | 🟢 stress-passed; no defect |
| W4.3 | Invoicing + AR (invoices/lines/payments; aging; opt-in nudges) | `w4_3_invoicing_test.sql` (21) + `invoiceMath.test.ts` (10) | 🟢 stress-passed; **F1 / F3 (P2)** open |
| W4.4 | Lender / due-diligence package (`pkg` kind; statements + aging + comparatives + cover) | `apps/app/src/ledger/package.test.ts` (9) | 🟢 stress-passed; no defect |
| W4.5 | Rescue-migration landing page (`/rescue`) | (static Astro; covered by web build + voice CI) | 🟢 stress-passed; no defect |
| — | CSV export hardening (cf/pkg CSV) | `export.test.ts` (17, incl. formula-injection) | 🟢 stress-passed; **F2 (P2)** open |

**Coverage delta:** +5 new ledger rows (W4.1–W4.5). 0 P0, 0 P1, 3 P2 — each with a permanent
regression stub (REG-W4-F1…F3) to be authored into `regression_pack` at fix time (the coverage
ratchet). Wave 4 invalidates the standing "Wave 4 not built" gap from Program 1.

**RT-230 · PayPal API↔CSV exactly-once (P0) — RESOLVED (Option A, Nik 4 Jul).**
An API-pulled PayPal payout and the SAME payout uploaded via CSV did **not** collapse:
the CSV path keyed on the user-typed batch id while the API path (Transaction Search has
no native batch id) synthesized `paypal:<startdate>`, so the same payout posted **twice**
(Square was fine — real payout id both sides). **Fix:** BOTH paths now derive the payout's
exactly-once anchor from the **transfer-to-bank (withdrawal) transaction id** — the actual
money movement that IS the payout. One shared derivation (`paypalCanonicalPayoutId`, keyed
on PayPal event code **T0400/T04xx**, mirrored named-constant on the Deno side) feeds the
same `ext:paypal:payout:<withdrawal-txn-id>` key from `apiSync.ts`, `payouts.ts` (CSV), and
`_shared/commerceApi.ts`. A window with **no** withdrawal transaction (money still in the
PayPal balance, not yet paid out) is **not** a completed payout: it is **skipped**, never
posted under a synthesized id (mirrors "non-reconciling → skip, never plug", LEARNINGS #16).
The RT-230 genuine-reconcile (vs. the old self-net tautology) and multi-currency-skip guards
are kept intact. → **regression scenario REG-W4-F5** (locked in tests): the SAME PayPal
payout via API + CSV derives the IDENTICAL id and collapses to ONE post to the cent
(`apiSync.test.ts` ⭐ exactly-once, `regression.api-sync.test.ts`); and a not-yet-withdrawn
window is skipped on both paths (`apiSync.test.ts`, `payouts.paypal.test.ts`,
`commerceApi.redteam.test.ts`).

### Proposed LEARNINGS additions (retro)
1. **A server-enforced invariant still needs a client-side guard for the *user*, not the data.**
   F1: overpayment is correctly rejected by the RPC, so the books are safe — but the UI lets the
   user submit an impossible amount and eat a raw error. Server-safe ≠ user-safe; mirror
   hard-boundaries (balance caps, positive-only) in the input so the user is guided, not just
   blocked. (Complements #16: the DB is the source of truth, but the UX must reflect the same
   boundary.)
2. **When two views age/bucket the "same" money by different rules, label the axis or unify it.**
   F3: due-date AR aging (invoice view) vs. entry-date AR aging (lender package) are both correct
   and both legitimate, but an unlabelled bucket count/total mismatch reads as a bug to the owner.
   Any two schedules of overlapping data must either share a scheme or name their axis.
3. **A CSV formula-injection guard must trim before testing the leading char.** F2: checking only
   the first char misses `" =…"`. Neutralize on `/^\s*[=+\-@]/`. (Graduate toward a shared
   `csvCell` util + a test that a leading-space formula is neutralized, so every export inherits it.)

### Standing gaps carried forward (NOT covered by this program)
- **Full width-ladder browser walk** of the owner surfaces across the auth wall — **CLOSED**
  by the `app-e2e` gate (`tools/app-e2e/run.mjs`): every owner surface (Home · Review incl.
  receipts · Reports incl. cash-flow + lender package · Connections incl. invoicing · Journal ·
  Reconcile) is swept overflow-free across the full 320→1920 ladder on the real authed DOM.
  (rescue page is public → covered by `test:responsive`.)
  **Extended by PENNY-UX-3:** overflow-free is necessary but not sufficient — a
  hidden-scrollbar tab strip passes the sweep while clipping tabs off-screen (Program 6
  finding F3: Advanced at right=432 in a 375px viewport). `.ledger-tabs` now carries the
  `.table-wrap` edge-fade affordance at ≤640px (Books sub-strip included), and the app-e2e
  PENNY-UX-3 check gates discoverability at 375px: a strip that overflows must actually
  render the fade (computed `background-image`, not just a stylesheet rule) and
  `#ltab-advanced` must stay reachable.
- **axe / a11y browser scan** across the auth wall — **CLOSED** by the same `app-e2e` gate:
  each owner surface gets a live axe-core WCAG 2.0/2.1 A+AA scan that FAILS the build on any
  serious/critical violation (moderate/minor logged as advisories). This retires the a11y
  browser gap flagged in every Program 1–5 audit ("auth-walled → a11y only static-checked").
  **Extended by PENNY-UX-5:** the walk now clicks all 7 report sub-views (the GL view's
  serious `scrollable-region-focusable` violation — Program 6 finding F5 — lived behind the
  switcher, invisible to a default-view-only scan) and asserts the GL scroll region stays
  keyboard-focusable. All 8 `.table-wrap` scroll regions in `apps/app` now carry
  `tabindex`/`role="region"`/copy-catalog `aria-label`.
- **Invoice email deliverability** — the `invoicing` edge fn's Resend send path + nudge dispatch
  are not exercised end-to-end here (SECDEF/idempotency/config verified in code; live email = a
  manual/integration check, like Wave-3's nudge path).
- **PayPal / Square / Amazon parsers** — registered as `planned`; the RPC + framework are
  provider-agnostic and tested via Stripe/Shopify, but the three planned parsers don't exist yet
  (nothing to stress — carried as the extensibility backlog, not a defect).
- **Multi-currency invoices/payouts** — the single-currency guard still applies; the moment
  multi-currency is enabled the invoice/payout FX path is untested (standing gap from Program 1).

## Program 4 — Wave 3 wave-gate audit (owner-experience layer, 3 Jul 2026)

The Wave-3 gate (LOOP_PROMPT hard-rule #8): the 14-dimension rubric + an adversarial
stress pass over the Wave-3 blast radius (all shipped + deployed), run before Wave 4
scales. Blast radius: **W3.2** trust-tiered autonomy (Review queue · "Penny did this"
feed · ≤5-asks/week budget · auto-post + 1-tap undo), **W3.1** in-app Penny thread
(grounded Q&A), **W3.3** 3-step onboarding (kernel-driven entity/industry + CoA seeding),
**W3.4** owner Home / am-I-okay pulse, **W3.5** receipt capture + match — plus a
sanity-check of the co-deployed **W2.4** estimated-tax strip + **W2.5** 1099 tracking
(they touch the same Home/Reports surfaces).

**GATE VERDICT: 🟢 CLEAR to start Wave 4 — 0 P0.** Two P1s + three P2s found (below);
all are contained (low-value metadata leak, copy-honesty, matcher edge, hardening) and
none blocks the wave. Recommend the two P1s are fixed or Nik-accepted before Wave 4
merges land. The trust cluster (security / data-integrity) is materially clean: the
recurring LEARNINGS failure modes (#15 TOCTOU locks, #16 balanced≠correct, #18
pagination, forged-`p_actor`, service_role-only grants) are all correctly handled in the
new code — the W3.2 spine is the strongest-built surface of the wave.

### Per-dimension summary (blast radius)

| Dimension | Verdict | Notes |
|---|---|---|
| security (RLS/isolation/actor/SECDEF) | 🟢 pass (1 P1) | every write RPC `can_write_org_as(p_actor,…)`, service_role-only EXECUTE, `SET search_path`; forged-`p_actor` class closed. **One gap:** `owner_asks_this_week` reader ungated (F1). |
| data_integrity (append-only/reversal/idempotency) | 🟢 pass | undo = reversal path + `FOR UPDATE`; one-reversal-per-original; auto-post idempotent on key; onboarding atomic + kernel-validated; balanced≠correct invariants held. |
| performance (pagination) | 🟢 pass | Home/estimated-tax reuse the RPTTEST-paginated `useEntries`; thread fn `fetchEntries` loops `.range()` — no 1000-row cliff. |
| ia_ux / usability gate | 🟡 pass w/ note | thread nests in Home (no new top-level tab ✔); ≤2-tap jobs ✔. **F2:** thread budget counter is dishonest (copy implies owner questions count; they don't). |
| copy / voice / centralization | 🟢 pass (F2 copy) | persona from live 'app' table (no redeploy), no inline hex, tier cutoffs + tax rates from config/seed; centralization CI gates wired (`check:app-strings/-tenant/-law-literals/-kernel-hardcodes`). |
| design_system | 🟢 pass | no inline hex, no bare `<h1>`, no hardcoded px widths in new components. |
| responsive | 🟢 pass (static) | no fixed px horizontal layouts; full width-ladder browser walk = standing gap (auth-walled; see NOT-covered). |
| a11y | 🟡 pass w/ note | aria present on interactive components; OwnerHome light on aria labels (polish, tracked). |
| reliability / observability | 🟢 pass | thread declines out-of-scope/empty-books cleanly; auto-post + undo audit-logged via trigger. |
| tests | 🟢 pass | Vitest + pgTAP + dedicated `regression.thread-server-authority.test.ts` for every W3 surface. |

### Findings (ranked, verified — `file:line` + repro)

**F1 · P1 · Cross-tenant read — `owner_asks_this_week` has no `can_access_org` gate.**
`supabase/migrations/20260705010000_w3_2_trust_tiered_autonomy.sql:268-279`. The fn is
SECURITY DEFINER (bypasses RLS), granted to `authenticated` (line 279), and counts
`ai_decisions where tenant_id='org:'||p_org` with **no `can_access_org(p_org)` guard** —
unlike its sibling `list_penny_activity` (line 184) and every W3.5 receipt reader, which
all include `and can_access_org(p_org)`. **Repro:** any authenticated user calls
`rpc('owner_asks_this_week',{p_org:<any-other-org-uuid>})` and gets that org's weekly
owner-interruption count. Low-value metadata (a count, no financial detail) ⇒ P1, but a
real isolation-pattern breach and trivially exploitable. **Fix:** add
`and can_access_org(p_org)` to the WHERE (matches line 184); the edge-fn path calls it via
service role, so the app is unaffected. → regression stub REG-W3-F1.

**F2 · P1 · Honesty/copy drift — thread budget counter never moves.**
Counter copy `apps/app/src/copy/strings.ts` (`thread.budgetSpent` "N of 5 questions this
week"), rendered `PennyThread.tsx:108-110`. The thread fn logs asks under
`use_case:'penny_thread'` (`supabase/functions/penny-thread/index.ts:51,185`), but the
budget counter (`owner_asks_this_week`/`record_owner_ask`) counts only
`use_case='owner_interruption'` (`20260705010000_…sql:235`). **Repro:** ask Penny 20
grounded questions this week — the header stays "0 of 5 questions this week" and never
blocks. The ≤5/week budget is an explicit usability + honesty promise (LOOP_PROMPT #1,
memory "usability-first"). Either the copy is wrong (it describes *Penny's* proactive
interruptions, not the owner's questions) or thread asks must route through the budget
gate. **Fix (decision-needed lean):** reword to "Penny's questions for you this week" or
intentionally decouple + drop the counter from the thread — confirm intended semantics
with Nik. → regression stub REG-W3-F2 (asserts counter semantics match what's counted).

**F3 · P2 · Receipt auto-attach to wrong txn on a fuzzy same-amount collision.**
`apps/app/src/ledger/receiptMatch.ts:138-141` + `supabase/functions/receipts/matcher.ts`.
The ambiguity guard only fires on **exact same-date** ties (`match.exactTies>=2`, line
138). If two entries share the same amount on *different* dates within the match window
(4d), the exact pass finds none, the fuzzy pass picks the nearest by date with
`exactTies=0`, and if the parsed vendor corroborates, the tier clears `confidence_high` →
**auto-attach to a possibly-wrong entry**. **Repro:** $42.00 "Acme" on Jul-1 and again on
Jul-3; a receipt dated Jul-2 fuzzy-matches both, picks one, vendor corroborates →
auto-attach. P2: detach is 1-tap, metadata-only, ledger untouched. **Fixed (W5.2):**
`matchReceipt` now counts same-amount candidates within the window sharing the best
(nearest) delta into a new `fuzzyTies` field; `receiptTier` downgrades to a confirm card
(LOW) when `fuzzyTies>=2` — mirroring the existing `exactTies` guard. → regression
**REG-W3-F3** live in `apps/app/src/ledger/receiptMatch.test.ts` (the Jul-1/Jul-3 vs Jul-2
collision reports `fuzzyTies=2` and never reaches HIGH, even vendor-corroborated; a single
nearest candidate still auto-attaches — no over-downgrade). Edge fn `matcher.ts` copy synced.

**F4 · P2 · Grounding post-check allows an extra invented number.**
`supabase/functions/penny-thread/index.ts:198` — the guard only asserts the correct money
string is *present* (`!text.includes(money(fact.amountMinor))`). A reply "…$200.00, about
15% of revenue" passes though the prompt forbids percentages/estimates. Can never corrupt
the server-computed stated fact (`index.ts:146`) ⇒ P2, but the header's "hallucinated
number is structurally impossible" overstates. **Fixed (W5.2):** new pure
`groundingViolation(text, allowedMoney)` in `_shared/thread/route.ts` rejects any percentage
(`\d%`/"percent") and any currency-shaped token other than the single allowed figure; the
guard now falls back to the deterministic phrasing when the reply violates OR omits the
figure. Conservative — bare integers (years/quarters/counts) don't trip it. → regression
**REG-W3-F4** in `supabase/functions/penny-thread/index.test.ts` (Deno): "$200.00, about 15%
of revenue" and an extra `$150.00` are rejected; on-contract replies pass.

**F5 · P2 · Receipt feed-row idempotency via `LIKE '%uuid%'` substring, not a key.**
`supabase/migrations/20260705030000_w3_5_receipts.sql:244-247,287-290` — `autoattach_receipt`
/ `detach_receipt` dedupe + undo the feed row with `summary like '%'||p_receipt_id||'%'`
against free-text owner copy, vs. W3.2's proper `entry_id=` key (`20260705010000:120`). No
security impact; a future copy change dropping the `[uuid]` suffix silently breaks
dedup/undo. **Fixed (W5.2):** new migration `20260706090000_w3_5_receipt_activity_fk.sql`
adds a nullable `receipt_id uuid` FK to `penny_activity` (+ index, + backfill from the old
`[uuid]` suffix) and `CREATE OR REPLACE`s `autoattach_receipt`/`detach_receipt` to dedup/undo
off `receipt_id =` (the deployed migration is untouched — write-don't-deploy). → regression
**REG-W3-F5** in `supabase/tests/w3_5_receipts_test.sql` (pgTAP): asserts the feed row carries
the real FK, then STRIPS the `[uuid]` summary suffix and proves dedup (one row on retry) and
undo (feed row marked undone) still work — the copy-change failure the old LIKE couldn't survive.

**Advisory (P2/robustness, no stub):** onboarding diagnostic `nudgeTarget` uses
`startsWith` over entity keys — a future prefix-colliding seed token could mis-suggest an
entity (`diagnostic.ts:105-111`); `complete_onboarding` re-validates the final key against
the kernel so no invalid entity is ever written — seed-authoring footgun only.

### W2.4 / W2.5 sanity-check (co-deployed onto Home/Reports)
Both clean under the trust cluster: `estimated_tax_basis` and the 1099 RPCs are SECURITY
DEFINER + `SET search_path` + `can_access_org`/`can_write_org_as` gated + service_role-only
writes; **all tax rates/factors/thresholds are seed/params data, zero rate literals in
code** (`20260706020000_…sql`, `20260706030000_…sql`); the estimated-tax strip on Home is
correctly gated on W2.4 presence (no stub number when absent). No findings.

### Coverage delta — Wave-3 ledger rows (this program)

New surfaces enter the ledger. A row leaves ⬜ only via this formal adversarial pass;
each below got the pass (finder → verifier) — those with findings carry the finding id.

| # | Surface | Permanent test | Status |
|---|---|---|---|
| W3.2 | Trust-tiered autonomy (feed · auto-post · undo · ≤5 budget) | `w3_2_trust_tiered_test.sql` + `apps/app/src/ledger/*tier*` Vitest | 🟢 stress-passed; **F1 (P1)** open |
| W3.1 | Penny thread in-app (grounded Q&A) | `thread.test.ts` + `regression.thread-server-authority.test.ts` + `penny-thread/index.test.ts` (REG-W3-F4) | 🟢 stress-passed; **F2 (P1)** open; **F4 (P2) FIXED (W5.2)** |
| W3.3 | 3-step onboarding (kernel entity/industry + CoA seed) | onboarding Vitest + `20260705020000` pgTAP; `check:kernel-seed` gate | 🟢 stress-passed; no defect (seed-order deploy note) |
| W3.4 | Owner Home / am-I-okay pulse | `homePulse.test.ts` | 🟢 stress-passed; no defect |
| W3.5 | Receipt capture + match | `receiptMatch.test.ts` (REG-W3-F3) + `w3_5_receipts_test.sql` (REG-W3-F5) | 🟢 stress-passed; **F3 / F5 (P2) FIXED (W5.2)** (supersedes the Wave-1 ⬜ W3.5 row) |

**Coverage delta:** +4 new ledger rows (W3.1/2/3/4) + W3.5 promoted from ⬜ (Program 2) to
stress-passed. 0 P0, 2 P1, 3 P2 — all with a permanent regression stub (REG-W3-F1…F5) to
be authored into `regression_pack` at fix time (the coverage ratchet).

### Proposed LEARNINGS additions (retro)
1. **A SECURITY DEFINER reader granted to `authenticated` must carry its own tenant guard
   in the WHERE — RLS does not protect it.** DEFINER bypasses RLS; the `can_access_org(p_org)`
   predicate is the *only* thing scoping the read. F1 slipped because a sibling reader in the
   same file had the guard and this one didn't — grep every DEFINER reader for the guard when
   a file adds one. (Graduate toward extending `check:tenant-predicate` to flag DEFINER
   readers missing `can_access_org`.)
2. **A user-facing counter must count the thing it names.** F2: "N of 5 questions this week"
   counted a *different* use_case than the thread's questions. When a surface renders a budget/
   quota, assert (in a test) that the number it shows is derived from the same event stream it
   claims to measure — an honesty gate, not just a copy check.
3. **Idempotency/undo keys are foreign keys, not substrings.** F5: dedupe via `LIKE '%uuid%'`
   over free-text copy couples correctness to copy. Key structural invariants off a real column.

### Standing gaps carried forward (NOT covered by this program)
- **Full width-ladder browser walk** of the new Home/thread/receipt surfaces (auth-walled —
  static responsive check only; same gap as Programs 1–2).
- **axe/a11y browser scan** of the new surfaces (OwnerHome aria polish flagged statically).
- **CoA-template seed deploy-order** — `seed_org_coa` returns 0 accounts (silent) if the kernel
  seed isn't loaded before onboarding runs; CI (`check:kernel-seed`) guards the seed file's
  integrity but not that prod was seeded before the migration went live. Operational deploy
  note for the integrator (load kernel seed with the W3.3 migration wave), not a code defect.

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
| W4.3 | Invoicing + AR nudges (opt-in, off by default; invoice+lines+payments; send posts Dr AR / Cr Revenue, payment posts Dr Cash / Cr AR, void reverses append-only; AR aging; config-driven nudge cadence; email via existing infra) | `apps/app/src/ledger/invoiceMath.test.ts` (line/total math · aging boundaries · config-driven nudge selector) + `w4_3_invoicing_test.sql` (full lifecycle create→send→pay→paid ties out · overpayment guard · idempotent re-send · aging 90+ · nudge cadence · void reversal · non-member auth gate) | ⬜ red-teamed; stress-pass pending |
| W4.1 | E-commerce payout splitting (provider-agnostic framework via connector registry; Stripe + Shopify parsers, PayPal/Square/Amazon extensible; lump payout → gross sales / fees / refunds / net component lines; per-payout `ext:<provider>:payout:<id>` idempotency; reversal-based restatement; reconcile guard rejects non-tying splits) | `apps/app/src/ecommerce/payouts.test.ts` (split math + Stripe/Shopify parsers + cent-tie + reconcile) + `w4_1_ecommerce_payouts_test.sql` (post/reverse RPC: component lines · ties to cent · idempotent re-import no-double-post · reconcile/unknown-provider/read_only guards) | ⬜ red-teamed; stress-pass pending |
| W4.2 | Cash-flow statement (GAAP indirect: operating/investing/financing; ties to BS cash delta + P&L; CSV+PDF via W1.2 machinery) | `apps/app/src/ledger/cashFlow.test.ts` (tie-out to BS cash delta + P&L, section classification, begin/end cash, reversal/pending discipline) + `export.test.ts` cash-flow CSV tie-out | ⬜ red-teamed; stress-pass pending |
| W4.4 | Lender / due-diligence package (assembles P&L + BS + cash-flow + AR/AP aging + period comparatives + cover sheet; entity-stamped; CSV+PDF via W1.2/W4.2 machinery; audit-logged `report.export report='pkg'`; read_only CPA can generate) | `apps/app/src/ledger/package.test.ts` (all-section assembly, figures match standalone builders to the cent, BS balances + cash-flow ties on cover, prior-period comparative + Δ, AR/AP aging bucket tie-out, pending exclusion, valid PDF, filename) + reuses `arApAging`/`cashFlow`/`balanceSheet`/`profitAndLoss` under existing report tests | ⬜ red-teamed; stress-pass pending |
| W5.4 | Multi-currency (per-org opt-in, D1–D7; currency catalog + `fx_rates` ECB-base daily snapshot with re-basing; `post_journal_entry` per-line rate resolution — explicit override → snapshot → refuse, never silent 1; NEW base-currency balance invariant alongside the unchanged per-currency one; foreign-currency invoicing with realized FX on settlement (AR clears at its booking rate, Cash at settlement rate, residual to Realized FX); period-close unrealized-FX revaluation + auto-reverse next period (D4); `is_monetary_account` infer-from-type + override (D5); `reports.ts`/`money.ts` base-currency + minor-unit-aware fixes) | `apps/app/src/ledger/money.test.ts` (minor-unit precision: JPY 0dp, BHD 3dp, USD 2dp) + `w5_4_multi_currency_test.sql` (28 assertions: opt-in gate + legacy-gate untouched, manual/snapshot rate resolution + refusal, the NEW base-balance trigger rejects an unplugged imbalance, `is_monetary_account` override, foreign invoice send→pay realized FX ties to the cent, period-close revaluation + next-period auto-reverse, reversal carries base_amount_minor, single-currency org byte-identical) | ⬜ red-teamed; stress-pass pending. **Known gap (disclosed, not silent):** e-commerce payouts (W4.1/W4.1-B) are not yet FX-aware — still home-currency by construction, so unaffected, not broken; a foreign-currency payout is a follow-up card. |
| RV2-C1 (cpa-practice-os) | Firm-level month-end close (nested in Practice home, no new nav): per-client close-readiness checklist (4 blockers → ready/exception + SLA `overdue`), set-based batch close with per-client authz + period-lock TOCTOU (FOR UPDATE, #131/#139 lineage) + roll-forward, config-driven doc-chase rail. Actor-parameterized (`cpa_firm_clients_as`) so the service_role write-path never depends on `auth.uid()`. | `apps/app/src/lenses/monthEndClose.test.ts` (copy/config contract: blocker labels non-empty · VOICE no-`!` · SLA threshold is config, not a magic number) + `supabase/tests/rv2_c1_cpa_month_end_close_test.sql` (21 assertions: readiness blocker counts + covering-period pick · batch closes ONLY ready+full clients · blocked→refused · read_only→forbidden · **NO cross-tenant close** (other firm's client → forbidden, period untouched) · per-client period-lock + roll-forward (May closes, June survives) · idempotent re-close → skipped · **authz on p_actor not auth.uid() under service_role** · doc-chase record + read_only-forbidden + idempotent per (client,template)) | ⬜ red-teamed; stress-pass pending |

| filing-export (RV2-A2) | Structured per-suite tax export (2nd leg of the filing mission after RV2-A1). Re-shapes the tied-out RV2-A1 worksheet into the format tax software imports — generic mapped-TB CSV, Drake + UltraTax TB-import files, print-ready package — so the CPA re-keys nothing into Drake/Lacerte/ProConnect. Per-suite line codes come from **seeded** `tax_form_lines.export_codes` (DATA, never inlined); serializers are per-suite config off the pluggable registry. Export is **gated on the return being review-ready AND tying out** (an unmapped/non-tying return is never handed to tax software — the #1 filing trust risk). No re-computation: an exported line total IS the worksheet line total by construction. | `apps/app/src/tax/taxExport.test.ts` (REG `RV2A2-EXPORT-ROUNDTRIP`: build worksheet from ledger → serialize every suite → **parse the file back** → reconstructed per-line totals tie to the worksheet AND the year-scoped TB to the cent; `RV2A2-EXPORT-GATE`: unmapped-blocked · non-tying-blocked · empty-ledger · wrong-year-scoping · rounding · seeded codeMap · unknown-suite guard · filename) + existing `engine.test.ts` serializer golden strings | ⬜ red-teamed; stress-pass pending |
| CONN-2 (qbo-intuit-tid) | Extends the WG.231 connector row: every QBO API call (`_shared/qbo.ts` — token exchange/refresh, query, query-all pagination, trial-balance report) now captures the `intuit_tid` response header via a centralized `INTUIT_TID_HEADER`/`intuitTid()` helper, on **both the success and error path**; logged (Supabase fn logs, structured JSON) unconditionally and persisted to a new `external_connections.last_intuit_tid` column (service_role-only, same column-grant discipline as the OAuth token fields) by `qbo-callback` (OAuth exchange) and `qbo-import` (token refresh + historical migration + preview import, success and catch branches alike) so it can be produced for Intuit support troubleshooting. | `supabase/functions/_shared/qbo.test.ts` (4: header read helper · success path forwards tid to caller · error path forwards tid AND embeds it in the thrown error · missing-header reports null without throwing) | ⬜ red-teamed; stress-pass pending |

| auth-botprotect (SEC-2) | Bot protection / captcha on the login + admin-login OTP-request forms. Cloudflare Turnstile widget (no new vendor; `size:"flexible"` so it never overflows the 320px width-ladder floor) gates the submit client-side; Supabase Auth verifies `options.captchaToken` server-side once the dashboard captcha provider is configured (Nik step — secret key never lives in this repo). **Independent, config-driven rate limit** in addition to Turnstile: `check_and_record_otp_attempt` (anon-callable, pre-auth) counts OTP requests per normalized email in a sliding window (`platform_config.behavior.otp_rate_limit_max`/`_window_minutes`, default 5/15min, admin-tunable no redeploy), prunes expired attempts, and never records a refused attempt (retrying immediately doesn't extend the window). The raw `auth_otp_attempts` table has zero direct grants — only the RPC touches it. | `apps/app/src/auth/otpGate.test.ts` + `apps/admin/src/lib/otpGate.test.ts` (pure gate-ordering logic: captcha-required checked before rate-limit, both block dispatch) + `supabase/tests/sec2_otp_rate_limit_test.sql` (17 assertions: budget exhausts at the config max then refuses · a refused attempt is not recorded · independent per-email budgets · raising `otp_rate_limit_max` unblocks immediately, no redeploy · attempts outside the window are pruned and don't count · malformed email rejected · anon can call the RPC pre-auth but has no direct table access, neither does authenticated) | ⬜ red-teamed; stress-pass pending |

| fx-rates-fetch (W5.4-FX) | Extends the W5.4 row: `fx_rates` shipped empty in prod (a resolver with nothing to resolve against). Adds the ECB daily-snapshot fetcher — a new `fx-rates-fetch` edge fn (pure `_shared/ecbFx.ts` XML parser, network-free and unit-tested; bounded retry/backoff on the fetch) in `daily` (today's snapshot) and `backfill` (ECB 90-day history, one-time starting snapshot) modes, triggered by a `pg_cron` + `pg_net` daily job mirroring `changelog_trigger_digest()` (Vault secret, silent no-op if unset — a cron job must never error the scheduler) or an admin JWT on demand. Every fetched currency is checked against the `currencies` catalog before being written; unsupported codes are dropped and reported, never silently grown into the table. Closes D3's other half — the **manual-override entry path**: an admin-gated `set_manual_fx_rate` RPC writes a `source='manual'` row, and the resolver (`fx_rate_vs_snapshot_base`) now prefers an exact-date manual override over the ECB snapshot for that date, while still falling back to the most recent available rate (either source) on or before the requested date — so a manual entry can also bridge a real ECB gap (bank holiday), not just correct one. A pair with no snapshot and no override still resolves to `NULL` — fails loud, never silently 1. The feed's own tunables (daily/hist90 URL, staleness-warn threshold) are `platform_config` (CENTRAL-1 pattern, `get_fx_feed_config()`, mirrors `get_qbo_config()`) — admin-tunable with no redeploy, never inlined; the refresh cadence is the `pg_cron` job's own schedule (already data). Cross-rate triangulation (a pair the ECB doesn't quote directly) was already implemented in `resolve_fx_rate` (via the EUR snapshot base, `v_to/v_from`) — this card populates the snapshot, it does not change that math. A freshest-fetched-date older than the threshold logs a `feed_stale` structured event (observability, not a hard failure — the resolver's own fail-loud-on-missing-data is the real safety net). | `supabase/functions/_shared/ecbFx.test.ts` (Deno, 8: single/multi-day parse, lenient quote-style, garbage-input safety, catalog-filtering + skip reporting, custom source label, latest-date selection, staleness threshold math) + `w5_4_fx_fetch_test.sql` (15: non-admin refused · admin sets an override tagged `source=manual` · idempotent re-set updates in place, no duplicate · bad rate/currency rejected · ECB-only resolves via snapshot · exact-date override beats an older ECB row · override bridges a later gap with no newer rows · unknown pair still resolves NULL · the cron trigger never raises when the Vault secret is unset · `get_fx_feed_config()` reads the seeded threshold · raising it in `platform_config` takes effect immediately) | ⬜ red-teamed; stress-pass pending |

**Coverage delta:** +18 ledger rows, all ⬜ (baseline + per-PR red-team, formal stress pass pending). RV2-C1 adds the firm-level month-end close row; RV2-A2 adds the `filing-export` row (structured per-suite export round-trips + ties to worksheet/TB); CONN-2 adds the `qbo-intuit-tid` row (support-trace capture on the QBO connector, success + error path); SEC-1 adds the `/security` two-factor row (TOTP + recovery codes + login/org MFA gates); SEC-2 adds the `auth-botprotect` row (Turnstile + config-driven OTP rate limit on both login forms); W5.4-FX adds the `fx-rates-fetch` row (ECB daily fetcher + manual-override entry path, closing the "fx_rates ships empty" gap from the W5.4 row above).
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
| 10 | Invites & engagements | 0 | 1 | invite accept was token-only, not email-bound; re-engage/no-demote lifecycle gaps. **3 Jul (PENNY-UX-1 F1, P0):** the *generated* accept link itself was dead — `invites` fn emitted the app's retired `/app/accept` base → router catch-all → onboarding, token lost. Fixed to `/accept?token=…`; app-e2e now gates the generated-link → Accept-route → token-consumed path on the prod-shaped `--base=/` build. **4 Jul (PENNY-UX-4 F4, P1):** firm-side "+ Add client" added as a client-side request artifact over this same machinery — the owner's `/settings` invite form pre-fills from a validated `invite_cpa` param (never auto-submitted; review notice); app-e2e gates firm-affordance → pre-filled owner form → `invites` 201. No new server path. | 🟢 | [#134](../../pull/134) |
| 11 | CPA lens / access scope | 0 | 1 | approval-settings write path missing; read-only CPA scope otherwise held. | 🟢 | [#141](../../pull/141) |
| 12 | QBO / Xero connect & sync | 1 | 3 | provider-commit DEAD ON ARRIVAL (qbo/xero source hit opening-balance branch → `no_cutover_date`); double-post on re-pull; JPY ×100. | 🟢 | [#142](../../pull/142) |
| 13 | Onboarding & org creation | 0 | 1 | org-create not atomic (partial org on failure). `create_org_atomic`. | 🟢 | [#136](../../pull/136) |
| 14 | Data export & erasure (GDPR) | 0 | 1 | export truncated at 1000 rows (same paging class as #3). Paginated to 1500+. | 🟢 | [#130](../../pull/130) |
| 15 | Platform-staff / break-glass | 0 | 1 | `open_break_glass` not gated on editor tier. Gated + audit-logged. | 🟢 | [#140](../../pull/140) |
| 16 | Load / soak — ledger post RPC + Plaid sync (RV2-E) | — | — | `packages/soak-harness/` drives N concurrent posts over shared idempotency keys and asserts no double-post (`created == distinct keys`), tie-out balances, Plaid dedup on `(org,external_id)`, and records latency/error percentiles. CI-safe smoke (`.github/workflows/soak-harness.yml`) runs the assertions against a faithful in-memory model of `post_journal_entry`; the live sandbox driver runs the same runner against the real RPC. Runbook: `docs/plans/production-readiness-runbook.md`. | ⬜ (smoke green; live sandbox soak operator-run) | this PR |

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
| **Load / volume** — behavior at 10k–100k entries, concurrent orgs | only correctness tested, not scale | **harness landed (RV2-E, row 16)** — `packages/soak-harness/` proves no double-post + tie-out under concurrency (CI smoke); still to do: run the live sandbox soak at 10k–100k volume + a perf audit with seeded large orgs |
| ~~**The whole top-half of the product**~~ — reconciliation UI, tax-line mapping, CPA workqueue, exports, depreciation | **BUILT in Wave 1** (Program 2 above); no longer "not built yet" | now ⬜ ledger rows, per-PR red-teamed, **stress-pass pending** — scheduled in [STRESS_TEST_TRACKER.md](STRESS_TEST_TRACKER.md) |
| **Wave 2 not built** — catch-up mode (W2.1), QBO one-click migration (W2.2), Plaid bank feeds (W2.3), Penny in-app thread + trust-tiered cards (W3.x) | genuinely not built yet → nothing to stress-test | see [FULL_BOOKKEEPING_ROADMAP.md](plans/FULL_BOOKKEEPING_ROADMAP.md) Waves 2–4 |
| **W1.3-B CPA mapping-edit UI deferred** | the tax-mapping *engine* shipped (W1.3-B); the CPA per-account mapping-edit *UI* was deferred | build + stress the edit UI when carded |
| **Disposal JE (W1.3-C)** — fixed-asset disposal journal-entry path, if still open | disposal-convention book-vs-default mismatch flagged (P2 above); the disposal JE itself is thin | close under the W1.3-C stress pass |

## Program 0 — platform audit (30 Jun 2026)
53 findings (4 P0 / 20 P1). 6 "shipped baseline" items were actually broken
(invite email-bind, pgTAP-in-CI, single-currency guard, GDPR fn, app error boundary,
`ledger_audit` table). Sprint-1 fixes folded into the pre-onboarding baseline (#122).
Superseded as a coverage record by Program 1.
