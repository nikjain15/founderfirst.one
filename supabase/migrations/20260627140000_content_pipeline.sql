-- =============================================================================
-- FounderFirst — content pipeline (Phase 1: marketing engine)
-- =============================================================================
--
-- The Insights page (insight_runs / insight_actions) is the demand sensor. This
-- adds the production line it feeds:
--
--   content_pipeline       — one row per content idea moving through the loop
--                            idea → drafting (auto) → review (you) → published.
--   content_voice_profile  — the single locked brand-voice asset (one active
--                            row), version-controlled like tokens.css. Cloned by
--                            both TTS providers (Chatterbox primary, ElevenLabs
--                            fallback) from the same reference clip.
--
-- It also closes the learning loop: insight_actions.resulting_content_id points
-- at the content_pipeline row an action produced.
--
-- NOTE on routing (LEARNINGS.md rule 6 — one concept, one source of truth):
-- "content-routable" insight actions are identified by their existing `surface`
-- (blog | podcast | social), NOT a new action_type column — that would be a
-- third overlapping signal alongside `theme` and `surface` and would drift.
--
-- Writes happen from the content-draft / content-publish edge functions with the
-- service role (bypasses RLS). Reads + stage flips go through is_admin()-gated
-- RPCs, audited via log_admin_action — same conventions as product_insights.
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3).
-- =============================================================================

-- ---- content_voice_profile: the single locked brand-voice asset -------------
create table if not exists content_voice_profile (
  id                 uuid        primary key default gen_random_uuid(),
  name               text        not null,
  reference_clip_url text,                                    -- null until the brand clip is produced (Q4)
  provider_default   text        not null default 'chatterbox'
                                 check (provider_default in ('chatterbox', 'elevenlabs')),
  is_active          boolean     not null default false,
  version            int         not null default 1,
  created_at         timestamptz not null default now()
);
-- At most one active profile — the "single locked asset".
create unique index if not exists content_voice_active_uniq
  on content_voice_profile (is_active) where is_active;

-- Seed the active profile (clip URL filled in once the reference clip exists).
insert into content_voice_profile (name, provider_default, is_active, version)
select 'FounderFirst brand voice', 'chatterbox', true, 1
where not exists (select 1 from content_voice_profile);

