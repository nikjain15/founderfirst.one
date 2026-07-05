-- Wave-3 integration fixes (P1/P1/P2 flagged by the wave-gate audit).
--
-- FIX 1 (P1) — restore the 'period.close' ledger_audit insert that the W5.4
--   rewrite of close_accounting_period (20260707080000_w5_4_writepath.sql)
--   dropped. The audit trail must match pre-W5.4 behaviour (same actor/org/
--   period/detail shape from 20260630080000_ledger_audit.sql) PLUS the new FX
--   revaluation run.
--
-- FIX 2 (P1) — server-side MFA enforcement. When an org has mfa_required = true
--   (SEC-1 opt-in policy), its org-scoped write RPCs must require an aal2
--   (MFA-verified) session. Enforced inside can_write_org_as so every SECDEF
--   write path (ledger/cpa/bill/org-settings) is covered at once; aal1 reads go
--   through can_access_org and are unaffected. Orgs that never enabled the
--   policy are never gated.
--
-- FIX 3 (P2) — recovery-code double-redeem: consume_mfa_recovery_code did a
--   SELECT ... then a separate UPDATE by id with no used_at guard, so two
--   concurrent calls both saw the code unused and both "succeeded". Redeem in a
--   single guarded UPDATE (used_at IS NULL) and key success off row_count = 1.

-- ============================================================================
-- FIX 1 — restore 'period.close' ledger_audit row in close_accounting_period
-- ============================================================================
create or replace function close_accounting_period(p_actor uuid, p_org uuid, p_period_id uuid)
returns accounting_periods language plpgsql security definer set search_path = public as $$
declare v_p accounting_periods;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  -- run the revaluation BEFORE flipping status (it must post INTO the closing
  -- period — design §5, guarded by the close-vs-post lock).
  perform run_period_fx_revaluation(p_actor, p_org, p_period_id);
  update accounting_periods set status = 'closed', closed_by = p_actor, closed_at = now()
   where id = p_period_id and org_id = p_org
  returning * into v_p;
  if not found then raise exception 'not_found: period % not in org %', p_period_id, p_org using errcode = 'no_data_found'; end if;
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'period.close', 'period', p_period_id,
            jsonb_build_object('period_start', v_p.period_start, 'period_end', v_p.period_end));
  return v_p;
end$$;

revoke all on function close_accounting_period(uuid, uuid, uuid) from public;
grant execute on function close_accounting_period(uuid, uuid, uuid) to service_role;

-- ============================================================================
-- FIX 2 — server-side MFA enforcement on the org write path
-- ============================================================================
-- org_requires_mfa: true iff the org opted in to the SEC-1 "MFA required" policy.
create or replace function org_requires_mfa(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select mfa_required from public.org_accounting_settings where org_id = p_org),
    false);
$$;

-- session_is_aal2: the caller's request JWT is MFA-verified (aal claim = aal2).
-- A trusted backend caller (service_role, or no request JWT at all) is NOT
-- gated: those paths already went through their own authorization and Supabase
-- Auth does not stamp an 'aal' claim on the service_role key.
create or replace function session_is_aal2()
returns boolean language sql stable set search_path = public as $$
  select case
    when coalesce(current_setting('request.jwt.claims', true), '') = '' then true
    when (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' then true
    else (current_setting('request.jwt.claims', true)::jsonb ->> 'aal') = 'aal2'
  end;
$$;

-- Extend the shared write gate: any org-scoped SECDEF write RPC that calls
-- can_write_org_as is now also MFA-gated when the org requires it. Body below
-- is the exact 20260629125000 definition plus the opt-in MFA guard; signature
-- unchanged so existing grants/callers are preserved.
create or replace function can_write_org_as(p_actor uuid, target_org uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_ok boolean;
begin
  v_ok := has_membership_as(p_actor, target_org)
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
      );
  if not v_ok then return false; end if;
  -- opt-in MFA policy: only gate orgs that enabled it.
  if org_requires_mfa(target_org) and not session_is_aal2() then
    raise exception 'mfa_required: org % requires an MFA-verified session', target_org
      using errcode = 'insufficient_privilege';
  end if;
  return true;
end$$;

revoke all on function can_write_org_as(uuid, uuid) from public;
grant execute on function can_write_org_as(uuid, uuid) to service_role;
grant execute on function org_requires_mfa(uuid) to service_role;
grant execute on function session_is_aal2() to authenticated, service_role;

-- ============================================================================
-- FIX 3 — recovery-code double-redeem guard
-- ============================================================================
create or replace function consume_mfa_recovery_code(p_actor uuid, p_code text)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_count integer;
begin
  v_hash := encode(digest(upper(trim(p_code)), 'sha256'), 'hex');
  -- single guarded UPDATE: a given code redeems at most once even under
  -- concurrent calls (the used_at IS NULL predicate + row lock serialize them).
  update mfa_recovery_codes set used_at = now()
   where user_id = p_actor and code_hash = v_hash and used_at is null;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    return false;
  end if;
  insert into security_audit (user_id, action, detail)
    values (p_actor, 'mfa.recovery_used', '{}'::jsonb);
  return true;
end$$;

revoke all on function consume_mfa_recovery_code(uuid, text) from public;
grant execute on function consume_mfa_recovery_code(uuid, text) to service_role;
