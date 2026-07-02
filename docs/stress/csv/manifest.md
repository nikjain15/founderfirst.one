# [stress:csv] CSVTEST — fixture manifest

All test data is namespaced `[CSVTEST]` / `@csvtest.founderfirst.test` and was
created black-box through the live write-path (Auth admin API → `orgs` →
`ledger-accounts` → `imports` edge fn). Nothing else on prod was touched. No
schema/migration/edge-fn/grant/config change was made during testing.

## Prod fixtures (ref `ejqsfzggyfsjzrcevlnq`)

| Kind | Id / value | Notes |
|---|---|---|
| User | `f52c1dc2-eb86-4cfd-aa1b-5849c66a3cf8` · `owner@csvtest.founderfirst.test` | minted via magiclink→OTP→verify |
| Org (business) | `5c119f4b-d914-4484-ad68-3e949a984574` · `[CSVTEST] Stress Co` | 1 membership (owner) |
| Account (asset) | `8e7af2bf-bbfd-4080-a83e-dedbe41c6964` · `[CSVTEST] Checking` (1000) | bank side |
| Account (expense) | `1cf1e7f7-ec9b-4169-967c-d649d1693bab` · `[CSVTEST] Office Expense` (6000) | contra |
| Batch A | `5232662a-70e2-4588-9f9b-7d60caf26520` · `good.csv` | committed, 3 rows |
| Batch B | `c18384fd-2614-4ad8-baea-c3d0c341f772` · `baddate.csv` | **draft, 0 rows (orphan — finding F2)** |
| Batch C | `a3027818-1c40-4619-9d6c-502d5cd4b1fd` · `good.csv` | committed, 3 rows (re-import dup — F4) |
| Batch D | `postfix.csv` | committed, 1 posted + 1 error (post-fix proof) |

Footprint: 1 org · 1 user · 1 membership · 2 accounts · 4 batches · 8 import_rows ·
7 journal_entries · 14 journal_lines · 1 subscription.

## Books integrity at hand-off
Org trial balance ties to the cent after every commit: **Dr = Cr = 679334** (7 entries).
No cross-tenant leak, no imbalance, no double-post *within* a batch, no orphaned reversal.

## Before / after global row counts
Global counts are **noisy** — multiple sibling stress sessions mutated prod
concurrently during this window, so the global delta is NOT attributable to CSVTEST.
The org-scoped numbers above are the meaningful measure.

| | organizations | journal_entries | journal_lines | import_batches | import_rows |
|---|---|---|---|---|---|
| before | 77 | 19447 | 44011 | 46 | 84414 |
| after  | 85 | 39605 | 84973 | 60 | 106669 |
| CSVTEST share | +1 | +7 | +14 | +4 | +8 |

## Cleanup
`cleanup.sql` (un-run) removes exactly these fixtures. Left for the integrator.
