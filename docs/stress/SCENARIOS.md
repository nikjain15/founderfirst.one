

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
