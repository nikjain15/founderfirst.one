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
auto-attach. P2: detach is 1-tap, metadata-only, ledger untouched. **Fix:** count fuzzy
ties at the best delta and downgrade to a confirm card when >1. → regression stub REG-W3-F3.

**F4 · P2 · Grounding post-check allows an extra invented number.**
`supabase/functions/penny-thread/index.ts:198` — the guard only asserts the correct money
string is *present* (`!text.includes(money(fact.amountMinor))`). A reply "…$200.00, about
15% of revenue" passes though the prompt forbids percentages/estimates. Can never corrupt
the server-computed stated fact (`index.ts:146`) ⇒ P2, but the header's "hallucinated
number is structurally impossible" overstates. **Fix:** reject any currency/percent token
other than the single allowed `money(fact.amountMinor)`; fall back to the deterministic
phrasing. → regression stub REG-W3-F4 (adversarial: extra-number reply is rejected).

**F5 · P2 · Receipt feed-row idempotency via `LIKE '%uuid%'` substring, not a key.**
`supabase/migrations/20260705030000_w3_5_receipts.sql:244-247,287-290` — `autoattach_receipt`
/ `detach_receipt` dedupe + undo the feed row with `summary like '%'||p_receipt_id||'%'`
against free-text owner copy, vs. W3.2's proper `entry_id=` key (`20260705010000:120`). No
security impact; a future copy change dropping the `[uuid]` suffix silently breaks
dedup/undo. **Fix:** add a nullable `receipt_id uuid` column to `penny_activity` and key
off it. → regression stub REG-W3-F5.

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
| W3.1 | Penny thread in-app (grounded Q&A) | `thread.test.ts` + `regression.thread-server-authority.test.ts` | 🟢 stress-passed; **F2 (P1) / F4 (P2)** open |
| W3.3 | 3-step onboarding (kernel entity/industry + CoA seed) | onboarding Vitest + `20260705020000` pgTAP; `check:kernel-seed` gate | 🟢 stress-passed; no defect (seed-order deploy note) |
| W3.4 | Owner Home / am-I-okay pulse | `homePulse.test.ts` | 🟢 stress-passed; no defect |
| W3.5 | Receipt capture + match | `receiptMatch.test.ts` + `w3_5_receipts_test.sql` | 🟢 stress-passed; **F3 / F5 (P2)** open (supersedes the Wave-1 ⬜ W3.5 row) |

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
| W4.1 | E-commerce payout splitting (provider-agnostic framework via connector registry; Stripe + Shopify parsers, PayPal/Square/Amazon extensible; lump payout → gross sales / fees / refunds / net component lines; per-payout `ext:<provider>:payout:<id>` idempotency; reversal-based restatement; reconcile guard rejects non-tying splits) | `apps/app/src/ecommerce/payouts.test.ts` (split math + Stripe/Shopify parsers + cent-tie + reconcile) + `w4_1_ecommerce_payouts_test.sql` (post/reverse RPC: component lines · ties to cent · idempotent re-import no-double-post · reconcile/unknown-provider/read_only guards) | ⬜ red-teamed; stress-pass pending |
| W4.2 | Cash-flow statement (GAAP indirect: operating/investing/financing; ties to BS cash delta + P&L; CSV+PDF via W1.2 machinery) | `apps/app/src/ledger/cashFlow.test.ts` (tie-out to BS cash delta + P&L, section classification, begin/end cash, reversal/pending discipline) + `export.test.ts` cash-flow CSV tie-out | ⬜ red-teamed; stress-pass pending |
| W4.4 | Lender / due-diligence package (assembles P&L + BS + cash-flow + AR/AP aging + period comparatives + cover sheet; entity-stamped; CSV+PDF via W1.2/W4.2 machinery; audit-logged `report.export report='pkg'`; read_only CPA can generate) | `apps/app/src/ledger/package.test.ts` (all-section assembly, figures match standalone builders to the cent, BS balances + cash-flow ties on cover, prior-period comparative + Δ, AR/AP aging bucket tie-out, pending exclusion, valid PDF, filename) + reuses `arApAging`/`cashFlow`/`balanceSheet`/`profitAndLoss` under existing report tests | ⬜ red-teamed; stress-pass pending |

**Coverage delta:** +13 ledger rows, all ⬜ (baseline + per-PR red-team, formal stress pass pending).
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
