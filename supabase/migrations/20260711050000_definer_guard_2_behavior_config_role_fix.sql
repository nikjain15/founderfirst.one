-- DEFINER-GUARD-2 — get_effective_behavior_config caller-role-aware fix -----
--
-- get_effective_behavior_config(p_org) is `security definer`, granted to
-- `anon, authenticated` (by design — pre-auth callers need the platform-
-- default read with p_org = null), but never checked membership before
-- folding in `org_behavior_overrides.behavior` for a caller-supplied p_org:
-- any anon/authenticated caller could pass another tenant's org id and read
-- its tuned autonomy thresholds (asks/week, confidence cutoffs, SLA days —
-- config-tuning data, no financial/PII). A blanket `can_access_org` guard
-- would ALSO break the 3 edge fns (receipts, categorize, invoicing) that
-- call this RPC via a service-role client with no per-user JWT
-- (auth.uid() is null there) — so the fix has to be caller-role-aware, not
-- a flat membership check.
--
-- Fix: the org-override branch now requires EITHER a service-role caller
-- (the legitimate backend reads) OR real membership (can_access_org). A
-- non-member anon/authenticated caller still gets a result (never an
-- error) — it just falls through to the platform default, same as if no
-- override existed. p_org = null (the pre-auth default read) is untouched.

create or replace function get_effective_behavior_config(p_org uuid default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select
    coalesce((select behavior from platform_config where id = true), '{}'::jsonb)
    || coalesce(
         (select behavior from org_behavior_overrides o
           where p_org is not null
             and o.org_id = p_org
             and (auth.role() = 'service_role' or can_access_org(p_org))),
         '{}'::jsonb
       );
$$;

grant execute on function get_effective_behavior_config(uuid) to anon, authenticated;
