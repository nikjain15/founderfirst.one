-- ============================================================================
-- [RPTTEST] cleanup — UN-RUN. Removes ONLY the report-stress-test fixtures.
-- Run by the integrator via the Management API SQL endpoint (executes as
-- `postgres`, which can set session_replication_role). DO NOT run as part of a
-- migration. Idempotent: safe to run more than once.
--
-- Why session_replication_role: journal_entries / journal_lines are append-only
-- (BEFORE DELETE guard triggers raise). `replica` suppresses user + RI triggers
-- so the fixtures can be torn down. We restore `origin` immediately after.
--
-- Scope is pinned to organizations named '[RPTTEST]%' and the three
-- '…@rpttest.founderfirst.test' auth users — nothing else is touched.
-- ============================================================================

begin;

-- collect the test org ids once
create temporary table _rpttest_orgs on commit drop as
  select id from organizations where name like '[RPTTEST]%';

set session_replication_role = replica;  -- bypass append-only + RI triggers

delete from journal_lines        where org_id in (select id from _rpttest_orgs);
delete from journal_entries      where org_id in (select id from _rpttest_orgs);
delete from accounting_periods   where org_id in (select id from _rpttest_orgs);
delete from ledger_accounts      where org_id in (select id from _rpttest_orgs);
delete from org_accounting_settings where org_id in (select id from _rpttest_orgs);
delete from subscriptions        where billable_org_id in (select id from _rpttest_orgs);
delete from memberships          where org_id in (select id from _rpttest_orgs);
delete from organizations        where id in (select id from _rpttest_orgs);

set session_replication_role = origin;

-- auth users (cascades clean; outside the org graph)
delete from auth.users where email like '%@rpttest.founderfirst.test';

commit;

-- Expected effect (see manifest.md row-count baseline):
--   journal_lines        -2040
--   journal_entries      -1020   (Scenario A 9 + B 1010 + C 1)
--   accounting_periods   -varies (A ~1, B ~13 across seeded months, C 1)
--   ledger_accounts        -13
--   org_accounting_settings -4
--   subscriptions          -4
--   memberships            -4     (one owner each; orphan A had its own)
--   organizations          -4
--   auth.users             -3
