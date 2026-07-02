-- [JETEST] journal-entry stress-test teardown — UN-RUN. Deletes ONLY this session's
-- fixtures (orgs 6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1 and 37246e1e-086d-46dd-9651-fca329dc3348, user 8837e4d0-7068-4d91-aa6a-b6ee3684f0a6). Touches no other org.
-- Append-only guards (journal_entries_guard / journal_lines_immutable) block normal
-- DELETE, so teardown runs with session_replication_role=replica to bypass triggers
-- + RI for the teardown only. Run as the postgres/service role (Management API).
begin;
set local session_replication_role = replica;

delete from ledger_audit            where org_id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348');
delete from journal_lines           where org_id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348');
delete from journal_entries         where org_id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348');
delete from accounting_periods      where org_id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348');
delete from ledger_accounts         where org_id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348');
delete from org_accounting_settings where org_id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348');
delete from subscriptions           where billable_org_id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348');
delete from memberships             where org_id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348');
delete from organizations           where id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348');
delete from auth.users              where id = '8837e4d0-7068-4d91-aa6a-b6ee3684f0a6';

reset session_replication_role;
commit;

-- Verify (expect all zero):
-- select (select count(*) from journal_entries where org_id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348')) je,
--        (select count(*) from organizations where id in ('6b2ff6c0-aba4-43d3-901a-6c3c165dc9a1','37246e1e-086d-46dd-9651-fca329dc3348')) orgs,
--        (select count(*) from auth.users where id='8837e4d0-7068-4d91-aa6a-b6ee3684f0a6') usr;
