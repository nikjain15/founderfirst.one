-- [ORGTEST] cleanup — UN-RUN. Integrator runs after review. Removes ONLY ORGTEST fixtures.
-- Child rows (memberships, subscriptions, org_accounting_settings, journal_*) cascade
-- via on delete cascade from organizations. Scope is pinned to the ORGTEST owner.
begin;
delete from organizations
 where created_by = '4e272f7c-904e-4167-a5be-d601cae1a044'::uuid;
-- then the test user itself:
delete from auth.users
 where id = '4e272f7c-904e-4167-a5be-d601cae1a044'::uuid;
commit;
