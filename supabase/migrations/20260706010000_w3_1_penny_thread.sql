-- =============================================================================
-- W3.1 — Penny thread in-app: actor-based READ gate for the grounded-Q&A fn.
-- =============================================================================
--
-- The penny-thread edge fn answers a grounded books question. A question is a
-- READ (it reports figures the owner can already see in Reports), so a read-only
-- CPA may ask too — the gate is READ access, not write access. The fn runs under
-- the service-role client (like categorize), so it needs an ACTOR-based read check
-- it can call with the JWT-verified user id.
--
-- can_access_org(target_org) already exists but reads auth.uid() (the RLS path) —
-- under the service role auth.uid() is null, so it can't be used from the fn. This
-- adds the actor-parameterised twin `can_access_org_as(p_actor, target_org)`,
-- mirroring the existing can_write_org_as(p_actor, target_org) exactly:
--   • SECURITY DEFINER, same membership+engagement logic as can_access_org
--   • EXECUTE granted ONLY to service_role — never anon/authenticated. This keeps
--     it OFF the client-callable PostgREST surface (LEARNINGS: the forged-actor
--     [stress:isolation] F1 hole was exactly a p_actor-first SECDEF fn left
--     EXECUTE-grantable to PUBLIC). The only call path is edge fn → service role.
--
-- ADDITIVE + idempotent. No data change, no new table. The thread itself stores
-- nothing server-side (turns are ephemeral UI state); Penny's language is the live
-- 'app' persona (already seeded, 20260702050000) — this card reuses it, so there
-- is no new persona surface.
-- =============================================================================

create or replace function can_access_org_as(p_actor uuid, target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Same READ capability as can_access_org(target_org), but for an explicit actor:
  -- an active member of the org, OR a CPA with an active engagement (any access
  -- level — read-only CPAs can view). Mirrors has_membership / has_engagement_access
  -- but keyed off p_actor rather than auth.uid().
  select
    exists (
      select 1 from memberships m
      where m.org_id = target_org and m.user_id = p_actor and m.status = 'active'
    )
    or exists (
      select 1
      from engagements e
      join memberships m
        on m.org_id = e.firm_org_id and m.user_id = p_actor and m.status = 'active'
      where e.client_org_id = target_org
        and e.status = 'active'
        and ( m.role = 'firm_admin'
              or exists (select 1 from client_assignments ca
                         where ca.engagement_id = e.id and ca.user_id = p_actor) )
    );
$$;

-- Off the client-callable surface: service_role only (the edge-fn path), never
-- anon/authenticated (would be a cross-tenant membership oracle otherwise).
revoke all on function can_access_org_as(uuid, uuid) from public;
revoke all on function can_access_org_as(uuid, uuid) from anon;
revoke all on function can_access_org_as(uuid, uuid) from authenticated;
grant execute on function can_access_org_as(uuid, uuid) to service_role;

-- =============================================================================
-- End of migration.
-- =============================================================================
