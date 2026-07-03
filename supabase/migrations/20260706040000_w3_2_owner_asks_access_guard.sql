-- =============================================================================
-- W3.2 fix · owner_asks_this_week — add the missing can_access_org guard.
-- =============================================================================
-- Wave-3 audit F1 (P1, security · cross-tenant read): owner_asks_this_week is
-- SECURITY DEFINER and granted to `authenticated`, but — unlike its sibling
-- list_penny_activity (which filters `... and can_access_org(p_org)`) — it had
-- NO membership guard. So any authenticated user could pass any org's id and
-- read that org's weekly interruption count. This CREATE OR REPLACE re-adds the
-- guard, matching how list_penny_activity gates its read.
--
-- Behavior: a non-member is forbidden (42501, insufficient_privilege) rather
-- than silently returning a count for someone else's org. A member still gets
-- their own org's count. Signature, return type, stability, SECURITY DEFINER,
-- and `set search_path = public` are all preserved. The count still reads from
-- the ai_decisions ledger (use_case = 'owner_interruption'); the ≤N/week budget
-- cutoff is still the caller's job (never hardcoded here).
-- Deployed original: 20260705010000_w3_2_trust_tiered_autonomy.sql (do not edit).

create or replace function owner_asks_this_week(p_org uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
begin
  -- Same READ capability gate as list_penny_activity(p_org): an active member of
  -- the org, or a CPA with an active engagement. Forbid everyone else so the
  -- count can never be read cross-tenant.
  if not can_access_org(p_org) then
    raise exception 'not authorized to read this org'
      using errcode = '42501';
  end if;

  return (
    select coalesce(count(*), 0)::int
      from ai_decisions
     where tenant_id = 'org:' || p_org::text
       and use_case = 'owner_interruption'
       and created_at >= date_trunc('week', now())
  );
end;
$$;

-- Same grant as before: org-scoped, gated inside the function; readable by authed.
grant execute on function owner_asks_this_week(uuid) to authenticated;

-- =============================================================================
-- End of migration.
-- =============================================================================
