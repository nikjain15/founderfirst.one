-- 14-Jul weekly audit (docs/AUDIT.md § supabase) — sig_digest_sends was created
-- (20260623150000_signals_digest_sends.sql) with grants locked to service_role
-- but never had `enable row level security` run on it, unlike every sibling
-- sig_* table (sig_keywords/sig_sources/sig_settings). Not exploitable (anon/
-- authenticated already have zero grants) but a defense-in-depth gap. Proves
-- the fix (20260712000000_sig_digest_sends_rls.sql) closes it and that
-- service_role access is unaffected.

begin;
select plan(4);

-- 1) RLS is now enabled on the table.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sig_digest_sends'::regclass),
  'sig_digest_sends has row level security enabled'
);

-- 2) anon has no access (was already true via revoke; RLS adds defense-in-depth).
select ok(
  not has_table_privilege('anon', 'public.sig_digest_sends', 'select'),
  'anon cannot read sig_digest_sends'
);

-- 3) authenticated has no access either.
select ok(
  not has_table_privilege('authenticated', 'public.sig_digest_sends', 'select'),
  'authenticated cannot read sig_digest_sends'
);

-- 4) service_role keeps full access — enabling RLS with no policy must not
--    lock out the cron/digest write path (service_role bypasses RLS in Supabase).
select ok(
  has_table_privilege('service_role', 'public.sig_digest_sends', 'select')
  and has_table_privilege('service_role', 'public.sig_digest_sends', 'insert'),
  'service_role keeps read+write access to sig_digest_sends'
);

select * from finish();
rollback;
