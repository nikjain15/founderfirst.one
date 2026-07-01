# [stress:periods] manifest — prod fixtures created (ref ejqsfzggyfsjzrcevlnq)

Adversarial period-locking stress-test, 2026-06-30. All fixtures namespaced
`[PERIODTEST]` with emails `…@periodtest.founderfirst.test`. **A parallel session
shares the `[PERIODTEST]` namespace** (orgs `Stress Co`/`Stranger Co`/`CPA Firm`,
users `owner@`/`cpa@`/`stranger@`) — those are NOT mine; cleanup is scoped to the
exact ids below, never the namespace.

## This session's fixtures (random-suffixed)
| kind | id | label |
|------|----|-------|
| user (owner)   | `24f33ddb-51ac-4472-a632-7cb6d568e762` | owner-eed268@periodtest.founderfirst.test |
| user (CPA)     | `5e32be75-019a-41b4-b2be-9a07535f9292` | cpa-ceebb4@periodtest.founderfirst.test |
| user (stranger)| `ad957215-5a0b-4e51-8fe5-9a09d6bf7906` | stranger-616d8a@periodtest.founderfirst.test |
| org (business) | `c7b06332-501a-423d-88c2-cc7713e8417c` | [PERIODTEST] Co fee90 |
| org (firm)     | `0b5964e0-e358-47da-ae5f-8834857040c1` | [PERIODTEST] Firm f7ee3 |
| engagement     | `f01585cc-91ac-4caa-9e91-2e114b94b51e` | firm→business, set full + read_only during tests |
| accounts       | `db2c8ba0-…` Cash (asset), `50ea4ee0-…` Revenue (income) | in business org |

## Row-count footprint (to be removed by cleanup.sql)
| table | rows |
|-------|------|
| journal_lines | 34 |
| journal_entries | 17 |
| ledger_audit | 38 |
| accounting_periods | 5 |
| ledger_accounts | 2 |
| org_accounting_settings | 1 |
| client_assignments | 1 |
| engagements | 1 |
| subscriptions | 2 (one per org, `billable_org_id`) |
| memberships | 2 |
| organizations | 2 |
| auth.users | 3 |

## Integrity check after testing
- Books **tie**: per-currency Σdebits = Σcredits = 23 844 (USD), net 0; **0 unbalanced entries**.
- The bugs found are **period-integrity** breaks (entries finalized into a closed
  period), not arithmetic imbalances — the ledger never went out of balance.

## Round 2 (post-deploy) added fixtures
Expanded testing (edge battery, concurrency burst, negatives, F7 check) created more
`[PERIODTEST]` orgs/users. The **authoritative, complete list** — verified against the
live DB — is the IN-lists in `cleanup.sql` (**11 orgs, 14 users**), each scoped by exact
id. The parallel session's `Stress Co`/`CPA Firm`/`Stranger Co` + `owner@`/`cpa@`/`stranger@`
are explicitly excluded there.

## What was mutated on prod (the deploy)
- **Deployed (authorized):** `ensure_open_period` / `approve_journal_entry` /
  `reverse_journal_entry` (combined) via Management API; `ledger-periods` edge fn v9→v10
  (F7, `verify_jwt` preserved). Rollback for the RPCs: `scratchpad/rollback.sql`.
- **Everything else read-only** (PostgREST + Management API SQL with a `User-Agent` header).
  No config/schema changes beyond the three function bodies + one edge fn.
