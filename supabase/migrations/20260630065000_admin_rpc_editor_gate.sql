-- #4b — Gate MUTATING admin RPCs on is_admin_editor() (Viewer tier read-only enforcement).
--
-- Companion to 20260630060000_admin_roles_tiers.sql. That migration tiered the
-- RLS *table* policies (writes need editor). But many admin actions go through
-- SECURITY DEFINER RPCs that gate INTERNALLY with `if not is_admin() then raise`.
-- is_admin() is true for ANY admin tier (viewer/editor/super), so a Viewer could
-- still MUTATE data by calling these RPCs directly, bypassing the policy tiering.
--
-- This migration re-defines every MUTATING admin RPC, changing ONLY the auth gate
-- from is_admin() to is_admin_editor() (editor or super). Bodies are otherwise
-- reproduced VERBATIM from their latest definition. READ-ONLY admin RPCs
-- (get_*/list_*/admin_ai_kpis/*_library/*_facets/*_leaderboard/…) intentionally
-- stay on is_admin() so Viewers keep full read access.
--
-- Functions gated (39):
--   penny prompt:   log_admin_action, create_prompt_version, set_live_prompt
--   support:        reply_to_ticket
--   discord:        admin_discord_erase
--   voice:          create_voice_version, set_live_voice, set_voice_synth_settings
--   content pages:  create_page_version, set_live_page
--   blog:           create_blog_post_version, set_live_blog_post
--   discord persona:create_discord_persona_version, set_live_discord_persona
--   outreach:       create_outreach_persona_version, set_live_outreach_persona
--   content pipe:   create_content_pipeline_item, set_content_pipeline_status
--   insights:       set_insight_action_status
--   signals:        upsert_sig_source, delete_sig_source, upsert_sig_keyword,
--                   add_sig_icp_example, delete_sig_icp_example, set_sig_setting,
--                   save_sig_lead_draft, save_sig_lead_notes, save_sig_lead_card,
--                   update_sig_lead_stage, mark_sig_lead_sent, sig_quick_add_item
--   AI evals/cfg:   admin_ai_eval_upsert, admin_ai_eval_attach, admin_ai_eval_detach,
--                   admin_ai_eval_set, admin_ai_review_submit, admin_ai_model_config_set,
--                   admin_ai_price_set, admin_ai_set_review_mode
--
-- NOTE: log_admin_action is intentionally NOT re-gated. It is the shared audit
-- primitive called by break-glass (close/open, gated by is_platform_staff — which
-- includes non-editor admins) and by every editor-gated RPC here. Tightening it to
-- is_admin_editor() would break audit logging for legitimate non-editor staff
-- paths, so it keeps its original is_admin() gate. The editor checks on the RPCs
-- that *call* it are what stop a viewer from driving a mutation.

-- ── public.create_prompt_version  (latest body from 20260620153619_remote_commit.sql) ──
CREATE OR REPLACE FUNCTION public.create_prompt_version(p_body text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare new_id uuid;
begin
  if not is_admin_editor() then raise exception 'create_prompt_version: admin access required'; end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'create_prompt_version: body cannot be empty';
  end if;
  insert into penny_prompts (body, notes, created_by, is_live)
  values (p_body, p_notes, auth.uid(), false) returning id into new_id;
  return new_id;
end;
$function$
;

-- ── public.set_live_prompt  (latest body from 20260620153619_remote_commit.sql) ──
CREATE OR REPLACE FUNCTION public.set_live_prompt(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_admin_editor() then raise exception 'set_live_prompt: admin access required'; end if;
  if not exists (select 1 from penny_prompts where id = p_id) then
    raise exception 'set_live_prompt: version not found';
  end if;
  update penny_prompts set is_live = false where is_live = true and id <> p_id;
  update penny_prompts set is_live = true  where id = p_id;
end;
$function$
;

-- ── public.reply_to_ticket  (latest body from 20260620153619_remote_commit.sql) ──
CREATE OR REPLACE FUNCTION public.reply_to_ticket(p_ticket_id uuid, p_body text, p_resolve boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_message_id uuid;
begin
  if not is_admin_editor() then
    raise exception 'reply_to_ticket: admin access required';
  end if;

  insert into support_messages (ticket_id, author, body)
    values (p_ticket_id, 'admin', p_body)
    returning id into v_message_id;

  update support_tickets
    set status      = case when p_resolve then 'resolved' else 'in_progress' end,
        resolved_at = case when p_resolve then now() else resolved_at end,
        updated_at  = now()
    where id = p_ticket_id;

  return v_message_id;
end;
$function$
;

-- ── public.admin_discord_erase  (latest body from 20260624100000_discord_erase_complete.sql) ──
create or replace function public.admin_discord_erase(
  p_discord_user_id text default null,
  p_email           text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_uid   text := p_discord_user_id;
  v_msgs  int  := 0;
  v_mem   int  := 0;
  v_links int  := 0;
begin
  if not is_admin_editor() then
    raise exception 'admin_discord_erase: admin access required';
  end if;
  if p_discord_user_id is null and p_email is null then
    raise exception 'admin_discord_erase: must provide discord_user_id or email';
  end if;

  -- The message/memory tables key on discord_user_id; resolve it from email
  -- when the admin only has the email.
  if v_uid is null and p_email is not null then
    select discord_user_id into v_uid
      from discord_account_links
     where email_normalized = _normalize_email(p_email)
       and discord_user_id is not null
     limit 1;
  end if;

  if v_uid is not null then
    delete from discord_dm_messages where discord_user_id = v_uid;
    get diagnostics v_msgs = row_count;

    delete from discord_dm_memory where discord_user_id = v_uid;
    get diagnostics v_mem = row_count;
  end if;

  -- Remove every link row for this person (all states, by id and/or email).
  delete from discord_account_links
   where (v_uid is not null and discord_user_id = v_uid)
      or (p_email is not null and email_normalized = _normalize_email(p_email));
  get diagnostics v_links = row_count;

  return jsonb_build_object(
    'discord_user_id', v_uid,
    'messages', v_msgs,
    'memory', v_mem,
    'links', v_links
  );
end;
$$;

-- ── create_voice_version  (latest body from 20260620104500_voice.sql) ──
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
  if not is_admin_editor() then
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

-- ── set_live_voice  (latest body from 20260620104500_voice.sql) ──
create or replace function set_live_voice(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then
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

-- ── set_voice_synth_settings  (latest body from 20260629230000_voice_studio_settings.sql) ──
create or replace function set_voice_synth_settings(
  p_engine  text default null,
  p_voice_a text default null,
  p_voice_b text default null,
  p_blend   numeric default null,
  p_speed   numeric default null,
  p_gap_ms  int default null,
  p_lang    text default null,
  p_bitrate text default null,
  p_warmth  numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then
    raise exception 'set_voice_synth_settings: admin access required';
  end if;
  update content_voice_profile set
    engine  = coalesce(p_engine,  engine),
    voice_a = coalesce(p_voice_a, voice_a),
    voice_b = coalesce(p_voice_b, voice_b),
    blend   = coalesce(p_blend,   blend),
    speed   = coalesce(p_speed,   speed),
    gap_ms  = coalesce(p_gap_ms,  gap_ms),
    lang    = coalesce(p_lang,    lang),
    bitrate = coalesce(p_bitrate, bitrate),
    warmth  = coalesce(p_warmth,  warmth)
  where is_active = true;
end;
$$;
grant execute on function set_voice_synth_settings(text,text,text,numeric,numeric,int,text,text,numeric) to authenticated;

-- ── create_page_version  (latest body from 20260625030000_content_model.sql) ──
create or replace function create_page_version(
  p_slug text, p_surface text, p_payload jsonb, p_notes text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not is_admin_editor() then raise exception 'create_page_version: admin access required'; end if;
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

-- ── set_live_page  (latest body from 20260625030000_content_model.sql) ──
create or replace function set_live_page(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_slug text;
begin
  if not is_admin_editor() then raise exception 'set_live_page: admin access required'; end if;
  select slug into v_slug from content_pages where id = p_id;
  if v_slug is null then raise exception 'set_live_page: version not found'; end if;

  update content_pages set is_live = false where slug = v_slug and is_live = true and id <> p_id;
  update content_pages set is_live = true  where id = p_id;

  perform log_admin_action('content_page_publish', 'content_page', v_slug,
    jsonb_build_object('version_id', p_id));
end;
$$;
grant execute on function set_live_page(uuid) to authenticated;

-- ── create_blog_post_version  (latest body from 20260627121000_blog_posts.sql) ──
create or replace function create_blog_post_version(p_slug text, p_payload jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not is_admin_editor() then raise exception 'create_blog_post_version: admin access required'; end if;
  if p_payload is null then raise exception 'create_blog_post_version: payload required'; end if;
  insert into blog_posts (slug, payload, notes, created_by, is_live)
  values (p_slug, p_payload, p_notes, auth.uid(), false)
  returning id into new_id;
  perform log_admin_action('blog_post_draft', 'blog_post', p_slug, jsonb_build_object('version_id', new_id));
  return new_id;
end;
$$;
grant execute on function create_blog_post_version(text, jsonb, text) to authenticated;

-- ── set_live_blog_post  (latest body from 20260627121000_blog_posts.sql) ──
create or replace function set_live_blog_post(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_slug text;
begin
  if not is_admin_editor() then raise exception 'set_live_blog_post: admin access required'; end if;
  select slug into v_slug from blog_posts where id = p_id;
  if v_slug is null then raise exception 'set_live_blog_post: version not found'; end if;
  update blog_posts set is_live = false where slug = v_slug and is_live = true and id <> p_id;
  update blog_posts set is_live = true where id = p_id;
  perform log_admin_action('blog_post_publish', 'blog_post', v_slug, jsonb_build_object('version_id', p_id));
end;
$$;
grant execute on function set_live_blog_post(uuid) to authenticated;

-- ── create_discord_persona_version  (latest body from 20260627140001_discord_persona.sql) ──
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
  if not is_admin_editor() then
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

-- ── set_live_discord_persona  (latest body from 20260627140001_discord_persona.sql) ──
create or replace function set_live_discord_persona(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then
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

-- ── create_outreach_persona_version  (latest body from 20260629220000_outreach_persona_content_surface.sql) ──
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
  if not is_admin_editor() then
    raise exception 'create_outreach_persona_version: admin access required';
  end if;

  if p_surface not in ('signals', 'email', 'content') then
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

-- ── set_live_outreach_persona  (latest body from 20260629120000_outreach_persona.sql) ──
create or replace function set_live_outreach_persona(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface text;
begin
  if not is_admin_editor() then
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

-- ── create_content_pipeline_item  (latest body from 20260627140000_content_pipeline.sql) ──
create or replace function create_content_pipeline_item(
  p_source text, p_topic text, p_angle text default null,
  p_grounding jsonb default '{}'::jsonb, p_source_ref uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin_editor() then raise exception 'create_content_pipeline_item: admin access required'; end if;
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

-- ── set_content_pipeline_status  (latest body from 20260627140000_content_pipeline.sql) ──
create or replace function set_content_pipeline_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ok uuid;
begin
  if not is_admin_editor() then raise exception 'set_content_pipeline_status: admin access required'; end if;
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

-- ── set_insight_action_status  (latest body from 20260627120500_product_insights.sql) ──
create or replace function set_insight_action_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_run uuid;
begin
  if not is_admin_editor() then raise exception 'set_insight_action_status: admin access required'; end if;
  if p_status not in ('suggested', 'accepted', 'dismissed', 'done') then
    raise exception 'set_insight_action_status: bad status %', p_status;
  end if;
  update insight_actions set status = p_status where id = p_id returning run_id into v_run;
  if v_run is null then raise exception 'set_insight_action_status: action not found'; end if;
  perform log_admin_action('insight_action_status', 'insight_action', p_id::text,
    jsonb_build_object('status', p_status));
end;
$$;
grant execute on function set_insight_action_status(uuid, text) to authenticated;

-- ── upsert_sig_source  (latest body from 20260622100000_signals.sql) ──
create or replace function upsert_sig_source(
  p_platform text,
  p_query text default null,
  p_captured_via text default 'extension',
  p_enabled boolean default true,
  p_cadence_minutes int default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin_editor() then raise exception 'upsert_sig_source: admin access required'; end if;
  if p_id is not null then
    update sig_sources
       set platform = p_platform, query = p_query, captured_via = p_captured_via,
           enabled = p_enabled, cadence_minutes = p_cadence_minutes, updated_at = now()
     where id = p_id returning id into v_id;
  else
    insert into sig_sources (platform, query, captured_via, enabled, cadence_minutes)
      values (p_platform, p_query, p_captured_via, p_enabled, p_cadence_minutes)
      returning id into v_id;
  end if;
  perform log_admin_action('sig_source_upsert', 'sig_source', v_id::text,
                           jsonb_build_object('platform', p_platform));
  return v_id;
end;
$$;
grant execute on function upsert_sig_source(text,text,text,boolean,int,uuid) to authenticated;

-- ── delete_sig_source  (latest body from 20260622150000_signals_source_mgmt.sql) ──
create or replace function delete_sig_source(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then raise exception 'delete_sig_source: admin access required'; end if;
  delete from sig_sources where id = p_id;
  perform log_admin_action('sig_source_delete', 'sig_source', p_id::text, '{}'::jsonb);
end;
$$;
grant execute on function delete_sig_source(uuid) to authenticated;

-- ── upsert_sig_keyword  (latest body from 20260622170000_signals_sourcing_geo.sql) ──
create or replace function upsert_sig_keyword(
  p_term text, p_kind text, p_enabled boolean default true, p_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin_editor() then raise exception 'upsert_sig_keyword: admin access required'; end if;
  if p_kind not in ('pain','competitor','exclude') then
    raise exception 'upsert_sig_keyword: invalid kind %', p_kind;
  end if;
  if p_id is not null then
    update sig_keywords set term = p_term, kind = p_kind, enabled = p_enabled
      where id = p_id returning id into v_id;
  else
    insert into sig_keywords (term, kind, enabled) values (p_term, p_kind, p_enabled)
      returning id into v_id;
  end if;
  perform log_admin_action('sig_keyword_upsert', 'sig_keyword', v_id::text,
                           jsonb_build_object('term', p_term, 'kind', p_kind));
  return v_id;
end;
$$;
grant execute on function upsert_sig_keyword(text,text,boolean,uuid) to authenticated;

-- ── add_sig_icp_example  (latest body from 20260622100000_signals.sql) ──
create or replace function add_sig_icp_example(p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin_editor() then raise exception 'add_sig_icp_example: admin access required'; end if;
  insert into sig_icp_examples (body) values (p_body) returning id into v_id;
  perform log_admin_action('sig_icp_example_add', 'sig_icp_example', v_id::text, '{}'::jsonb);
  return v_id;
end;
$$;
grant execute on function add_sig_icp_example(text) to authenticated;

-- ── delete_sig_icp_example  (latest body from 20260622130000_signals_icp_list.sql) ──
create or replace function delete_sig_icp_example(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then raise exception 'delete_sig_icp_example: admin access required'; end if;
  delete from sig_icp_examples where id = p_id;
  perform log_admin_action('sig_icp_example_delete', 'sig_icp_example', p_id::text, '{}'::jsonb);
end;
$$;
grant execute on function delete_sig_icp_example(uuid) to authenticated;

-- ── set_sig_setting  (latest body from 20260622170000_signals_sourcing_geo.sql) ──
create or replace function set_sig_setting(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin_editor() then raise exception 'set_sig_setting: admin access required'; end if;
  if p_key not in ('intent_threshold','relevance_threshold','relevance_floor','geo_mode') then
    raise exception 'set_sig_setting: unknown key %', p_key;
  end if;
  if p_key = 'geo_mode' and (p_value #>> '{}') not in ('hard_us','us_preferred','off') then
    raise exception 'set_sig_setting: invalid geo_mode %', p_value;
  end if;
  insert into sig_settings (key, value, updated_at, updated_by)
    values (p_key, p_value, now(), coalesce(auth.email(),'unknown'))
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;
  perform log_admin_action('sig_setting', 'sig_settings', p_key, jsonb_build_object('value', p_value));
end;
$$;
grant execute on function set_sig_setting(text,jsonb) to authenticated;

-- ── save_sig_lead_draft  (latest body from 20260622100000_signals.sql) ──
create or replace function save_sig_lead_draft(p_lead_id uuid, p_draft text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then raise exception 'save_sig_lead_draft: admin access required'; end if;
  update sig_leads
     set draft = p_draft,
         stage = case when stage in ('new','reviewing') then 'drafted' else stage end,
         updated_at = now()
   where id = p_lead_id;
  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, coalesce(auth.email(),'unknown'), 'draft_edited', '{}'::jsonb);
  perform log_admin_action('sig_lead_draft', 'sig_lead', p_lead_id::text, '{}'::jsonb);
end;
$$;
grant execute on function save_sig_lead_draft(uuid,text) to authenticated;

-- ── save_sig_lead_notes  (latest body from 20260623230000_sig_lead_contact_details.sql) ──
create or replace function save_sig_lead_notes(
  p_lead_id         uuid,
  p_notes           text,
  p_contact_name    text default null,
  p_contact_company text default null,
  p_status          text default null,
  p_contact_email   text default null,
  p_contact_details text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then raise exception 'save_sig_lead_notes: admin access required'; end if;
  if p_status is not null and p_status not in
       ('awaiting','not_contacted','replied','resolved','no_response') then
    raise exception 'save_sig_lead_notes: invalid status %', p_status;
  end if;

  update sig_leads
     set notes           = p_notes,
         contact_name    = p_contact_name,
         contact_company = p_contact_company,
         contact_email   = p_contact_email,
         contact_details = p_contact_details,
         note_status     = p_status,
         updated_at      = now()
   where id = p_lead_id;

  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, coalesce(auth.email(),'unknown'), 'note_saved',
            jsonb_build_object('notes', p_notes, 'status', p_status,
                               'contact_name', p_contact_name,
                               'contact_company', p_contact_company,
                               'contact_email', p_contact_email,
                               'contact_details', p_contact_details));
  perform log_admin_action('sig_lead_notes', 'sig_lead', p_lead_id::text,
                           jsonb_build_object('status', p_status));
end;
$$;
grant execute on function save_sig_lead_notes(uuid,text,text,text,text,text,text) to authenticated;

-- ── save_sig_lead_card  (latest body from 20260623240000_sig_lead_unify.sql) ──
create or replace function save_sig_lead_card(
  p_lead_id         uuid,
  p_stage           text,
  p_draft           text,
  p_contact_name    text default null,
  p_contact_company text default null,
  p_contact_email   text default null,
  p_contact_details text default null,
  p_notes           text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then raise exception 'save_sig_lead_card: admin access required'; end if;
  if p_stage not in ('new','reviewing','drafted','sent','replied','won','dead') then
    raise exception 'save_sig_lead_card: invalid stage %', p_stage;
  end if;

  update sig_leads
     set stage           = p_stage,
         draft           = p_draft,
         contact_name    = p_contact_name,
         contact_company = p_contact_company,
         contact_email   = p_contact_email,
         contact_details = p_contact_details,
         notes           = p_notes,
         sent_at         = case when p_stage = 'sent' and sent_at is null then now() else sent_at end,
         updated_at      = now()
   where id = p_lead_id;

  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, coalesce(auth.email(),'unknown'), 'card_saved',
            jsonb_build_object('stage', p_stage, 'notes', p_notes,
                               'contact_name', p_contact_name,
                               'contact_company', p_contact_company,
                               'contact_email', p_contact_email,
                               'contact_details', p_contact_details));
  perform log_admin_action('sig_lead_card', 'sig_lead', p_lead_id::text,
                           jsonb_build_object('stage', p_stage));
end;
$$;
grant execute on function save_sig_lead_card(uuid,text,text,text,text,text,text,text) to authenticated;

-- ── update_sig_lead_stage  (latest body from 20260622100000_signals.sql) ──
create or replace function update_sig_lead_stage(p_lead_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then raise exception 'update_sig_lead_stage: admin access required'; end if;
  if p_stage not in ('new','reviewing','drafted','sent','replied','won','dead') then
    raise exception 'update_sig_lead_stage: invalid stage %', p_stage;
  end if;

  update sig_leads set stage = p_stage, updated_at = now() where id = p_lead_id;
  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, coalesce(auth.email(),'unknown'), 'stage_changed',
            jsonb_build_object('stage', p_stage));
  perform log_admin_action('sig_lead_stage', 'sig_lead', p_lead_id::text,
                           jsonb_build_object('stage', p_stage));
end;
$$;
grant execute on function update_sig_lead_stage(uuid,text) to authenticated;

-- ── mark_sig_lead_sent  (latest body from 20260622100000_signals.sql) ──
create or replace function mark_sig_lead_sent(p_lead_id uuid, p_channel text default 'on_platform')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_editor() then raise exception 'mark_sig_lead_sent: admin access required'; end if;
  update sig_leads
     set stage = 'sent',
         channel = p_channel,
         send_method = case when p_channel = 'email' then 'email' else 'copy' end,
         sent_at = now(),
         updated_at = now()
   where id = p_lead_id;
  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, coalesce(auth.email(),'unknown'), 'sent',
            jsonb_build_object('channel', p_channel));
  perform log_admin_action('sig_lead_sent', 'sig_lead', p_lead_id::text,
                           jsonb_build_object('channel', p_channel));
end;
$$;
grant execute on function mark_sig_lead_sent(uuid,text) to authenticated;

-- ── sig_quick_add_item  (latest body from 20260622100000_signals.sql) ──
create or replace function sig_quick_add_item(
  p_platform     text,
  p_external_url text default null,
  p_title        text default null,
  p_body         text default null,
  p_author_handle text default null,
  p_author_url   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin_editor() then raise exception 'sig_quick_add_item: admin access required'; end if;
  v_id := sig_ingest_item(
    p_platform, p_external_url, p_author_handle, p_author_url,
    p_title, p_body, null, 'quick_add', '{}'::jsonb, null
  );
  perform log_admin_action('sig_quick_add', 'sig_item', v_id::text,
                           jsonb_build_object('platform', p_platform, 'url', p_external_url));
  return v_id;
end;
$$;
grant execute on function sig_quick_add_item(text,text,text,text,text,text) to authenticated;

-- ── admin_ai_eval_upsert  (latest body from 20260628140000_ai_evals.sql) ──
create or replace function admin_ai_eval_upsert(
  p_key text, p_name text, p_description text, p_method text, p_kind text,
  p_judge_criteria text default null, p_default_threshold numeric default null,
  p_check_ref text default null
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_actor text := coalesce(auth.email(), 'system');
  v_prev  int;
  v_next  int;
begin
  if not is_admin_editor() then raise exception 'admin_ai_eval_upsert: admin access required'; end if;
  if p_method not in ('deterministic','sql_reconciliation','llm_judge','classifier') then
    raise exception 'invalid method "%"', p_method;
  end if;
  if p_kind not in ('gate','score') then raise exception 'invalid kind "%"', p_kind; end if;

  select max(version) into v_prev from ai_evals where key = p_key;
  v_next := coalesce(v_prev, 0) + 1;

  -- Retire the prior live version; insert the new one live. Floor flags are not
  -- editable here — mandatory floor evals are seeded by migration only (D8).
  update ai_evals set is_live = false where key = p_key and is_live;
  insert into ai_evals (key, version, name, description, method, kind,
                        mandatory, floor_customer, floor_financial,
                        judge_criteria, default_threshold, check_ref, is_live, created_by)
  select p_key, v_next, p_name, p_description, p_method, p_kind,
         coalesce(prev.mandatory, false), coalesce(prev.floor_customer, false),
         coalesce(prev.floor_financial, false),
         p_judge_criteria, p_default_threshold, p_check_ref, true, v_actor
  from (select mandatory, floor_customer, floor_financial from ai_evals
        where key = p_key and version = v_prev) prev
  right join (select 1) one on true;

  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai_eval.upsert', 'ai_eval', p_key,
            jsonb_build_object('version', v_next, 'method', p_method, 'kind', p_kind));
  return v_next;
end; $$;
grant execute on function admin_ai_eval_upsert(text,text,text,text,text,text,numeric,text) to authenticated;

-- ── admin_ai_eval_attach  (latest body from 20260628140000_ai_evals.sql) ──
create or replace function admin_ai_eval_attach(
  p_use_case text, p_eval_key text, p_position int default 100
)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text := coalesce(auth.email(), 'system');
begin
  if not is_admin_editor() then raise exception 'admin_ai_eval_attach: admin access required'; end if;
  if not exists (select 1 from ai_evals where key = p_eval_key and is_live) then
    raise exception 'no live eval "%"', p_eval_key;
  end if;
  insert into ai_use_case_evals (use_case, eval_key, position, updated_by)
    values (p_use_case, p_eval_key, p_position, v_actor)
    on conflict (use_case, eval_key) do update set enabled = true, updated_by = v_actor;
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai_eval.attach', 'ai_use_case_eval', p_use_case,
            jsonb_build_object('eval_key', p_eval_key));
end; $$;
grant execute on function admin_ai_eval_attach(text,text,int) to authenticated;

-- ── admin_ai_eval_detach  (latest body from 20260628140000_ai_evals.sql) ──
create or replace function admin_ai_eval_detach(p_use_case text, p_eval_key text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text := coalesce(auth.email(), 'system');
begin
  if not is_admin_editor() then raise exception 'admin_ai_eval_detach: admin access required'; end if;
  delete from ai_use_case_evals where use_case = p_use_case and eval_key = p_eval_key;
  if not found then raise exception 'eval "%" not attached to use case "%"', p_eval_key, p_use_case; end if;
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai_eval.detach', 'ai_use_case_eval', p_use_case,
            jsonb_build_object('eval_key', p_eval_key));
end; $$;
grant execute on function admin_ai_eval_detach(text,text) to authenticated;

-- ── admin_ai_eval_set  (latest body from 20260628140000_ai_evals.sql) ──
create or replace function admin_ai_eval_set(
  p_use_case text, p_eval_key text,
  p_enabled boolean default null, p_kind_override text default null,
  p_threshold_override numeric default null, p_sample_rate numeric default null,
  p_position int default null, p_panel_policy jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text := coalesce(auth.email(), 'system');
begin
  if not is_admin_editor() then raise exception 'admin_ai_eval_set: admin access required'; end if;
  update ai_use_case_evals set
    enabled            = coalesce(p_enabled, enabled),
    kind_override      = case when p_kind_override = '' then null else coalesce(p_kind_override, kind_override) end,
    threshold_override = coalesce(p_threshold_override, threshold_override),
    sample_rate        = coalesce(p_sample_rate, sample_rate),
    position           = coalesce(p_position, position),
    panel_policy       = coalesce(p_panel_policy, panel_policy),
    updated_by         = v_actor
  where use_case = p_use_case and eval_key = p_eval_key;
  if not found then raise exception 'eval "%" not attached to use case "%"', p_eval_key, p_use_case; end if;
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai_eval.set', 'ai_use_case_eval', p_use_case,
            jsonb_build_object('eval_key', p_eval_key, 'enabled', p_enabled, 'kind_override', p_kind_override));
end; $$;
grant execute on function admin_ai_eval_set(text,text,boolean,text,numeric,numeric,int,jsonb) to authenticated;

-- ── admin_ai_review_submit  (latest body from 20260628170000_ai_review.sql) ──
create or replace function admin_ai_review_submit(
  p_id      uuid,
  p_verdict text,                    -- 'approved' | 'approved_after_edit' | 'rejected'
  p_edit    jsonb default null,      -- the corrected answer (when edited)
  p_reason  text  default null       -- why (esp. for rejected)
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor text := coalesce(auth.email(), 'system');
begin
  if not is_admin_editor() then raise exception 'admin_ai_review_submit: admin access required'; end if;
  if p_verdict not in ('approved','approved_after_edit','rejected') then
    raise exception 'admin_ai_review_submit: invalid verdict %', p_verdict;
  end if;
  -- tenant-ok: single-row operator review by primary key, is_admin()-gated — the
  -- queue RPC already scopes which rows an operator sees, this writes one by id.
  update ai_decisions
    set human_verdict = p_verdict,
        human_edit    = case when p_verdict = 'approved_after_edit' then p_edit else null end,
        zero_edit     = (p_verdict = 'approved'),
        reviewed_at   = now(),
        reviewed_by   = auth.uid()
    where id = p_id and deleted_at is null;
  if not found then raise exception 'admin_ai_review_submit: decision % not found', p_id; end if;
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai.review.' || p_verdict, 'ai_decision', p_id::text,
            jsonb_build_object('reason', p_reason,
                               'edited', p_verdict = 'approved_after_edit'));
end; $$;
grant execute on function admin_ai_review_submit(uuid,text,jsonb,text) to authenticated;

-- ── admin_ai_model_config_set  (latest body from 20260628180000_ai_model_config.sql) ──
create or replace function admin_ai_model_config_set(
  p_use_case text,
  p_main_provider text, p_main_model text,
  p_backup_provider text default null, p_backup_model text default null,
  p_cache_enabled boolean default null, p_monthly_cap_usd numeric default null
)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text := coalesce(auth.email(), 'system');
begin
  if not is_admin_editor() then raise exception 'admin_ai_model_config_set: admin access required'; end if;
  if not exists (select 1 from ai_model_config where use_case = p_use_case) then
    raise exception 'no config row for use case "%" (seed it via migration first)', p_use_case;
  end if;
  if p_main_provider not in ('anthropic','workers-ai') then
    raise exception 'invalid main_provider "%"', p_main_provider;
  end if;
  update ai_model_config set
    main_provider   = p_main_provider,
    main_model      = p_main_model,
    backup_provider = case when p_backup_provider = '' then null else p_backup_provider end,
    backup_model    = case when p_backup_model = '' then null else p_backup_model end,
    cache_enabled   = coalesce(p_cache_enabled, cache_enabled),
    monthly_cap_usd = p_monthly_cap_usd,   -- null clears the cap
    updated_by      = v_actor
  where use_case = p_use_case;             -- trigger validates runtime/provider + sets updated_at
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai_model_config.set', 'ai_model_config', p_use_case,
            jsonb_build_object('main_model', p_main_model, 'backup_model', p_backup_model,
                               'cache_enabled', p_cache_enabled, 'monthly_cap_usd', p_monthly_cap_usd));
end; $$;
grant execute on function admin_ai_model_config_set(text,text,text,text,text,boolean,numeric) to authenticated;

-- ── admin_ai_price_set  (latest body from 20260628180000_ai_model_config.sql) ──
create or replace function admin_ai_price_set(
  p_model text, p_provider text, p_input_per_mtok numeric, p_output_per_mtok numeric
)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor text := coalesce(auth.email(), 'system');
begin
  if not is_admin_editor() then raise exception 'admin_ai_price_set: admin access required'; end if;
  if p_provider not in ('anthropic','workers-ai') then raise exception 'invalid provider "%"', p_provider; end if;
  insert into ai_model_prices (model, provider, input_per_mtok, output_per_mtok, updated_by)
    values (p_model, p_provider, p_input_per_mtok, p_output_per_mtok, v_actor)
    on conflict (model) do update set
      provider = excluded.provider,
      input_per_mtok = excluded.input_per_mtok,
      output_per_mtok = excluded.output_per_mtok,
      updated_at = now(), updated_by = v_actor;
  insert into admin_audit (actor_email, action, target_type, target_id, payload)
    values (v_actor, 'ai_price.set', 'ai_model_price', p_model,
            jsonb_build_object('input_per_mtok', p_input_per_mtok, 'output_per_mtok', p_output_per_mtok));
end; $$;
grant execute on function admin_ai_price_set(text,text,numeric,numeric) to authenticated;

-- ── admin_ai_set_review_mode  (latest body from 20260629140000_ai_autonomy_ramp.sql) ──
create or replace function admin_ai_set_review_mode(
  p_use_case    text,
  p_mode        text,
  p_sample_rate numeric
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_editor() then raise exception 'admin_ai_set_review_mode: admin access required'; end if;
  if p_mode not in ('full','sampling') then raise exception 'invalid mode'; end if;
  if p_sample_rate < 0 or p_sample_rate > 1 then raise exception 'sample rate out of range'; end if;

  update ai_use_cases
     set review_mode = p_mode,
         review_sample_rate = case when p_mode = 'full' then 1.0 else p_sample_rate end
   where use_case = p_use_case;
  if not found then raise exception 'unknown use case %', p_use_case; end if;

  insert into admin_audit (actor_email, action, target_type, target_id, payload)
  values (coalesce(auth.email(), 'system'), 'ai_review_mode.set', 'ai_use_case', p_use_case,
          jsonb_build_object('mode', p_mode, 'sample_rate', p_sample_rate));
end; $$;
grant execute on function admin_ai_set_review_mode(text, text, numeric) to authenticated;

