-- E2E P2-4 — membership lifecycle: remove member + transfer ownership (ARCHITECTURE
-- §5.4 were unbuilt). Enforces the LAST-OWNER guard: a business keeps ≥1 active
-- owner and a firm keeps ≥1 active firm_admin — removal of the final one is refused;
-- ownership must be transferred first. Removal is a soft status flip (suspended) so
-- the ledger this user authored stays attributed (append-only) while access is cut.

create or replace function transfer_ownership(p_actor uuid, p_org uuid, p_to_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_type org_type; v_owner_role member_role;
begin
  select type into v_type from organizations where id = p_org;
  if not found then raise exception 'not_found: org %', p_org using errcode = 'no_data_found'; end if;
  v_owner_role := case when v_type = 'firm' then 'firm_admin' else 'owner' end;

  if not exists (select 1 from memberships where user_id = p_actor and org_id = p_org
                   and role = v_owner_role and status = 'active') then
    raise exception 'forbidden: only an active owner may transfer ownership' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from memberships where user_id = p_to_user and org_id = p_org and status = 'active') then
    raise exception 'bad_target: the new owner must be an active member of this org' using errcode = 'invalid_parameter_value';
  end if;
  update memberships set role = v_owner_role where user_id = p_to_user and org_id = p_org;
end$$;

create or replace function remove_member(p_actor uuid, p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_type org_type; v_owner_role member_role; v_target_role member_role; v_owner_ct int;
begin
  select type into v_type from organizations where id = p_org;
  if not found then raise exception 'not_found: org %', p_org using errcode = 'no_data_found'; end if;
  v_owner_role := case when v_type = 'firm' then 'firm_admin' else 'owner' end;

  if not exists (select 1 from memberships where user_id = p_actor and org_id = p_org
                   and role = v_owner_role and status = 'active') then
    raise exception 'forbidden: only an active owner/admin may remove members' using errcode = 'insufficient_privilege';
  end if;

  select role into v_target_role from memberships where user_id = p_user and org_id = p_org and status = 'active';
  if not found then raise exception 'not_found: target is not an active member' using errcode = 'no_data_found'; end if;

  -- last-owner guard: never drop the org below one active owner/firm_admin.
  if v_target_role = v_owner_role then
    select count(*) into v_owner_ct from memberships
      where org_id = p_org and role = v_owner_role and status = 'active';
    if v_owner_ct <= 1 then
      raise exception 'last_owner: cannot remove the final owner — transfer ownership first'
        using errcode = 'restrict_violation';
    end if;
  end if;

  update memberships set status = 'suspended' where user_id = p_user and org_id = p_org;
end$$;

revoke all on function transfer_ownership(uuid, uuid, uuid) from public;
revoke all on function remove_member(uuid, uuid, uuid)      from public;
grant execute on function transfer_ownership(uuid, uuid, uuid) to service_role;
grant execute on function remove_member(uuid, uuid, uuid)      to service_role;
