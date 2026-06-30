-- [stress:gdpr] GDPRTEST fixture cleanup — UN-RUN. For the integrator to run on prod
-- (ref ejqsfzggyfsjzrcevlnq) AFTER the PR is reviewed. Removes ONLY GDPRTEST-namespaced
-- fixtures; touches no other tenant. Org deletes cascade to memberships, subscriptions,
-- external_connections, import_batches→import_rows, journal_*, ledger_audit, etc.
--
-- Verify before running:
--   select id, name from organizations where name like '[GDPRTEST]%';
--   select id, email from auth.users where email like '%@gdprtest.founderfirst.test';

begin;

-- 1. all GDPRTEST orgs (there may be duplicates from re-runs) — cascades clean the rest.
delete from organizations where name like '[GDPRTEST]%';

-- 2. the two GDPRTEST test users (no org left referencing them after step 1).
delete from auth.users where email like '%@gdprtest.founderfirst.test';

-- sanity: both should return 0
-- select count(*) from organizations where name like '[GDPRTEST]%';
-- select count(*) from auth.users where email like '%@gdprtest.founderfirst.test';

commit;
