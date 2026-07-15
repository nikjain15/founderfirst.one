# BACKLOG — the build loop's single source of truth

> Status: **active** · 2 Jul 2026 · Owner: Nik

> ⚠️ **STATUS RECONCILIATION (loop-orch, 3 Jul):** every card below PENNY-UX-0 that shipped in
> Waves 1–5 is now marked `merged` with its PR. Builders: the ONLY claimable work is PENNY-UX-*
> cards (as they are carded from the PENNY-UX-0 audit) and roadmap-v2 phase cards (order
> A → C → D → E → B) once carded. If a card says `unclaimed` but describes something that exists
> on main, assume a stale status — verify via `gh pr list --state merged` before building.

> ⚠️ **STATUS RECONCILIATION #2 (loop-orch, 5 Jul):** roadmap-v2 Wave 2 (RV2-A2/C1/D1) and Wave 3
> (W5.4/SEC-1/SEC-2/CONN-2) both shipped via combined integration PRs (#243, #248) — each
> individual card's own PR (#239–#241, #244–#247) shows `CLOSED` in `gh pr view` (superseded by
> the integration branch), which reads as unmerged unless you check the integration PR itself.
> **Always check the integration PR, not just the feature PR, before concluding a card is still
> open.** PENNY-UX-9 also shipped (pr:#251 — audit found the IA already conformant; added CI
> design-conformance guards instead of a restructure). IQ-1/IQ-2 have GREEN PRs (#255/#253) folded
> into open integration pr:#256, awaiting Nik's merge (not further buildable). All statuses below
> corrected to match. Remaining real buildable work: **W5.4-FX** (ECB fx-rate fetcher — schema
> shipped, no fetcher exists yet) is the top unclaimed, unblocked, non-decision-needed card.

## Wave 2 — COMPLETE + DEPLOYED (3 Jul 2026)
W2.1/W2.2/W2.3 shipped earlier; **W2.4 (PR #202) + W2.5 (PR #201) merged to main, migrations
`20260706020000`+`20260706030000` applied to prod (ledger in sync), edge fns `nec-tracking`
(new) + `report-export` (redeploy) live, DB objects verified.** Next gate: **Wave-3 audit**
before Wave 4. Open follow-ups (non-blocking): W2.4 blended-rate confirm (seed-tunable),
OPS-1 (#199) live Lighthouse ≥90, Plaid production application (Nik human step).

## Nik decisions log (3 Jul 2026)
- **W1.3-A tax mapping — SIGNED OFF.** Yes to all research recommendations (1120 lines seeded
  w/ deferred package polish · generic CSV+PDF v1, per-suite serializers fast-follow · CPAs
  edit mappings, owners view · Penny M-1 adjustments = propose-with-approval · Canada = paper
  proof only). **Year-end CPA package = bundled into the core subscription** (not a separately
  priced artifact) — overridable later if GTM wants it priced.
- **CSV F4 (re-import dedup) — DECIDED.** Per-row idempotency key on content hash: skip exact
  duplicate rows on re-import, report "N skipped" (mirrors the QBO/Plaid `ext:` dedup discipline).
- **W2.1 catch-up pricing — DECIDED.** Flat price per year of backlog (exact $ = GTM detail on
  the marketing card, not a build blocker). See W2.1.
- **Spend ceiling — NONE.** Subscription-only; on a rate/usage limit, pause and resume in a
  fresh session; never escalate to the metered API (LOOP_PROMPT rule 12).
- **Plaid production — Nik human step.** File the production application on the Plaid dashboard
  (sandbox already live; prod has review lead time). Not a build blocker for sandbox work.
- **IA-3 — DEFERRED** until Wave 1 sign-off (plan doc PR #198 left dormant).

### Nik answers (3 Jul, part 2) — pricing philosophy + Wave-4 scope
- ⭐ **STANDING PRICING PRINCIPLE: everything is part of the core product — NO extra charges,
  NO add-ons, NO separately-priced artifacts.** Overrides earlier pricing recs: the year-end CPA
  package (W1.3-A), catch-up mode (W2.1), and the lender/DD package (W4.4) are all **bundled into
  the core subscription**, not priced separately. Any future "should we charge for X" = the answer
  is NO unless Nik explicitly reopens it.
- **W4.1 e-commerce — integrate with the MAJOR providers (all the biggies), not just one.** Build a
  provider-agnostic payout-splitting framework (connector registry from CENTRAL-2) and implement the
  big platforms — Stripe + Shopify first (largest), then PayPal / Square / Amazon etc. API-based where
  available, file/report import as fallback. Extensible = adding a provider is config + a parser, not a rewrite.
- **W4.3 invoicing — in the core bundle; reuse the EXISTING email infra** (verify it can send invoices;
  if it works, use it — do not add a new email provider).
- **W4.4 lender/DD package — bundled** (build the generator; no pricing gate).
- **W2.4 estimated-tax blended rate (fed 22% / CA 6%) — CONFIRMED** as the v1 default (seed-tunable).
- **Loop MODE while unattended — still unanswered → defaulting to `safe`** (build + green PRs, never
  deploys to prod). Flip to `deploy` only on Nik's explicit go.

### Nik answers (4 Jul) — next-phase direction + P0
- **Roadmap-v2 order = A → C → D → E → B** (close filing mission · deeper CPA practice-OS ·
  AP/bill-pay · production-readiness · admin console LAST). Detail in docs/plans/roadmap-v2.md.
- ⭐ **NEW P0: PENNY-UX** — penny.founderfirst.one is a mess (fonts not on the design system, empty
  tabs, many connectors broken). Do a rigorous audit + overhaul to the founderfirst.one/admin
  standard BEFORE the roadmap-v2 phases. See PENNY-UX-0 card below.
- **Multi-currency (#216 D1–D7)** — ✅ ALL ANSWERED 4 Jul (see multi-currency-design.md §8):
  D1 scope confirmed · D2 full currency catalog · D3 systematic rates (fx_rates ECB snapshot
  primary in v1, manual = override only) · D4 auto-revalue at close + auto-reverse · D5 infer +
  is_monetary override · D6 EVERYTHING in v1 (ledger + invoices + payouts) · D7 per-org opt-in
  flag. W5.4 build is UNBLOCKED; sequence it per the 4-Jul priorities (PENNY-UX wave gate first,
  then Nik slots it against roadmap-v2 A→C→D→E→B).
- **All future work runs in a NEW 24/7 loop chat** via the launchd durable loop (this chat set it up).

## PENNY-UX-0 · Rigorous audit of penny.founderfirst.one (P0 — do FIRST)
status: pr:#220 (audit complete — 1 P0 · 4 P1 · 7 P2; fixtures for cleanup listed in the ledger)
goal: a complete findings ledger of everything wrong with the live authed app — the input that
  drives the PENNY-UX fix cards. Nothing is fixed in this card; it AUDITS.
spec: exercise every lens (owner/CPA/staff) × every tab/route × the full width ladder (RESPONSIVE.md)
  using the authed E2E path (tools/app-e2e devAuth; test users e2e1-*). For each surface record:
  (a) design-system compliance — fonts/type scale, `.eyebrow`+`.page-title` header pattern vs bare
  `<h1>`, tokens vs inline hex/px, spacing, the admin-parity nav; (b) EMPTY/placeholder tabs with no
  real content; (c) every connector (QBO/Xero/Plaid/Stripe/Shopify) tried end-to-end — which work,
  which error, which are dead; (d) a11y (reuse the axe gate) + responsive overflow; (e) broken links/
  routes/console errors. Rank P0/P1/P2 with file:line + repro. Output = a docs PR adding a PENNY-UX
  findings section to docs/AUDIT.md + a proposed fix-card list (PENNY-UX-1..N).
acceptance:
  - [ ] Every owner + CPA tab/route visited; each marked working / broken / empty with evidence
  - [ ] Every connector's real status recorded (works E2E / errors / not wired)
  - [ ] Design-system violations enumerated per surface (vs packages/design-system + RESPONSIVE.md)
  - [ ] Ranked findings + a concrete PENNY-UX-1..N fix-card list for the loop to build next
decision-needed: none to audit
touches: read-only audit + docs/AUDIT.md (a fixer card set follows)

### PENNY-UX fix cards (from the PENNY-UX-0 audit, PR #220 — full specs in docs/AUDIT.md § PENNY-UX findings)
Shared-file map (LEARNINGS #24): styles.css = UX-2→UX-3→UX-6 serialize · Ledger.tsx = UX-5→UX-7
serialize · tools/app-e2e/run.mjs shared UX-1/UX-5 (append-only delimited blocks, union-merge at gate).

## PENNY-UX-1 · Invite accept link resolves (P0)
status: merged (pr:#223)
spec: `accept_path` → `/accept?token=…` in supabase/functions/invites/index.ts (write-don't-deploy;
  fn deploy at the gate per LEARNINGS #23); app-e2e asserts generated link reaches Accept + engagement renders.
workflow: owner · "invite my accountant" · send link → CPA lands on Accept → books shared, 2 taps

## PENNY-UX-2 · Zero unresolved CSS vars + gate (P1)
status: merged (pr:#221)
spec: map the 9 undefined vars (--fs-sm/xs/caption --ink-1 --r-sm --radius-1/2 --surface/-2) to real
  tokens in apps/app/src/styles.css; add `check:css-vars` grep gate to CI so the class can't recur.

## PENNY-UX-3 · Mobile tab-strip discoverability (P1)
status: merged (pr:#224)
blocked-by: PENNY-UX-2 (styles.css chain) — merged (pr:#221), clear
spec: `.ledger-tabs` wraps or edge-fades at ≤640px so Advanced/subs are visibly reachable; ladder screenshot diff in app-e2e.

## PENNY-UX-4 · CPA "+ Add client" affordance (P1)
status: merged (pr:#226) — Nik decided 4 Jul: BUILD (guided request flow in org switcher)
spec: either "+ Add client" in the org switcher for firm contexts, or Practice-home empty copy stops promising it.

## PENNY-UX-5 · Focusable scroll regions + full report axe walk (P1)
status: merged (pr:#222)
spec: tabindex/role/label on scrollable .table-wraps (Ledger.tsx); app-e2e axe walk visits all 7 report views.

## PENNY-UX-6 · Touch targets ≥44px (P2)
status: merged (pr:#227)
blocked-by: PENNY-UX-3 (styles.css chain) — merged (pr:#224)
spec: sub-tabs, sm/seg buttons, brand link to ≥44px via padding (keep density).

## PENNY-UX-7 · Copy/pattern honesty batch (P2)
status: pr:#228
blocked-by: PENNY-UX-5 (Ledger.tsx) — merged (pr:#222), PENNY-UX-6 (styles.css) — merged (pr:#227); clear
spec: activity takeaway counts entries; Login heading on the app scale; APP_PRINCIPLES §0/§3 refreshed to nav.ts reality.

## PENNY-UX-8 · Stub payout tiles (P2)
status: pr:#225 — resolved by W4.1-B (Nik 4 Jul: integrate the majors now): PayPal/Square/Amazon
  got real report parsers and their tiles went LIVE via the registry; no flag-off needed (F11 closed).

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

# Roadmap-v2 — the current phase (A → C → D → E → B)

> Order: **A → C → D → E → B** (Nik, 4 Jul). Full candidate detail: docs/plans/roadmap-v2.md.
> Card each phase before building; run the wave gate between phases.

## Roadmap-v2 Wave 1 — SHIPPED + DEPLOYED (5 Jul 2026)
The first slice of A/E/B + connector enablement is live on `main` (== prod), wave-gate GO:
- **RV2-A1** · filing worksheet per form w/ ledger traceability — merged (pr:#232)
- **RV2-E** · production-readiness slice (load/soak harness + observability + DR runbook) — merged (pr:#234)
- **IA-3 (B) scaffold** · internal admin console at penny.../admin, additive parallel-run, `/admin` untouched — merged (pr:#233)
- **Connectors** · Plaid/QBO/Xero env-wiring + connect-URL/link-token tests — merged (pr:#231)
- **W4.1-C/D** · Square + PayPal API payout sync (sandbox, read-only) — merged (pr:#230)
- **Wave-gate audit** · GO (0 P0, 1 non-blocking P1) — merged (pr:#235)
> Follow-ups from the gate P1 + Nik decisions (4–5 Jul): alerting-sink wire + live soak schedule
> (RV2-E follow-up), Supabase PITR = Nik dashboard toggle, Zoho Books + FreshBooks importers
> (build after this wave — share connector-registry files). These are tracked as cards below /
> Nik human steps, not silently dropped.

## RV2-A2 · Structured per-suite tax export (A fast-follow)
status: merged (pr:#239, folded into Wave-2 integration pr:#243) — Drake/UltraTax/generic
  CSV+PDF serializers live in apps/app/src/tax/{taxExport,serializers}.ts; K-1 package
  generation is NOT built (seed-only placeholder fields) — real gap, needs its own follow-up
  card if wanted; no filing-export audit-log row exists yet either (report-export has one,
  this doesn't) — also a follow-up, not re-opening this card
blocked-by: — (RV2-A1 worksheet shipped, pr:#232; builds on the same filing/worksheet layer)
workflow: CPA · year-end filing · open client → Filing → pick form/suite → Download import file →
  re-keys NOTHING into Drake/Lacerte/ProConnect = 3 taps, one file
goal: emit the return in the structured format tax software imports (tax-prep import files /
  K-1 packages), per suite, so the CPA re-keys nothing — the second leg of the filing mission
  after the worksheet. Every exported line stays traced back to ledger entries (the "show your
  work" trust surface). True IRS e-file (MeF partner + CPA-of-record gate) stays a separate,
  later, `decision-needed` bet — NOT in this card.
centralization: serializers are per-suite config off the tax-mapping engine + CENTRAL-2 kernel,
  not hardcoded line maps; form/line literals come from the seeded filing data, never inlined.
coverage delta: new AUDIT ledger row (filing-export) ⬜ untested → stress pass (round-trip a
  sample return through the export format; assert line totals tie to the worksheet and to the TB).

## RV2-C1 · CPA practice-OS depth — firm-level month-end close (C)
status: merged (pr:#240, folded into Wave-2 integration pr:#243)
blocked-by: — (Wave 1 CPA lens + IA-2 Practice home + exports all shipped)
scope-decision: Nik 4 Jul — optimize for **both firms and single owners** (not either/or).
workflow: CPA · month-end close across many clients · Practice home → batch-select clients →
  run close checklist (roll-forward + doc-chase) → resolve exceptions → sign off; a clean client
  is zero-touch. Must stay INSIDE the ≤5-asks/week + no-new-top-level-nav usability budget —
  design workflow-inward, nest under the existing CPA Practice home, do NOT re-create QBO.
goal: take the CPA lens from "workqueue" to "practice operating system": firm-level batch
  operations (approve/close across clients), per-client month-end close checklist with
  roll-forward, a client-communication rail (request docs / chase missing statements), a
  workpaper/adjusting-entry review flow, and per-firm SLA/response tracking (the "responsive"
  Signal #3). Extends the existing CPA lens — NO new schema spine.
centralization: checklist steps, SLA thresholds, and doc-chase templates are seed/config +
  live personas (Penny copy), not inline strings or magic numbers.
coverage delta: new AUDIT ledger row (cpa-practice-os) ⬜ untested → stress pass (batch close
  across N fixture clients; assert per-client period locks + roll-forward integrity, no cross-
  tenant bleed).

## RV2-D1 · AP / bill-pay — TRACKING ONLY (D)
status: merged (pr:#241, folded into Wave-2 integration pr:#243)
blocked-by: — (vendors W2.5 + receipt capture W3.5 shipped)
scope-decision: Nik 4 Jul — **tracking-only, NEVER moves money** (no money transmission, no
  payments partner). Payroll stays out (→ Gusto). If any sub-task would move funds, it is
  `decision-needed`, not built.
workflow: owner · "what do I owe and when" · Bills → capture a bill (extends receipt capture) →
  see AP aging → mark paid (records the payment, does NOT send it); nests under existing money
  surfaces, no new top-level nav.
goal: complete the cash picture's money-out half: bill capture (extends receipt capture), AP
  aging, vendor records reused from the 1099 model (W2.5), scheduled/marked payments as
  bookkeeping records only. Modular + opt-in, mirroring how invoicing (W4.3) shipped.
centralization: aging buckets + reminder cadence are config, not magic numbers; vendor data
  reuses the existing 1099 vendor model — one source, no duplicate vendor store.
coverage delta: new AUDIT ledger row (ap-billpay) ⬜ untested → stress pass (bill lifecycle
  capture→age→mark-paid; assert AP aging ties to the ledger and 1099 vendor totals; assert NO
  code path initiates a fund transfer).

## W5.4 · Multi-currency (D1–D7 answered — build unblocked)
status: merged (pr:#244, folded into Wave-3 integration pr:#248); follow-up W5.4-FX (ECB
  fetcher) still unclaimed below — fx_rates ships empty until that lands
blocked-by: — (D1–D7 answered by Nik 4 Jul; full plan in docs/plans/multi-currency-design.md §8)
slot: cross-cutting (ledger + invoices + payouts) — sequence against A/C/D per orchestrator +
  Nik; per-org opt-in flag means it ships dark until enabled, so it can run in parallel.
workflow: owner/CPA · "my business isn't only in USD" · enable multi-currency (per-org opt-in) →
  transactions carry their currency → close auto-revalues → reports read in base currency; a
  single-currency org sees ZERO change.
goal: implement the D1–D7 decisions — full currency catalog (D2), systematic rates (fx_rates
  ECB daily snapshot primary, manual = override only, NEVER silent 1) (D3), auto-revalue at
  close + auto-reverse (D4), infer + is_monetary override (D5), everything in v1 —
  ledger + invoices + payouts (D6), per-org opt-in flag (D7).
centralization: currency catalog + fx_rates are seeded/systematic data, never inline; the base
  currency + opt-in are per-org config rows, not hardcoded USD.
coverage delta: new AUDIT ledger row (multi-currency) ⬜ untested → stress pass (mixed-currency
  entries revalue at close, reverse next period, reports tie in base currency; single-currency
  org unaffected).
scope note (this PR): ledger (rate resolution, base-balance invariant, period-close revaluation
  + auto-reverse) and invoicing (foreign-currency invoices, realized FX on settlement) ship in
  full per D6. E-commerce payouts (post_ecommerce_payout, W4.1/W4.1-B) are NOT yet FX-aware —
  they still derive their currency from home_currency by construction, so an opted-in org is
  unaffected, not broken — but a genuinely foreign-currency payout is a disclosed follow-up card,
  not silently dropped (LOOP_PROMPT "no silent caps").

# SEC — production auth hardening (surfaced by the Intuit app-review questionnaire, 5 Jul)
> Today penny.founderfirst.one auth = passwordless email one-time-code (Supabase `signInWithOtp`)
> — single factor, no Captcha, no MFA. Honest answers on the Intuit questionnaire (5 Jul) flagged
> these as gaps to build. Nik: add to backlog.

## SEC-1 · Multi-factor authentication (MFA) for owner + CPA login
status: merged (pr:#245, folded into Wave-3 integration pr:#248); see SEC-1-CPACLOSE below
  for the still-open cpa-close MFA-gating decision
blocked-by: — (auth is Supabase; TOTP/factor enrolment is native)
workflow: owner/CPA · "protect my books" · Settings → Security → enable MFA → enrol authenticator
  (TOTP) → next login prompts for the 6-digit code; recovery codes issued. ≤1 owner-ask, opt-in
  first then promotable to required per-org.
goal: add a real second factor on top of the email OTP. Use Supabase Auth MFA (TOTP factor
  enrolment + challenge/verify) — no new provider. Per-org policy: optional → required (CPAs
  handling many clients' books should be able to mandate it). Recovery codes + a re-enrol path.
  Deliver so the Intuit "MFA?" answer can honestly become Yes.
centralization: MFA policy (optional/required) = per-org config row, not hardcoded; all copy from
  live personas. No inline hex/px (tokens.css); .eyebrow+.page-title headers.
coverage delta: new AUDIT ledger row (auth-mfa) ⬜ untested → stress pass (enrol → challenge →
  wrong-code reject → recovery-code path → per-org required-policy enforced; no lockout bypass).

## SEC-2 · Bot protection / Captcha on authentication
status: merged (pr:#246, folded into Wave-3 integration pr:#248); captcha is fail-open until
  Nik sets the Turnstile keys — see SEC-2-KEYS below
blocked-by: — (independent of SEC-1)
workflow: anonymous · "sign in / request code" · the login + OTP-request form runs an invisible
  bot check before dispatching an email; a human sees nothing extra, bots/abuse are blocked.
goal: add Captcha / bot protection to the auth entry points (login + OTP request) to stop
  credential-stuffing and email-bombing the OTP endpoint. Prefer Cloudflare Turnstile (we're on
  Cloudflare — no new vendor) wired into Supabase Auth's captcha hook, or an equivalent invisible
  challenge. Rate-limit the OTP-request path regardless. Lets the Intuit "Captcha?" answer become
  Yes honestly.
centralization: Turnstile site/secret keys = env/secrets, never inlined; rate-limit thresholds =
  config, not magic numbers.
coverage delta: new AUDIT ledger row (auth-botprotect) ⬜ untested → stress pass (challenge
  required before OTP dispatch; rapid-fire OTP requests rate-limited; legit human flow unaffected).

## CONN-2 · Capture QBO intuit_tid for troubleshooting
status: merged (pr:#247, folded into Wave-3 integration pr:#248; migration 20260707090000_conn2_intuit_tid)
blocked-by: — (small change to the QBO edge fns)
context: Intuit recommends capturing the `intuit_tid` response header on every QBO API call so
  their support can trace issues. We don't today (qbo-callback/qbo-connect/qbo-import). Honest
  questionnaire answer = No; this makes it Yes.
goal: read the `intuit_tid` response header on all QBO API responses and store it in our shareable
  error/request logs (Supabase fn logs + any request-audit row), so it can be produced for Intuit
  support when troubleshooting. Small, additive.
centralization: log field name/config centralized; no inline literals.
coverage delta: extend the connector AUDIT row — assert intuit_tid is captured + logged on a QBO
  call (success + error path).

# PENNY-UX-10 + E-FILE (Nik 5-Jul: declutter + make responsive; card e-file Phase A)

## PENNY-UX-10 · Owner app declutter + FULL responsive pass → /admin minimalist standard
status: claimed:loop-insession-5jul (building)
lane: apps/app (owner lens views + styles) — disjoint from EFILE-A1 (functions)
context: Nik 5-Jul reviewed the LIVE owner app: **cluttered, hard to read, NOT clean/minimalist
  like founderfirst.one/admin, AND not responsive across devices.** PENNY-UX-9 added CI design
  guards but did NOT reduce density or fix mobile. Worst offenders (Nik screenshots): **Review**
  (5+ stacked full-height sections w/ long empty-state prose) and **Connections** (a mega
  single-scroll: Catch-me-up · Bring-in-data · Connect-bank · Connect-software · Split-payout ·
  Getting-paid · Paying-bills · Share-accountant). Home's Ask-Penny block is oversized.
  ⛔ MUST NOT break any existing functionality.
workflow: owner (on ANY device) · "everything's easy to scan and act on" · each tab reads clean
  like /admin — clear hierarchy, compact empty states, one primary action per section — and works
  as well on a 375px phone as on desktop.
goal: a DESIGN/DENSITY + RESPONSIVE pass (not a rewrite) to the founderfirst.one/admin standard:
  1. **Reduce section density**: collapse verbose empty states to compact single-line states
     (icon + one line + one action), not full-height billboards. Group related sections; use the
     design-system card/section rhythm /admin uses.
  2. **Connections**: restructure the mega-scroll into a scannable grouped layout (Get-data-in ·
     Sell-channels · Money-in/out · Sharing) with tighter cards, less prose. Sub-nav/accordions only
     if nested under the existing Connections tab (no new top-level nav). Every connect/upload/toggle
     handler must still work.
  3. **Review**: compact the approve / Penny-did / receipts stack; empty states one line each.
  4. **Home**: right-size the Ask-Penny block; keep the setup prompt tight.
  5. Apply the authed-header + tokens standard PENNY-UX-9 locked (.eyebrow + .page-title, ink tabs,
     tokens.css only — NO inline hex/px/one-off sizes), and TRIM copy to VOICE (no wall of text).
  6. ⭐ **FULL RESPONSIVE PASS (Nik: currently broken on devices) across the ENTIRE owner lens** —
     Home · Review · Reports · Connections · Advanced + the section tab-strip + org switcher +
     account menu. Follow apps/admin/RESPONSIVE.md: fluid-first (clamp/min/max/flex-wrap/grid
     auto-fit), NO hardcoded px widths in horizontal layouts, tables in .table-wrap, ≥16px inputs,
     ≥44px tap targets, tab-strip collapses/scrolls on narrow. Test EVERY view at the full width
     ladder (320·360·375·414·480·540·640·768·834·1024·1280·1440·1920): at each,
     document.documentElement.scrollWidth > innerWidth MUST be false (no horizontal scroll).
gates: usability — NO new top-level nav / onboarding question / owner jargon; every existing
  button/flow/handler preserved (regression-lock connect + upload + invoice + bill-tracking +
  catch-up + payout handlers). Centralization — copy from COPY/personas; visuals tokens.css.
  Existing stack only.
coverage delta: extend the PENNY-UX AUDIT rows — assert: no bare authed <h1>, no inline hex, and
  **no h-scroll at any width-ladder step across every owner view** (add a responsive assertion, and
  drive the live width ladder where possible — reuse the responsive.yml harness/pattern); regression
  test that Connections connect handlers (qbo/xero/bank/csv/payout/invoice/bill/catch-up) stay wired.
  Before/after screenshot walkthrough (desktop + 375px mobile) in the PR.

## EFILE-A1 · E-file Phase A spike — 1099-NEC transmittal via TaxBandits (sandbox)
status: claimed:loop-insession-5jul (building)
lane: supabase/functions + migrations — disjoint from PENNY-UX-10 (app-UI)
context: e-file research (5 Jul) — no small-SaaS income-return API exists; Phase A = 1099/94x via a
  partner API is the buyable, low-risk beachhead. Nik 5-Jul: do the Phase A spike. TaxBandits =
  recommended vendor (clean REST + sandbox); Tax1099 backup. TaxBandits sandbox creds NOT yet
  provisioned (Nik human step) → build against the documented API, creds from secrets/env; if creds
  absent, transmit path is a dry-run/preview (NEVER a fake success). SPIKE (prove the path), not GA.
workflow: owner/CPA · "file my 1099-NECs without leaving Penny" · Penny already tracks vendors +
  1099 (W2.5) → review the 1099-NEC set → TIN-match pre-check → confirm-before-send (human gate) →
  transmit via TaxBandits → ingest accept/reject → surface status. NEVER auto-transmit.
goal: a spike mapping Penny's existing 1099 vendor data → the TaxBandits 1099-NEC create/transmit
  payload, with: TIN matching pre-check, explicit human confirm-before-send gate, accept/reject
  ingestion, and an IMMUTABLE submission+ack log. Build the TRUST GATE the research called for even
  in the spike. Creds via env (TAXBANDITS_* — Nik provisions sandbox); no creds → dry-run preview.
gates: ⛔ NEVER transmit without the human confirm gate; ⛔ never a fake/synth success — a missing
  credential or a reject is surfaced honestly (fail-loud). Centralization — reuse the existing 1099
  store (no duplicate vendor), TaxBandits base/keys from env not inlined. Existing stack only.
  Migration (submission+ack log) timestamp AFTER 20260708000000 (use 20260708030000), unique,
  write-don't-deploy.
coverage delta: new AUDIT ledger row (efile-1099-spike) — assert: payload maps from the 1099 store;
  TIN-match gates send; no transmit without confirm; a reject is ingested + surfaced (not swallowed);
  immutable log records submission id + ack; no-creds → dry-run (no fake success).

# NEXT WAVE — activate shipped-but-dark features (buildable, 5 Jul)
> W5.4 (multi-currency) and SEC-2 (captcha) shipped but are inert until their data/keys exist.
> These cards make already-deployed features actually usable. Disjoint lanes → fan out.

## W5.4-FX · ECB daily FX-rate feed (activates multi-currency)
status: pr:#259 (loop-insession-5jul) — migration 20260708000000_w5_4_fx_fx_rates_fetch.sql +
  supabase/functions/fx-rates-fetch (+ _shared/ecbFx.ts pure parser); write-don't-deploy, safe mode,
  NOT deployed; awaiting CI green + Nik review/merge. Note: there was a duplicate card (this file
  briefly had two "W5.4-FX" entries after a concurrent carding pass) — consolidated into this one;
  the older duplicate is removed, not two PRs.
blocked-by: — (W5.4 fx_rates table + rate resolution shipped; only the automatic feed is missing)
lane: supabase/functions + supabase/migrations (disjoint from app-UI/marketing lanes)
workflow: owner/CPA (multi-currency orgs) · "my foreign transactions convert at real rates
  automatically" · rates refresh daily with no manual entry; a missing rate still fails loud
  (never silently 1) per D3.
goal: build the systematic FX feed W5.4's design (D3) specified but did not ship: a scheduled edge
  fn (pg_cron + pg_net, mirrors the existing `changelog_trigger_digest()` cron pattern — no new infra)
  that fetches the ECB daily reference rates (eurofxref-daily.xml, + a one-time eurofxref-hist-90d.xml
  backfill) and upserts them into `fx_rates` as source='ECB' (kept uppercase — matches the column's
  existing shipped default and the W5.4 test fixtures; not worth a breaking rename), filtered against
  the currencies catalog. Manual entry remains an override (`set_manual_fx_rate`, admin-gated): the
  resolver now prefers an exact-date manual row over the ECB snapshot for that date, and also falls
  back to the most recent available row (either source) otherwise — so manual entries bridge a real
  ECB gap (bank holiday), not just correct one. A missing/stale rate still raises per the D3 fail-loud
  contract (unchanged). Cross-rate via the EUR base was ALREADY implemented in `resolve_fx_rate`
  (v_to/v_from) before this card — this card only populates the snapshot it reads from.
centralization: the feed's daily/hist90 URLs + staleness-warn threshold live in `platform_config`
  (`get_fx_feed_config()`, mirrors `get_qbo_config()` — admin-tunable, no redeploy); the refresh
  cadence is the pg_cron job's own schedule (already data, editable via SQL); currency catalog stays
  the seeded source of truth.
coverage delta: extends the multi-currency AUDIT row with a `fx-rates-fetch (W5.4-FX)` row — asserts:
  manual-override admin gate + idempotent upsert · resolver exact-date-override precedence + gap-
  bridging fallback · unknown pair still fails loud (NULL) · cron trigger never raises with no secret
  · `get_fx_feed_config()` reflects `platform_config` live · pure XML-parser + staleness-math unit
  tests (Deno, network-free). A daily-upsert-is-idempotent assertion against a LIVE ECB fetch is not
  pgTAP-provable (no network in CI) — proven instead by the upsert's `on conflict` key + the Deno
  parser/shaper tests; a live smoke-test is the deploy-time verification step (write-don't-deploy here).
scope note: `set_manual_fx_rate` is admin-gated and callable today (admin session / SQL), but has no
  admin-console FORM yet — disclosed, not silently dropped; building one is new admin-console surface,
  out of scope for this card.

## IQ-1-CLEANUP · Null legacy plaintext QBO tokens (post-verify) — UNBLOCKED
status: claimed:loop-insession-5jul (building)
note: UNBLOCKED 5-Jul — the pgcrypto encrypt→decrypt roundtrip was PROVEN in PROD with the real
  Vault key (dec_qbo_token(pgp_sym_encrypt('x', qbo_token_key))='x' → true), so the encrypted path
  is verified on live crypto; safe to null legacy plaintext without waiting for a real QBO login.
blocked-by: a real QBO (re)connect that populates + round-trips an encrypted token in prod (the one
  existing conn was tokenless at deploy, so encrypt/decrypt hasn't been exercised on live data yet)
lane: supabase/migrations
goal: the deferred follow-up from IQ-1 — once a real token has been encrypted + decrypted live in
  prod (verify via ext_connection_secrets on a reconnected org), ship a migration that NULLs the
  legacy plaintext access_token/refresh_token columns (kept until now for rollback safety). Do NOT
  run this until the encrypted path is proven on real live data.
coverage delta: extend the qbo-hardening AUDIT row — assert no plaintext token column is readable/
  populated post-cleanup; decrypt still returns the token.

# INTUIT-QUALITY — QBO app-assessment hardening (5-Jul audit; right-for-our-product only)
> A read-only-Accounting compliance audit (against Intuit's App Assessment + security policies)
> confirmed our posture is strong — CSRF state nonce, proactive refresh, secrets server-side,
> strong tenant isolation, intuit_tid capture, server-side MFA all COVERED. These are the genuine
> remaining gaps that fit our product (payments/payroll/discovery-doc items are N-A/optional and
> excluded). Building these closes the assessment credibly and hardens quality.

## IQ-1 · QBO connection hardening (tokens-at-rest + resilience + revoke)
status: pr:#255 (GREEN — all checks pass; folded into open integration pr:#256; safe mode,
  awaiting Nik to merge)
blocked-by: — (all in the QBO edge fns / _shared/qbo.ts — ONE builder owns this domain to avoid collisions)
workflow: owner/CPA · "my QuickBooks stays connected and my data is safe" · connect once → imports
  survive throttling + brief token expiry → disconnect actually revokes at Intuit; invisible to the user.
goal: harden the QBO integration per the audit:
  1. **Tokens at rest** (biggest exposure): move external_connections.access_token/refresh_token to
     Supabase Vault / pgsodium (encrypt on write, decrypt only server-side in the qbo fns). SAFE
     migration: encrypt existing rows in-place, dual-read during transition, no live-connection break.
  2. **Retry + backoff** on 429/5xx in qboQuery/qboQueryAll, honor `Retry-After`; throttle paged pulls
     so a large historical import survives QBO rate limits.
  3. **Reactive refresh-on-401**: on a 401 from a QBO query, refresh the access token once and retry
     before failing (complements the existing proactive time-based refresh).
  4. **Disconnect revokes at Intuit**: add a qbo-disconnect edge fn that calls Intuit's token-revocation
     endpoint and sets status='revoked' (don't leave a live grant).
  5. **Expire the OAuth `state` nonce**: reject a callback whose `pending` connection row is older than
     ~10 min (needs a created_at check; state is already single-use + unique).
  6. **Unknown account Classification → review, not silent 'expense'**: mapQboAccountType must NOT
     silently bucket an unknown QBO classification as expense (silent wrong books) — route it to the
     uncategorized/holding path or flag for mapping review.
centralization: retry thresholds / backoff / state-TTL = config (platform_config), not magic numbers;
  QBO endpoints stay in _shared/qbo.ts; no secrets inlined.
coverage delta: new AUDIT ledger row (qbo-hardening) — assert: encrypted tokens unreadable by
  `authenticated`; 429→backoff→success; 401→refresh→retry; disconnect calls revoke + sets revoked;
  stale state rejected; unknown classification does NOT post as expense.

## IQ-2 · Connections UX — broken-connection banner + Reconnect + in-app support
status: pr:#253 (GREEN — all checks pass; folded into open integration pr:#256; safe mode,
  awaiting Nik to merge)
blocked-by: — (apps/app UI only — disjoint from IQ-1's edge-fn work; safe to build in parallel)
workflow: owner/CPA · "Penny told me my QuickBooks needs reconnecting, one tap fixes it" · a broken
  connection (status='error'/invalid_grant) shows a clear banner on Connections + a Reconnect CTA;
  a Contact-support link is always reachable. Nests under existing Connections — no new top-level nav.
goal: the audit's assessment-required UX gaps:
  1. Connections surface reads external_connections.status/last_error and, when a connection is
     broken (status='error'), shows an honest banner + one-click **Reconnect** (re-runs the connect
     flow) — so users are never stranded on stale data with no path to fix.
  2. An always-reachable in-app **Contact support** affordance using SITE.email (founder@founderfirst.one)
     — reachable from Connections + error states (today it only appears in a couple of error strings).
centralization: all copy from live personas/COPY + SITE.email (never a hardcoded address); tokens.css
  for all visuals; .eyebrow+.page-title headers.
coverage delta: extend the connectors AUDIT row — assert a broken connection renders the banner +
  Reconnect CTA, and the support link resolves to SITE.email.

## SEC-2-KEYS · Cloudflare Turnstile keys (Nik) — captcha is dark until set
status: unclaimed (Nik human step)
context: SEC-2 shipped + is wired to signInWithOtp, but no TURNSTILE_SITE_KEY / TURNSTILE_SECRET is
  set, so captcha is fail-open (login works normally, rate-limit still active). To turn bot protection
  ON: Nik creates a Cloudflare Turnstile widget → set TURNSTILE_SITE_KEY (frontend env / pages.yml)
  + TURNSTILE_SECRET (supabase fn secret) → redeploy. Then the Intuit "Captcha?" answer is truly Yes.

## SEC-1-CPACLOSE · MFA-gate the CPA batch-close path (Nik: YES, 5 Jul)
status: claimed:loop-insession-5jul (building)
lane: supabase/functions (cpa-close) + supabase/migrations
decision: **Nik 5 Jul — YES, gate it.** For consistency with the 10 other org-write paths.
workflow: CPA (firm user) · batch month-end close · if the firm's org requires MFA and the
  session is aal1 → blocked with a clear reconnect-with-MFA message; aal2 → proceeds. Non-MFA
  firms unaffected.
goal: extend SEC-1's server-side MFA enforcement to `cpa-close`. It operates on firm_id + a list
  of client_org_ids, so gate on the CPA FIRM USER's own org MFA policy (org_requires_mfa on the
  firm org + session_is_aal2 from the JWT) BEFORE any batch write — mirror the mfaGate.ts pattern
  the other 10 fns use. The can_write_org_as DB guard already covers RPCs routing through it; this
  closes the edge-fn entry path. Reuse _shared/mfaGate.ts (aalFromJwt + mfaSatisfied).
centralization: reuse existing mfaGate + org_requires_mfa; no new thresholds.
coverage delta: extend the auth-mfa AUDIT row — assert: MFA-required firm + aal1 CPA → cpa-close
  rejected 403; aal2 → allowed; non-MFA firm → unaffected. deno/pgTAP.

## CONN-1 · QBO production hosting IP (static-egress proxy) — Nik + infra
status: unclaimed (deferred — sandbox unaffected)
blocked-by: — (not blocking any build; production QBO is Intuit-review-gated anyway)
context: Intuit's "Tell us where your app is hosted" step (required for PRODUCTION keys only)
  demands a fixed Country + IP range. Our QBO calls originate from Supabase Edge Functions +
  Cloudflare = no static egress IP, so there is no correct value to enter (Nik left it blank
  4 Jul night — sandbox/development keys work WITHOUT this step). Xero redirect URI saved + live;
  QBO sandbox Redirect URI (…/functions/v1/qbo-callback) set.
goal: when we go to PRODUCTION QBO, stand up a small static-IP egress proxy (or NAT) for the
  server-to-server QBO API calls, register that IP range in the Intuit hosting step, and complete
  the production-credentials checklist. Deliberate infra task — do NOT guess an IP range (a wrong/
  broad range is a security-review liability). Same pattern will inform any other provider that
  IP-allowlists.
centralization: the QBO API base + egress config = env/secrets, never inlined.

## PENNY-UX-9 · Owner + CPA IA restructure to the /admin design standard (POST-DEPLOY)
status: unclaimed
blocked-by: RV2-A2, RV2-C1, RV2-D1, W5.4 — do this AFTER all four Wave-2 features are merged +
  deployed (the new tax-export / practice-OS / AP-bills / multi-currency surfaces must exist
  before we restructure the IA around them). Nik ask, 4 Jul night.
scope-decision: Nik 4 Jul — revisit penny.founderfirst.one from the OWNER and CPA perspective;
  arrange/structure the tabs; match founderfirst.one/admin EXACTLY on font · alignment ·
  minimalist approach · tokens.
workflow: owner · "everything I need is where I expect it, and it looks as clean as /admin" ·
  Home → any job in ≤2 taps, zero empty/duplicate tabs · CPA · Practice home → per-client
  workflow tabs, same visual language. NO new top-level nav / onboarding question / owner jargon
  without Nik (usability gate); nest new Wave-2 surfaces (Filing export, AP/Bills, multi-currency
  toggle) under existing jobs, do NOT add tabs.
goal: a fresh owner+CPA IA/design pass on the LIVE app now that Wave-2 shipped. FIRST re-audit
  every tab per lens (owner: Home·Review·Reports·Connections+Advanced; CPA: Practice home +
  workflow tabs) — list which tabs need restructuring, which are empty/duplicative, where the new
  Wave-2 features should nest. THEN bring the whole app to the founderfirst.one/admin standard:
  the authed header/nav pattern (.eyebrow + .page-title (+.page-sub) from components/typography.css
  — NEVER a bare <h1>; ink-active section tabs, sans wordmark), tokens.css for ALL font/color/
  spacing/radius (no inline hex/px/one-off sizes), RESPONSIVE.md width ladder at every breakpoint,
  minimalist layout, real content in every tab. Extends the PENNY-UX-0 audit (PR #220) — reuse its
  ledger; this is the second, post-feature pass.
centralization: all copy/Penny-language from live personas + CENTRAL-1 config; all visual values
  from tokens.css. Tuning must be an edit (token/persona/config), not a per-file PR.
coverage delta: extend the PENNY-UX AUDIT ledger rows (per-lens IA + design-conformance) — assert
  zero unresolved CSS vars, zero bare <h1> on authed pages, no horizontal scroll on the width
  ladder, every tab has real content.

---

## LOOP-1 · Build dashboard (/admin → Build tab)
status: merged (pr:#173 — live on main)
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
status: merged (pr:#175 — nightly regression.yml live)
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
status: merged (pr:#174)
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

## IA-3 · Internal admin console (penny.../admin mirror) — BUILD (Nik: build now, 5 Jul)
status: claimed:loop-insession-5jul (building — slice 1 of N)
lane: apps/app (penny/admin console) — disjoint from cpa-close (functions) + e-file (research)
decision: **Nik 5 Jul — BUILD NOW, additive parallel-run.** Never break founderfirst.one/admin.
workflow: platform staff · "run the business from inside Penny" · penny.../admin mirrors the 4
  admin tabs (Support · Audience · Analytics · Penny) + ⚙️ Settings, gated by is_platform_staff;
  parallel-run 1-2 months alongside founderfirst.one/admin, cut over per APP_PRINCIPLES §4.
goal: grow the IA-3 scaffold (pr:#233) into a working internal console. **SLICE 1 (this card):**
  stand up the console shell + navigation at penny.../admin matching the /admin IA (4 tabs +
  Settings, the authed-header/token standard PENNY-UX-9 locked), gated by is_platform_staff, and
  wire the FIRST tab (Support inbox — highest-use) to the same Supabase data /admin reads.
  ADDITIVE ONLY — founderfirst.one/admin untouched (a regression there = automatic fail). Later
  slices bring Audience/Analytics/Penny tabs. Read apps/app/APP_PRINCIPLES.md §4 + the existing
  /staff lens (is_platform_staff) + apps/admin routes (mirror their data hooks, don't re-invent).
centralization: reuse the design-system authed header + tokens; copy from live personas/COPY;
  read the SAME Supabase tables/RPCs /admin uses (one source of truth, no duplicate data path).
coverage delta: new AUDIT ledger row (ia3-console) — assert: console renders only for
  is_platform_staff; the Support tab lists the same tickets /admin shows; /admin unaffected (its
  e2e still green); no bare <h1>, width-ladder clean.

## CENTRAL-1 · Centralize apps/app copy, Penny language, and behavior thresholds
status: merged (pr:#176)
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
status: merged (pr:#177)
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
status: merged (pr:#200 — watcher live; auto-extraction decision still open for Nik)
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
status: merged (pr:#179)
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
status: merged (pr:#178)
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
status: merged (pr:#183)
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
status: merged (pr:#180)
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
status: merged (pr:#182)
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
status: merged (pr:#188)
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
status: merged (pr:#187)
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
status: merged (pr:#186 — sandbox live; Plaid production application FILED by Nik 3 Jul, awaiting Plaid review)
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
status: merged (pr:#193)
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
status: merged (pr:#196)
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
status: merged (pr:#194)
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
status: merged (pr:#195)
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
status: merged (pr:#197)
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

# Wave 4 — vertical + expansion (carded 3 Jul; Wave-3 gate CLEAR, 0 P0)

> Roadmap §Wave-4. All build OFF main, PR-only, into the APP_PRINCIPLES nav (no new top-level
> tab without Nik), centralization + usability gates apply, kernel/config/persona are the only
> sources of truth. Next free migration timestamp >= 20260706050000.

## W4.2 · Cash-flow statement (GAAP indirect)
status: merged (pr:#206)
blocked-by: — (reads the shipped ledger; demo util/cash-flow.js is the interaction spec)
goal: owner/CPA sees a GAAP indirect cash-flow statement (operating/investing/financing) tying
  to the P&L + balance-sheet deltas — the last of the big-three statements (theme #8).
workflow: CPA · "where did the cash go?" · Reports → Cash flow → period → ties to BS/P&L · ≤3 taps
spec: indirect method from existing journal data (net income + non-cash adjustments + working-
  capital deltas); reuse the W1.2 export machinery (add a `cf` ReportKind, CSV+PDF); pagination
  discipline (RPTTEST). Demo apps/demo/util/cash-flow.js = the algorithm reference, rebuilt on
  real data. Ties to the cent against BS period deltas.
acceptance:
  - [ ] Cash-flow statement ties to BS cash delta + P&L to the cent (seeded test)
  - [ ] Exports CSV+PDF via the W1.2 machinery; period-scoped; audit-logged
  - [ ] Responsive; tokens only; copy from 'app' persona
tests: Vitest tie-out; E2E; REG scenario
touches: apps/app/src/ledger/{reports.ts,export.ts,Ledger.tsx} (SHARED export module — additive, declare)
decision-needed: none

## W4.5 · Rescue-migration landing pages (Bench/Heard-style)
status: merged (pr:#205)
blocked-by: — (marketing site apps/web; fully disjoint from all app cards)
goal: SEO/GEO landing pages targeting owners whose bookkeeper shut down (Bench/Heard-style
  events) — "we'll rescue your books" — feeding Signals. Theme #10 / marketing.
workflow: prospect · "my bookkeeper vanished" · lands on a rescue page → clear value + CTA → waitlist/contact
spec: apps/web (Astro) new landing route(s) from @ff/content source of truth; on-brand (VOICE.md,
  BLOG_PRINCIPLES structure), SITE constants (no hardcoded URL/email), tokens only; SEO/GEO meta +
  sitemap + llms.txt entry; fast-template perf (OPS-1 standard: ≥90). Copy shame-free, on-voice.
acceptance:
  - [ ] Rescue landing page(s) live under apps/web, in sitemap + llms.txt, ≥90 perf
  - [ ] SITE constants + tokens only (no hardcoded contact/URL/hex); VOICE.md compliant
  - [ ] Responsive on the full width ladder
tests: build clean; responsive check; link/CTA works
touches: apps/web (marketing — disjoint from app)
decision-needed: none to build (target-event list + exact CTA copy = Nik can refine post-draft)

## W4.1 · E-commerce payout splitting (Shopify/Stripe)
status: merged (pr:#207 framework + pr:#213 payout-upload UI) · **W4.1-B** (PayPal + Square +
  Amazon file-import, registry-driven tiles, migration 20260706120000) pr:#225 — API sync per
  provider is the follow-up once Nik's credentials land
blocked-by: W4.2 nice-to-have not required; independent of it
goal: Shopify/Stripe payouts split into gross sales, fees, refunds, COGS — not one lump deposit
  (theme #6). The #1 e-commerce bookkeeping pain.
spec: parse payout/settlement reports (Stripe balance transactions, Shopify payouts) into
  component journal lines (sales / processing fees / refunds / COGS adjustment) with per-row
  idempotency (`ext:stripe:<txn>` discipline); reversal-based corrections. Connector registry
  (CENTRAL-2) for provider metadata. Grounded, records to ai_decisions where inference is used.
acceptance:
  - [ ] A sample Stripe payout splits into correct component entries, ties to the cent (test)
  - [ ] Idempotent re-import (no double-post); refunds/fee reversals handled via reversal path
tests: Vitest split logic; pgTAP on the post RPC; REG scenario
touches: apps/app import/categorize + a payout-parse path (declare)
decision-needed: RESOLVED (Nik 3 Jul) — integrate the MAJOR providers (Stripe + Shopify first,
  then PayPal/Square/Amazon), provider-agnostic framework via connector registry; API where
  available + file-import fallback. Bundled (no extra charge).

## W4.3 · Invoicing + AR nudges (modular, opt-in)
status: merged (pr:#208 + pr:#214 PDF attach)
blocked-by: —
goal: owners send invoices + get paid faster with gentle AR nudges (theme #9). Modular/opt-in —
  off by default, nests under an existing job, no new top-level nav.
spec: invoice entity + line items, send (email), status (draft/sent/paid/overdue), AR aging that
  posts to the ledger correctly (revenue recognition + AR), opt-in nudge cadence from config.
  Voice from 'app' persona. Careful ledger integration (AR account, payment application).
acceptance:
  - [ ] Create → send → mark paid posts correct AR/revenue entries, ties out (test)
  - [ ] Nudge cadence from config; opt-in; owner interruption budget respected
tests: Vitest + pgTAP on AR posting; E2E; REG scenario
touches: apps/app (new invoicing surface, ledger AR path)
decision-needed: RESOLVED (Nik 3 Jul) — in the CORE bundle (no add-on charge); reuse the EXISTING
  email infra (verify it can send invoices; if it works, use it — no new provider).

## W4.4 · Lender / due-diligence-ready package
status: merged (pr:#209)
blocked-by: W4.2 (cash-flow statement is part of the package)
goal: a lender/DD-ready financial package (theme #10) — the three statements + supporting
  schedules + period comparatives, export-clean, priced artifact like the year-end package.
spec: package generator riding W1.2 + W4.2 export machinery: P&L, BS, cash-flow, AR/AP aging,
  comparatives, cover sheet; entity-stamped; audit-logged. Reuses everything; adds assembly + cover.
acceptance:
  - [ ] Package assembles all statements + comparatives, ties to the cent, exports CSV+PDF
  - [ ] Audit-logged; read_only CPA can generate
tests: Vitest assembly; E2E; REG scenario
touches: apps/app export/package (SHARED — additive, declare)
decision-needed: RESOLVED (Nik 3 Jul) — BUNDLED into the core product (no separate price). Build the generator.

# Wave 5 — post-roadmap hardening + fast-follows (carded 3 Jul; all 4 roadmap waves shipped)

> Nik selected all four workstreams (polish/fast-follows · a11y gate · real-world hardening · roadmap v2).
> The durable launchd loop (safe mode) works these top-down. `safe` = build + GREEN PR only, never deploy.
> IN FLIGHT (in-session, will PR — do NOT re-claim): a11y+responsive E2E gate · W4.1 payout upload UI.
> HUMAN STEPS (not loop cards — Nik does these): Plaid production application + QBO production readiness
> (OAuth/prod keys on the provider dashboards). Loop preps code only, never files prod apps.

## W5.1 · Invoice PDF attachment (W4.3 fast-follow)
status: merged (pr:#214)
goal: invoices go out as a PDF attachment (today they're branded HTML only — send.ts has no attachments field).
spec: extend supabase/functions/_shared/send.ts to carry a PDF attachment (Resend supports `attachments`);
  generate the invoice PDF via the existing export/PDF machinery; attach on the `invoice_sent`/nudge path.
acceptance: invoice email includes a correct PDF; existing HTML body unchanged; no new provider; test proves attach path.
decision-needed: none

## W5.2 · Wave-3 audit P2 fixes (F3-F5) + Wave-4 F3 note
status: merged (pr:#215)
goal: clear the carried Wave-3 P2 regression stubs (F3 receipt same-amount/diff-date auto-attach; F4 grounding
  extra-number pass-through; F5 receipt undo LIKE-substring key) + reconcile the Wave-4 F3 dual AR-aging schemes.
spec: see docs/AUDIT.md Programs 4-5 findings; each has a REG-W3-F*/REG-W4-F* stub — fix + convert stub to a real scenario.
acceptance: each finding fixed + its regression scenario green; no behavior regressions.
decision-needed: none (F3 Wave-4 aging is by-design — only align presentation/labels, do not merge the two schemes)

## W5.3 · Email deliverability test harness
status: merged (pr:#218 — manual live-send step remains for Nik)
goal: an automated end-to-end test that the invoice/nudge/notification email path actually sends (Resend), so
  "email works" stops being verified-in-code-only.
spec: a test/harness that exercises sendEmail() against a test inbox / Resend sandbox (or a mocked-then-live toggle);
  wire a CI-safe version (mock) + a documented manual live-send check. Do not spam real users.
acceptance: CI test proves the send path builds+dispatches correctly; a documented manual live-send step for Nik.
decision-needed: none to build the harness (a real live-send to a production address is a Nik step)

## W5.4 · Multi-currency DESIGN PLAN (plan-only — NO build)
status: plan merged (pr:#216) — D1–D7 ANSWERED by Nik 4 Jul (design doc §8) → build UNBLOCKED;
  card the build (full v1 scope: ledger + invoices + payouts, per-org flag) after the PENNY-UX
  wave gate, sequenced against roadmap-v2 by Nik
goal: a design doc for multi-currency (invoices/payouts/ledger) for Nik to approve BEFORE any code.
spec: docs/plans/ doc with a `Status: DRAFT — awaiting Nik sign-off` header covering: base vs transaction currency,
  FX-rate source options, realized/unrealized FX gain-loss posting, presentation, and the decisions Nik must make.
  Survey how the ledger/invoicing/payouts currently guard single-currency. NO code, NO migration.
acceptance: one docs PR with the plan + an explicit "Decisions Nik must make" section.
decision-needed: none to draft (the plan IS the surfacing of decisions)

## W5.5 · Roadmap v2 draft (plan-only — NO build)
status: merged (pr:#217 — Nik picked order A → C → D → E → B, 4 Jul)
goal: a short proposal of the next big bets now that Waves 1-4 shipped, for Nik to direct.
spec: docs/plans/ doc, DRAFT header: 3-5 candidate directions (grounded in Signals demand + the mission "CPA files
  taxes from Penny" gaps still open), each with rough scope/impact/risk, ending in "what to prioritize — Nik".
  Do NOT commit to scope or build anything.
acceptance: one concise docs PR; options not decisions.
decision-needed: none to draft (Nik picks the direction from it)

---

# WEEKLY-AUDIT-P1 — findings from the 14-Jul audit (#338), self-carded

> `docs/plans/BACKLOG.md` on `main` lags the loop's real state by many iterations (see
> LEARNINGS + memory — every open loop PR is real shipped-as-open-PR work awaiting Nik's
> merge). Per the established self-carding precedent (#309/#311/#321/#327/#339), each loop
> iteration that finds no unclaimed non-decision card in the file above re-reads the latest
> weekly audit, cross-checks its named findings against every open PR's file list, and cards
> + builds whichever finding is still genuinely unclaimed.

## SIG-DIGEST-RLS · Enable RLS on sig_digest_sends (P1-hygiene)
status: pr:#340 (loop-orch, 12 Jul) — carded and fixed same session
context: the 14-Jul audit (#338, supabase section) found `sig_digest_sends`
  (`20260623150000_signals_digest_sends.sql`) is the one table (of 120) missing
  `enable row level security` — grants already lock it to `service_role` (revoke all from
  anon/authenticated), so it is NOT exploitable, but every sibling `sig_*` table
  (`sig_keywords`/`sig_sources`/`sig_settings`) has RLS on for defense-in-depth/parity.
  Cross-checked all 30 other currently-open loop PRs' file lists against every other named
  P1 in #338 — the other 8 (admin unresolved `--accent*`/`--warn`/`--text-warning` tokens,
  stale bubble bundle, `llms.txt` + legal-page hardcoded canonical origin, `SignupForm`
  exclamation mark, unwrapped 1099-NEC table, both personal-email leaks) are already claimed
  by #311/#327/#317/#315/#313/#339 respectively. This RLS gap was the one genuinely
  unclaimed, non-decision-needed P1.
goal: `alter table sig_digest_sends enable row level security;` (new migration,
  write-don't-deploy) — no policy needed, mirroring the sibling `sig_*` tables
  (RLS-enabled + policy-less = deny-all-by-default for every role except the owner and
  `service_role`, which bypasses RLS in Supabase). New pgTAP test proves RLS is on and that
  `service_role` keeps full read/write (the cron/digest write path is unaffected).
centralization: n/a (single catalog flag on an existing table, no new config surface).
coverage delta: new `supabase/tests/sig_digest_sends_rls_test.sql` — asserts
  `pg_class.relrowsecurity` is true, anon/authenticated stay locked out, service_role keeps
  select+insert.
