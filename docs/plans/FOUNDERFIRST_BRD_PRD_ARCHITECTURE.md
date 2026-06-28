# FounderFirst — BRD · PRD · Hardened Architecture (build-ready)

> Status: **Draft for review** · 27 Jun 2026 · Owner: Nik
> Companion to [ARCHITECTURE.md](ARCHITECTURE.md) (source of truth for locked decisions).
> This document does **not** re-litigate §0/§1b of ARCHITECTURE.md — it builds on them and
> hardens them into a complete, build-ready spec set: **Part A — BRD**, **Part B — PRD**,
> **Part C — Hardened Architecture**, **Part D — Traceability & gap analysis**.

**Context that shaped this doc (from discovery):**
- ICP: **balanced two-sided** — owner and CPA originate roughly equally; neither persona is
  privileged in scope or copy. Two co-equal funnels.
- Pilots: **a few design partners committed.** Success metrics target real activation/retention,
  not vanity acquisition. Integration order follows what those partners use today (see §A6).
- Team/timeline: **solo founder + Claude, quality-gated, no hard date.** Scope is the full §1b
  Definition of Done; the lever is *sequence and pace*, not *cutting scope*. Capacity risk is
  called out explicitly in §B11 and §C12.

---
---

# PART A — Business Requirements Document (BRD)

## A1. Problem statement

Small businesses and the accountants who serve them run their books on tools that force a bad
trade. **QuickBooks/Xero** are correct and CPA-trusted but hostile to a non-accountant owner —
they assume you know what a debit is, dump you into a blank ledger, and make categorization a
chore. **Bench/Pilot** are friendly to owners (a human does the books) but opaque, slow, expensive,
and they put a service desk between the owner and their own numbers — and the CPA is often locked
out or working from exports.

Nobody has built **one system both sides love**: an owner who never learned accounting gets
plain-language answers and tap-to-confirm categorization, *and* a CPA gets a real double-entry
ledger, reconciliation, period close, and a cross-client workqueue they trust to the cent — on the
**same data**, in real time, with no export/re-import dance between them.

The wedge is **AI that does the bookkeeping labor (Penny) on top of a real ledger**, with
**role-scoped lenses** so the owner sees a friendly cockpit and the CPA sees professional-grade
controls, both reading and writing the same isolated, auditable books.

## A2. Target users & personas

### Persona 1 — Maya, the Business Owner ("owner lens")
- Runs a 2–20 person services/e-commerce business, US, <$2M revenue, <~500 txns/month.
- **Not** an accountant. Wants to know "can I make payroll, am I profitable, what needs my
  attention" — not to learn accounting.
- Today: bank app + spreadsheet + a shoebox of receipts + a CPA she pays at tax time and dreads
  the back-and-forth with.
- **Jobs-to-be-done:** (1) *When money moves, categorize it correctly without thinking like an
  accountant* → tap-to-confirm. (2) *When I get a receipt, capture it before I lose it* → phone
  photo. (3) *When I wonder how the business is doing, get a straight answer* → plain-language
  dashboard. (4) *When I switch tools, bring my history so I'm not starting cold.*
- **Delight test:** connects a bank in minutes; transactions arrive *already categorized*; "how's
  my business?" answered in English.

### Persona 2 — David, the CPA / bookkeeper ("CPA lens")
- Solo or small firm (1–10 people), 10–60 small-business clients.
- Hard, opinionated, trust-first user. **One wrong balance loses him forever.**
- Today: logs into N separate QBO/Xero files, juggles client passwords, chases owners for
  receipts and categorizations, reconciles by hand, closes periods at month/quarter/year end.
- **Jobs-to-be-done:** (1) *Across all my clients, show me what needs work, ranked* → workqueue.
  (2) *Trust the books are balanced, immutable, auditable* → real double-entry ledger. (3) *Tie
  every account to the bank statement* → reconciliation. (4) *Lock the period when it's done* →
  close. (5) *Don't make me fix the same miscategorization twice* → Penny learns rules. (6) *Never
  trap me — let me round-trip to QBO/Xero.* (7) *Control exactly what I can touch per client.*
- **Delight test:** a single ranked workqueue across clients; reconciliation that ties; close that
  locks; his corrections become rules.

