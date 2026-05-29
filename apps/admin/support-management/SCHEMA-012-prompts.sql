-- =============================================================================
-- FounderFirst Admin — Penny prompt versioning (migration 012)
-- =============================================================================
--
-- Stores Penny's system prompt in Supabase so an admin can edit + version it
-- from /admin/content without redeploying the Cloudflare Worker. The Worker
-- fetches the live prompt at runtime (cached ~60s) via get_live_prompt().
--
-- Versioning model:
--   - Every save creates a new row in penny_prompts.
--   - Exactly zero or one row has is_live = true at any time (enforced by a
--     partial unique index).
--   - set_live_prompt(id) atomically flips the live flag from the previous
--     live row to the requested one.
--   - The Worker has a hardcoded fallback prompt, so if the table is empty
--     or unreachable, Penny still works.
--
-- Authorization:
--   - get_live_prompt() is callable by anon (the Worker uses the anon key).
--   - All write RPCs require is_admin().
-- =============================================================================

create table if not exists penny_prompts (
  id           uuid        primary key default gen_random_uuid(),
  version      int         not null,
  body         text        not null,
  notes        text,
  is_live      boolean     not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid        references auth.users(id) on delete set null
);

-- One live prompt at a time.
create unique index if not exists penny_prompts_one_live
  on penny_prompts ((is_live)) where is_live = true;

-- Auto-increment version per insert (no gaps within a single process, fine
-- for our single-admin scale — uses table-level max+1).
create or replace function penny_prompts_set_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version from penny_prompts;
  end if;
  return new;
end;
$$;

drop trigger if exists penny_prompts_version_trg on penny_prompts;
create trigger penny_prompts_version_trg
  before insert on penny_prompts
  for each row execute function penny_prompts_set_version();

alter table penny_prompts enable row level security;

-- Locked down by default; all access goes through SECURITY DEFINER RPCs below.
drop policy if exists penny_prompts_no_direct on penny_prompts;
create policy penny_prompts_no_direct on penny_prompts
  for all using (false) with check (false);

-- =============================================================================
-- RPCs
-- =============================================================================

-- Public: returns the currently live prompt. Used by the Worker.
create or replace function get_live_prompt()
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
  from penny_prompts
  where is_live = true
  limit 1;
$$;

grant execute on function get_live_prompt() to anon, authenticated;

-- Admin: list all versions, newest first.
create or replace function list_prompts()
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
    raise exception 'list_prompts: admin access required';
  end if;

  return query
    select
      p.id, p.version, p.body, p.notes, p.is_live, p.created_at,
      p.created_by,
      (select email from auth.users u where u.id = p.created_by)::text as created_by_email
    from penny_prompts p
    order by p.version desc;
end;
$$;

grant execute on function list_prompts() to authenticated;

-- Admin: create a new version (does NOT set it live — that's a separate action).
create or replace function create_prompt_version(
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
    raise exception 'create_prompt_version: admin access required';
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'create_prompt_version: body cannot be empty';
  end if;

  insert into penny_prompts (body, notes, created_by, is_live)
  values (p_body, p_notes, auth.uid(), false)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function create_prompt_version(text, text) to authenticated;

-- Admin: set a specific version as live. Atomically unsets any previous live.
create or replace function set_live_prompt(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'set_live_prompt: admin access required';
  end if;

  if not exists (select 1 from penny_prompts where id = p_id) then
    raise exception 'set_live_prompt: version not found';
  end if;

  update penny_prompts set is_live = false where is_live = true and id <> p_id;
  update penny_prompts set is_live = true  where id = p_id;
end;
$$;

grant execute on function set_live_prompt(uuid) to authenticated;

-- =============================================================================
-- End of migration 012.
-- =============================================================================
