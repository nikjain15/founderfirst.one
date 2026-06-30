-- [stress:sync] SYNCTEST fixture cleanup — UN-RUN. Review, then execute on prod
-- (ref ejqsfzggyfsjzrcevlnq) via the Management API to remove the test fixtures.
-- Everything is namespaced; this touches ONLY [SYNCTEST] data. Nothing else.
--
-- Fixtures created during the run (all in org A / org B, no tokens — OAuth not
-- completed, so external_connections rows are pending/error only):
--   ORG_A = 3d3bc99a-bd8b-47d4-bf80-80b0afecebcc  "[SYNCTEST] Org A"
--   ORG_B = 17505c7b-f110-4268-b7c0-a5116ab315d8  "[SYNCTEST] Org B"
--   users: owner-a@synctest.founderfirst.test, owner-b@synctest.founderfirst.test
-- NOTE: every commit_import_batch / post_journal_entry proof ran inside a
-- transaction that was force-rolled-back (RAISE), so NO ledger_accounts,
-- import_batches, journal_entries, or journal_lines were persisted for these orgs.

begin;

-- external_connections (pending/error, no live tokens) for the two test orgs
delete from external_connections
 where org_id in ('3d3bc99a-bd8b-47d4-bf80-80b0afecebcc','17505c7b-f110-4268-b7c0-a5116ab315d8');

-- memberships + orgs (ON DELETE CASCADE clears settings/memberships/etc.)
delete from organizations
 where id in ('3d3bc99a-bd8b-47d4-bf80-80b0afecebcc','17505c7b-f110-4268-b7c0-a5116ab315d8');

-- the two test users
delete from auth.users
 where email in ('owner-a@synctest.founderfirst.test','owner-b@synctest.founderfirst.test');

-- sanity: confirm the two orgs are gone before committing
-- select count(*) from organizations where name like '[SYNCTEST]%';   -- expect 0

commit;
