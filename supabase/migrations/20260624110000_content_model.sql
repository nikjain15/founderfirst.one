-- =============================================================================
-- FounderFirst — Content model (unified architecture, Phase 1)
-- =============================================================================
--
-- Single source of truth for editable PAGE copy. Mirrors the penny_voice /
-- penny_prompts pattern exactly (auto-incrementing version, one-live partial
-- index, RLS locked to security-definer RPCs gated by is_admin(), audit via
-- log_admin_action, publish → notify/rebuild via pg_net):
--
--   content_pages — one versioned JSONB document per page slug. Payload is the
--                   full Page doc { seo, sections } validated by @ff/content
--                   (Zod) in the app BEFORE insert. Read by Astro at build +
--                   live render; edited + published from /admin.
--
-- FAQ entries are embedded inside a page's payload (a `faq` section) so the whole
-- page versions atomically and JSON-LD / llms.txt generate from one document.
--
-- Emails are deliberately NOT here: email copy already has a single source of
-- truth in `email_templates` (edited in admin EmailHub). See GAME_PLAN §6.
--
-- NOTE: review before `supabase db push`. Check `supabase migration list` first —
-- this only deploys when intended (LEARNINGS.md rule 3).
-- =============================================================================

-- ───────────────────────────── content_pages ────────────────────────────────
create table if not exists content_pages (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null,                      -- "/", "/confirmed", …
  surface     text        not null default 'marketing',  -- marketing | blog | product
  version     int         not null,
  payload     jsonb       not null,                      -- full Page { seo, sections }
  notes       text,
  is_live     boolean     not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid        references auth.users(id) on delete set null
);

-- One live version PER slug.
create unique index if not exists content_pages_one_live
  on content_pages (slug) where is_live = true;
create index if not exists content_pages_slug_idx on content_pages (slug);

-- Version auto-increments per slug.
create or replace function content_pages_set_version()
returns trigger language plpgsql as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
    from content_pages where slug = new.slug;
  end if;
  return new;
end;
$$;

drop trigger if exists content_pages_version_trg on content_pages;
create trigger content_pages_version_trg
  before insert on content_pages
  for each row execute function content_pages_set_version();

alter table content_pages enable row level security;
drop policy if exists content_pages_no_direct on content_pages;
create policy content_pages_no_direct on content_pages
  for all using (false) with check (false);

-- NOTE: emails are NOT modelled here. Email copy already has a single source of
-- truth in `email_templates` (keyed by email_key, edited in admin EmailHub) with
-- timing in `email_schedules` and rendering in the email-dispatch fn. Adding a
-- content_emails table would create a second source of truth for the same
-- concept. Triggered emails are unified by registering each as an
-- email_templates row + email_schedules kind='event' — see GAME_PLAN §6.

-- =============================================================================
-- RPCs — pages
-- =============================================================================

-- Public: the live page for a slug. Used by Astro (build + live render).
create or replace function get_live_page(p_slug text)
returns table (id uuid, slug text, surface text, version int, payload jsonb, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select id, slug, surface, version, payload, created_at
  from content_pages
  where slug = p_slug and is_live = true
  limit 1;
$$;
grant execute on function get_live_page(text) to anon, authenticated;

-- Admin: one row per slug (the live version, or latest if none live) — editor index.
create or replace function list_content_pages()
returns table (slug text, surface text, version int, is_live boolean, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'list_content_pages: admin access required'; end if;
  return query
    select distinct on (p.slug)
      p.slug, p.surface, p.version, p.is_live, p.created_at
    from content_pages p
    order by p.slug, p.is_live desc, p.version desc;
end;
$$;
grant execute on function list_content_pages() to authenticated;

-- Admin: full version history for a slug, newest first.
create or replace function list_page_versions(p_slug text)
returns table (id uuid, version int, payload jsonb, notes text, is_live boolean,
               created_at timestamptz, created_by uuid, created_by_email text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'list_page_versions: admin access required'; end if;
  return query
    select p.id, p.version, p.payload, p.notes, p.is_live, p.created_at, p.created_by,
           (select email from auth.users u where u.id = p.created_by)::text
    from content_pages p
    where p.slug = p_slug
    order by p.version desc;
end;
$$;
grant execute on function list_page_versions(text) to authenticated;

-- Admin: save a new draft version (validated payload from @ff/content). Not live.
create or replace function create_page_version(
  p_slug text, p_surface text, p_payload jsonb, p_notes text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not is_admin() then raise exception 'create_page_version: admin access required'; end if;
  if p_payload is null then raise exception 'create_page_version: payload required'; end if;

  insert into content_pages (slug, surface, payload, notes, created_by, is_live)
  values (p_slug, coalesce(p_surface, 'marketing'), p_payload, p_notes, auth.uid(), false)
  returning id into new_id;

  perform log_admin_action('content_page_draft', 'content_page', p_slug,
    jsonb_build_object('version_id', new_id));
  return new_id;
end;
$$;
grant execute on function create_page_version(text, text, jsonb, text) to authenticated;

-- Admin: promote a version to live (one live per slug). Fires publish → rebuild.
create or replace function set_live_page(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_slug text;
begin
  if not is_admin() then raise exception 'set_live_page: admin access required'; end if;
  select slug into v_slug from content_pages where id = p_id;
  if v_slug is null then raise exception 'set_live_page: version not found'; end if;

  update content_pages set is_live = false where slug = v_slug and is_live = true and id <> p_id;
  update content_pages set is_live = true  where id = p_id;

  perform log_admin_action('content_page_publish', 'content_page', v_slug,
    jsonb_build_object('version_id', p_id));
end;
$$;
grant execute on function set_live_page(uuid) to authenticated;

-- =============================================================================
-- Publish → rebuild notify (mirrors migration 014 notify_publish). On a page
-- going live, POST the notify-content-change fn which triggers the static
-- rebuild (pages.yml) so crawlers get fresh HTML/JSON-LD/llms.txt. Live render
-- is already instant via get_live_page; this keeps the SSG copy in sync.
-- Skips silently if the Vault secret isn't set — a notify bug must never block a publish.
-- =============================================================================
create or replace function notify_content_publish()
returns trigger language plpgsql security definer set search_path = public, vault as $$
declare
  fn_url text := 'https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/notify-content-change';
  secret text;
begin
  if not (new.is_live = true and (old.is_live is distinct from true)) then
    return new;
  end if;

  begin
    select decrypted_secret into secret from vault.decrypted_secrets
    where name = 'notify_webhook_secret' limit 1;
  exception when others then secret := null;
  end;
  if secret is null then return new; end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    body    := jsonb_build_object('kind', 'content_page', 'slug', new.slug, 'version', new.version)
  );
  return new;
end;
$$;

drop trigger if exists content_pages_notify_publish on content_pages;
create trigger content_pages_notify_publish
  after update of is_live on content_pages
  for each row execute function notify_content_publish();

-- =============================================================================
-- End of content model migration.
-- =============================================================================
