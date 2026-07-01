# [JETEST] Journal-entry stress-test — fixture manifest
Prod ref: ejqsfzggyfsjzrcevlnq  |  created 2026-06-30T22:32:28Z

## Fixtures created (all namespaced [JETEST] / @jetest.founderfirst.test)
- auth.users: owner+1782852222@jetest.founderfirst.test  (id 8837e4d0-7068-4d91-aa6a-b6ee3684f0a6)
- organizations: 6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1  ([JETEST] Stress Co, type business)
- memberships: owner (8837e4d0-7068-4d91-aa6a-b6ee3684f0a6 → 6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1)
- subscriptions: pilot_free for 6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1
- org_accounting_settings: auto-seeded row (USD) for 6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1
- ledger_accounts: Cash b7a4e3f0-6796-4bbc-b13c-a4b4411ac9fb / Revenue c70eb11d-6c8a-4581-b7be-d0fcf5feb138 / Expense 732e49cf-341b-44bd-9025-7ec8ed85ae53
- journal_entries / journal_lines / accounting_periods / ledger_audit: created during tests (see results log)

## Cleanup
See cleanup.sql (un-run). Deletes ONLY rows for org 6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1 + user 8837e4d0-7068-4d91-aa6a-b6ee3684f0a6. Nothing else touched.

## Row-count diff (this session's footprint — orgs 6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1 + 37246e1e-086d-46dd-9651-fca329dc3348, user 8837e4d0-7068-4d91-aa6a-b6ee3684f0a6)
| table                  | added |
|------------------------|-------|
| organizations          | 2     |
| auth.users             | 1     |
| memberships            | 2     |
| subscriptions          | 2     |
| org_accounting_settings| 2     |
| ledger_accounts        | 4     |
| accounting_periods     | 4     |
| journal_entries        | 28    |
| journal_lines          | 5376  |
| ledger_audit           | 30    |

(Global counts also moved a lot during the window — parallel [CATTEST]/[JETEST] sessions,
not this one; e.g. [CATTEST] Olive Co alone holds 36k entries. Scope above is by org_id.)

## Pre-existing prod state observed (NOT created by this session)
12 originals across 5 orgs already had >1 reversal — ALL in throw-away stress
namespaces ([JETEST]/[CATTEST]). No real pilot org affected. These are the same
double-reverse P0 firing under other sessions' concurrent load.