### Persona 3 — Platform Staff / Admin ("admin lens" — internal)
- FounderFirst staff (today's `apps/admin`). **Not a tenant role.** Operates support, audience,
  analytics, Penny content, quality, billing oversight.
- Access to tenant financial data is **break-glass and audited** (§C9), never silent.

**Secondary actors:** the *firm_admin* (managing partner who assigns CPAs to clients), the
*business member* (a bookkeeper/employee the owner invites to help, no ownership), and *Penny*
itself as a non-human proposer that never mutates money unsupervised.

## A3. Jobs-to-be-done summary (the spine of the PRD)

| # | Actor | Job | PRD feature group |
|---|---|---|---|
| J1 | Owner/CPA | Get started without a cold ledger (import history) | §B3 History import |
| J2 | Owner | Categorize money correctly without accounting knowledge | §B5 Penny categorize |
| J3 | Owner | Capture receipts before they're lost | §B6 Receipt capture |
| J4 | Owner | Understand the business in plain language | §B7 Owner cockpit |
| J5 | CPA | Trust a real, balanced, immutable ledger | §B4 Ledger core |
| J6 | CPA | See what needs work across all clients | §B8 CPA workqueue |
| J7 | CPA | Reconcile to the bank statement | §B5 Reconciliation |
| J8 | CPA | Close & lock periods | §B4 Periods/close |
| J9 | CPA | Not fix the same thing twice | §B5 Learned rules |
| J10 | CPA | Never be trapped (export / round-trip) | §B9 Integrations/export |
| J11 | Both | Invite the other party; control access | §B2 Identity & access |
| J12 | Both | Trust isolation, correctness, recoverability | §B10 Non-functional |

## A4. Business goals & success metrics

Because the team is solo + quality-gated and pilots are committed, metrics are **activation- and
trust-weighted**, not growth-vanity.

| Goal | Metric | Pilot target |
|---|---|---|
| Both sides run real books | % design-partner pairs (owner+CPA) live on real data | ≥ 80% of committed partners |
| Owner activation | Time from signup → first bank connected & first month categorized | < 30 min median |
| Categorization quality | % Penny proposals accepted without edit (after 30 days of learning) | ≥ 75% |
| CPA trust | % clients with at least one period reconciled **and** closed | ≥ 70% |
| Correctness (the existential one) | Ledger imbalance incidents in prod | **0** (hard gate) |
| Isolation (the existential one) | Cross-tenant data exposure incidents | **0** (hard gate) |
| Stickiness | Weekly active CPA workqueue usage | ≥ 3 sessions/CPA/week |
| Monetization readiness | Pilots who say "I'd pay for this" at exit interview | ≥ 60% |
| Retention | Design-partner pairs still active at 90 days | ≥ 70% |

**Two metrics are launch gates, not KPIs:** zero imbalance incidents and zero cross-tenant
exposure. Either one nonzero means not launched (mirrors ARCHITECTURE.md §1b "trust is the
product").

## A5. Monetization hypothesis

- **Hypothesis:** *businesses* pay (per-business subscription), because the business captures the
  value (their books, their dashboard) and the CPA is a multiplier/influencer who drives adoption.
- **Schema is polymorphic** (`subscriptions.billable_org_id` → business OR firm) so a
  firm-pays-for-all-clients model is expressible **without a migration** if the CPA-led motion
  proves stronger (ARCHITECTURE.md §6b).
- **Free during pilot** (`plan='pilot_free'`); entitlement check exists day one; Stripe slots in
  behind `provider`/`provider_ref`. Pricing shapes kept open: per-business flat, per-business by
  txn volume, or per-seat — all expressible without schema change.
- **CPA as channel:** a CPA who loves the workqueue brings 10–60 clients. The balanced two-sided
  ICP means we court both, but the *cheapest* acquisition path is likely CPA-led fan-out; the BGM
  (below) treats both funnels as co-equal but instruments which one converts cheaper.

## A6. Competitive context

| Competitor | Strength | Weakness we exploit | Our wedge |
|---|---|---|---|
| **QuickBooks Online** | CPA-trusted, deep, ubiquitous (US share leader) | Hostile to non-accountant owners; blank-ledger cold start; categorization is manual toil | Owner lens + Penny pre-categorization on the *same* real ledger a CPA trusts |
| **Xero** | Clean UX, strong outside US, good bank feeds | Smaller US footprint; still accountant-shaped; owner still must "do accounting" | Same wedge; QBO-first but Xero behind same adapter |
| **Bench** | Human-done books, owner-friendly | Opaque, slow, pricey, proprietary ledger, CPA locked out / export-only | Self-serve + AI labor, *transparent* ledger both sides share live |
| **Pilot** | High-touch, startup-favored | Expensive, service-desk-mediated, not real-time, owner doesn't own the loop | Real-time shared ledger, owner+CPA co-pilot, lower cost via AI |
| **Spreadsheets / shoebox** | Free, familiar | Not double-entry, no reconciliation, error-prone, no CPA trust | Real ledger with a spreadsheet-easy front door |

**Positioning one-liner:** *"The books your accountant trusts and you actually understand — one
shared, AI-run ledger, two lenses."*

**Integration sequencing (confirmed-with-partners action):** default **QBO first** on US market
share. *Before Phase 3 commits*, confirm against the committed design partners — if the signed
CPAs are predominantly Xero shops, flip the order; the adapter interface (§C7) makes this a
sequencing choice, not a rebuild.

## A7. Risks & assumptions

| # | Risk / assumption | Severity | Mitigation |
|---|---|---|---|
| R1 | **Ledger correctness bug** posts an imbalanced/wrong entry → CPA trust lost permanently | Critical | API balanced-entry invariant + deferred DB constraint + pgTAP tests; append-only; reversing-only corrections (§C6) |
| R2 | **Cross-tenant leak** via RLS bug (esp. recursion footgun, §C5) | Critical | `security definer` helpers, default-deny, no client writes to backbone, pgTAP isolation suite across all 4 relationship combos |
| R3 | **Solo capacity** vs full §1b scope → burnout / half-built surface shipped | High | Phase order de-risks; each phase dogfoodable; quality-gated launch; lean-path notes (§B11). Lean on Claude for fan-out, but typecheck after every fan-out (LEARNINGS #5) |
| R4 | **Prod-only infra** (single Supabase project today) | High | Stand up dev/staging/prod **in Phase 0** before any tenant data exists (ARCHITECTURE.md §9b); PITR on prod |
| R5 | **Plaid coverage/cost** in US pilot | Medium | Validate before Phase 4; aggregator behind adapter; manual import path means Plaid is not a hard dependency for go-live |
| R6 | **QBO/Xero sync conflicts** corrupt canonical books | Medium | Own ledger canonical; sync is import+export first, field-level conflict policy (§C7); round-trip tested on synthetic data |
| R7 | **Penny hallucination** mis-categorizes at scale | Medium | Propose→approve only; never auto-posts; learned rules are deterministic; per-org rate/model controls (§C8) |
| R8 | **No Docker/pg_dump in shell** → can't take local backups (LEARNINGS #13) | Medium | Rely on Supabase PITR + staging rehearsal; never blind-push (LEARNINGS #3) |
| R9 | Assumption: **one currency per org** for pilot | Low | `currency` stored from day one; multi-currency designed-for, not built (§C6, ARCHITECTURE.md §12.4) |
| R10 | Assumption: design partners will tolerate rough edges in exchange for the dual-lens win | Medium | Continuous dogfooding + design-partner feedback loop; the two existential gates never relax |

---
---

# PART B — Product Requirements Document (PRD)

Features are grouped by the §1b Definition of Done. Each feature carries **user stories +
acceptance criteria**. Role visibility is specified per feature in §B1. Flows in §B12, edge cases
in §B13, NFRs in §B10, out-of-scope in §B14.

## B1. The three lenses — what each role sees and can do

One app, one data model; the role on the **active-org membership** (or engagement) decides the
projection. Source of truth: ARCHITECTURE.md §4.

| Capability | Owner | Business member | CPA (`read_only`) | CPA (`full`) | firm_admin | Platform staff |
|---|---|---|---|---|---|---|
| See a business's books | ✅ own | ✅ own | ✅ assigned client | ✅ assigned client | ✅ all firm clients | 🔒 break-glass only |
| Post / correct ledger entries | ✅ | ✅ | ❌ | ✅ | ✅ (if assigned/full) | ❌ |
| Connect bank / integrations | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Approve Penny categorizations | ✅ | ✅ | ❌ (suggest only) | ✅ | ✅ | ❌ |
| Reconcile / close periods | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Invite CPA / transfer ownership | ✅ owner-only | ❌ | ❌ | ❌ | ❌ | ❌ |
| CPA workqueue across clients | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Assign CPAs to clients | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Org-switcher | ✅ (their businesses) | ✅ | ✅ (their clients) | ✅ | ✅ | n/a |
| Admin surfaces (support/analytics/Penny content) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

> **Owner cockpit vs CPA cockpit are the same data, different default view:** owner lands on
> "How's my business" (§B7); CPA lands on the workqueue (§B8). Either can navigate to the raw
> ledger; the *defaults and affordances* differ, the *data and RLS* do not.

> **CPA write-approval (resolves ARCHITECTURE.md §12.7):** `full` is unsupervised **by default**,
> but the data model carries an org setting `cpa_posts_require_approval` (default `false`). When on,
> a `full`-CPA's posts land in `status='pending_review'` and the owner approves them. The column +
> enum value ship in Phase 0/2; the UI toggle ships Phase 5. **No migration later.**

## B2. Identity, access & onboarding

### B2.1 Sign up & create org
- **US1 (owner-originated):** *As a new owner, I sign up, create a business org, and land in an
  empty-but-guided workspace.* AC: signup creates `auth.users` row + `organizations(type=business)`
  + `memberships(role=owner)` + `subscriptions(plan='pilot_free')`; org-switcher shows the new
  business; next-step prompts onboarding (connect bank / import history).
- **US2 (CPA-originated):** *As a CPA, I sign up and create my practice (firm), then add a client
  business and invite its owner.* AC: creates `organizations(type=firm)` +
  `memberships(role=firm_admin)`; "Add client" creates a `business` org + a `pending` engagement;
  solo CPA never forced to see the word "firm" (labeled "Your practice").
- **US3 (add another business):** *As an owner, I add a second business under the same login.* AC:
  `POST /orgs {type:business}` + owner membership; org-switcher lists both; **books never bleed**
  (separate `org_id`, separate RLS scope, separate ledger).

### B2.2 Invite & accept
- **US4:** *As an owner, I invite my CPA by email and choose `read_only` or `full` at invite time.*
  AC: one `invites` row (token, target org, intended engagement + access, expiry); email sent;
  accepting is the **only** path to access; on accept, engagement → `active` with the chosen access.
- **US5:** *As a firm_admin, I assign specific CPAs to specific clients.* AC: `client_assignments`
  row; an unassigned regular CPA sees nothing for that client; firm_admin sees all (§C4 predicate).
- **US6 (invite staff):** owner invites a business `member`; firm invites a `cpa`. AC: membership
  created on accept with the stated role.

### B2.3 Revoke, transfer, lifecycle
- **US7 (revoke):** *As an owner, I revoke a CPA's access and it's cut immediately.* AC: engagement
  `status='revoked'`, `revoked_at` set; RLS denies on next request; audit-logged.
- **US8 (last-owner protection):** AC: API refuses to remove/suspend the final `active` owner of a
  business (or final `firm_admin` of a firm); ownership must be transferred first.
- **US9 (ownership transfer):** explicit flow; never an implicit side effect of leaving.
- **US10 (export/erasure):** per-org data export + erasure path (GDPR; LEARNINGS #8). AC: revoke
  cuts access; erasure soft-deletes (archive) with a separate true-erasure path; ledger history the
  user authored stays attributed but inaccessible to them.

**Acceptance gate for B2:** the pgTAP suite proves user A cannot read user B's org under all four
relationship combinations (member-of-own, engaged+assigned, engaged+unassigned, firm_admin) —
isolation is *tested*, not assumed (ARCHITECTURE.md §4.5).

## B3. History import (J1 — launch scope, not deferred)

Three paths, all landing in the same canonical ledger with provenance; previewable & reversible
before commit.

- **US11 (API pull):** *As an owner/CPA, I connect QBO/Xero and import chart of accounts + history.*
  AC: connector pulls accounts + transactions into an `import_batch` (status `preview`); user sees a
  diff; **commit** posts immutable entries with `source='qbo:<id>'`; **discard** drops the batch.
- **US12 (manual upload):** *I upload a CSV / bank statement / trial balance and map columns.* AC:
  guided importer; Penny assists column mapping + categorization suggestions; preview before commit;
  `source='import:<batch_id>'`.
- **US13 (opening balances):** *My business has no exportable history, so I set opening balances at
  a cutover date.* AC: a dated trial-balance journal entry per account at the cutover date; balance
  sheet correct from go-live.
- **US14 (reversible batch):** AC: an uncommitted batch is fully discardable; a committed batch is
  immutable, corrected only via reversing entries (consistency with §B4).

**Acceptance gate for B3 (mirrors ARCHITECTURE.md Phase 3 exit):** a real business imports existing
books and the **balance sheet is correct at the cutover date to the cent.**

## B4. Ledger core (J5, J8 — the CPA's trust foundation)

- **US15 (chart of accounts):** standard COA seeded per org (configurable); accounts typed
  (asset/liability/equity/income/expense). AC: account create/rename/archive; never hard-delete an
  account with postings.
- **US16 (post a balanced entry):** *As an authorized user, I post a journal entry and it's rejected
  unless debits = credits per currency.* AC: API enforces balance + double-checked by deferred DB
  constraint/trigger; money in **integer minor units** + currency, never float; idempotency key
  required.
- **US17 (immutability + corrections):** AC: no UPDATE/DELETE on posted entries; a correction is a
  **reversing entry** referencing the original.
- **US18 (periods & close):** *As a CPA, I close a month/year and the books lock.* AC: posting into a
  `closed` period is refused; corrections to a closed period go to the next open period as
  adjustments; `fiscal_year_start` configurable (default Jan).
- **US19 (provenance):** every entry carries `source` + `source_ref`
  (`manual`/`plaid:<id>`/`import:<batch>`/`qbo:<id>`).

**Acceptance gate for B4:** books always balance; closed periods are locked; zero float anywhere in
money math.

## B5. Penny categorization, learned rules & reconciliation (J2, J7, J9)

- **US20 (propose→approve):** *As an owner, incoming transactions arrive with a suggested category I
  tap to confirm.* AC: Penny writes a **proposal**, never posts; one-tap confirm posts the entry;
  edit-then-confirm is captured as a correction signal.
- **US21 (learned rules):** *As a CPA, when I recategorize "Stripe payout" once, it stops asking.*
  AC: a confirmed/edited categorization can create/update a `categorization_rules` row (deterministic
  match → account); future matching txns are pre-applied; rules are per-org, viewable & editable.
- **US22 (reconciliation):** *As a CPA, I reconcile an account to its statement.* AC: a
  `reconciliations` row (statement date + balance); match raw `bank_txns` ↔ posted entries until
  cleared balance = statement balance; status `in_progress`→`reconciled`; a reconciled period is a
  trust signal surfaced in the workqueue.

**Acceptance gate for B5 (mirrors Phase 4 exit):** live txns arrive pre-categorized; an account
reconciles to a real statement; a learned rule stops a repeat fix.

## B6. Receipt capture (J3 — owner delight, PWA)

- **US23:** *As an owner, I snap a receipt on my phone and it files against the right transaction.*
  AC: **PWA** camera upload to Supabase Storage; `documents` row with `org_id` + link to a
  `journal_entry` (or unmatched queue); Penny suggests the matching txn; works on mobile web, no app
  store. **(Resolves ARCHITECTURE.md §12.6 → PWA.)**

## B7. Owner cockpit — "How's my business?" (J4)

- **US24:** *As an owner, I open the app and see cash position, P&L, and "what needs attention" in
  plain language.* AC: derived from the ledger on the fly (P&L / balance sheet / cash flow, §C6.5);
  plain-language summary (Penny) with a "so-what" takeaway; no accounting jargon required;
  "what needs attention" = uncategorized count + unmatched receipts + unreconciled items.

## B8. CPA workqueue (J6 — the CPA's home)

- **US25:** *As a CPA, I see one ranked queue across all my clients: what needs review,
  uncategorized, unreconciled.* AC: aggregates across all engaged+assigned clients; ranked by
  urgency (e.g. close deadline, volume, age); each item deep-links into the client's books; respects
  `read_only` vs `full` (read_only sees the queue but actions that mutate are disabled / become
  suggestions).
- **US26 (per-client scope):** AC: a regular CPA sees only assigned clients; firm_admin sees all;
  nothing leaks across clients (§C4).

## B9. Integrations, sync & export (J10 — never trapped)

- **US27 (bank feed):** Plaid link → raw `bank_txns` ingested, deduped on provider txn id.
- **US28 (QBO/Xero round-trip):** import (US11) + export back; field-level conflict policy
  (canonical wins on categorization; external wins on raw bank reality).
- **US29 (export):** *As a CPA, I export clean books (CSV/standard format) anytime.* AC: full ledger
  + reports exportable; no lock-in.

## B10. Non-functional requirements (J12 — trust is the product)

| Dimension | Requirement |
|---|---|
| **Correctness** | Money = integer minor units + currency, never float. Every entry balanced (API + deferred DB constraint). Append-only; reversing-only corrections. **Zero imbalance incidents is a launch gate.** |
| **Isolation** | RLS default-deny on every tenant table; `security definer` helper predicates; no client writes to backbone/ledger; pgTAP isolation suite. **Zero cross-tenant exposure is a launch gate.** |
| **Performance** | Owner cockpit + workqueue load < 2s p95 at pilot volume; ledger post < 500ms p95; reports computed on the fly, promoted to materialized views only if needed (don't pre-optimize empty tables — LEARNINGS #12). |
| **Security** | Secrets server-side only (Plaid/QBO/Anthropic tokens in Vault/Edge secrets); break-glass admin access audited; append-only audit log. |
| **Accessibility** | WCAG 2.1 AA: keyboard nav, focus states, contrast via design-system tokens, screen-reader labels on financial figures. |
| **Responsive** | Full width-ladder compliance per [apps/admin/RESPONSIVE.md](apps/admin/RESPONSIVE.md): 320→1920; no horizontal scroll at any width; tap targets ≥44px; inputs ≥16px (iOS no-zoom); fluid-first. Owner lens is **mobile-first** (receipt capture). |
| **Design system** | No inline hex / magic px / one-off font sizes — `packages/design-system/tokens.css` only (CLAUDE.md guardrail). |
| **Recoverability** | PITR on prod; dev/staging/prod separation; no un-rehearsed schema change touches prod (ARCHITECTURE.md §9b). |
| **Observability** | Verify every deploy from the system itself (`wrangler tail`/`supabase` re-query — LEARNINGS #5); typecheck after every fan-out edit. |

## B11. Lean path for a solo builder (scope is fixed; pace is the lever)

The §1b scope does not shrink, but the **build order minimizes rework risk** and lets Claude
fan-out safely:
1. **Phase 0 is non-negotiable and first** — isolation + envs + pgTAP. Every later phase rides on it;
   a leak found in Phase 5 is catastrophic, in Phase 0 it's a test failure.
2. **Generate `database.types.ts` from the live schema** after every migration (LEARNINGS #11) —
   it's the cheapest drift catch a solo dev has.
3. **Reuse, don't rebuild UI:** seed owner/CPA lenses from `apps/demo/businessowner` + `apps/demo/cpa`
   (ARCHITECTURE.md §3); fold `apps/admin` in as the admin lens.
4. **Penny gateway converges last** (Phase 4) — the three existing proxies keep working until then.
5. **Each phase is dogfoodable on synthetic tenants** before the next — find ledger/isolation bugs
   on fake money.

## B12. Key user flows

```
FLOW 1 — Owner onboarding (mobile-first)
  signup → create business org → "Connect your bank" (Plaid) OR "Import my books" (QBO/CSV/opening)
  → first transactions arrive pre-categorized → tap to confirm → cockpit shows "How's my business"

FLOW 2 — CPA onboarding
  signup → create practice (firm) → add client business → invite owner (choose read_only/full)
  → owner accepts → engagement active → assign self/staff → client appears in workqueue

FLOW 3 — Invite & accept (either direction)
  originator issues invite (email + token + intended role/engagement+access)
  → invitee signs up / logs in → accepts → membership created OR engagement activated → RLS opens

FLOW 4 — Connect bank
  owner/full-CPA → Plaid Link token → consent → raw bank_txns ingest (deduped) → categorization queue

FLOW 5 — Categorize → approve
  Penny proposes category (rule or model) → human confirms/edits → balanced entry posts
  → edit becomes a learned-rule candidate

FLOW 6 — Reconcile
  CPA picks account + statement date/balance → match bank_txns ↔ entries → cleared = statement → reconciled

FLOW 7 — Period close
  CPA reviews workqueue clean → close period → posting into it refused → corrections go to next open period

FLOW 8 — History import
  connect QBO/Xero OR upload CSV/statement/trial-balance OR set opening balances
  → preview batch (diff) → commit (immutable, provenance) OR discard

FLOW 9 — CPA workqueue triage
  open workqueue (all assigned clients, ranked) → pick item → deep-link into client books → act → return
```

## B13. Edge cases (must be handled, not discovered in prod)

- **Same person, both roles:** owner of business A *and* CPA at firm B → org-switcher must scope
  every query; role comes from active-org membership/engagement, never the user (ARCHITECTURE.md §4).
- **Two firms on one business:** distinct engagement rows; each firm's CPAs see only via their own
  engagement; revoking one doesn't touch the other.
- **CPA assigned then unassigned mid-period:** access cut immediately; entries they authored stay
  attributed.
- **Duplicate bank txn / re-import:** dedupe on provider txn id; re-running an import batch must not
  double-post (idempotency).
- **Replay of a ledger POST** (network retry): idempotency key returns the original result, no
  double entry.
- **Correction to a closed period:** refused into the closed period; routed to next open period as
  an adjustment.
- **Last owner tries to leave:** refused; must transfer first.
- **Multi-currency txn in a single-currency-pilot org:** store currency; flag mismatch; out-of-scope
  to *transact* multi-currency in v1 but never silently coerce.
- **Penny proposes into a closed period / archived account:** proposal blocked with a clear reason.
- **Revoked CPA's in-flight request:** RLS denies on the next request (no grace window).

## B14. Explicitly OUT of v1 scope

- Native mobile app (PWA only).
- Payroll, invoicing/AR, bill-pay/AP automation, inventory (read/import only if it arrives via
  QBO/Xero; not first-class).
- Multi-currency *transacting* (currency stored; FX gain/loss accounts designed-for, not built).
- Tax filing / tax-prep workflows.
- Stripe billing live (built behind `provider`, off during pilot).
- Cross-business roll-up dashboards ("all my companies") — explicit future aggregate, not default.
- Real-time bidirectional QBO/Xero sync (v1 = import + export with field-level conflict policy).
- SOC2 certification (controls designed in; certification is post-pilot).
- Non-US data residency (region concept exists; only US bucket live).

---
---

# PART C — Hardened technical architecture

Builds on ARCHITECTURE.md §2–§10. This part **completes** the data model beyond the backbone, gives
the full RLS set with the recursion-safe pattern, the API contract, the integration adapters, the
Penny gateway, and ops. SQL is illustrative-precise, not final migration text (migrations are the
only schema source of truth — LEARNINGS #2; Phase 0 writes the real ones, reviewed, in a worktree).

## C1. Module map

```
app.founderfirst.one (authed SPA)  ── owner lens · cpa lens · /admin lens
        │ (HTTPS, scoped JWT)
        ├── reads ───────────────▶ Supabase Postgres (RLS-enforced, scoped token)
        └── money mutations ─────▶ Edge Functions (typed write-path, service role)
                                        ├── ledger posting (balanced + idempotent)
                                        ├── invites / engagements / assignments
                                        ├── Plaid / QBO / Xero adapters (secrets server-side)
                                        ├── import batches (preview→commit)
                                        └── Penny gateway (scoped-token context, propose-only)
        Supabase Storage / R2  ── receipts & invoices (documents metadata in Postgres)
        Anthropic (Claude)     ── Penny model calls (server-side only)
```

## C2. Complete data model

Backbone (`organizations`, `memberships`, `engagements`, `client_assignments`, `platform_staff`,
`invites`, `subscriptions`) is defined in ARCHITECTURE.md §4 & §6b — **not repeated here**. Below is
the full set *beyond* the backbone. Every tenant table carries `org_id` and is RLS-protected
(`can_access_org` read / `can_write_org` write).

```sql
-- ── org-level accounting settings (one row per business org) ──────────────
create table org_accounting_settings (
  org_id                     uuid primary key references organizations(id) on delete cascade,
  fiscal_year_start_month    int not null default 1,        -- 1=Jan
  home_currency              char(3) not null default 'USD',
  cutover_date               date,                          -- go-live date for imported books
  cpa_posts_require_approval boolean not null default false, -- resolves §12.7; off by default
  created_at                 timestamptz not null default now()
);

-- ── chart of accounts ────────────────────────────────────────────────────
create type account_type as enum ('asset','liability','equity','income','expense');
create table ledger_accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  code        text,                       -- optional numbering
  name        text not null,
  type        account_type not null,
  parent_id   uuid references ledger_accounts(id),
  currency    char(3) not null default 'USD',
  is_archived boolean not null default false,
  source      text,                       -- 'manual' | 'qbo:<id>' | 'xero:<id>' | 'import:<batch>'
  source_ref  text,
  created_at  timestamptz not null default now(),
  unique (org_id, code)
);

-- ── accounting periods ───────────────────────────────────────────────────
create type period_status as enum ('open','closed');
create table accounting_periods (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  status        period_status not null default 'open',
  closed_by     uuid references auth.users(id),
  closed_at     timestamptz,
  unique (org_id, period_start, period_end)
);

-- ── journal entries (immutable header) ───────────────────────────────────
create type entry_status as enum ('posted','pending_review','reversed');
create table journal_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  entry_date      date not null,
  period_id       uuid not null references accounting_periods(id),
  memo            text,
  status          entry_status not null default 'posted',  -- pending_review when cpa approval gate on
  source          text not null,          -- 'manual'|'plaid:<txn>'|'import:<batch>'|'qbo:<id>'|'xero:<id>'
  source_ref      text,
  reverses_id     uuid references journal_entries(id),     -- set on reversing corrections
  idempotency_key text not null,
  posted_by       uuid not null references auth.users(id), -- human or service-on-behalf
  approved_by     uuid references auth.users(id),          -- owner approval when gate on
  created_at      timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

-- ── journal lines (debit/credit rows) ────────────────────────────────────
create table journal_lines (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references journal_entries(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade, -- denormalized for RLS
  account_id    uuid not null references ledger_accounts(id),
  -- signed integer minor units; sum per entry per currency MUST be 0
  amount_minor  bigint not null,
  currency      char(3) not null default 'USD',
  side          char(1) not null check (side in ('D','C')),
  memo          text
);
-- balance invariant double-checked by a DEFERRED constraint trigger:
--   per (entry_id, currency): sum(amount_minor where side='D') = sum(amount_minor where side='C')

-- ── bank accounts & raw transactions (ingest, pre-ledger) ────────────────
create table bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  provider        text not null,          -- 'plaid' | 'manual'
  provider_ref    text,                   -- plaid account id (token stored in Vault, not here)
  name            text not null,
  mask            text,
  currency        char(3) not null default 'USD',
  ledger_account_id uuid references ledger_accounts(id),  -- the GL account this bank maps to
  created_at      timestamptz not null default now()
);
create table bank_txns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  bank_account_id uuid not null references bank_accounts(id),
  provider_txn_id text,                   -- dedupe key for Plaid ingest
  txn_date        date not null,
  amount_minor    bigint not null,
  currency        char(3) not null default 'USD',
  raw_description text,
  status          text not null default 'unposted', -- unposted | posted | ignored
  posted_entry_id uuid references journal_entries(id),
  created_at      timestamptz not null default now(),
  unique (org_id, bank_account_id, provider_txn_id)
);

-- ── reconciliations ──────────────────────────────────────────────────────
create type recon_status as enum ('in_progress','reconciled');
create table reconciliations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  bank_account_id   uuid not null references bank_accounts(id),
  statement_date    date not null,
  statement_balance_minor bigint not null,
  status            recon_status not null default 'in_progress',
  reconciled_by     uuid references auth.users(id),
  reconciled_at     timestamptz,
  created_at        timestamptz not null default now()
);
create table reconciliation_items (
  reconciliation_id uuid not null references reconciliations(id) on delete cascade,
  org_id            uuid not null references organizations(id) on delete cascade,
  bank_txn_id       uuid references bank_txns(id),
  journal_line_id   uuid references journal_lines(id),
  primary key (reconciliation_id, bank_txn_id, journal_line_id)
);

-- ── documents (receipts/invoices; files in Storage) ──────────────────────
create table documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  storage_path  text not null,            -- Supabase Storage object key
  kind          text not null default 'receipt', -- receipt | invoice | statement
  entry_id      uuid references journal_entries(id),  -- null = unmatched queue
  uploaded_by   uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

-- ── Penny-learned categorization rules ───────────────────────────────────
create table categorization_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  match_type    text not null,            -- 'description_contains' | 'exact' | 'counterparty'
  match_value   text not null,
  account_id    uuid not null references ledger_accounts(id),
  created_by     uuid references auth.users(id),  -- null = Penny-suggested, human-confirmed
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── import batches (preview → commit, reversible before commit) ───────────
create type batch_status as enum ('preview','committed','discarded');
create table import_batches (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  source        text not null,            -- 'qbo' | 'xero' | 'csv' | 'statement' | 'opening_balance'
  status        batch_status not null default 'preview',
  summary       jsonb,                    -- counts, date range, account map for the preview diff
  created_by    uuid not null references auth.users(id),
  committed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ── integration connections (tokens in Vault, NOT here) ──────────────────
create table integration_connections (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  provider      text not null,            -- 'plaid' | 'qbo' | 'xero'
  status        text not null default 'active',
  vault_secret_ref text not null,         -- pointer into Supabase Vault; never the token itself
  external_ref  text,                     -- realmId / tenantId
  connected_by  uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

-- ── audit log (append-only) ──────────────────────────────────────────────
create table audit_log (
  id            bigint generated always as identity primary key,
  org_id        uuid,                     -- null for platform-level events
  actor_id      uuid references auth.users(id),
  action        text not null,            -- 'engagement.grant'|'ledger.post'|'period.close'|'breakglass.read'...
  target_ref    text,
  detail        jsonb,
  created_at    timestamptz not null default now()
);
```

> **`org_id` denormalized onto `journal_lines` and `reconciliation_items`** so RLS predicates are a
> single-column check, never a join back through the parent (cheaper policies, no recursion risk).

## C3. The authorization predicate (from ARCHITECTURE.md §4.3 — reused everywhere)

`has_membership(org)`, `has_engagement_access(org)`, `can_access_org(org)` (read), `can_write_org(org)`
(write) are defined in ARCHITECTURE.md §4.3 as `security definer` SQL helpers. **All policies below
call these helpers** — they never inline a membership/engagement subquery (that's the recursion
footgun, §C5). The write-path API additionally calls `can_write_org(org_id)` before any mutation,
and checks `org_accounting_settings.cpa_posts_require_approval` to decide `posted` vs
`pending_review`.

## C4. Full RLS policy set

Pattern for **every tenant-scoped table** (reads isolated by DB; writes funnel through the
service-role API):

```sql
alter table <T> enable row level security;

-- READ: any user who can access the org
create policy <T>_select on <T>
  for select using ( can_access_org(org_id) );

-- WRITE: denied to clients by default — all money/backbone mutations go through the API (service role)
create policy <T>_no_client_write on <T>
  for all using ( false ) with check ( false );
```

Applied to: `ledger_accounts`, `accounting_periods`, `journal_entries`, `journal_lines`,
`bank_accounts`, `bank_txns`, `reconciliations`, `reconciliation_items`, `documents`,
`categorization_rules`, `import_batches`, `integration_connections`, `org_accounting_settings`,
`audit_log` (audit is **select-only** even for the API; inserts via a dedicated definer fn).

**Backbone tables — the recursion-safe rules (ARCHITECTURE.md §4.5):**

```sql
-- memberships: a user sees their OWN memberships; admins see their org's (via definer helper) — NO self-join
create policy memberships_select_self on memberships
  for select using ( user_id = auth.uid() or has_membership(org_id) );
create policy memberships_no_client_write on memberships for all using (false) with check (false);

-- engagements: visible to either side via definer helpers, never a direct self-join
create policy engagements_select on engagements
  for select using ( has_membership(firm_org_id) or has_membership(client_org_id) );
create policy engagements_no_client_write on engagements for all using (false) with check (false);

-- client_assignments: firm members read; only firm_admin writes (and writes go via API anyway)
create policy client_assignments_select on client_assignments
  for select using ( has_membership((select firm_org_id from engagements e where e.id = engagement_id)) );
create policy client_assignments_no_client_write on client_assignments for all using (false) with check (false);
```

> **Why this can't recurse:** the helper functions are `security definer` and bypass RLS *inside*
> themselves, so a policy that *calls* `has_membership()` never triggers `memberships`' own policy.
> The only direct predicates (`user_id = auth.uid()`, scalar subselect on `engagements`) touch a
> single row by PK and don't re-enter the same table's policy. **All backbone writes go through the
> API**, so client-side we only ever `select` — eliminating the remaining recursion surface.

**Storage:** receipt/invoice objects are pathed `org/<org_id>/...`; a Storage RLS policy gates
`select`/`insert` on `can_access_org`/`can_write_org` of the path's `org_id`.

## C5. RLS test strategy (Phase 0 gate)

pgTAP suite asserts, for the **four relationship combinations**, that user A cannot read user B's org:
1. member-of-own-org (positive: can read own; negative: can't read another)
2. engaged + assigned CPA (positive on assigned client only)
3. engaged + **un**assigned CPA (negative on that client)
4. firm_admin (positive on all firm clients; negative on non-client orgs)

Plus: revoked engagement → immediate denial; closed-period write → refused; idempotency replay →
single entry; balance violation → rejected. **Isolation and correctness are tested, not assumed.**

## C6. Ledger invariants (hardened from ARCHITECTURE.md §6.1)

1. **Integer minor units + currency, never float.** `amount_minor bigint`. Presentation formats at
   the edge only.
2. **Balanced:** per (entry, currency), Σ debit = Σ credit. Enforced in the posting fn **and** a
   deferred constraint trigger (belt + suspenders).
3. **Append-only:** no UPDATE/DELETE on `journal_entries`/`journal_lines`. Corrections = reversing
   entries (`reverses_id`).
4. **Idempotency:** `unique(org_id, idempotency_key)`; replay returns original. Plaid ingest dedupes
   on `provider_txn_id`.
5. **Provenance:** `source` + `source_ref` on every entry.
6. **Period lock:** posting fn refuses a `closed` period.
7. **Approval gate:** if `cpa_posts_require_approval`, a `full`-CPA post lands `pending_review`;
   owner approval flips to `posted` (`approved_by` set). Reports count only `posted`.

**Reports (§6.5):** P&L / balance sheet / cash flow derived on the fly from `posted` entries;
promote to materialized views only when a real query plan shows the need (LEARNINGS #12 — don't
optimize empty tables).

## C7. Integration adapters

All adapters sit **behind one interface**; the canonical ledger never imports a provider type.
Tokens live in **Supabase Vault**, referenced by `integration_connections.vault_secret_ref` — never
in app tables, never client-side.

```
interface LedgerSource {
  connect(orgId, authCode): ConnectionRef          // OAuth handshake → Vault
  pullAccounts(conn): ChartOfAccounts              // → import_batch (preview)
  pullTransactions(conn, since): RawTxn[]           // → bank_txns / import preview
  pushEntries(conn, entries): SyncResult            // export / round-trip
  webhook(payload): IngestEvent[]                    // Plaid/QBO push
}
```

- **Plaid** (`provider='plaid'`): Link token → consent → `bank_txns` ingest, deduped on
  `provider_txn_id`; webhook for new txns. *Validate coverage/cost before Phase 4 (R5); manual
  import means Plaid is not a hard go-live dependency.*
- **QBO** (default first) / **Xero** (second, same interface): OAuth → import COA + history into an
  `import_batch`; export entries back. **Field-level conflict policy:** canonical wins on
  categorization; external wins on raw bank reality. v1 = import + export, **not** real-time
  bidirectional sync (§B14).
- **Confirm QBO-vs-Xero order against committed design partners before Phase 3** (§A6).

## C8. Penny AI gateway (hardened from ARCHITECTURE.md §7)

- **Server-authoritative:** caller identity, active org, role come from the **verified JWT**, never
  the browser.
- **Scoped-token context, not service role:** Penny reads context using the caller's **own scoped
  token** (RLS-enforced) — the model can only ever see what the user already can. **Penny is not a
  privilege-escalation path.**
- **Propose-only:** Penny writes proposals (categorizations, draft entries, plain-language summaries)
  a human approves. It **never silently mutates the ledger**.
- **Learned rules are deterministic:** confirmed categorizations become `categorization_rules` rows
  applied without a model call — cheaper and auditable.
- **Cost controls (resolves §12.8):** per-org rate limits + model pinning before opening the propose
  loop to real volume (Phase 4). Pin a current model; handle Workers-AI-style gotchas if any model
  runs there (string-vs-object returns, control-char JSON repair — LEARNINGS #13). For Penny's core
  reasoning, default to the latest Claude (e.g. Opus/Sonnet 4.x) server-side.
- **Convergence:** the three existing proxies (`penny-api`, bubble worker, compose-server) converge
  onto this one authenticated gateway over time; the public marketing bubble stays anonymous and
  separate. **Retire the Mac compose-server / local-Ollama dependency** (LEARNINGS #13 — dev machine
  is not prod infra).

## C9. Environments & ops (from ARCHITECTURE.md §9b — hardened)

- **Three Supabase projects: dev / staging / prod.** Stand up staging+dev **in Phase 0**, before any
  tenant data exists (today there's only prod — a LEARNINGS-class risk, R4).
- **PITR on prod.** Financial data must be restorable. (Local backups may be impossible in this
  shell — LEARNINGS #13 — so PITR + staging rehearsal is the safety net, not `pg_dump`.)
- **Migrations:** `supabase/migrations/` is the only schema source of truth (LEARNINGS #2). Never
  reuse a timestamp (LEARNINGS #11 — duplicates silently skip). `db push` deploys **all** pending —
  `migration list` first, never blind-push (LEARNINGS #3). Out-of-order pending → `--include-all`.
- **`database.types.ts` generated from the live schema** after every migration; hand-written row
  types drift silently (LEARNINGS #11).
- **Audit log append-only**, covering: engagement grant/revoke, access-level change, assignment
  change, period close, every ledger post, every break-glass platform-admin read.
- **Verify every deploy from the system itself**; typecheck after every fan-out edit (LEARNINGS #5).
- **One worktree per task**, commit small & atomic (LEARNINGS #1); don't commit without explicit ask
  (CLAUDE.md).

## C10. API contract (complete first cut)

All endpoints are Edge Functions on the typed write-path. Every mutating endpoint: (1) verifies JWT
→ derives `auth.uid()`; (2) calls the relevant authz helper; (3) for money, requires
`idempotency_key`; (4) writes an `audit_log` row. Reads may go direct to Supabase under RLS where
convenient.

| Method & path | Purpose | Authz check | Idempotent | Notes |
|---|---|---|---|---|
| `POST /orgs` | create business or firm | authed user | — | + owner/firm_admin membership + `pilot_free` sub |
| `POST /invites` | issue invite (membership or engagement) | `has_membership(target)` owner/firm_admin | — | token, intended role/engagement+access, expiry |
| `POST /invites/:token/accept` | accept → membership / activate engagement | valid token + authed | yes (token) | only path to access |
| `POST /engagements/:id/revoke` | revoke access | owner of client OR firm_admin | — | sets `revoked`, RLS cuts immediately |
| `POST /engagements/:id/assign` | assign CPA to client | `firm_admin` of firm | — | `client_assignments` row |
| `DELETE /engagements/:id/assign/:userId` | unassign CPA | `firm_admin` | — | access cut immediately |
| `POST /orgs/:id/ownership/transfer` | transfer ownership | current owner | — | last-owner protection enforced |
| `GET /ledger/accounts` | chart of accounts | `can_access_org` (RLS) | — | direct Supabase read OK |
| `POST /ledger/accounts` | create/edit account | `can_write_org` | — | no hard-delete with postings |
| `POST /ledger/entries` | post balanced journal entry | `can_write_org` | **yes** | balance + period-open + idempotency; gate→`pending_review` |
| `POST /ledger/entries/:id/reverse` | reversing correction | `can_write_org` | **yes** | sets `reverses_id` |
| `POST /ledger/entries/:id/approve` | owner approves pending CPA post | owner of org | yes | only when approval gate on |
| `POST /periods/:id/close` | close & lock period | `can_write_org` (CPA full) | — | future posts into it refused |
| `POST /bank-txns/:id/categorize` | post a raw bank txn to ledger | `can_write_org` | yes | applies rule or Penny proposal |
| `POST /reconciliations` | start reconciliation | `can_write_org` | — | statement date + balance |
| `POST /reconciliations/:id/match` | match txn ↔ entry | `can_write_org` | yes | cleared = statement → reconciled |
| `POST /imports` | start import batch (preview) | `can_write_org` | — | qbo/xero/csv/statement/opening |
| `POST /imports/:id/commit` | commit batch (immutable) | `can_write_org` | yes | provenance stamped |
| `POST /imports/:id/discard` | discard preview batch | `can_write_org` | — | only while `preview` |
| `POST /documents` | upload receipt metadata | `can_write_org` | — | file → Storage; link to entry or unmatched |
| `POST /rules` / `PATCH /rules/:id` | create/edit categorization rule | `can_write_org` | — | also auto-created from confirms |
| `POST /integrations/plaid/link` | Plaid Link token | `can_write_org` | — | token → Vault |
| `POST /integrations/plaid/webhook` | ingest new bank txns | webhook signature | yes (provider id) | dedupe |
| `POST /integrations/qbo/connect` / `/xero/connect` | OAuth handshake | `can_write_org` | — | token → Vault |
| `POST /sync/qbo` / `/sync/xero` | pull/push round-trip | `can_write_org` | yes | field-level conflict policy |
| `GET /reports/pl` `/balance-sheet` `/cash-flow` | derived reports | `can_access_org` | — | computed from `posted` entries |
| `GET /workqueue` | CPA cross-client ranked queue | engaged+assigned | — | aggregates assigned clients |
| `POST /penny/message` | authed AI turn (server builds context) | `can_access_org`; scoped token | — | propose-only |
| `POST /admin/breakglass/:orgId` | platform-staff scoped read | `platform_staff` | — | audited, time-boxed |

**Standard error contract:** `403` (authz fail), `409` (idempotency replay → returns original; or
closed-period / last-owner violations), `422` (unbalanced entry / validation), `404` (RLS-invisible
rows look like not-found, never leaking existence).

## C11. Frontend topology

- New unified authed SPA at `apps/app` (ARCHITECTURE.md §10), seeded from
  `apps/demo/businessowner` (owner lens) + `apps/demo/cpa` (CPA lens); `apps/admin` folds in as the
  admin lens (or a route group).
- **Org-switcher** holds active-org in session; every query/write scoped to it.
- Reads via Supabase client (scoped JWT, RLS); money mutations via Edge Function endpoints only.
- Design-system tokens only; full responsive width-ladder compliance; owner lens mobile-first.

## C12. Open risks carried forward (with this doc's resolutions)

| ARCHITECTURE.md §12 item | Resolution in this doc |
|---|---|
| Edge Functions vs dedicated TS service | **Edge Functions first**; tripwire on latency/complexity → graduate hot paths to Hono/Cloudflare. Unchanged. |
| QBO vs Xero first | **QBO first** by US share; **confirm against committed design partners before Phase 3** (§A6). |
| Plaid coverage/cost | Validate before Phase 4 (R5); manual import keeps Plaid off the critical path. |
| Multi-currency | Store `currency` day one; **one currency per org for pilot**; FX accounts designed-for, not built. |
| App hosting | Static SPA on Pages (auth+data behind API); decide edge-auth at Phase 1. |
| Mobile receipt capture | **PWA** (camera→Storage). Resolved. |
| CPA write approval | **`full` = unsupervised by default**; `cpa_posts_require_approval` setting + `pending_review` status ship in schema Phase 0/2, UI toggle Phase 5. **No later migration.** |
| Penny cost controls | Per-org rate limits + model pinning before Phase 4 propose loop. Resolved. |

---
---

# PART D — Traceability & gap analysis

Every §1b delight item → PRD feature → data model + API + RLS that supports it. **Gaps flagged
explicitly.**

| §1b Definition-of-Done item | PRD feature | Data model | API | RLS / authz | Status |
|---|---|---|---|---|---|
| Owner: connect bank, txns flow in pre-categorized | B5 (US20), B9 (US27) | `bank_accounts`, `bank_txns`, `categorization_rules`, `journal_*` | `POST /integrations/plaid/link`, `/webhook`, `/bank-txns/:id/categorize` | `can_write_org`; RLS on all | ✅ supported |
| Owner: snap a receipt, files against the txn | B6 (US23) | `documents` (+ Storage) | `POST /documents` | `can_write_org`; Storage path RLS | ✅ supported |
| Owner: "how's my business?" in plain language | B7 (US24) | derived from `journal_*` | `GET /reports/*`, `POST /penny/message` | `can_access_org`; Penny scoped-token | ✅ supported |
| Owner: existing books come in cleanly | B3 (US11–14) | `import_batches`, `ledger_accounts`, `journal_*` | `POST /imports`, `/commit`, `/discard` | `can_write_org` | ✅ supported |
| CPA: real double-entry ledger, balanced/immutable/auditable | B4 (US15–19) | `journal_entries`/`journal_lines` (append-only, deferred balance trigger), `audit_log` | `POST /ledger/entries`, `/reverse` | `can_write_org`; append-only | ✅ supported |
| CPA: client workqueue across businesses, ranked | B8 (US25–26) | aggregate over `journal_*`, `bank_txns`, `reconciliations` per engaged client | `GET /workqueue` | engaged+assigned predicate | ✅ supported |
| CPA: bank reconciliation that ties to statements | B5 (US22) | `reconciliations`, `reconciliation_items` | `POST /reconciliations`, `/match` | `can_write_org` | ✅ supported |
| CPA: period close/lock | B4 (US18) | `accounting_periods` (status) | `POST /periods/:id/close` | `can_write_org` (full) | ✅ supported |
| CPA: Penny learns corrections (rules) | B5 (US21) | `categorization_rules` | `POST /rules`, auto-create on confirm | `can_write_org` | ✅ supported |
| CPA: clean export / round-trip to QBO/Xero | B9 (US28–29) | `integration_connections`, `import_batches` | `POST /sync/qbo`/`xero`, export | `can_write_org`; tokens in Vault | ✅ supported |
| CPA: per-client access (read-only vs full), no leak | B1, B2 | `engagements.access`, `client_assignments` | `/engagements/:id/revoke`/`assign` | `can_write_org` gated on `access='full'`; pgTAP | ✅ supported |
| Both: correct to the cent | B10 NFR | integer minor units, deferred balance trigger | `422` on imbalance | — | ✅ supported (gate) |
| Both: isolated | B10 NFR | `org_id` everywhere | default-deny RLS | `security definer` helpers, pgTAP | ✅ supported (gate) |
| Both: recoverable | B10 NFR, C9 | append-only + PITR | — | — | ✅ supported |
| Both: fast | B10 NFR | denormalized `org_id` on lines; on-the-fly reports | — | — | ⚠️ verify at volume (R-perf); materialize only if plan shows need |

### Gaps & watch-items flagged (none block Phase 0, all named)

1. **Cross-business roll-up** ("all my companies") is **out of v1** (§B14) — confirm no committed
   partner needs it as a launch requirement. *Low risk; explicit future aggregate.*
2. **Real-time bidirectional QBO/Xero sync** is out of v1 (import+export only). If a partner runs
   QBO *in parallel* during pilot, field-level conflict policy must be exercised early on synthetic
   data (R6).
3. **Performance at volume** is the only ⚠️ in the matrix — unproven until real pilot data lands.
   Plan: measure, then materialize hot reports; do **not** pre-optimize (LEARNINGS #12).
4. **Multi-currency transacting** unsupported in v1 — currency is stored, so no migration needed
   later, but a partner with genuine FX needs is a scope conversation, not a quiet coercion (§B13).
5. **Penny propose-loop cost** unproven until Phase 4 — rate limits + model pinning are the
   mitigation; instrument per-org cost from the first real proposals.

**Conclusion:** the hardened data model + RLS + API in Part C support **every §1b delight item** for
both personas. The only open verification item is performance-at-volume (provable only with pilot
data); everything else is structurally covered. No architectural gap blocks Phase 0 — the next
deliverable remains the **Phase 0 Supabase migration (orgs/memberships/engagements/assignments/
invites + RLS + `can_write_org` + platform-staff separation + pgTAP isolation tests + staging env)**,
built in an isolated worktree and reviewed before any deploy.

---

*End of BRD · PRD · Hardened Architecture. Sign off here → write the Phase 0 migration next.*
