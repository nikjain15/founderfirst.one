-- Isolation gate: the forged-actor cross-tenant write hole stays closed.
-- ([stress:isolation] finding F1; fix migration 20260701000000.)
--
-- The write-path RPCs authorize against a client-supplied `p_actor` argument
-- (can_write_org_as(p_actor, …)), so they MUST NOT be directly callable by the
-- client roles (anon / authenticated) — only by service_role via the edge
-- functions, which inject the JWT-verified actor. If a future migration or a
-- `GRANT … TO PUBLIC` re-opens EXECUTE on any of them, a caller could pass a
-- victim's user_id as p_actor and write into the victim's tenant. This test
-- fails the moment that happens.
--
-- Run locally: `supabase test db`.

begin;
select plan(31);

-- ── Every p_actor-trusting SECURITY DEFINER RPC: NOT callable by anon/authenticated.
--    (Asserted in bulk so newly-added RPCs of the same shape are covered too.)
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and pg_get_function_arguments(p.oid) ~ '^p_actor uuid'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0, 'no p_actor RPC is EXECUTE-able by authenticated');

select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and pg_get_function_arguments(p.oid) ~ '^p_actor uuid'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0, 'no p_actor RPC is EXECUTE-able by anon');

select isnt(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and pg_get_function_arguments(p.oid) ~ '^p_actor uuid'),
  0, 'the p_actor RPC set is non-empty (sanity: the matcher still matches)');

-- ── Headline functions, named explicitly (defence against the bulk query drifting).
select ok(not has_function_privilege('authenticated','post_journal_entry(uuid,uuid,date,text,jsonb,text,text,text)','EXECUTE'), 'authenticated cannot EXECUTE post_journal_entry');
select ok(not has_function_privilege('anon',         'post_journal_entry(uuid,uuid,date,text,jsonb,text,text,text)','EXECUTE'), 'anon cannot EXECUTE post_journal_entry');
select ok(not has_function_privilege('authenticated','upsert_ledger_account(uuid,uuid,text,account_type,text,uuid,uuid,bpchar,boolean)','EXECUTE'), 'authenticated cannot EXECUTE upsert_ledger_account');
select ok(not has_function_privilege('anon',         'upsert_ledger_account(uuid,uuid,text,account_type,text,uuid,uuid,bpchar,boolean)','EXECUTE'), 'anon cannot EXECUTE upsert_ledger_account');
select ok(not has_function_privilege('authenticated','reverse_journal_entry(uuid,uuid,uuid,text,date,text)','EXECUTE'), 'authenticated cannot EXECUTE reverse_journal_entry');
select ok(not has_function_privilege('authenticated','approve_journal_entry(uuid,uuid,uuid)','EXECUTE'), 'authenticated cannot EXECUTE approve_journal_entry');
select ok(not has_function_privilege('authenticated','close_accounting_period(uuid,uuid,uuid)','EXECUTE'), 'authenticated cannot EXECUTE close_accounting_period');
select ok(not has_function_privilege('authenticated','reopen_accounting_period(uuid,uuid,uuid)','EXECUTE'), 'authenticated cannot EXECUTE reopen_accounting_period');
select ok(not has_function_privilege('authenticated','commit_import_batch(uuid,uuid,uuid)','EXECUTE'), 'authenticated cannot EXECUTE commit_import_batch');
select ok(not has_function_privilege('authenticated','add_import_rows(uuid,uuid,uuid,jsonb)','EXECUTE'), 'authenticated cannot EXECUTE add_import_rows');
select ok(not has_function_privilege('authenticated','transfer_ownership(uuid,uuid,uuid)','EXECUTE'), 'authenticated cannot EXECUTE transfer_ownership');
select ok(not has_function_privilege('authenticated','remove_member(uuid,uuid,uuid)','EXECUTE'), 'authenticated cannot EXECUTE remove_member');
select ok(not has_function_privilege('authenticated','revoke_engagement(uuid,uuid)','EXECUTE'), 'authenticated cannot EXECUTE revoke_engagement');
select ok(not has_function_privilege('authenticated','can_write_org_as(uuid,uuid)','EXECUTE'), 'authenticated cannot EXECUTE can_write_org_as (membership oracle)');
select ok(not has_function_privilege('authenticated','has_membership_as(uuid,uuid)','EXECUTE'), 'authenticated cannot EXECUTE has_membership_as (membership oracle)');

-- ── service_role keeps EXECUTE (the edge functions must still work).
select ok(has_function_privilege('service_role','post_journal_entry(uuid,uuid,date,text,jsonb,text,text,text)','EXECUTE'), 'service_role CAN EXECUTE post_journal_entry');
select ok(has_function_privilege('service_role','upsert_ledger_account(uuid,uuid,text,account_type,text,uuid,uuid,bpchar,boolean)','EXECUTE'), 'service_role CAN EXECUTE upsert_ledger_account');
select ok(has_function_privilege('service_role','transfer_ownership(uuid,uuid,uuid)','EXECUTE'), 'service_role CAN EXECUTE transfer_ownership');

-- ── RLS helpers & self-guarded readers (auth.uid()-based) STAY client-callable.
select ok(has_function_privilege('authenticated','can_access_org(uuid)','EXECUTE'), 'can_access_org stays EXECUTE-able (RLS depends on it)');
select ok(has_function_privilege('authenticated','can_write_org(uuid)','EXECUTE'), 'can_write_org stays EXECUTE-able');
select ok(has_function_privilege('authenticated','has_engagement_access(uuid)','EXECUTE'), 'has_engagement_access stays EXECUTE-able (RLS depends on it)');
select ok(has_function_privilege('authenticated','list_org_members(uuid)','EXECUTE'), 'list_org_members stays EXECUTE-able (self-guards on auth.uid())');

-- ── A direct call as authenticated is rejected at the privilege layer.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';
select throws_ok(
  $$ select upsert_ledger_account('00000000-0000-0000-0000-0000000000bb'::uuid,'00000000-0000-0000-0000-0000000000cc'::uuid,'x','expense'::account_type,null,null,null,null,null) $$,
  '42501', null,
  'direct upsert_ledger_account call as authenticated -> insufficient_privilege');
reset role;

-- ── Defence-in-depth (finding F2): tenant tables expose SELECT only to clients.
select ok(not has_table_privilege('authenticated','public.journal_entries','INSERT'), 'authenticated cannot INSERT journal_entries (table grant)');
select ok(not has_table_privilege('authenticated','public.ledger_accounts','UPDATE'), 'authenticated cannot UPDATE ledger_accounts (table grant)');
select ok(not has_table_privilege('authenticated','public.memberships','DELETE'), 'authenticated cannot DELETE memberships (table grant)');
select ok(not has_table_privilege('anon','public.journal_entries','TRUNCATE'), 'anon cannot TRUNCATE journal_entries (table grant)');
select ok(    has_table_privilege('authenticated','public.journal_entries','SELECT'), 'authenticated retains SELECT on journal_entries (RLS-filtered reads)');

select * from finish();
rollback;
