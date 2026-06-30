-- OBTEST cleanup — UN-RUN. Removes every [OBTEST] fixture from prod.
-- Run by the INTEGRATOR after the findings are reviewed. DELETE NOTHING before then.
--
-- before-state for this org = 0 (the org was created fresh during this session).
-- after-state (captured 2026-06-30):
--   ledger_accounts 5 · accounting_periods 9 · import_batches 12 · import_rows 621
--   journal_entries 10 · journal_lines 622
--
-- organizations ON DELETE CASCADE clears ledger_accounts, accounting_periods,
-- journal_entries, journal_lines, import_batches, import_rows, memberships,
-- subscriptions, org_accounting_settings for the org in one shot.

begin;
delete from organizations where id = 'e49bba48-4051-4454-8b5e-2f1407f94f6e';  -- [OBTEST] Acme Books
commit;

-- Then remove the auth user (no FK cascade from organizations):
--   select auth.uid;  -- n/a
delete from auth.users where id = '08dfa3aa-1e51-45a5-ba5d-8532dfb0c3f2';  -- owner@obtest.founderfirst.test

-- Verify zero residue:
-- select count(*) from organizations where name like '[OBTEST]%';            -- expect 0
-- select count(*) from auth.users where email like '%@obtest.founderfirst.test'; -- expect 0
