

# Regression scenario pack — coverage index (REG-1 v1)

> Status: **active** · 2 Jul 2026 · Owner: regression engineer (build loop §4.2)

Every confirmed P0/P1 from the 15 stress features (docs/STRESS_TEST_TRACKER.md +
docs/stress/\* + LEARNINGS.md) maps to a **permanent automated scenario** here. The
suite only ever grows — nothing that broke once may silently re-break. Run nightly by
`.github/workflows/regression.yml` against a **fresh local stack** (`supabase db start`
→ replay all migrations + `supabase/seed.sql` → `supabase test db`) plus the apps/app
Vitest suite. On failure the TAP / Vitest output is uploaded as the red report.

**Layers**
- **pgTAP** — `supabase/tests/*.sql`. Self-seeding: each file creates namespaced
  `[REGTEST]` fixtures inside `BEGIN … ROLLBACK`, so runs never collide or leak.
- **Vitest** — `apps/app/src/ledger/*.test.ts` for report/status logic (DB-free, pure).

New scenarios added by this card are in `regression_pack_test.sql`,
`regression_coa_integrity_test.sql`, and `regression.reports-truncation.test.ts`.
Findings already covered by a phase-\* test are marked ✅ (covered) with the file that
holds the assertion — this index is the single map from finding id → scenario → status.

## Coverage map

| Finding | Feature (TAG) | Sev | Scenario | Status |
|---|---|---|---|---|
| **ISO-F1** forged-actor RPC write (p_actor w/o membership) | Isolation (ISOTEST) | P0 | `regression_pack_test.sql` + `phase0_isolation_test.sql` | ✅ covered |
| ISO-F2 DML grants / anon table writes | Isolation | P1 | `phase0_isolation_test.sql` | ✅ covered |
| **JE-F1** `reverse_journal_entry` double-reversal | Journal (JETEST/CATTEST) | P0 | `regression_pack_test.sql` + `phase2_ledger_posting_test.sql` (test 16) | ✅ covered |
| JE (idempotent replay, no double-post, per-entry balance) | Journal | P0 | `phase2_ledger_posting_test.sql` | ✅ covered |
| **RPTTEST** 1000-row report truncation (oldest rows dropped) | Reports (RPTTEST) | P0 | `regression.reports-truncation.test.ts` | ✅ covered |
| **PERIOD-F1** close-vs-post TOCTOU (`FOR SHARE`) | Periods (PERIODTEST) | P0 | `phase2_period_lock_test.sql` (F1) | ✅ covered |
| PERIOD-F1 posting into a closed period rejected | Periods | P0 | `regression_pack_test.sql` + `phase2_ledger_posting_test.sql` (test 11) | ✅ covered |
| PERIOD-F2 approve-into-closed | Periods | P1 | `phase2_period_lock_test.sql` | ✅ covered |
| PERIOD-F3 reverse-after-close | Periods | P1 | `phase2_period_lock_test.sql` | ✅ covered |
| **CAT-F1/F2** recategorize double-categorize (FOR UPDATE) | Categorize (CATTEST) | P0 | `phase4_categorize_stress_test.sql` | ✅ covered |
| **CAT-F4** LIKE-wildcard rule poisoning (ESCAPE) | Categorize | P1 | `regression_pack_test.sql` + `phase4_categorize_stress_test.sql` | ✅ covered |
| CAT-F5 generic/short-memo rule poisoning | Categorize | P2 | `phase4_categorize_stress_test.sql` | ✅ covered |
| **CSV-F1** impossible/calendar dates | CSV import (CSVTEST) | P1 | `phase3_import_test.sql` | ✅ covered |
| CSV-F2 orphan draft batch | CSV import | P1 | `phase3_import_test.sql` | ✅ covered |
| CSV-F3 delimiter auto-detect (`;`/tab EU exports) | CSV import | P2 | — | ⚠️ **GAP** (fix not landed — tracker "left") |
| CSV `safe_to_date` defense-in-depth | CSV import | P1 | — | ⚠️ **GAP** (migration not in repo) |
| CSV-F4 re-import double-post dedup | CSV import | P1 | — | ⚠️ **GAP** (product decision → Nik) |
| **OB** opening-balance silent-drop (account-less row → OBE plug) | Opening balances (OBTEST) | P1 | `phase4_uncategorized_test.sql` + `phase3_import_test.sql` (commit_import_batch) | ✅ covered |
| **COA-F4** currency shape unvalidated (crashes books view) | Chart of accts (COATEST) | P1 | `regression_coa_integrity_test.sql` | 🆕 **added** |
| **COA-F5** cross-tenant `parent_id` | Chart of accts | P1 | `regression_coa_integrity_test.sql` | 🆕 **added** |
| **COA-F6** parent of a different type (wrong rollups) | Chart of accts | P1 | `regression_coa_integrity_test.sql` | 🆕 **added** |
| **COA-F7** cycle-guard (self-parent / loop) drift | Chart of accts | P1 | `regression_coa_integrity_test.sql` (positive parent) + trigger folded in migration | ✅ covered |
| AUTH (session/routing) | Auth (AUTHTEST) | P1 | `phase0_isolation_test.sql` (access predicates) | ✅ covered |
| **INV** accept_invite idempotency / email-bind | Invites (INVTEST) | P1 | `invites_accept_test.sql` | ✅ covered |
| **INV-F2** owner not demoted by member-invite (re-engage/no-demote) | Invites | P1 | `invites_accept_test.sql` (F2) | ✅ covered |
| **CPA** read_only CPA cannot mutate | CPA lens (CPATEST) | P1 | `phase2_ledger_posting_test.sql` (tests 8–9) | ✅ covered |
| **SYNC-F0/F1** provider-commit + per-row dedup (ext keys) | QBO/Xero sync (SYNCTEST) | P1 | `phase3_external_connections_test.sql` | ✅ covered |
| **ORG** atomic org creation | Onboarding (ORGTEST) | P1 | `phase0_isolation_test.sql` / org fixtures | ✅ covered |
| **GDPR** paginated export / erasure | Data export (GDPRTEST) | P1 | — | ⚠️ **GAP** (fn-level; no pgTAP — export is edge-fn) |
| **STAFF** break-glass / editor gate | Platform staff (STAFFTEST) | P0 | `phase5_platform_staff_test.sql` + `admin_tiers_and_guards_test.sql` | ✅ covered |
| **LOOP-1** heartbeat write-path RLS (loop_runs/loop_events) | Build loop (PR #173) | P1 | — | ⏳ **pending** (migration unmerged; add once #173 lands) |
| **W3.2-UNDO** auto-post undo reverses cleanly (ledger balanced) | Trust-tiered autonomy (W3.2) | P0 | `w3_2_trust_tiered_autonomy_test.sql` | ✅ covered |
| **W3.2-BUDGET-DEFER** ≤5-asks/week cap → surplus + income defer to digest | Trust-tiered autonomy (W3.2) | P1 | `autonomy.test.ts` (`budgetDisposition`) + `w3_2_trust_tiered_autonomy_test.sql` | ✅ covered |

## Gaps surfaced for the integrator / Nik

These findings have **no reproducible automated scenario yet** — flagged, not silently
skipped:

1. **CSV-F3 / `safe_to_date` / CSV-F4** — the delimiter auto-detect fix, the
   `safe_to_date` defense-in-depth migration, and the re-import dedup are still open on
   the tracker (CSV-F4 is a product decision for Nik). Once the fixes land, add scenarios
   next to `phase3_import_test.sql`.
2. **GDPR export/erasure** — implemented as an edge fn (`org-data`), not a DB RPC, so it
   isn't reachable from pgTAP. Needs an integration/E2E scenario (out of this card's scope
   — E2E nav-walk is owned by IA-1). Tracked as a gap.
