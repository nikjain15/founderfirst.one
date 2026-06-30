-- Phase 5 — platform-staff identity + break-glass access (ARCHITECTURE.md §4.2, §11).
--
-- Internal staff are NEVER a tenant role. Today /admin gates on `is_admin()` =
-- "your JWT email is in the `admins` table". The new staff lens in apps/app must
-- grant EXACTLY the same people (no drift while both run in parallel for 1-2
-- months), so is_platform_staff() mirrors that email check. Underneath, we keep
-- the canonical `platform_staff` (user_id) allow-list in sync so a future
-- consolidation (when /admin retires) is a flip, not a migration scramble.
--
-- Staff access to a TENANT's data is break-glass: explicit, time-boxed, and
-- audited (written to admin_audit, the same log the Audit tab shows) — never
-- silent. staff_can_access_org() is the predicate the lens's read RPCs check; it
-- is deliberately NOT wired into tenant RLS (that stays membership/engagement
-- only), so this migration cannot widen any existing tenant's exposure.
--
-- Fully additive: it does not touch `admins`, is_admin(), or any /admin surface.

-- ── staff predicate — mirrors is_admin/is_super (single source = admins) ─────
create or replace function is_platform_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(coalesce(auth.email(), '')));
$$;

create or replace function is_platform_super()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(coalesce(auth.email(), '')) and is_super);
$$;

-- ── keep platform_staff (canonical, user_id-keyed) synced from admins ────────
-- Backfill the staff who already have an auth account; the rest sync the moment
-- their admins row is touched after they sign up. The email gate above covers
-- access meanwhile, so there is no access gap.
insert into platform_staff (user_id, is_super, added_at)
select u.id, a.is_super, a.added_at
  from admins a join auth.users u on lower(u.email) = lower(a.email)
on conflict (user_id) do update set is_super = excluded.is_super;

create or replace function sync_platform_staff_from_admins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    insert into platform_staff (user_id, is_super)
    select u.id, new.is_super from auth.users u where lower(u.email) = lower(new.email)
    on conflict (user_id) do update set is_super = excluded.is_super;
  end if;
  if tg_op = 'DELETE' then
    delete from platform_staff ps using auth.users u
     where ps.user_id = u.id and lower(u.email) = lower(old.email);
  end if;
  return null;
end$$;

drop trigger if exists trg_sync_platform_staff on admins;
create trigger trg_sync_platform_staff
  after insert or update or delete on admins
  for each row execute function sync_platform_staff_from_admins();

-- ── break-glass grants — time-boxed, audited tenant access ───────────────────
create table if not exists break_glass_grants (
  id              uuid primary key default gen_random_uuid(),
  staff_user_id   uuid not null references auth.users(id),
  org_id          uuid not null references organizations(id) on delete cascade,
  reason          text not null,
  opened_at       timestamptz not null default now(),
  expires_at      timestamptz not null,
  closed_at       timestamptz,
  opened_by_email text not null
);
create index if not exists break_glass_active_idx
  on break_glass_grants (staff_user_id, org_id) where closed_at is null;

alter table break_glass_grants enable row level security;
drop policy if exists bgg_select on break_glass_grants;
drop policy if exists bgg_no_client_write on break_glass_grants;
create policy bgg_select          on break_glass_grants for select using ( is_platform_staff() );
create policy bgg_no_client_write on break_glass_grants for all    using (false) with check (false);
grant select on break_glass_grants to authenticated;
grant select, insert, update on break_glass_grants to service_role;

-- the predicate the staff lens's read RPCs check (NOT used in tenant RLS).
create or replace function staff_can_access_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_staff() and exists (
    select 1 from break_glass_grants g join auth.users u on u.id = g.staff_user_id
     where g.org_id = p_org
       and lower(u.email) = lower(coalesce(auth.email(), ''))
       and g.closed_at is null and g.expires_at > now());
$$;

-- open a break-glass window (self-gated to staff; clamped 5min..8h; audited).
create or replace function open_break_glass(p_org uuid, p_reason text, p_minutes int default 60)
returns break_glass_grants language plpgsql security definer set search_path = public as $$
declare v_grant break_glass_grants; v_uid uuid; v_email text := auth.email();
begin
  if not is_platform_staff() then
    raise exception 'forbidden: platform staff only' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required: a reason is required to open break-glass' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from organizations where id = p_org) then
    raise exception 'org_not_found' using errcode = 'no_data_found';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(coalesce(v_email, ''));
  if v_uid is null then raise exception 'no_staff_user' using errcode = 'no_data_found'; end if;

  insert into break_glass_grants (staff_user_id, org_id, reason, expires_at, opened_by_email)
  values (v_uid, p_org, p_reason, now() + make_interval(mins => least(greatest(p_minutes, 5), 480)), v_email)
  returning * into v_grant;
  perform log_admin_action('break_glass.open', 'org', p_org::text,
            jsonb_build_object('reason', p_reason, 'expires_at', v_grant.expires_at, 'grant_id', v_grant.id));
  return v_grant;
end$$;

-- close a window early (idempotent; audited).
create or replace function close_break_glass(p_grant uuid)
returns break_glass_grants language plpgsql security definer set search_path = public as $$
declare v_grant break_glass_grants;
begin
  if not is_platform_staff() then
    raise exception 'forbidden: platform staff only' using errcode = 'insufficient_privilege';
  end if;
  update break_glass_grants set closed_at = now() where id = p_grant and closed_at is null returning * into v_grant;
  if not found then
    select * into v_grant from break_glass_grants where id = p_grant;
    if not found then raise exception 'grant_not_found' using errcode = 'no_data_found'; end if;
    return v_grant;  -- already closed → idempotent
  end if;
  perform log_admin_action('break_glass.close', 'org', v_grant.org_id::text, jsonb_build_object('grant_id', v_grant.id));
  return v_grant;
end$$;

-- ── grants (every fn self-gates; safe to expose to authenticated) ────────────
revoke all on function is_platform_staff()           from public;
revoke all on function is_platform_super()           from public;
revoke all on function staff_can_access_org(uuid)    from public;
revoke all on function open_break_glass(uuid, text, int) from public;
revoke all on function close_break_glass(uuid)       from public;
grant execute on function is_platform_staff()           to authenticated, service_role;
grant execute on function is_platform_super()           to authenticated, service_role;
grant execute on function staff_can_access_org(uuid)    to authenticated, service_role;
grant execute on function open_break_glass(uuid, text, int) to authenticated, service_role;
grant execute on function close_break_glass(uuid)       to authenticated, service_role;
