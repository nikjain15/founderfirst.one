-- E2E P1-1 — make invite acceptance ATOMIC + race-safe.
--
-- WHY: invites-accept (edge fn) was a non-transactional check-then-act — it read
-- invite.accepted_at, then did separate service-role inserts (firm → membership →
-- engagement → assignment), marking accepted_at only at the end, with NO lock on
-- the invite row. Two concurrent accepts (when the CPA had no firm yet) each
-- auto-created a DIFFERENT firm-of-one, so the unique(firm,client) guard never
-- fired → duplicate firm orgs + duplicate engagements (E2E A-race, proven live).
--
-- FIX: one SECURITY DEFINER function that runs in a single transaction and takes
-- `select … for update` on the invite row. The second concurrent caller blocks,
-- then sees accepted_at set → 'already_accepted'. The firm-of-one create +
-- engagement + assignment all commit together or not at all.
--
-- The edge fn becomes a thin wrapper that calls this and maps the message → HTTP.

create or replace function accept_invite(p_actor uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv     invites;
  v_email   text;
  v_firm_id uuid;
  v_eng_id  uuid;
begin
  if p_actor is null then raise exception 'unauthorized' using errcode = 'insufficient_privilege'; end if;

  -- serialize concurrent accepts of the SAME token on this row lock.
  select * into v_inv from invites where token = p_token for update;
  if not found then raise exception 'invalid_token' using errcode = 'no_data_found'; end if;
  if v_inv.accepted_at is not null then raise exception 'already_accepted' using errcode = 'restrict_violation'; end if;
  if v_inv.expires_at < now() then raise exception 'expired' using errcode = 'restrict_violation'; end if;

  -- the invite is bound to the email it was issued to (forwarded-link guard).
  select lower(trim(email)) into v_email from auth.users where id = p_actor;
  if coalesce(v_email,'') <> lower(trim(coalesce(v_inv.email,''))) then
    raise exception 'wrong_recipient' using errcode = 'insufficient_privilege';
  end if;

  -- ── membership invite ───────────────────────────────────────────────
  if v_inv.intended_role is not null then
    insert into memberships (user_id, org_id, role, status, invited_by)
    values (p_actor, v_inv.target_org_id, v_inv.intended_role, 'active', v_inv.invited_by)
    on conflict (user_id, org_id) do update set role = excluded.role, status = 'active';
    update invites set accepted_at = now() where id = v_inv.id;
    return jsonb_build_object('ok', true, 'org_id', v_inv.target_org_id, 'lens', 'owner_or_member');
  end if;

  -- ── engagement invite (CPA) ─────────────────────────────────────────
  -- find the accepter's firm; create a firm-of-one (atomically) if none.
  select m.org_id into v_firm_id
  from memberships m join organizations o on o.id = m.org_id
  where m.user_id = p_actor and m.status = 'active' and o.type = 'firm'
  limit 1;

  if v_firm_id is null then
    insert into organizations (type, name, created_by)
    values ('firm', initcap(split_part(split_part(v_email,'@',1),'.',1)) || '''s practice', p_actor)
    returning id into v_firm_id;
    insert into memberships (user_id, org_id, role, status) values (p_actor, v_firm_id, 'firm_admin', 'active');
    insert into subscriptions (billable_org_id, plan) values (v_firm_id, 'pilot_free');
  end if;

  -- activate the engagement firm → client with the granted access.
  begin
    insert into engagements (firm_org_id, client_org_id, status, access, initiated_by)
    values (v_firm_id, v_inv.target_org_id, 'active', v_inv.intended_access, v_inv.invited_by)
    returning id into v_eng_id;
  exception when unique_violation then
    -- a link for (this firm, this client) already exists → consume the token, report it.
    update invites set accepted_at = now() where id = v_inv.id;
    raise exception 'already_engaged' using errcode = 'unique_violation';
  end;

  insert into client_assignments (engagement_id, user_id, assigned_by)
  values (v_eng_id, p_actor, p_actor)
  on conflict (engagement_id, user_id) do nothing;

  update invites set accepted_at = now() where id = v_inv.id;
  return jsonb_build_object('ok', true, 'org_id', v_inv.target_org_id, 'lens', 'cpa', 'firm_id', v_firm_id);
end$$;

revoke all on function accept_invite(uuid, text) from public;
grant execute on function accept_invite(uuid, text) to service_role;
