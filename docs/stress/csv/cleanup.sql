-- [stress:csv] CSVTEST fixture cleanup — UN-RUN. Integrator runs this after review.
-- Removes ONLY the CSVTEST black-box fixtures created on prod during this stress
-- pass. Strictly scoped to org 5c119f4b-… and the @csvtest.founderfirst.test user.
-- Touches no other tenant. Run inside a transaction; verify the counts first.
--
-- Fixture footprint at hand-off (org 5c119f4b-d914-4484-ad68-3e949a984574):
--   1 org · 1 user · 1 membership · 2 ledger_accounts · 4 import_batches ·
--   8 import_rows · 7 journal_entries · 14 journal_lines · 1 subscription.

begin;

-- sanity: should print exactly the one CSVTEST org
select id, name from organizations where name like '[CSVTEST]%';

with org as (select id from organizations where name like '[CSVTEST]%')
-- children first (FKs may or may not cascade; explicit is safe + auditable)
, _lines   as (delete from journal_lines    where org_id in (select id from org))
, _entries as (delete from journal_entries  where org_id in (select id from org))
, _irows   as (delete from import_rows      where org_id in (select id from org))
, _ibatch  as (delete from import_batches   where org_id in (select id from org))
, _acct    as (delete from ledger_accounts  where org_id in (select id from org))
, _periods as (delete from accounting_periods where org_id in (select id from org))
, _subs    as (delete from subscriptions    where billable_org_id in (select id from org))
, _mem     as (delete from memberships      where org_id in (select id from org))
select 1;

delete from organizations where name like '[CSVTEST]%';

-- the test auth user (cascades its identities/sessions)
delete from auth.users where email like '%@csvtest.founderfirst.test';

-- verify zero remnants before committing
select
  (select count(*) from organizations where name like '[CSVTEST]%')           as orgs_left,
  (select count(*) from auth.users where email like '%@csvtest.founderfirst.test') as users_left;

-- COMMIT;   -- uncomment once the two counts above are 0
rollback;    -- default: no-op until the integrator approves
