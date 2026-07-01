-- [stress:staff] FIX — gate break-glass OPEN on is_admin_editor(), not is_platform_staff().
--
-- THE BREAK (proven on prod, rolled back): break-glass is the cross-tenant
-- capability the staff lens adds — opening a window is a state-changing, audited
-- WRITE that grants a staff member READ access to a tenant's books. It was gated on
-- is_platform_staff() = "your email is in `admins`", which is true for EVERY admin
-- tier, including VIEWER.
--
-- The pre-onboarding admin-tiers work (20260630060000) established the invariant
-- "a VIEWER admin is read-only and makes NO changes", and its companion
-- (20260630065000) re-gated 39 mutating admin RPCs from is_admin() to
-- is_admin_editor(). But break-glass was MISSED by that sweep because it gates on
-- is_platform_staff(), not is_admin() — so the regex-driven re-gate never touched
-- it. Result: a read-only Viewer could open a break-glass window and read any
-- tenant's full books. (The 6 current prod Viewers all had this capability.)
--
-- FIX: open_break_glass now requires is_admin_editor() (editor or super). This is
-- the privilege-EXPANDING action and belongs behind the same gate as every other
-- admin mutation. The body is otherwise reproduced VERBATIM from
-- 20260629215000_phase5_platform_staff.sql.
--
-- close_break_glass is deliberately LEFT on is_platform_staff(): closing only ever
-- REDUCES exposure (a de-escalation / safety valve), and any platform staff member
-- who notices an open window should be able to shut it. This mirrors the existing
-- choice to keep log_admin_action() on is_admin() so non-editor staff can still
-- close + audit. (After this change, only editors/supers can OPEN a window, so the
-- "Close now" control in the staff console is only ever reachable for windows an
-- editor/super opened anyway.)
--
-- Additive + idempotent: changes only the auth gate; grants are preserved by
-- CREATE OR REPLACE and re-stated below for self-containedness.

create or replace function open_break_glass(p_org uuid, p_reason text, p_minutes int default 60)
returns break_glass_grants language plpgsql security definer set search_path = public as $$
declare v_grant break_glass_grants; v_uid uuid; v_email text := auth.email();
begin
  if not is_admin_editor() then
    raise exception 'forbidden: break-glass requires an editor or super admin'
      using errcode = 'insufficient_privilege';
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

revoke all on function open_break_glass(uuid, text, int) from public;
grant execute on function open_break_glass(uuid, text, int) to authenticated, service_role;
