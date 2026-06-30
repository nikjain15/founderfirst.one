-- E2E P1-3 / P2-3 — engagement lifecycle endpoints (ARCHITECTURE §8 were unbuilt).
--
-- WHY: RLS honours engagements.status='revoked' (E2E E6 proved access cuts), but
-- NOTHING in the product could set it — an owner could not cut a CPA off without
-- raw DB access. And a firm_admin could not assign a staff CPA to a specific
-- client (client_assignments was written only by invites-accept self-assign), so
-- the per-client need-to-know model was unconfigurable. These three SECURITY
-- DEFINER functions close both gaps; the `engagements` edge fn calls them.

-- revoke: the CLIENT's owner (cut off their CPA) OR the FIRM's firm_admin may revoke.
create or replace function revoke_engagement(p_actor uuid, p_engagement_id uuid)
returns engagements language plpgsql security definer set search_path = public as $$
declare v_e engagements;
begin
  select * into v_e from engagements where id = p_engagement_id;
  if not found then raise exception 'not_found: engagement %', p_engagement_id using errcode = 'no_data_found'; end if;

  if not (
    exists (select 1 from memberships m where m.user_id = p_actor and m.org_id = v_e.client_org_id
              and m.role = 'owner' and m.status = 'active')
    or exists (select 1 from memberships m where m.user_id = p_actor and m.org_id = v_e.firm_org_id
              and m.role = 'firm_admin' and m.status = 'active')
  ) then
    raise exception 'forbidden: only the client owner or the firm admin may revoke' using errcode = 'insufficient_privilege';
  end if;

  update engagements set status = 'revoked', revoked_at = now()
   where id = p_engagement_id returning * into v_e;
  return v_e;
end$$;

-- assign / unassign a firm member to a client engagement — firm_admin only.
create or replace function assign_cpa(p_actor uuid, p_engagement_id uuid, p_user_id uuid)
returns client_assignments language plpgsql security definer set search_path = public as $$
declare v_e engagements; v_ca client_assignments;
begin
  select * into v_e from engagements where id = p_engagement_id;
  if not found then raise exception 'not_found: engagement %', p_engagement_id using errcode = 'no_data_found'; end if;
  if not exists (select 1 from memberships m where m.user_id = p_actor and m.org_id = v_e.firm_org_id
                   and m.role = 'firm_admin' and m.status = 'active') then
    raise exception 'forbidden: only the firm admin may assign staff' using errcode = 'insufficient_privilege';
  end if;
  -- the assignee must be an active member of the SAME firm (need-to-know within firm).
  if not exists (select 1 from memberships m where m.user_id = p_user_id and m.org_id = v_e.firm_org_id
                   and m.status = 'active' and m.role in ('firm_admin','cpa')) then
    raise exception 'bad_assignee: user is not an active member of this firm' using errcode = 'invalid_parameter_value';
  end if;
  insert into client_assignments (engagement_id, user_id, assigned_by)
  values (p_engagement_id, p_user_id, p_actor)
  on conflict (engagement_id, user_id) do update set assigned_by = excluded.assigned_by
  returning * into v_ca;
  return v_ca;
end$$;

create or replace function unassign_cpa(p_actor uuid, p_engagement_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_e engagements;
begin
  select * into v_e from engagements where id = p_engagement_id;
  if not found then raise exception 'not_found: engagement %', p_engagement_id using errcode = 'no_data_found'; end if;
  if not exists (select 1 from memberships m where m.user_id = p_actor and m.org_id = v_e.firm_org_id
                   and m.role = 'firm_admin' and m.status = 'active') then
    raise exception 'forbidden: only the firm admin may unassign staff' using errcode = 'insufficient_privilege';
  end if;
  delete from client_assignments where engagement_id = p_engagement_id and user_id = p_user_id;
end$$;

revoke all on function revoke_engagement(uuid, uuid)        from public;
revoke all on function assign_cpa(uuid, uuid, uuid)         from public;
revoke all on function unassign_cpa(uuid, uuid, uuid)       from public;
grant execute on function revoke_engagement(uuid, uuid)     to service_role;
grant execute on function assign_cpa(uuid, uuid, uuid)      to service_role;
grant execute on function unassign_cpa(uuid, uuid, uuid)    to service_role;
