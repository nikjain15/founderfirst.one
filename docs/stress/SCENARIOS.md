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
