# [stress:cpa-scope] CPATEST — fixture manifest

All fixtures are TAG-namespaced (`[CPATEST]` orgs, `@cpatest.founderfirst.test`
users). No foreign-tenant row was written, updated, or deleted. Teardown =
`cleanup.sql` (un-run).

## Users (auth.users)
| email | id | role |
|---|---|---|
| owner@cpatest.founderfirst.test | `78c7993d-20b3-400a-b230-6991d1bbe3cf` | owner of Client A + Client B |
| firmadmin@cpatest.founderfirst.test | `2bbc06fb-2f8d-40e2-9720-758f15e8aa67` | firm_admin of the firm; full CPA on A, read-only on B |
| staff@cpatest.founderfirst.test | `22bcc2ed-74c8-457b-a36a-7a780a7dfe58` | cpa member of the firm; assigned to A only |

## Orgs (organizations)
| name | id | type |
|---|---|---|
| [CPATEST] Client A | `758f591d-5dde-44c1-9339-912dc738ac1e` | business |
| [CPATEST] Client B | `dfa49f00-c366-46c9-9c5f-1a722bf61cfe` | business |
| Firmadmin's practice | `635e552d-e77b-460c-b51f-d2b211b47d48` | firm (auto-created on first CPA accept) |

## Engagements
| firm → client | id | access | status (end) |
|---|---|---|---|
| firm → Client A | `6aae275b-193d-499b-9c41-514e108f3694` | full | **revoked** (T6) |
| firm → Client B | `01fd679f-092c-44b2-a809-d2e8b29fa45c` | read_only | active |

## Other rows created
- memberships: owner→A (owner), owner→B (owner), firmadmin→firm (firm_admin), staff→firm (cpa)
- client_assignments: firmadmin→ENG_A, firmadmin→ENG_B (auto on accept), staff→ENG_A (assigned)
- ledger_accounts (Client A): Cash `4f7e72e9…`, Revenue `45045f94…`, Office Supplies
- journal_entries (Client A): 5 (manual post, its reversal, staff post, owner direct, CPA pending→approved)
- ledger_audit (Client A): 5 · org_accounting_settings: A (flag reverted to false), B · subscriptions: A, B, firm
- invites: 3 (all consumed) · ledger_accounting integrity: Client A Σdebit = Σcredit = 11082 ✓

## Before / after prod row-count diff (whole tables)
| table | before | after | delta |
|---|---|---|---|
| organizations | 101 | 104 | +3 (A, B, firm) |
| memberships | 106 | 110 | +4 |
| engagements | 22 | 24 | +2 |
| client_assignments | 17 | 20 | +3 |

Deltas equal exactly the fixtures listed above — no collateral writes. (Baselines
inferred from post-run totals minus this session's creations; `journal_entries` /
`ledger_audit` for my orgs went 0→5 each, Client B and firm stayed 0.)
