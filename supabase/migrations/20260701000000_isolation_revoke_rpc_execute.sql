-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY FIX (P0) — close the forged-actor cross-tenant write hole.
--
-- Stress-test [stress:isolation] finding F1. The write-path RPCs
-- (post_journal_entry, upsert_ledger_account, transfer_ownership, …) are
-- SECURITY DEFINER and authorize against a CLIENT-SUPPLIED `p_actor` argument
-- (can_write_org_as(p_actor, p_org)), NOT auth.uid(). They are meant to be
-- reachable ONLY through the service-role edge functions, which inject the
-- JWT-verified actor. But every one of them was also EXECUTE-grantable to the
-- `anon` and `authenticated` roles (Postgres/Supabase default: EXECUTE to
-- PUBLIC), so any caller could invoke them DIRECTLY via PostgREST
-- (`POST /rest/v1/rpc/<fn>`) and pass `p_actor = <a victim's user_id>`,
-- `p_org = <the victim's org>`. can_write_org_as then returns true for the
-- forged actor and the mutation lands in the victim's tenant — proven live:
-- both an authenticated cross-tenant caller AND an anonymous (anon-key-only)
-- caller posted a ledger_accounts row into a foreign org.
--
-- FIX: these RPCs must not be part of the client-callable PostgREST surface.
-- Revoke EXECUTE from PUBLIC/anon/authenticated and grant only to service_role
-- (the role the edge functions use). The functions are unchanged; the only
-- supported call path is now the edge function → service role → RPC, where the
-- actor is taken from the verified JWT and can never be forged.
--
-- Selection is by signature: every SECURITY DEFINER function in `public` whose
-- FIRST argument is `p_actor uuid` (the authorization actor). This deliberately
-- EXCLUDES admin_list_audit(p_action text, p_actor text, …) — there `p_actor`
-- is a text e-mail *filter* and the function self-guards with is_admin(). It
-- also leaves the RLS helper functions (can_access_org / can_write_org /
-- has_engagement_access — which read auth.uid()) and the self-guarded
-- list_*/staff_* readers executable, because RLS and those readers depend on
-- them and they do not trust a client-supplied actor.
--
-- ADDITIVE + idempotent. No data change. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- Match every public function whose FIRST parameter is `p_actor uuid` — i.e. it
-- authorizes against a client-supplied actor. This set is the 22 write-path RPCs
-- (post_journal_entry, upsert_ledger_account, transfer_ownership, remove_member,
-- assign_cpa, … ) plus the membership-oracle helpers can_write_org_as /
-- has_membership_as (which would otherwise let a caller probe "is user X a
-- member/writer of org Y"). It EXCLUDES admin_list_audit, whose first parameter
-- is `p_action text` (its `p_actor` is a text e-mail filter, self-guarded by
-- is_admin()). The oracle helpers are called internally by the definer-owned
-- RPCs above, which keep working regardless of these grants.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_get_function_arguments(p.oid) ~ '^p_actor uuid'
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- DEFENCE-IN-DEPTH (finding F2) — strip the latent client DML/TRUNCATE grants on
-- tenant tables. RLS (the *_nowrite "for all using(false) with check(false)"
-- policies) already blocks client writes, but every tenant table still carried
-- the Supabase default INSERT/UPDATE/DELETE/TRUNCATE grants to anon/authenticated
-- (only external_connections had been locked down). TRUNCATE in particular is NOT
-- filtered by RLS — it is gated solely by the grant. Keep SELECT (RLS-filtered
-- reads are the supported client path); remove the rest. Matches the model the
-- phase-0 migration documents ("client-side is select-only").
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
  tenant_tables text[] := array[
    'organizations','memberships','engagements','client_assignments','platform_staff',
    'invites','subscriptions','ledger_accounts','journal_entries','journal_lines',
    'accounting_periods','import_batches','import_rows','categorization_rules',
    'external_connections','ledger_audit','org_accounting_settings'
  ];
begin
  foreach t in array tenant_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
