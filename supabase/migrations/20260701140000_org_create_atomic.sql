-- [stress:org-creation] Atomic org creation + anti-abuse guards.
--
-- WHY (proven live on prod via the `orgs` edge fn):
--   • The edge fn did org → membership → subscription as THREE independent
--     service-role inserts. The membership-failure path best-effort DELETEs the
--     org (a delete that can itself fail → an orphan org no one can see under RLS
--     and no user can clean up), and the subscription insert was UNCHECKED — a
--     failure there left a fully-usable org with NO entitlement stub and still
--     returned 201. Partial-failure orphans, by construction.
--   • No org-count cap: a single user created 8 orgs in parallel (all 201) with no
--     limit — unbounded org + pilot_free-subscription spam.
--   • No idempotency: two identical creates fired together produced TWO orgs with
--     the same name (double-submit / network-retry duplicates).
--
-- FIX: one SECURITY DEFINER function that does all of it in a SINGLE transaction,
-- so org + membership + subscription (+ the settings trigger that fires on the org
-- insert) are all-or-nothing. It also enforces a per-user cap and a short
-- idempotency window. The edge fn calls this instead of three loose inserts.
--
-- The caller's identity is passed explicitly as p_user (the edge fn derives it
-- from the verified JWT); the function never trusts auth.uid() since it runs in a
-- service-role context. Granted to service_role only — never reachable by clients,
-- which keeps "creating an org is the only path to a membership" intact.

create or replace function public.create_org_atomic(
  p_user uuid,
  p_type text,
  p_name text
) returns organizations
language plpgsql security definer set search_path = public as $$
declare
  v_org      organizations;
  v_existing organizations;
  v_role     member_role;
  v_count    int;
begin
  if p_user is null then
    raise exception 'unauthorized' using errcode = 'insufficient_privilege';
  end if;
  if p_type is null or p_type not in ('business', 'firm') then
    raise exception 'bad_type' using errcode = 'invalid_parameter_value';
  end if;
  if p_name is null or length(p_name) < 1 or length(p_name) > 120 then
    raise exception 'bad_name' using errcode = 'invalid_parameter_value';
  end if;

  -- Idempotency / double-submit guard: if this same user just created an org with
  -- the same type + name, return THAT one instead of minting a duplicate. The
  -- 15s window neutralises double-clicks and client retries while still allowing a
  -- deliberately-same-named org to be created later.
  select * into v_existing from organizations
   where created_by = p_user
     and type = p_type::org_type
     and lower(name) = lower(p_name)
     and created_at > now() - interval '15 seconds'
   order by created_at desc
   limit 1;
  if found then
    return v_existing;
  end if;

  -- Per-user org cap (anti-spam). Generous for real use; stops runaway creation.
  select count(*) into v_count from organizations where created_by = p_user;
  if v_count >= 50 then
    raise exception 'org_limit_reached' using errcode = 'restrict_violation';
  end if;

  v_role := case when p_type = 'firm' then 'firm_admin' else 'owner' end::member_role;

  -- All three writes in one txn. Any failure rolls the whole thing back — no
  -- orphan org, no membership-less org, no entitlement-less org.
  insert into organizations (type, name, created_by)
    values (p_type::org_type, p_name, p_user)
    returning * into v_org;

  insert into memberships (user_id, org_id, role, status)
    values (p_user, v_org.id, v_role, 'active');

  insert into subscriptions (billable_org_id, plan)
    values (v_org.id, 'pilot_free');

  -- org_accounting_settings is seeded by the AFTER INSERT trigger on organizations
  -- (20260630100000), which runs inside this same transaction → also atomic.
  return v_org;
end$$;

revoke all on function public.create_org_atomic(uuid, text, text) from public;
grant execute on function public.create_org_atomic(uuid, text, text) to service_role;
