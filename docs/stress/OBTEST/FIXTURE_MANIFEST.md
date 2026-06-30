# OBTEST — fixture manifest (live prod ejqsfzggyfsjzrcevlnq)

All data namespaced `[OBTEST]` / `@obtest.founderfirst.test`. DELETE NOTHING during
testing — this manifest + cleanup.sql let the integrator remove fixtures later.

## Identities
- user: owner@obtest.founderfirst.test  → auth.users.id = 08dfa3aa-1e51-45a5-ba5d-8532dfb0c3f2

## Org
- organizations.id = e49bba48-4051-4454-8b5e-2f1407f94f6e  ("[OBTEST] Acme Books", business)
- membership: owner of the above org

## Ledger accounts (created via ledger-accounts edge fn)
- 1000 [OBTEST] Cash             asset      697fbd74-a7c1-4fe8-a90d-526f3db2ad14
- 1100 [OBTEST] Accounts Receiv. asset      43d02b0b-ae32-4f7e-a46f-29ddfdc5a783
- 2000 [OBTEST] Loan Payable     liability  662c6e60-0d33-4bf7-89df-586cedc4eca5
- 3000 [OBTEST] Owner Capital    equity     114126fb-0a6b-4202-9ebe-8fe8674abbce
- 3900 Opening Balance Equity    equity     9b91aad1-8e85-4a62-85c0-a0618e1add76  (auto-created by plug)

## Import batches (opening_balances) committed during testing (all in this org)
A 2024-01-15, B 2024-02-15, B2 2024-03-15, C 2024-04-15, E 2024-06-15,
H 2023-11-15, I-run1/I-run2 2024-10-15 (x2), G 2024-11-15, UI-demo 2024-12-15,
plus discarded/failed: F 2024-07-15 (nothing_to_commit), D 7b1e2ecf (period_closed)

## Row-count footprint (this org only)
- organizations: +1, memberships: +1, subscriptions: +1
- ledger_accounts: +5, accounting_periods: ~9 (auto-created per cutover month)
- journal_entries: ~12, journal_lines: ~620 (incl. the 600-line large-set entry)
- import_batches: ~12, import_rows: matching

Cleanup = delete the org (ON DELETE CASCADE clears all ledger/import/period rows),
then delete the auth user. See cleanup.sql.
