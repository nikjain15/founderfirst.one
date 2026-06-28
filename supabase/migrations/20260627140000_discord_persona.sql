-- =============================================================================
-- FounderFirst Admin — Discord persona versioning
-- =============================================================================
--
-- The Discord bot's behavioral instruction block (output format, memory rules,
-- safety) was hard-coded in the Worker (buildDiscordSystemPrompt). This stores
-- it in Supabase so an admin can edit + version it from /admin/content#discord
-- without redeploying the Worker — exactly like penny_voice / penny_prompts.
--
-- The Worker fetches the live persona at runtime (cached ~60s) and assembles:
--   <live voice guide>  +  <this persona>  +  <runtime user_context block>
-- Until a version is published the Worker falls back to its baked-in
-- DISCORD_PERSONA_BASE, so Discord behaviour is unchanged by this migration.
--
-- Mirrors the structure of penny_voice (migration 013) exactly.
-- =============================================================================

create table if not exists penny_discord_persona (
  id           uuid        primary key default gen_random_uuid(),
  version      int         not null,
  body         text        not null,
  notes        text,
  is_live      boolean     not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users(id) on delete set null
);

create unique index if not exists penny_discord_persona_one_live
  on penny_discord_persona ((is_live)) where is_live = true;

create or replace function penny_discord_persona_set_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version from penny_discord_persona;
  end if;
  return new;
end;
$$;

drop trigger if exists penny_discord_persona_version_trg on penny_discord_persona;
create trigger penny_discord_persona_version_trg
  before insert on penny_discord_persona
  for each row execute function penny_discord_persona_set_version();

alter table penny_discord_persona enable row level security;

drop policy if exists penny_discord_persona_no_direct on penny_discord_persona;
create policy penny_discord_persona_no_direct on penny_discord_persona
  for all using (false) with check (false);

-- =============================================================================
-- RPCs
-- =============================================================================

-- Public: returns the currently live persona. Used by the Worker.
create or replace function get_live_discord_persona()
returns table (
  id         uuid,
  version    int,
  body       text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, version, body, created_at as updated_at
  from penny_discord_persona
  where is_live = true
  limit 1;
$$;

grant execute on function get_live_discord_persona() to anon, authenticated;

-- Admin: list all versions, newest first.
create or replace function list_discord_persona()
returns table (
  id           uuid,
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
    raise exception 'list_discord_persona: admin access required';
  end if;

  return query
    select
      v.id, v.version, v.body, v.notes, v.is_live, v.created_at,
      v.created_by,
      (select email from auth.users u where u.id = v.created_by)::text as created_by_email
    from penny_discord_persona v
    order by v.version desc;
end;
$$;

grant execute on function list_discord_persona() to authenticated;

create or replace function create_discord_persona_version(
  p_body  text,
  p_notes text default null
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
    raise exception 'create_discord_persona_version: admin access required';
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'create_discord_persona_version: body cannot be empty';
  end if;

  insert into penny_discord_persona (body, notes, created_by, is_live)
  values (p_body, p_notes, auth.uid(), false)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function create_discord_persona_version(text, text) to authenticated;

create or replace function set_live_discord_persona(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'set_live_discord_persona: admin access required';
  end if;

  if not exists (select 1 from penny_discord_persona where id = p_id) then
    raise exception 'set_live_discord_persona: version not found';
  end if;

  update penny_discord_persona set is_live = false where is_live = true and id <> p_id;
  update penny_discord_persona set is_live = true  where id = p_id;
end;
$$;

grant execute on function set_live_discord_persona(uuid) to authenticated;

-- =============================================================================
-- End of migration.
-- =============================================================================
