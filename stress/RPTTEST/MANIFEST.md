# RPTTEST fixture manifest — financial reports tie-out

Prod ref: `ejqsfzggyfsjzrcevlnq`

## What this run did
Financial-reports tie-out is a **pure read-side** feature (`apps/app/src/ledger/reports.ts`
derives TB / P&L / BS from in-memory journal entries). It was stress-tested **without
mutating prod**:
- 52 hand-computed + fuzz assertions against the REAL `reports.ts` (harness in scratchpad).
- A live tie-out pulling a real org's entries from prod and running the actual reports
  functions over them (read-only).

This run **created no new prod rows**. All `[RPTTEST]` orgs below pre-date this run.

## Prod row-count snapshot (isolation proof)
| table | before | after | delta |
|---|---|---|---|
| journal_entries | 6115 | 6121 | +6 (other parallel agents — not RPTTEST) |
| journal_lines | 12247 | 12357 | +110 (other parallel agents — not RPTTEST) |
| ledger_accounts | 257 | 259 | +2 (other parallel agents — not RPTTEST) |
| accounting_periods | 63 | 64 | +1 (other parallel agents — not RPTTEST) |

My own `[RPTTEST]` orgs were unchanged across the run (verified). The deltas are from
sibling stress agents (JETEST/CATTEST/PERIODTEST) writing concurrently; I issued only SELECTs.

## Pre-existing [RPTTEST] fixtures (from earlier runs — cleanup.sql removes them)
- `[RPTTEST] Scenario A Co` (9 entries / 9 accounts)
- `[RPTTEST] Scenario A Co` (0/0 — empty duplicate)
- `[RPTTEST] Scenario B HighVolume` (1010 entries / 2 accounts) — used for the live tie-out
- `[RPTTEST] Scenario C MultiCcy` (1 entry / 2 accounts, both USD)

## Cleanup
`cleanup.sql` (un-run) deletes only `[RPTTEST]%` orgs and their scoped rows. Any RPTTEST
auth users (`…@rpttest.founderfirst.test`) should be removed via the Auth admin API
(`DELETE /auth/v1/admin/users/{id}`) — none were created this run.
