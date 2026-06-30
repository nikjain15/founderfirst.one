-- [stress:periods] cleanup — UN-RUN. For the integrator to remove ONLY this
-- session's prod fixtures (ref ejqsfzggyfsjzrcevlnq). Scoped to EXACT ids, NOT the
-- shared "[PERIODTEST]" namespace — a parallel session is using the same prefix
-- (its orgs "[PERIODTEST] Stress Co/Stranger Co/CPA Firm" + users owner@/cpa@/
-- stranger@periodtest.founderfirst.test must be left ALONE).
--
-- This session's fixtures (random-suffixed):
--   business org  c7b06332-501a-423d-88c2-cc7713e8417c  "[PERIODTEST] Co fee90"
--   firm org      0b5964e0-e358-47da-ae5f-8834857040c1  "[PERIODTEST] Firm f7ee3"
--   users         24f33ddb… owner-eed268  · 5e32be75… cpa-ceebb4  · ad957215… stranger-616d8a
--   engagement    f01585cc-91ac-4caa-9e91-2e114b94b51e
--
-- Run inside a transaction; review the row counts against manifest.md first.
begin;

-- child → parent FK order
delete from journal_lines           where org_id = 'c7b06332-501a-423d-88c2-cc7713e8417c';
delete from journal_entries         where org_id = 'c7b06332-501a-423d-88c2-cc7713e8417c';
delete from ledger_audit            where org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','0b5964e0-e358-47da-ae5f-8834857040c1');
delete from accounting_periods      where org_id = 'c7b06332-501a-423d-88c2-cc7713e8417c';
delete from ledger_accounts         where org_id = 'c7b06332-501a-423d-88c2-cc7713e8417c';
delete from org_accounting_settings where org_id = 'c7b06332-501a-423d-88c2-cc7713e8417c';
delete from client_assignments      where engagement_id = 'f01585cc-91ac-4caa-9e91-2e114b94b51e';
delete from engagements             where id = 'f01585cc-91ac-4caa-9e91-2e114b94b51e';
delete from subscriptions           where billable_org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','0b5964e0-e358-47da-ae5f-8834857040c1');
delete from memberships             where org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','0b5964e0-e358-47da-ae5f-8834857040c1');
delete from organizations           where id in ('c7b06332-501a-423d-88c2-cc7713e8417c','0b5964e0-e358-47da-ae5f-8834857040c1');
delete from auth.users              where id in (
  '24f33ddb-51ac-4472-a632-7cb6d568e762',   -- owner-eed268
  '5e32be75-019a-41b4-b2be-9a07535f9292',   -- cpa-ceebb4
  'ad957215-5a0b-4e51-8fe5-9a09d6bf7906');  -- stranger-616d8a

-- Expected deletions (see manifest.md): journal_lines 34 · journal_entries 17 ·
-- ledger_audit 38 · accounting_periods 5 · ledger_accounts 2 ·
-- org_accounting_settings 1 · client_assignments 1 · engagements 1 ·
-- subscriptions 2 · memberships 2 · organizations 2 · auth.users 3
commit;
