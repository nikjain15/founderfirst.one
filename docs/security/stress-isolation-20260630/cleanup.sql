-- ─────────────────────────────────────────────────────────────────────────────
-- [stress:isolation] fixture cleanup — UN-RUN. Operator runs this manually to
-- remove the test fixtures created by the 2026-06-30 tenant-isolation stress test.
--
-- SAFETY:
--   * Scoped to FOUR specific org ids and FOUR specific user ids — never to the
--     shared `@isotest.founderfirst.test` email wildcard (parallel test sessions
--     reuse that domain; a wildcard delete would destroy their fixtures).
--   * The shared identity cpa@isotest is firm_admin of the test FIRM, and a
--     parallel session engaged its own business to that FIRM. So the FIRM org is
--     only dropped if NO foreign engagement still references it (guarded). Run
--     after all parallel isolation sessions have finished for a full teardown.
--   * Append-only ledger: journal rows are normally never deleted. This is test
--     data in throwaway orgs, so a hard delete is acceptable here ONLY.
--   * Idempotent: safe to run more than once. Wrapped in one transaction.
--
-- Fixture ids (see manifest.json):
--   ORG_A  = 5f71d64f-d3df-4651-9fe8-1b94b6e977f1  (business, owner-a)
--   ORG_A2 = 8c372519-d512-4a72-9423-f06288ccc393  (business, owner-a)
--   ORG_B  = fb7761a6-0ba7-4b5b-b298-59ff857e5c98  (business, owner-b)
--   FIRM   = 777887e6-b158-4b74-888e-a8c3d38e99fc  (firm,    cpa)  [shared — guarded]
--   users: owner-a ade01247…  owner-b e1b507dd…  cpa 8ecf325e…  cpa2 2e600fa7…
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1) My three businesses — fully owned by this session.
create temporary table _my_biz on commit drop as
  select unnest(array[
    '5f71d64f-d3df-4651-9fe8-1b94b6e977f1',
    '8c372519-d512-4a72-9423-f06288ccc393',
    'fb7761a6-0ba7-4b5b-b298-59ff857e5c98'
  ]::uuid[]) as id;

-- FK children first, then parents.
delete from journal_lines          where org_id        in (select id from _my_biz);
delete from journal_entries        where org_id        in (select id from _my_biz);
delete from ledger_audit           where org_id        in (select id from _my_biz);
delete from import_rows            where org_id        in (select id from _my_biz);
delete from import_batches         where org_id        in (select id from _my_biz);
delete from categorization_rules   where org_id        in (select id from _my_biz);
delete from accounting_periods     where org_id        in (select id from _my_biz);
delete from external_connections   where org_id        in (select id from _my_biz);
delete from ledger_accounts        where org_id        in (select id from _my_biz);
delete from org_accounting_settings where org_id       in (select id from _my_biz);
delete from invites                where target_org_id in (select id from _my_biz);
delete from subscriptions          where billable_org_id in (select id from _my_biz);
delete from client_assignments     where engagement_id in
  (select id from engagements where client_org_id in (select id from _my_biz));
delete from engagements            where client_org_id in (select id from _my_biz);
delete from memberships            where org_id        in (select id from _my_biz);
delete from organizations          where id            in (select id from _my_biz);

-- 2) FIRM org (shared identity) — remove only what is unambiguously mine, then
--    drop the org ONLY if no foreign engagement still references it.
delete from subscriptions           where billable_org_id = '777887e6-b158-4b74-888e-a8c3d38e99fc';
delete from org_accounting_settings where org_id          = '777887e6-b158-4b74-888e-a8c3d38e99fc';
delete from invites                 where target_org_id    = '777887e6-b158-4b74-888e-a8c3d38e99fc';
delete from memberships             where org_id           = '777887e6-b158-4b74-888e-a8c3d38e99fc'
  and user_id in ('8ecf325e-bfce-4c7f-8d8b-8f5dd663693c','2e600fa7-8db8-41fc-af19-ef8c63bed659');
delete from organizations o         where o.id             = '777887e6-b158-4b74-888e-a8c3d38e99fc'
  and not exists (select 1 from engagements e where e.firm_org_id = o.id);

-- 3) Auth users — only my four specific ids (NEVER the shared email domain), and
--    only once they hold no surviving membership.
delete from auth.users u where u.id in (
  'ade01247-b79a-42de-9fc6-44f63eb83b99',  -- owner-a
  'e1b507dd-7e56-40b2-a3d4-3de3313cde2b',  -- owner-b
  '8ecf325e-bfce-4c7f-8d8b-8f5dd663693c',  -- cpa
  '2e600fa7-8db8-41fc-af19-ef8c63bed659'   -- cpa2
)
and not exists (select 1 from memberships m where m.user_id = u.id);

commit;