3. **LOOP-1 heartbeat RLS** — `loop_runs`/`loop_events` (PR #173) is not on `main`; a
   pgTAP scenario (service-role writes / admin reads / stale-beat) is drafted-in-intent
   here and should be added in the PR that merges #173, so this card does not depend on an
   unmerged migration.

## Adding a scenario (regression engineer)

1. Reproduce the finding as a failing assertion FIRST (prove it catches the regression).
2. Put pgTAP in `supabase/tests/` (self-seeding, namespaced `[REGTEST]`, `BEGIN…ROLLBACK`)
   or Vitest in `apps/app/src/ledger/`; label the assertion with the finding id.
3. Add the row here. Never delete/weaken a scenario without a retro decision (§4.2).

---

## W1.2 report exports (merged in)

Status · 2026-07-03 · Owner: build-loop

Named, re-runnable regression scenarios for the unified app. Each row is a
behaviour we never want to silently break; the `id` is quotable in a PR/ledger.
A scenario points at the automated check that enforces it (unit / E2E) so the
"proof" is a green gate, not a manual note.

| id | surface | asserts | enforced by |
|---|---|---|---|
| W1.2-EXPORT | Reports → exports | All four reports (TB / P&L / BS / GL detail) export CSV + PDF; the CSV ties to the on-screen numbers **to the cent**; GL detail is the full line dump with per-account running balances; period/as-of scoping filters correctly; a 10k-entry org exports **completely** (no 1000-row truncation); the PDF is a structurally valid, branded document; the download flow yields one period-stamped file. | `apps/app/src/ledger/export.test.ts` (serialization + tie-out + scale) · `tools/app-e2e/run.mjs` → `verifyReportDownload` (real download event) |

## W1.2-EXPORT — detail

**Why it matters.** A CPA hands the exported package to tax software at year-end.
If the file disagrees with the screen by a cent, or drops the oldest entries
(opening balances, capital injections — the RPTTEST truncation P0), the books
look balanced but are wrong. Exports must be complete and tie exactly.

**Tie-out invariant.** CSV amounts are formatted from the SAME integer minor
units the on-screen report renders, via the same derivation functions
(`reports.ts`). The GL export reuses the exact `generalLedger()` pure function the
on-screen GL renders — screen and file cannot diverge.

**Completeness invariant.** The serializers are pure functions over the already-
paginated entry list (`api.ts useEntries` pages via `.range()` until a short
page). The unit test serializes a 10k-entry org and asserts every line is present
(20,000 GL rows) with a correct running balance — no truncation at any scale.

**Audit invariant.** Every export records one `report.export` row in
`ledger_audit` (via the `report-export` edge function, actor from the verified
JWT, gated by `can_access_org`). A read-only CPA CAN export (read capability) and
is audited, but the path mutates nothing in the books.

**Re-run.** `pnpm --dir apps/app test` (unit) and the App E2E workflow
(`.github/workflows/app-e2e.yml`, drives the real authed Reports tab and captures
the download). No prod fixtures — the unit seed is the RPTTEST Scenario A seed.

---


## W1.6 learned-rules management (merged in — consolidated from docs/SCENARIOS.md)

| Scenario id | Feature / finding | Scenario file(s) | Proves | Status |
|---|---|---|---|---|
| W1.6-RULEDEL | W1.6 learned-rules management (delete) | `supabase/tests/w16_learned_rules_test.sql` · `apps/app/src/ledger/nav.test.ts` (learned-rules nav) · `apps/app/src/ledger/learnedRules.test.ts` | Owner/full-CPA can delete a learned rule (soft-deactivate, audit-logged); a deleted rule stops being proposed; non-writers (read_only CPA) are forbidden; Rules reachable in ≤3 taps (Categorize/Advanced → Rules → delete); a CAT-F4-poisoned `%` rule is deletable by id and then dead | ✅ landed w/ W1.6 |

---

## W1.4 — CPA Practice home (cross-client work queue)

| id | scenario file | status |
| --- | --- | --- |
| W1.4-QUEUE | supabase/tests/w1_4_cpa_practice_queue_test.sql | ✅ |

## W1.5 — CPA collaboration primitives (flag · note · add-txn · reclass)

All land in `supabase/tests/w1_5_cpa_collaboration_test.sql` (pgTAP round-trip +
guardrails). Each id maps to a labelled assertion in that file.

| id | what it proves | status |
| --- | --- | --- |
| W1.5-FLAG | full CPA flags an entry → open flag; idempotent; surfaces in the W1.4 queue `flagged` column (rank 4, journal surface) + client-counts badge | ✅ |
| W1.5-NOTE | full CPA annotates an entry; an empty note is refused | ✅ |
| W1.5-RECLASS | CPA suggests reclass (medium tier, pending_review) → nothing moves → CPA cannot self-approve → owner approves → entry recategorized AND a rule is learned | ✅ |
| W1.5-ADDTXN | CPA proposes a missing txn (unbalanced refused) → nothing posts until owner acknowledges → on approve exactly one entry posts | ✅ |
| W1.5-ISO | an outsider with no engagement cannot flag another org's entry (forged-actor class) | ✅ |
| W1.5-PERIODLOCK | approving an add-txn dated into a CLOSED period is refused (nothing posts into a closed period) | ✅ |
| W1.5-READONLY | a read_only CPA cannot flag or suggest (server-side gate, not just UI) | ✅ |
| W1.5-AUDIT | flag and approval each write a ledger_audit row | ✅ |

---

## W1.1 — bank reconciliation

| id | surface | asserts | enforced by |
|---|---|---|---|
| W1.1-AUTOMATCH | Books → Reconcile | Auto-match pairs a statement line (import_rows) to a ledger entry by the account's debit-positive net: EXACT (same signed amount + same date) first, FUZZY (amount within ±windowDays, nearest date) second; each line + entry consumed at most once; already-confirmed matches excluded; withdrawals (negative) carry the right sign. | `apps/app/src/ledger/reconcile.test.ts` (autoMatch) · `supabase/tests/w1_1_reconciliation_test.sql` (match RPC) |
| W1.1-TIEOUT | Books → Reconcile | The report ties to the cent: `computed_closing = opening + Σ cleared` (integer minor units, no float); `difference = statement closing − computed_closing`; a reconciled month has difference 0; `reconcile_lock` REFUSES unless opening + Σ cleared = closing. | `apps/app/src/ledger/reconcile.test.ts` (reconciliationReport) · `supabase/tests/w1_1_reconciliation_test.sql` (lock tie-out) |
| W1.1-REVERSAL | Ledger + Reconcile | Reversing a matched entry REOPENS its match (soft — `reopened_at` + `reopened_reason='entry_reversed'`, keeping the trail) and UNLOCKS the containing reconciled session; the reopen is audit-logged; a subsequent lock then refuses (books no longer tie). A trigger on `journal_entries.status→'reversed'` enforces this for every reversal path. | `supabase/tests/w1_1_reconciliation_test.sql` (reversal-reopen + re-lock refusal) |
| W1.1-ISO | reconcile RPCs | Match/unmatch/lock RPCs are SECURITY DEFINER, EXECUTE granted to service_role ONLY (no anon/authenticated → no p_actor forgery); `can_write_org_as` gates a read_only CPA out server-side; cross-tenant actor refused; every action audit-logged. | `supabase/tests/w1_1_reconciliation_test.sql` (grant absence · read_only gate · cross-tenant · audit rows) |

**Why it matters.** Reconciliation is the #1 CPA trust surface: the point of the
month-end close is to prove the books agree with the bank statement, line by line.
If a reconciled month can silently drift — an entry it cleared gets reversed
later, or the report ties to the wrong number — the "Reconciled ✓" badge lies.

**Tie-out invariant.** The report is derived by the pure `reconciliationReport()`
over the same confirmed matches the DB stores; screen and lock-RPC agree because
both compute `opening + Σ cleared` in integer minor units. `reconcile_lock`
refuses to stamp ✓ unless that equals the statement closing balance.

**Reversal-reopen invariant.** A DB trigger, not the client, reopens matches and
unlocks the session on any reversal — so the guarantee holds whether the reversal
came from `reverse_journal_entry`, a categorize repost, or a future path.

**Isolation invariant.** The reconciliation tables deny client writes (RLS
select-only); all mutation flows through the `reconcile` edge fn → service_role-
only RPCs. A read-only CPA reads the numbers but is refused every write server-
side (`can_write_org_as`), independent of the disabled UI buttons.

**Source note.** Statement lines come from `import_rows` today; when the Plaid-fed
`bank_transactions` lands (W2.3), the matcher's `StatementLine` shape is the swap
point — the engine and tie-out are source-agnostic.

**Re-run.** `pnpm --dir apps/app test` (matcher + tie-out unit) · `supabase test
db` (pgTAP match RPCs) · the App E2E workflow drives the real Books → Reconcile
tab across the width ladder. No prod fixtures — the pgTAP seed is self-contained.

---

## W2.2 — QBO one-click migration with history

| id | surface | asserts | enforced by |
|---|---|---|---|
| W2.2-MIGRATE | Books → Import → Migrate | A connected QBO company migrates fully: CoA upserts, full Purchase/Deposit history (all pages) buckets into one `import_batch` per year (`source='qbo'`), each row keyed by its QBO txn id as `external_id`; a `provider_migrations` record captures the batches + a snapshot of QBO's own trial balance; commit posts every year's rows through the verified bank branch of `commit_import_batch(4-arg)`, so each entry balances (Dr==Cr). | `supabase/tests/w2_2_qbo_migration_test.sql` (year batch commits · entry-per-txn · record_provider_migration) |
| W2.2-TBTIE | migration → TB compare | The migrated ledger ties to QBO's own trial balance to the CENT: `compareTrialBalances()` matches accounts by normalized name, computes debit-positive nets in integer minor units, and any non-zero `diff` surfaces as a variance row (never silent); `tiesToTheCent` ⟺ `totalVariance===0`; provider-only / ledger-only accounts are flagged. | `apps/app/src/migration/tbCompare.test.ts` (ties · 1c variance · presence · duplicate collapse) · `supabase/tests/w2_2_qbo_migration_test.sql` (posted ledger nets to zero) |
| W2.2-REPULL-IDEM | migration re-pull | A second pull NEVER doubles the books: provider rows commit under `ext:qbo:<external_id>`, so re-staging the same transactions into a new batch and committing adds ZERO new journal entries — the duplicates are marked `skipped`, not posted. | `supabase/tests/w2_2_qbo_migration_test.sql` (re-pull adds no entries · rows skipped · ext-key present) |
| W2.2-CUTOVER | migration → cutover | The owner confirms one cutover date after reviewing the TB: `set_import_batch_cutover` stamps each pre-commit batch (refused on a committed/frozen batch), `set_provider_migration_cutover` marks the migration `committed`; both audit-logged. A foreign actor is refused server-side (`can_write_org_as`). | `supabase/tests/w2_2_qbo_migration_test.sql` (cutover stamp · frozen refusal · migration commit · foreign-actor forbidden) |

**Why it matters.** "I'd love historic data in the new system" is the migration
promise. The trust moment is the side-by-side trial balance: the owner will not
switch off QuickBooks until the new books match it to the cent. A silent variance —
or a re-pull that doubles a year of transactions — breaks that trust irrecoverably.

**Idempotency invariant.** Every provider row commits under `ext:qbo:<external_id>`
(the QBO transaction id). The dedup lives in the shared `commit_import_batch`
(SYNCTEST F1), so a re-pull, an overlapping year, or a re-run all collide on the
same key and skip — the migration is safe to run as many times as it takes.

**TB-tie invariant.** The comparison is pure over integer minor units (no float);
the ledger side derives from the same `accountBalances()` the Reports tab uses, and
QBO's side is the report it returns. A difference is shown as a row, never absorbed.

**Re-run.** `pnpm --dir apps/app test` (TB-compare unit) · `supabase test db`
(pgTAP migration RPCs + idempotency). A full E2E needs a QBO sandbox company +
one human OAuth consent at run time (LEARNINGS #10) — the pgTAP seed stands in for
that with a self-contained provider fixture.

---

## W1.3-B tax mapping engine (merged in — consolidated from tests/scenarios/SCENARIOS.md)

## W1.3-B · Tax mapping engine

| ID | Proves | Owned by |
|----|--------|----------|
| **W1.3B-MAP** | Trial balance × entity × year → per-form-line amounts via data-driven rules; ties to the books; every account lands on one line **or** the first-class UNMAPPED bucket (never silently dropped). | `apps/app/src/tax/engine.test.ts` (Vitest) + `supabase/tests/tax_mapping_engine_test.sql` (pgTAP: resolution precedence override>rule>unmapped) |
| **W1.3B-M1** | Penny **drafts** book-tax differences (meals 50%, penalties 0%) from seeded line metadata as `status=proposed`; a human approves; only approved rows reach the M-1 summary — never auto-posted. Idempotent re-draft (no dup). | `engine.test.ts` (draftM1Adjustments / scheduleM1) + pgTAP (draft→approve→summary, idempotency) |
| **W1.3B-DRAKE** | Per-suite serializers emit Drake's fixed-column TB import + UltraTax tax-code column (88888 excludes unmapped) + generic CSV/PDF spine; pluggable registry rejects unknown suites. | `engine.test.ts` (serializer golden strings) |
| **W1.3B-EXT** | A **second** jurisdiction/entity (CA-FED T2125) **and** a US state form (US-CA CA_565) map through the identical engine by seed rows alone — zero code change (research §B.8). | pgTAP (§9 extensibility) + `scripts/seed-tax.ts --check` type-fallback lint |
| **W1.3B-ROLE** | Mapping edits + M-1 approval require CPA-role (`can_edit_tax_map_as`); owners read only; all write RPCs are `service_role`-EXECUTE-only (forged-actor P0 closed, ISOTEST). Edits audit-logged. | pgTAP (owner-blocked, grants, audit rows) |
| **W1.3B-LAW** | Forms are year-versioned + effective-dated; `supersede_tax_form` closes the old row and opens the new atomically; `tax_form_in_force` returns old law for old periods, new for new; overlapping active windows are impossible. | pgTAP (§6 effective-dating) |

**Follow-on (not in this card):** `W1.3B-UI` — the CPA mapping-edit surface (stacks
on the app-UI base; this card ships the RPCs it will call).

---

## W1.3-C fixed-asset & depreciation subledger (merged in — consolidated from tests/scenarios/SCENARIOS.md)

## W1.3-C · Fixed-asset & depreciation subledger

| ID | Proves | Owned by |
|----|--------|----------|
| **W1.3C-MACRS** | Penny COMPUTES depreciation to the cent: book straight-line + tax MACRS per asset per year, driven by DATA (effective-dated `asset_classes` + published `macrs_percentages`), never a code literal. A $10,000 5-year 200DB half-year asset yields the IRS Pub 946 Table A-1 schedule (2000/3200/1920/1152/1152/576, sums to cost); mid-quarter Q4 + §179/bonus stacking also verified. | `apps/app/src/tax/depreciation.test.ts` (Vitest golden numbers) + `supabase/tests/fixed_asset_depreciation_test.sql` (pgTAP: `macrs_tax_depreciation_for_year` / `book_depreciation_for_year` golden) |
| **W1.3C-M1** | The book-vs-tax depreciation delta DRAFTS a `tax_adjustment` via W1.3-B's `draft_tax_adjustment` (origin_kind=`depreciation_book_tax`, status=`proposed`, temporary); the delta picks the bucket (tax>book → deduction_on_return_not_books); a proposal never counts until a human approves; re-draft is idempotent — proves asset → schedule → M-1 round-trip. | `depreciation.test.ts` (m1BucketForDelta, net-zero over life) + pgTAP (draft→bucket→idempotency; proposal excluded from `tax_m1_summary`) |
| **W1.3C-POST** | Book depreciation posts a BALANCED journal entry (Dr depreciation expense / Cr accumulated depreciation) through the existing `post_journal_entry` path — period-lock respected (a closed period refuses), idempotent per (asset, year), audit-logged. No parallel posting path. | pgTAP (balanced JE, closed-period refusal `23001`, idempotent re-post) |
| **W1.3C-DISPOSAL** | Disposal computes gain/loss = proceeds − net book value, records the disposal, and marks the asset disposed. | `depreciation.test.ts` (disposalGainLoss gain + loss) + pgTAP (§8 disposal) |
| **W1.3C-LAW** | `asset_classes` + `macrs_percentages` are year-versioned + effective-dated + cited; `supersede_asset_class` + `asset_class_in_force` make an asset compute under the §179/bonus law of its in-service year; overlapping active windows impossible (EXCLUDE); a law change (bonus step-down, §179 bump, new class) is a seed row. | pgTAP (effective-dating) + `scripts/seed-depreciation.ts --check` (MACRS tables sum to 100%, class→table coverage, effective-dating clean) |
| **W1.3C-ROLE** | The p_actor-first write RPCs (`register_fixed_asset`, `compute_depreciation_schedule`, `post_book_depreciation`, `draft_depreciation_m1`, `dispose_fixed_asset`, `supersede_asset_class`) are `service_role`-EXECUTE-only (forged-actor P0 closed, ISOTEST); cross-tenant register refused; every action audit-logged. | pgTAP (§9 grants + cross-tenant refusal) |

---

## W2.1 · Catch-up mode (the #1 Signals wedge — years-behind owners, shame-free)

Catch-up mode ORCHESTRATES the existing pipeline (import → categorize → reconcile →
per-year export); it adds only a flat-per-year packaging model, a trust-gated
bulk-approve RPC, and a per-year progress rollup. These scenarios lock the decisions
that could silently go wrong.

| ID | Proves | Owned by |
|----|--------|----------|
| **W2.1-CATCHUP** | Multi-year CSVs land as one import batch per backlog year, then Penny proposes a category per landed uncategorized entry; per-year progress (`catch_up_progress`) rolls up uncategorized + reconciled counts and a `done` flag derived from the ledger (no denormalized status to drift). A year with an unsorted transaction is not `done`. | `apps/app/src/catchup/catchup.test.ts` (Vitest: `yearStatus` / `allYearsDone` / `yearOf` / `backlogYears`) + `supabase/tests/w2_1_catchup_test.sql` (pgTAP: per-year rollup) |
| **W2.1-BATCHAPPROVE** | `catch_up_batch_approve` bulk-recategorizes ONLY high-confidence picks (trust tier from `get_effective_behavior_config.confidence_high`, server-authoritative); a below-cutoff item is SKIPPED and left untouched on the holding account — never auto-posted. Reuses `recategorize_entry` (append-only reverse+repost, learning). Tenant-gated (non-member refused, `42501`); the bulk action writes a summary audit row **and** the per-entry recategorize audit row. Period-lock inherited: a closed-period entry still recategorizes into the open period, never permanently blocked. | `catchup.test.ts` (Vitest: `isHighConfidence` / `partitionProposals` trust gating, rule=1 always, no-account never) + `w2_1_catchup_test.sql` (pgTAP: approved/skipped counts, holding-account untouched, audit rows, non-member `42501`, closed-period inheritance) |
| **W2.1-5K** | The interruption budget holds at 5,000 backlog transactions: with 4,990 high-confidence + 10 low, the owner confirms 4,990 in ONE tap and answers only the 10 low-confidence questions — `interruptionCount` = 10, not 5,000. Surfaced questions are capped at `asks_per_week` (≤5/week) and the rest deferred. | `catchup.test.ts` (Vitest: `interruptionCount` at 5k, `withinAskBudget`, `questionsForThisWeek` cap) |
| **W2.1-PRICING** | Priced flat-per-year: `catch_up_plans.fee_total_minor` is a generated column = `fee_per_year_minor × cardinality(backlog_years)`; `catch_up_set_plan` records the packaging and audit-logs it. $500/yr over 3 years → $1,500. | `catchup.test.ts` (Vitest: `catchUpFeeTotal`) + `w2_1_catchup_test.sql` (pgTAP: `fee_total_minor` = per-year × N) |
## W2.3 · Plaid bank feeds (sandbox)

| ID | Proves | Owned by |
|----|--------|----------|
| **W2.3-LINK** | A linked Plaid item's transactions land in the SAME categorize queue as CSV/QBO imports (a bank-vs-Uncategorized entry Penny then categorizes), exactly once, and the ledger balances (Dr==Cr). Each Plaid `transaction_id` → one `bank_transactions` row → one journal entry keyed `ext:plaid:<transaction_id>`. | `supabase/tests/w2_3_plaid_ingest_test.sql` (pgTAP: add ingests, distinct entries, ledger balances) + `apps/app/src/import/plaidStateMachine.test.ts` (Vitest: add lands once) |
| **W2.3-REPLAY** | A duplicate webhook delivery — Plaid retries, at-least-once — adds NOTHING. Re-ingesting the same sync page skips every row (idempotent on `bank_transactions` unique key AND on `post_journal_entry`'s `ext:plaid:<id>`); no new rows, no new entries, net unchanged. Overlapping cursor pages likewise never double-post. | pgTAP (`skipped=2`, row/entry counts unchanged) + Vitest (duplicate page + overlapping page no-op) |
| **W2.3-REMOVED** | Plaid mutating history is handled by REVERSAL-based corrections, never in-place edits. A **removed** txn reverses its prior entry (original → `status=reversed`, row → `state=removed`, never deleted) and nets to zero; a **modified** (amount/date-changed) txn reverses the old entry and posts a fresh one (books tie to the corrected amount); **pending→posted** with no amount change moves no money. A replayed remove is idempotent (no second reversal). | pgTAP (modify: original reversed + corrected amount + still balances; remove: reversed + state) + Vitest (pending→posted, modify reverse+repost, idempotent remove, full-lifecycle nets to 0) |

**Tenant + role.** `plaid_ingest_transactions` / `plaid_set_cursor` are
`service_role`-EXECUTE-only (ISOTEST: no `p_actor` forgery from anon/authenticated),
gated by `can_write_org_as`; a non-member actor is refused. The Plaid access token
never reaches the browser (stored on `external_connections`, column-walled like
QBO/Xero); the link_token is the only client-side token. Every add/modify/remove
writes a `ledger_audit` row.

**Webhook replay-safety proof.** The `plaid-webhook` fn resolves `item_id →
external_connections` (the tenant boundary; an unknown item is ignored 200 so Plaid
stops retrying) then runs the SAME `/transactions/sync` loop as `plaid-sync`. Because
`plaid_ingest_transactions` is idempotent, running the loop twice on the same events
is a no-op — proven by W2.3-REPLAY.

**Sandbox-only.** Build targets `PLAID_ENV=sandbox` (secret from
`~/.config/founderfirst/secrets.env` → `PLAID_SECRET_SANDBOX`, set as a Supabase fn
secret at deploy). Production requires Plaid's app review — a **Nik step** before
>10 live users (flip `PLAID_ENV`/`PLAID_SECRET` to production). E2E against the live
Plaid sandbox is feasible via `/sandbox/item/fire_webhook` (`sandboxFireWebhook` in
`_shared/plaid.ts`); the recorded state machine (`plaidStateMachine.ts`) is the
CI-runnable fixture that mirrors the RPC contract.

**Re-run.** `pnpm --dir apps/app test` (state machine) · `supabase test db` (pgTAP
ingestion RPC) · no prod fixtures (the pgTAP seed is self-contained).

## W3.3 · Minimal 3-step onboarding (name → entity → industry)

The demo's 8-step quiz is replaced by exactly three steps — business name, entity
type, industry — with everything else asked in-journey. Entity + industry options
render from the CENTRAL-2 kernel seeds (no hardcoded enum), the "not sure" flow is a
seed-driven 2-question diagnostic, and picking an industry seeds the matching chart
of accounts from its kernel CoA template. These scenarios lock the decisions that
could silently regress.

| ID | Proves | Owned by |
|----|--------|----------|
| **W3.3-ONBOARD** | Onboarding is exactly 3 steps; entity + industry tiles render from the `entity_types` / `industries` kernel seeds — adding a test entity/industry via the seed alone makes it appear (no hardcoded list). `complete_onboarding` stamps `entity_type` + `industry_key` on the org's settings (the filing-calendar consumer reads these) in one atomic call, is tenant-gated (`42501` for a non-member) and rejects a forged entity/industry key against the kernel (`22023`). The onboarding write-path is `service_role`-EXECUTE-only (ISOTEST). | `apps/app/src/onboarding/diagnostic.test.ts` (Vitest: kernel-drives-options — a seeded entity becomes diagnosable with no code) + `supabase/tests/w3_3_onboarding_test.sql` (pgTAP: profile stamped, tenant gate, forged-key reject, not client-EXECUTE-granted) |
| **W3.3-DIAGNOSTIC** | The "not sure" flow is the seed's 2-question diagnostic: questions are flattened from `entity_types.diagnostic_questions` (deduped, capped to 2), and answers resolve to a single entity — a YES on an entity's own primary question resolves to THAT entity; an all-NO / tie board resolves to `null` (the UI then asks the owner to pick manually, never a forced pick). Adding an entity with its own diagnostic question makes it resolvable with zero code. | `apps/app/src/onboarding/diagnostic.test.ts` (Vitest: `buildQuiz` dedup/cap, `resolveDiagnostic` per-entity resolution, null on no-signal, co-op seed appears) |
| **W3.3-COA** | Selecting an industry seeds the matching chart of accounts from its kernel `coa_template_ref` — kernel-driven, NO hardcoded industry→accounts map. Every industry's ref resolves to a non-empty, well-formed template (types in the account_type enum, unique codes, ≥1 income + ≥1 expense); an industry with no ref falls back to the `general_business` template. Seeding is idempotent (a re-run over an org that already has a chart adds nothing) and tags accounts `source=onboarding`. | `apps/app/src/onboarding/coaTemplate.test.ts` (Vitest: ref→template resolution, fallback exists, valid accounts, usable chart) + `supabase/tests/w3_3_onboarding_test.sql` (pgTAP: `seed_org_coa` produces the template's rows, fallback path, idempotency) |

**Deferral (in-journey, usability gate).** Onboarding asks NOTHING beyond the three
steps. After it, a **skippable** "connect a bank" offer routes to the Connections tab
(APP_PRINCIPLES §2); payment methods, check-in cadence and everything else are asked
at the moment they matter, never upfront. No 4th onboarding question ships without Nik.

**Kernel-driven, no code.** Adding an entity, an industry, or a whole sector chart is
a seed edit (`supabase/seeds/kernel/*.json` → `scripts/seed-kernel.ts`), never a code
change — the CI kernel-seed lint (`pnpm check:kernel-seed`) enforces that every
industry's `coa_template_ref` resolves to a template and the `general_business`
fallback exists.

**E2E note.** The DB-layer pgTAP proves "complete onboarding → land in seeded books
with the right CoA" deterministically (the app-e2e runner uses a pre-seeded owner org
and does not re-enter onboarding). A live-Supabase browser walkthrough of the 3-step
wizard is a manual/staging check (needs a fresh no-org account + the `orgs` +
`onboarding` edge fns), noted for the wave integration pass.

**Re-run.** `pnpm --dir apps/app test` (diagnostic + CoA template) · `supabase test db`
(onboarding write-path) · `pnpm check:kernel-seed` (seed lint) · no prod fixtures.

## W3.2 · Trust-tiered autonomy (the ≤5-asks/week approval rework)

The demo's ask-about-everything model becomes homework at scale. Instead each
uncategorized transaction is triaged server-side into one of three tiers — cutoffs
+ the ≤5-asks/week budget from `platform_config` (`get_effective_behavior_config`,
CENTRAL-1), never a magic number: HIGH auto-posts (Penny did this, 1-tap undo),
MEDIUM batch-approves, LOW is one approval card. Income + a spent budget defer to
the digest, never a card.

| Scenario | Surface | Assertion | Test |
|---|---|---|---|
| **W3.2-TIER** | Categorize triage | Tier is assigned from CONFIG cutoffs (`confidence_high`/`confidence_medium`), and a learned rule / repeat vendor is HIGH by provenance regardless of the model's stated confidence — a stricter config re-bands the SAME score with no code change. | `apps/app/src/copy/autonomy.test.ts` (`assignTier`) |
| **W3.2-AUTOPOST** | HIGH tier | `autopost_categorization` posts the categorization itself (reverse+repost+learn via `recategorize_entry`, append-only), records exactly one `penny_activity` feed row, is idempotent on the key, and is audit-logged (`entry.reverse`). Tenant-gated (non-member `42501`); period-lock respected (a closed period refuses `23001`). | `supabase/tests/w3_2_trust_tiered_autonomy_test.sql` |
| **W3.2-UNDO** | Feed 1-tap undo | `undo_penny_activity` reverses the reposted entry through the SAME reversal path — the categorized account nets back to zero and the org trial balance ties to zero (double-entry preserved). Undo is idempotent (a second tap never double-reverses). | `supabase/tests/w3_2_trust_tiered_autonomy_test.sql` |
| **W3.2-BUDGET-DEFER** | LOW tier ≤5/week | `budgetDisposition` caps owner interruptions at `asks_per_week`: a run of 20 unknowns interrupts exactly `asks_per_week` times, then further unknowns DEFER to the digest (`reason=budget_spent`); income ALWAYS defers (`reason=income`, never a card); changing the config budget (5→8) changes the interruption count with no redeploy. Budget is counted from real data (`owner_asks_this_week` / `record_owner_ask` over `ai_decisions`). | `apps/app/src/copy/autonomy.test.ts` (`budgetDisposition`) + `supabase/tests/w3_2_trust_tiered_autonomy_test.sql` (owner-ask counting) |

**Re-run.** `pnpm --dir apps/app test` (tier + budget accounting) · `supabase test
db` (auto-post + undo/reversal RPC path). No prod fixtures — the pgTAP seed is
self-contained `[REGTEST]` inside `BEGIN…ROLLBACK`.

**E2E (seed a week).** Seed a week of transactions spanning all three tiers → the
`triage` op sorts them into feed (HIGH, already posted) / batch queue (MEDIUM) /
approval cards (LOW), and the owner's asks-count never exceeds the config budget
(the surplus low-confidence items + income appear as the digest note, not cards).
The tier split + the ≤budget assertion are the pure-function tests above; the
server wiring is `supabase/functions/categorize` op `triage`.
