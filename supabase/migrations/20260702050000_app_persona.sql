-- =============================================================================
-- FounderFirst — Penny in-app persona (live, surface-keyed) — card CENTRAL-1
-- =============================================================================
--
-- Penny's in-app language (the categorize rationale framing today; Review /
-- thread copy tomorrow) was baked into the `categorize` edge fn as a code-held
-- SYSTEM string. That is the third ❌ in the roadmap registry: Penny's prompts
-- must be a LIVE surface-keyed persona, editable from admin with no redeploy —
-- exactly the proven pattern of `penny_discord_persona` (20260627140001) and
-- `penny_outreach_persona` (20260629120000).
--
-- This is that store for the app. It mirrors penny_outreach_persona 1:1 (surface
-- discriminator, per-surface versioning, one-live-per-surface, admin RPCs) so
-- there is ONE shape to reason about. The runtime (categorize fn) reads the live
-- 'app' body via get_live_app_persona with a ~60s cache and a baked-in fallback,
-- so editing the persona changes Penny's in-app language live; until a version is
-- published the runtime uses its baked default and behavior is unchanged.
-- =============================================================================

create table if not exists penny_app_persona (
  id           uuid        primary key default gen_random_uuid(),
  surface      text        not null check (surface in ('app')),
  version      int         not null,
  body         text        not null,
  notes        text,
  is_live      boolean     not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users(id) on delete set null
);

-- One live version PER SURFACE (future surfaces: 'review', 'thread', …).
create unique index if not exists penny_app_persona_one_live
  on penny_app_persona (surface) where is_live = true;

create index if not exists penny_app_persona_surface_version
  on penny_app_persona (surface, version desc);

create or replace function penny_app_persona_set_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
    from penny_app_persona where surface = new.surface;
  end if;
  return new;
end;
$$;

drop trigger if exists penny_app_persona_version_trg on penny_app_persona;
create trigger penny_app_persona_version_trg
  before insert on penny_app_persona
  for each row execute function penny_app_persona_set_version();

alter table penny_app_persona enable row level security;

drop policy if exists penny_app_persona_no_direct on penny_app_persona;
create policy penny_app_persona_no_direct on penny_app_persona
  for all using (false) with check (false);

-- =============================================================================
-- RPCs (identical contract to outreach persona)
-- =============================================================================

-- Public: the live body for a surface. Used by the categorize runtime (service role).
create or replace function get_live_app_persona(p_surface text)
returns table (
  id         uuid,
  surface    text,
  version    int,
  body       text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, surface, version, body, created_at as updated_at
  from penny_app_persona
  where is_live = true and surface = p_surface
  limit 1;
$$;

grant execute on function get_live_app_persona(text) to anon, authenticated;

-- Admin: list all versions for a surface, newest first.
create or replace function list_app_persona(p_surface text)
returns table (
  id           uuid,
  surface      text,
  version      int,
  body         text,
  notes        text,
  is_live      boolean,
  created_at   timestamptz,
  created_by   uuid,
  created_by_email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'list_app_persona: admin access required';
  end if;

  return query
    select
      v.id, v.surface, v.version, v.body, v.notes, v.is_live, v.created_at,
      v.created_by,
      (select email from auth.users u where u.id = v.created_by)::text as created_by_email
    from penny_app_persona v
    where v.surface = p_surface
    order by v.version desc;
end;
$$;

grant execute on function list_app_persona(text) to authenticated;

-- Admin: save a new (non-live) version for a surface.
create or replace function create_app_persona_version(
  p_surface text,
  p_body    text,
  p_notes   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not is_admin() then
    raise exception 'create_app_persona_version: admin access required';
  end if;

  if p_surface not in ('app') then
    raise exception 'create_app_persona_version: unknown surface %', p_surface;
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'create_app_persona_version: body cannot be empty';
  end if;

  insert into penny_app_persona (surface, body, notes, created_by, is_live)
  values (p_surface, p_body, p_notes, auth.uid(), false)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function create_app_persona_version(text, text, text) to authenticated;

-- Admin: publish a version (scoped to its own surface).
create or replace function set_live_app_persona(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface text;
begin
  if not is_admin() then
    raise exception 'set_live_app_persona: admin access required';
  end if;

  select surface into v_surface from penny_app_persona where id = p_id;
  if v_surface is null then
    raise exception 'set_live_app_persona: version not found';
  end if;

  update penny_app_persona set is_live = false where is_live = true and surface = v_surface and id <> p_id;
  update penny_app_persona set is_live = true  where id = p_id;
end;
$$;

grant execute on function set_live_app_persona(uuid) to authenticated;

-- =============================================================================
-- Seed the initial live 'app' version from the current baked-in categorize SYSTEM
-- prompt, so the admin editor opens on exactly what production runs today. Kept in
-- sync with APP_PERSONA_BASE (supabase/functions/_shared/appPersona.ts).
-- =============================================================================

insert into penny_app_persona (surface, body, notes, is_live)
select 'app',
$body$You are Penny, an autonomous bookkeeper. Categorize one bank transaction by choosing the single best ledger account from the chart of accounts provided. You MUST return an account_id that appears in the list — never invent one. Prefer income accounts for money in and expense accounts for money out. If nothing is a good fit, pick the closest and give it a low confidence.

Write the rationale as one short, plain-language sentence a business owner would understand — warm and specific, no jargon, no exclamation marks.$body$,
       'Initial version — seeded from the categorize edge fn SYSTEM prompt (APP_PERSONA_BASE).',
       true
where not exists (select 1 from penny_app_persona where surface = 'app');

-- =============================================================================
-- End of migration.
-- =============================================================================
