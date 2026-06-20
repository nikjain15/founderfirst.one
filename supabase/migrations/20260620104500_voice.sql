-- =============================================================================
-- FounderFirst Admin — Voice guide versioning (migration 013)
-- =============================================================================
--
-- One canonical voice/tone guide (VOICE.md) shared by every FounderFirst
-- surface — marketing copy, Penny in-product, the site bubble, the support
-- bot, the Discord bot. Stored in Supabase so an admin can edit + version it
-- from /admin/content#voice without redeploying anything. The Worker fetches
-- the live voice at runtime (cached ~60s) and prepends it to the bot-specific
-- system prompt.
--
-- Mirrors the structure of migration 012 (penny_prompts) exactly.
-- =============================================================================

create table if not exists penny_voice (
  id           uuid        primary key default gen_random_uuid(),
  version      int         not null,
  body         text        not null,
  notes        text,
  is_live      boolean     not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users(id) on delete set null
);

create unique index if not exists penny_voice_one_live
  on penny_voice ((is_live)) where is_live = true;

create or replace function penny_voice_set_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version from penny_voice;
  end if;
  return new;
end;
$$;

drop trigger if exists penny_voice_version_trg on penny_voice;
create trigger penny_voice_version_trg
  before insert on penny_voice
  for each row execute function penny_voice_set_version();

alter table penny_voice enable row level security;

drop policy if exists penny_voice_no_direct on penny_voice;
create policy penny_voice_no_direct on penny_voice
  for all using (false) with check (false);

-- =============================================================================
-- RPCs
-- =============================================================================

-- Public: returns the currently live voice. Used by the Worker.
create or replace function get_live_voice()
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
  from penny_voice
  where is_live = true
  limit 1;
$$;

grant execute on function get_live_voice() to anon, authenticated;

-- Admin: list all versions, newest first.
create or replace function list_voice()
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
    raise exception 'list_voice: admin access required';
  end if;

  return query
    select
      v.id, v.version, v.body, v.notes, v.is_live, v.created_at,
      v.created_by,
      (select email from auth.users u where u.id = v.created_by)::text as created_by_email
    from penny_voice v
    order by v.version desc;
end;
$$;

grant execute on function list_voice() to authenticated;

create or replace function create_voice_version(
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
    raise exception 'create_voice_version: admin access required';
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'create_voice_version: body cannot be empty';
  end if;

  insert into penny_voice (body, notes, created_by, is_live)
  values (p_body, p_notes, auth.uid(), false)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function create_voice_version(text, text) to authenticated;

create or replace function set_live_voice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'set_live_voice: admin access required';
  end if;

  if not exists (select 1 from penny_voice where id = p_id) then
    raise exception 'set_live_voice: version not found';
  end if;

  update penny_voice set is_live = false where is_live = true and id <> p_id;
  update penny_voice set is_live = true  where id = p_id;
end;
$$;

grant execute on function set_live_voice(uuid) to authenticated;

-- =============================================================================
-- End of migration 013.
-- =============================================================================
