-- =============================================================================
-- FounderFirst — outreach persona (single voice, per-surface task note)
-- =============================================================================
--
-- One canonical voice guide (penny_voice) already drives every surface. Each
-- surface then layers a small, surface-specific TASK NOTE on top — exactly the
-- pattern Discord already uses (penny_discord_persona): live voice + persona.
--
-- Until now two outreach surfaces kept that task note hard-coded in code,
-- invisible and un-editable, and email ignored the voice guide entirely:
--   - Signals outreach  -> rules baked into tools/signals-worker/brain.mjs
--   - Email composition  -> SYSTEM baked into tools/signals-worker/compose-server.mjs
--
-- This is the SINGLE, surface-keyed store for those task notes, so we don't grow
-- a new table per surface. The runtime assembles, for each surface:
--   <live voice guide>  +  <this task note>  +  <code-held output contract>
-- Until a version is published per surface, the runtime falls back to its
-- baked-in default, so behaviour is unchanged by this migration.
--
-- Mirrors penny_discord_persona (migration 20260627140001) exactly, plus a
-- `surface` discriminator and per-surface versioning / one-live-per-surface.
-- =============================================================================

create table if not exists penny_outreach_persona (
  id           uuid        primary key default gen_random_uuid(),
  surface      text        not null check (surface in ('signals', 'email')),
  version      int         not null,
  body         text        not null,
  notes        text,
  is_live      boolean     not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users(id) on delete set null
);

-- One live version PER SURFACE (not one globally).
create unique index if not exists penny_outreach_persona_one_live
  on penny_outreach_persona (surface) where is_live = true;

create index if not exists penny_outreach_persona_surface_version
  on penny_outreach_persona (surface, version desc);

-- Version numbers increment per surface.
create or replace function penny_outreach_persona_set_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
    from penny_outreach_persona where surface = new.surface;
  end if;
  return new;
end;
$$;

drop trigger if exists penny_outreach_persona_version_trg on penny_outreach_persona;
create trigger penny_outreach_persona_version_trg
  before insert on penny_outreach_persona
  for each row execute function penny_outreach_persona_set_version();

alter table penny_outreach_persona enable row level security;

drop policy if exists penny_outreach_persona_no_direct on penny_outreach_persona;
create policy penny_outreach_persona_no_direct on penny_outreach_persona
  for all using (false) with check (false);

-- =============================================================================
-- RPCs
-- =============================================================================

-- Public: the live task note for a surface. Used by the signals-worker /
-- email-compose runtime (service role / anon).
create or replace function get_live_outreach_persona(p_surface text)
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
  from penny_outreach_persona
  where is_live = true and surface = p_surface
  limit 1;
$$;

grant execute on function get_live_outreach_persona(text) to anon, authenticated;

-- Admin: list all versions for a surface, newest first.
create or replace function list_outreach_persona(p_surface text)
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
    raise exception 'list_outreach_persona: admin access required';
  end if;

  return query
    select
      v.id, v.surface, v.version, v.body, v.notes, v.is_live, v.created_at,
      v.created_by,
      (select email from auth.users u where u.id = v.created_by)::text as created_by_email
    from penny_outreach_persona v
    where v.surface = p_surface
    order by v.version desc;
end;
$$;

grant execute on function list_outreach_persona(text) to authenticated;

-- Admin: save a new (non-live) version for a surface.
create or replace function create_outreach_persona_version(
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
    raise exception 'create_outreach_persona_version: admin access required';
  end if;

  if p_surface not in ('signals', 'email') then
    raise exception 'create_outreach_persona_version: unknown surface %', p_surface;
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'create_outreach_persona_version: body cannot be empty';
  end if;

  insert into penny_outreach_persona (surface, body, notes, created_by, is_live)
  values (p_surface, p_body, p_notes, auth.uid(), false)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function create_outreach_persona_version(text, text, text) to authenticated;

-- Admin: publish a version (scoped to its own surface — leaves other surfaces' live rows untouched).
create or replace function set_live_outreach_persona(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface text;
begin
  if not is_admin() then
    raise exception 'set_live_outreach_persona: admin access required';
  end if;

  select surface into v_surface from penny_outreach_persona where id = p_id;
  if v_surface is null then
    raise exception 'set_live_outreach_persona: version not found';
  end if;

  update penny_outreach_persona set is_live = false where is_live = true and surface = v_surface and id <> p_id;
  update penny_outreach_persona set is_live = true  where id = p_id;
end;
$$;

grant execute on function set_live_outreach_persona(uuid) to authenticated;

-- =============================================================================
-- Seed the initial live versions from the current baked-in task notes, so the
-- admin editor opens on exactly what production is running today. Kept in sync
-- with SIGNALS_PERSONA_BASE (brain.mjs) and EMAIL_PERSONA_BASE (compose-server.mjs).
-- =============================================================================

insert into penny_outreach_persona (surface, body, notes, is_live)
select 'signals',
$body$You draft short, problem-driven outreach for FounderFirst, a bookkeeping/accounting service for US founders, freelancers, and small businesses. You are replying in a public/community thread.

Rules:
- Reference a SPECIFIC detail from their post so it's obviously not a template.
- Open with a concrete, useful insight about their exact problem — never flattery, never "congrats" or "sounds like you've built something real".
- Lead with real help on THEIR exact problem. Mention FounderFirst in at most ONE sentence, only if it fits naturally — otherwise not at all.
- Never hard-sell. No "we help businesses like yours", no feature lists.
- Don't claim to be a fellow founder or invent facts about them.
- Plain, human, specific. Under 80 words. Write ONLY the message body — no subject, preamble, or quotes.$body$,
       'Initial version — seeded from brain.mjs SIGNALS_PERSONA_BASE.',
       true
where not exists (select 1 from penny_outreach_persona where surface = 'signals');

insert into penny_outreach_persona (surface, body, notes, is_live)
select 'email',
$body$You write short transactional/announcement emails for FounderFirst, a bookkeeping and accounting service for US founders, freelancers, and small-business owners.

Rules:
- Write for a non-technical reader; plain, warm, and useful — never salesy or hypey.
- Do not invent specific numbers, dates, or names that the brief didn't give you. Keep it honest and concrete.
- Do not use {curly-brace} placeholders.
- Never name the underlying technology, and never approximate a price.
- Sign off as "— The FounderFirst team".$body$,
       'Initial version — seeded from compose-server.mjs EMAIL_PERSONA_BASE.',
       true
where not exists (select 1 from penny_outreach_persona where surface = 'email');

-- =============================================================================
-- End of migration.
-- =============================================================================
