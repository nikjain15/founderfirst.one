-- [stress:gdpr] GDPRTEST fixture cleanup — UN-RUN. For the integrator to run on prod
-- (ref ejqsfzggyfsjzrcevlnq) AFTER the PR is reviewed. Removes ONLY GDPRTEST-namespaced
-- fixtures; touches no other tenant. Org deletes cascade to memberships, subscriptions,
-- external_connections, import_batches→import_rows, journal_*, ledger_audit, etc.
--
-- Verify before running:
--   select id, name from organizations where name like '[GDPRTEST]%';
--   select id, email from auth.users where email like '%@gdprtest.founderfirst.test';

begin;

-- 1. engagements do NOT cascade from organizations — remove any that reference a
--    GDPRTEST org (firm or client) first, else the org delete hits an FK violation.
--    client_assignments cascade from engagements, so they go automatically.
delete from engagements
 where firm_org_id   in (select id from organizations where name like '[GDPRTEST]%')
    or client_org_id in (select id from organizations where name like '[GDPRTEST]%');

-- 2. all GDPRTEST orgs (there may be duplicates from re-runs) — memberships,
--    subscriptions, external_connections, import_batches→rows, journal_*, ledger_audit
--    all cascade from organizations.
delete from organizations where name like '[GDPRTEST]%';

-- 3. the GDPRTEST test users (owner / outsider / cpa) — no org references them now.
delete from auth.users where email like '%@gdprtest.founderfirst.test';

-- sanity: both should return 0
-- select count(*) from organizations where name like '[GDPRTEST]%';
-- select count(*) from auth.users where email like '%@gdprtest.founderfirst.test';

commit;
