-- [stress:invites] INVTEST findings F1 + F2 — fixes inside the accept_invite RPC.
--
-- ⚠️  WRITE-BUT-DON'T-DEPLOY: authored by the INVTEST stress session; the integrator
--     applies it (Management API, not `db push`) once reviewed. Pure `create or
--     replace` of an existing function — additive, no schema/enum/table change.
--
-- F1 (HIGH) — re-invite after revoke was impossible. accept_invite inserted the
--   engagement and, on the unique(firm_org_id, client_org_id) violation from a
--   previously-REVOKED row, raised `already_engaged` (409). So once an owner revoked
--   a CPA, that firm could NEVER be re-engaged for that client — the leftover
--   'revoked' row permanently blocked re-acceptance. Home.tsx even tells a revoked
--   CPA to "ask the owner to re-invite you", which the backend then refused.
--   FIX: on unique_violation, look at the existing row — if it is NOT active,
--   re-activate it with the newly-granted access (revoked_at cleared); only an
--   already-ACTIVE engagement returns `already_engaged`.
--
-- F2 (HIGH) — no last-owner / last-admin protection on the membership-accept path.
--   The membership branch did `on conflict (user_id, org_id) do update set
--   role = excluded.role`, blindly overwriting. An owner (or firm_admin) who
--   accepted a *member* invite to their own org was silently DEMOTED, leaving the
--   org with ZERO owners/admins — irreversible without DB surgery (no owner left to
--   transfer ownership). The last-owner invariant is enforced in remove_member()
--   (20260630120000) but that guard was bypassed entirely here.
--   FIX: never demote on conflict — an existing owner/firm_admin keeps their role;
--   re-accepting only ever re-activates status. (No flow legitimately downgrades a
--   role via an invite: business member-invites carry role='member', firm
--   member-invites carry role='cpa'.)

create or replace function accept_invite(p_actor uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv     invites;
  v_email   text;
  v_firm_id uuid;
  v_eng_id  uuid;
  v_eng_status engagement_status;
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
    -- F2: re-accepting NEVER demotes an existing owner/firm_admin; it only
    -- (re)activates. A brand-new member is inserted with the invited role.
    insert into memberships (user_id, org_id, role, status, invited_by)
    values (p_actor, v_inv.target_org_id, v_inv.intended_role, 'active', v_inv.invited_by)
    on conflict (user_id, org_id) do update
      set status = 'active',
          role = case
                   when memberships.role in ('owner','firm_admin') then memberships.role
                   else excluded.role
                 end;
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
    -- F1: a link for (this firm, this client) already exists. If it is not active
    -- (revoked/pending), RE-ACTIVATE it with the freshly-granted access so an owner
    -- can re-engage a CPA they revoked. An already-ACTIVE link is a true duplicate.
    select id, status into v_eng_id, v_eng_status
      from engagements where firm_org_id = v_firm_id and client_org_id = v_inv.target_org_id;
    if v_eng_status = 'active' then
      raise exception 'already_engaged' using errcode = 'unique_violation';
    end if;
    update engagements
       set status = 'active', access = v_inv.intended_access,
           revoked_at = null, initiated_by = v_inv.invited_by
     where id = v_eng_id;
  end;

  insert into client_assignments (engagement_id, user_id, assigned_by)
  values (v_eng_id, p_actor, p_actor)
  on conflict (engagement_id, user_id) do nothing;

  update invites set accepted_at = now() where id = v_inv.id;
  return jsonb_build_object('ok', true, 'org_id', v_inv.target_org_id, 'lens', 'cpa', 'firm_id', v_firm_id);
end$$;

revoke all on function accept_invite(uuid, text) from public;
grant execute on function accept_invite(uuid, text) to service_role;
