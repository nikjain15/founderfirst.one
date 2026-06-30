-- [stress:cpa-scope] CPATEST — UN-RUN cleanup. Deletes ONLY this session's
-- namespaced fixtures (@cpatest.founderfirst.test + [CPATEST] orgs). Review before
-- running. DELETE NOTHING was the rule during testing; this is the post-program
-- teardown for the integrator to run (or not).
--
-- organizations FK-cascade covers memberships, engagements, client_assignments,
-- journal_entries/lines, ledger_accounts, accounting_periods, org_accounting_settings,
-- import_batches/rows, categorization_rules, external_connections, ledger_audit,
-- subscriptions. invites reference target_org_id; deleted explicitly first to be safe.

begin;

-- invites issued to the test orgs (defensive; cascade may already cover).
delete from invites where target_org_id in (
  '758f591d-5dde-44c1-9339-912dc738ac1e',  -- [CPATEST] Client A
  'dfa49f00-c366-46c9-9c5f-1a722bf61cfe',  -- [CPATEST] Client B
  '635e552d-e77b-460c-b51f-d2b211b47d48'   -- Firmadmin's practice (auto-created firm)
);

-- the three test orgs (cascades to all tenant-scoped child rows above).
delete from organizations where id in (
  '758f591d-5dde-44c1-9339-912dc738ac1e',
  'dfa49f00-c366-46c9-9c5f-1a722bf61cfe',
  '635e552d-e77b-460c-b51f-d2b211b47d48'
);

-- the three test users.
delete from auth.users where id in (
  '78c7993d-20b3-400a-b230-6991d1bbe3cf',  -- owner@cpatest.founderfirst.test
  '2bbc06fb-2f8d-40e2-9720-758f15e8aa67',  -- firmadmin@cpatest.founderfirst.test
  '22bcc2ed-74c8-457b-a36a-7a780a7dfe58'   -- staff@cpatest.founderfirst.test
);

commit;
