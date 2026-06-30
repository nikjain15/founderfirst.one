-- RPTTEST cleanup — UN-RUN. Review before executing on prod (ref ejqsfzggyfsjzrcevlnq).
-- Removes ONLY the [RPTTEST]-tagged fixture orgs and everything scoped to them.
-- This stress run (reports tie-out) created NO new prod rows — it is read-only over a
-- pre-existing [RPTTEST] fixture. These DELETEs target leftover fixtures from earlier
-- RPTTEST runs. Other agents' tags ([E2E]/[CATTEST]/[PERIODTEST]/[ISOTEST]/[JETEST]) and
-- all real orgs are untouched.
--
-- Run inside a transaction; verify the SELECT first.

begin;

-- 0) Preview exactly what will be deleted.
select id, name from organizations where name like '[RPTTEST]%';

-- 1) Child rows first (FK order). All scoped by org_id to the RPTTEST fixtures.
with tgt as (select id from organizations where name like '[RPTTEST]%')
delete from journal_lines
 where entry_id in (select id from journal_entries where org_id in (select id from tgt));

delete from journal_entries where org_id in (select id from organizations where name like '[RPTTEST]%');
delete from accounting_periods where org_id in (select id from organizations where name like '[RPTTEST]%');
delete from ledger_accounts   where org_id in (select id from organizations where name like '[RPTTEST]%');

-- memberships / any other org-scoped tables (no-op if empty)
delete from memberships       where org_id in (select id from organizations where name like '[RPTTEST]%');

-- 2) The orgs themselves.
delete from organizations where name like '[RPTTEST]%';

-- 3) Test users in the RPTTEST namespace (created by earlier runs, if any).
--    Auth users are removed via the Auth admin API, not SQL — listed in MANIFEST.md.

commit;
