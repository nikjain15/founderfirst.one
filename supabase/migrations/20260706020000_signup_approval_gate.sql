-- Signup approval gate (Nik 5-Jul): a new org — business OR firm — lands PENDING
-- and gets NO write access until platform staff approve it. Existing orgs are
-- grandfathered 'approved' by the column default (and prod has ~0 real orgs yet).
--
-- Access model unchanged elsewhere: the owner can still READ their own pending org
-- (so the app shows a "we're reviewing your request" screen), but every user-facing
-- WRITE path (can_write_org) refuses a non-approved org. Service-role setup
-- (create_org_atomic, the settings trigger, onboarding's complete_onboarding CoA
-- seed) does NOT go through can_write_org, so onboarding still completes.
--
-- Staff approve/decline via set_org_approval (is_platform_staff-gated + audited).

-- ── 1 · the status enum + column (default 'approved' grandfathers everything) ──
do $$ begin
  if not exists (select 1 from pg_type where typname = 'org_approval') then
    create type org_approval as enum ('pending', 'approved', 'declined');
  end if;
end $$;

alter table organizations
  add column if not exists approval_status org_approval not null default 'approved';

create index if not exists organizations_approval_idx
  on organizations (approval_status) where approval_status = 'pending';

-- ── 2 · new orgs start PENDING (both business + firm) ─────────────────────────
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

  -- Idempotency / double-submit guard (unchanged).
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

  select count(*) into v_count from organizations where created_by = p_user;
  if v_count >= 50 then
    raise exception 'org_limit_reached' using errcode = 'restrict_violation';
  end if;

  v_role := case when p_type = 'firm' then 'firm_admin' else 'owner' end::member_role;

  -- Approval gate: a brand-new org is PENDING. Owner membership + entitlement are
  -- still created (so the owner sees their org + a pending screen), but the write
  -- gate below withholds book access until staff approve.
  insert into organizations (type, name, created_by, approval_status)
    values (p_type::org_type, p_name, p_user, 'pending')
    returning * into v_org;

  insert into memberships (user_id, org_id, role, status)
    values (p_user, v_org.id, v_role, 'active');

  insert into subscriptions (billable_org_id, plan)
    values (v_org.id, 'pilot_free');

  return v_org;
end$$;

revoke all on function public.create_org_atomic(uuid, text, text) from public;
grant execute on function public.create_org_atomic(uuid, text, text) to service_role;

-- ── 3 · gate WRITES on approval (mirrors the existing membership/engagement logic
--        but AND-ed with an approved org) ─────────────────────────────────────
create or replace function can_write_org_as(p_actor uuid, target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from organizations o
           where o.id = target_org and o.approval_status = 'approved'
         )
     and (
       has_membership_as(p_actor, target_org)
       or exists (
         select 1
         from engagements e
         join memberships m
           on m.org_id = e.firm_org_id and m.user_id = p_actor and m.status = 'active'
         where e.client_org_id = target_org
           and e.status = 'active'
           and e.access = 'full'
           and ( m.role = 'firm_admin'
                 or exists (select 1 from client_assignments ca
                            where ca.engagement_id = e.id and ca.user_id = p_actor) )
       )
     );
$$;

-- ── 4 · staff approve / decline (audited) ─────────────────────────────────────
create or replace function set_org_approval(p_org uuid, p_status org_approval)
returns organizations
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
begin
  if not is_platform_staff() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('approved', 'declined') then
    raise exception 'bad_status' using errcode = 'invalid_parameter_value';
  end if;

  update organizations set approval_status = p_status
   where id = p_org
   returning * into v_org;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;

  insert into admin_audit (actor_email, action, target_type, target_id, payload)
  values (
    coalesce(auth.email(), 'unknown'),
    'org.approval.' || p_status::text,
    'organization', v_org.id::text,
    jsonb_build_object('name', v_org.name, 'type', v_org.type)
  );

  return v_org;
end$$;

revoke all on function set_org_approval(uuid, org_approval) from public;
grant execute on function set_org_approval(uuid, org_approval) to authenticated;

-- ── 5 · staff pending-signups queue (the console Approvals list) ──────────────
create or replace function staff_list_pending_orgs()
returns table (
  id uuid, name text, type org_type, created_at timestamptz, owner_email text
) language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.type, o.created_at, u.email::text
  from organizations o
  join memberships m on m.org_id = o.id and m.role in ('owner', 'firm_admin')
  join auth.users u on u.id = m.user_id
  where o.approval_status = 'pending'
    and is_platform_staff()
  order by o.created_at asc;
$$;

revoke all on function staff_list_pending_orgs() from public;
grant execute on function staff_list_pending_orgs() to authenticated;
