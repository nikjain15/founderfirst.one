-- =============================================================================
-- FounderFirst — platform_config + per-org behavior overrides — card CENTRAL-1
-- =============================================================================
--
-- The trust-tier / autonomy knobs (confidence cutoffs, ≤5 asks/week budget,
-- auto-propose limit, digest cadence) were magic numbers baked into apps/app and
-- the categorize edge fn. That is the third ❌ in the roadmap registry: behavior
-- thresholds must be DATA, admin-tunable, no redeploy (Roadmap principle #3).
--
-- Design:
--   platform_config          — one jsonb row of platform-wide defaults (the values
--                              tuning affects everyone). Admin-writable via RPC.
--   org_behavior_overrides   — sparse per-org override map (jsonb): only the keys an
--                              org differs on. Owner-scoped, folded OVER the default.
--   get_effective_behavior_config(p_org) — the single reader the app + fns call:
--                              platform default with the org override merged on top.
--
-- The seed MUST match apps/app/src/copy/config.ts CONFIG_DEFAULTS (baked fallback)
-- and the categorize fn's fallbacks, so behavior is identical whether or not the
-- fetch has landed.
-- =============================================================================

-- ── platform_config: a single canonical settings row ────────────────────────
create table if not exists platform_config (
  id          boolean     primary key default true check (id),  -- singleton row
  behavior    jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users(id) on delete set null
);

alter table platform_config enable row level security;

-- No direct table access; everything goes through the RPCs below.
drop policy if exists platform_config_no_direct on platform_config;
create policy platform_config_no_direct on platform_config
  for all using (false) with check (false);

-- Seed the singleton with the trust-tier defaults (must match config.ts).
insert into platform_config (id, behavior)
values (true, jsonb_build_object(
  'confidence_high',     0.75,
  'confidence_medium',   0.45,
  'auto_propose_limit',  8,
  'asks_per_week',       5,
  'digest_cadence_days', 7
))
on conflict (id) do nothing;

-- ── org_behavior_overrides: sparse per-org overrides ────────────────────────
create table if not exists org_behavior_overrides (
  org_id      uuid        primary key references organizations(id) on delete cascade,
  behavior    jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users(id) on delete set null
);

alter table org_behavior_overrides enable row level security;

-- Readable by anyone who can access the org; writes go through the RPC.
drop policy if exists org_behavior_overrides_read on org_behavior_overrides;
create policy org_behavior_overrides_read on org_behavior_overrides
  for select using (can_access_org(org_id));

drop policy if exists org_behavior_overrides_no_write on org_behavior_overrides;
create policy org_behavior_overrides_no_write on org_behavior_overrides
  for all using (false) with check (false);

-- =============================================================================
-- Readers / writers
-- =============================================================================

-- The effective config for an org = platform default with the org override merged
-- on top (org keys win). Pass null p_org for the platform default alone. This is
-- the ONE function the app hook + the categorize edge fn call.
create or replace function get_effective_behavior_config(p_org uuid default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select
    coalesce((select behavior from platform_config where id = true), '{}'::jsonb)
    || coalesce(
         (select behavior from org_behavior_overrides o where p_org is not null and o.org_id = p_org),
         '{}'::jsonb
       );
$$;

grant execute on function get_effective_behavior_config(uuid) to anon, authenticated;

-- Admin: read the raw platform defaults (for the admin config editor).
create or replace function get_platform_config()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'get_platform_config: admin access required';
  end if;
  return coalesce((select behavior from platform_config where id = true), '{}'::jsonb);
end;
$$;

grant execute on function get_platform_config() to authenticated;

-- Admin: set/merge platform-wide behavior keys. Merges (does not replace) so a
-- one-key change leaves the rest intact.
create or replace function set_platform_behavior(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb;
begin
  if not is_admin() then
    raise exception 'set_platform_behavior: admin access required';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'set_platform_behavior: patch must be a json object';
  end if;

  insert into platform_config (id, behavior, updated_at, updated_by)
  values (true, p_patch, now(), auth.uid())
  on conflict (id) do update
    set behavior = platform_config.behavior || excluded.behavior,
        updated_at = now(),
        updated_by = auth.uid()
  returning behavior into v_new;

  return v_new;
end;
$$;

grant execute on function set_platform_behavior(jsonb) to authenticated;

-- =============================================================================
-- End of migration.
-- =============================================================================