-- ---- content_pipeline: idea → drafting → review → published -----------------
create table if not exists content_pipeline (
  id                uuid        primary key default gen_random_uuid(),
  source            text        not null
                                check (source in ('insight', 'manual', 'signal')),
  source_ref        uuid        references insight_actions(id) on delete set null,  -- the action that spawned it (nullable)
  topic             text        not null,
  angle             text,
  grounding         jsonb       not null default '{}'::jsonb,  -- metrics/snapshot that justified it
  status            text        not null default 'idea'
                                check (status in ('idea', 'drafting', 'review', 'published', 'dismissed')),
  draft_md          text,                                      -- brand-voice blog markdown
  script            jsonb,                                     -- audio script (Podcastfy input)
  audio_url         text,
  seo               jsonb       not null default '{}'::jsonb,
  published_ref     text,                                      -- content_pages id / blog path
  promo_schedule_id uuid        references email_schedules(id) on delete set null,
  created_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists content_pipeline_status_idx  on content_pipeline (status);
create index if not exists content_pipeline_created_idx on content_pipeline (created_at desc);
create index if not exists content_pipeline_source_idx  on content_pipeline (source_ref);

-- updated_at maintenance
create or replace function content_pipeline_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists content_pipeline_touch_trg on content_pipeline;
create trigger content_pipeline_touch_trg
  before update on content_pipeline
  for each row execute function content_pipeline_touch();

-- ---- insight_actions: close the learning loop -------------------------------
alter table insight_actions
  add column if not exists resulting_content_id uuid references content_pipeline(id) on delete set null;

-- ---- RLS: locked to security-definer RPCs (+ service role for writes) -------
alter table content_pipeline      enable row level security;
alter table content_voice_profile enable row level security;
drop policy if exists content_pipeline_no_direct on content_pipeline;
create policy content_pipeline_no_direct on content_pipeline for all using (false) with check (false);
drop policy if exists content_voice_no_direct on content_voice_profile;
create policy content_voice_no_direct on content_voice_profile for all using (false) with check (false);

-- =============================================================================
-- RPCs (admin-gated, audited)
-- =============================================================================

-- Admin/manual + "Send to pipeline": create an idea. When spawned from an
-- insight action, link the action back to the new row (closes the loop).
create or replace function create_content_pipeline_item(
  p_source text, p_topic text, p_angle text default null,
  p_grounding jsonb default '{}'::jsonb, p_source_ref uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'create_content_pipeline_item: admin access required'; end if;
  if p_source not in ('insight', 'manual', 'signal') then
    raise exception 'create_content_pipeline_item: bad source %', p_source;
  end if;
  if coalesce(btrim(p_topic), '') = '' then
    raise exception 'create_content_pipeline_item: topic required';
  end if;
  insert into content_pipeline (source, source_ref, topic, angle, grounding, created_by)
    values (p_source, p_source_ref, p_topic, p_angle, coalesce(p_grounding, '{}'::jsonb), auth.uid())
    returning id into v_id;
  if p_source_ref is not null then
    update insight_actions set resulting_content_id = v_id where id = p_source_ref;
  end if;
  perform log_admin_action('content_pipeline_create', 'content_pipeline', v_id::text,
    jsonb_build_object('source', p_source, 'topic', p_topic, 'source_ref', p_source_ref));
  return v_id;
end;
$$;
grant execute on function create_content_pipeline_item(text, text, text, jsonb, uuid) to authenticated;

-- Admin: board read — items newest first, optionally filtered by stage.
create or replace function list_content_pipeline(p_status text default null)
returns table (id uuid, source text, topic text, angle text, status text,
               has_audio boolean, published_ref text, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'list_content_pipeline: admin access required'; end if;
  return query
    select c.id, c.source, c.topic, c.angle, c.status,
           (c.audio_url is not null) as has_audio,
           c.published_ref, c.created_at, c.updated_at
    from content_pipeline c
    where p_status is null or c.status = p_status
    order by c.updated_at desc;
end;
$$;
grant execute on function list_content_pipeline(text) to authenticated;

-- Admin: one item, full row (for the review screen).
create or replace function get_content_pipeline_item(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_admin() then raise exception 'get_content_pipeline_item: admin access required'; end if;
  select to_jsonb(c) into result from content_pipeline c where c.id = p_id;
  return result;
end;
$$;
grant execute on function get_content_pipeline_item(uuid) to authenticated;

-- Admin: move an item between stages (the human-in-the-loop step), audited.
create or replace function set_content_pipeline_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ok uuid;
begin
  if not is_admin() then raise exception 'set_content_pipeline_status: admin access required'; end if;
  if p_status not in ('idea', 'drafting', 'review', 'published', 'dismissed') then
    raise exception 'set_content_pipeline_status: bad status %', p_status;
  end if;
  update content_pipeline set status = p_status where id = p_id returning id into v_ok;
  if v_ok is null then raise exception 'set_content_pipeline_status: item not found'; end if;
  perform log_admin_action('content_pipeline_status', 'content_pipeline', p_id::text,
    jsonb_build_object('status', p_status));
end;
$$;
grant execute on function set_content_pipeline_status(uuid, text) to authenticated;

-- Read the active brand-voice profile (used by the draft/audio steps + admin).
create or replace function get_active_voice_profile()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_admin() then raise exception 'get_active_voice_profile: admin access required'; end if;
  select to_jsonb(v) into result from content_voice_profile v where v.is_active limit 1;
  return result;
end;
$$;
grant execute on function get_active_voice_profile() to authenticated;
