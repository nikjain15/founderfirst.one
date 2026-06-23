-- =============================================================================
-- FounderFirst — Signals: sourcing quality + US-geography gate (Sources tab)
-- =============================================================================
--
-- Audit outcome (Sources tab): the pipeline pulled recruiters, agencies, job
-- boards and non-US posts, then paid to score (and sometimes draft) them. This
-- migration adds the three filters that keep junk out at the source:
--
--   1. exclude keywords  — a third sig_keywords kind. The worker archives any
--      item matching one BEFORE scoring (no LLM, no embedding cost).
--   2. geo               — the local scorer now classifies us / non_us / unknown
--      and a "role" (needs_help / offering_services / hiring / other). Stored on
--      sig_scores. Promotion is gated by geo_mode + role in the worker.
--   3. geo_mode setting  — 'hard_us' (default, geo must be 'us'), 'us_preferred'
--      (anything not non_us), or 'off'. Editable like the other thresholds.
--
-- Same conventions: security definer, is_admin() gated where admin-facing,
-- service_role-only for worker RPCs. Safe to re-run (idempotent).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. exclude keyword kind
-- -----------------------------------------------------------------------------
alter table sig_keywords drop constraint if exists sig_keywords_kind_check;
alter table sig_keywords
  add constraint sig_keywords_kind_check
  check (kind in ('pain', 'competitor', 'exclude'));

-- Seed the negative list. These are the agency/recruiter/job-board patterns that
-- flooded the feed (see @Houston Jobs, @HireLATAM, Dogs 4 Rescue in the audit).
-- Unambiguous spam only. Anything ambiguous (e.g. "looking to hire a
-- bookkeeper" = a real buyer vs a recruiter's "we are hiring") is left to the
-- LLM "role" classifier, which separates needs_help from offering/hiring.
insert into sig_keywords (term, kind) values
  ('we offer',            'exclude'),
  ('we provide',          'exclude'),
  ('our services include','exclude'),
  ('dm for rates',        'exclude'),
  ('dm me for',           'exclude'),
  ('we are hiring',       'exclude'),
  ('now hiring',          'exclude'),
  ('job opening',         'exclude'),
  ('job opportunity',     'exclude'),
  ('apply now',           'exclude'),
  ('send your resume',    'exclude'),
  ('send your cv',        'exclude'),
  ('full-time position',  'exclude'),
  ('part-time position',  'exclude'),
  ('offshore bookkeeping','exclude'),
  ('outsource your books to us','exclude'),
  ('promo code',          'exclude'),
  ('affiliate link',      'exclude')
on conflict (lower(term), kind) do nothing;

-- Allow the admin keyword editor to manage 'exclude' too.
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
  if not is_admin() then raise exception 'upsert_sig_keyword: admin access required'; end if;
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

-- -----------------------------------------------------------------------------
-- 2. geo on scores
-- -----------------------------------------------------------------------------
alter table sig_scores add column if not exists geo  text;   -- 'us' | 'non_us' | 'unknown'
alter table sig_scores add column if not exists role text;   -- 'needs_help' | 'offering_services' | 'hiring' | 'other'

-- -----------------------------------------------------------------------------
-- 3. geo_mode setting + widen the settings whitelist
-- -----------------------------------------------------------------------------
insert into sig_settings (key, value) values
  ('geo_mode', '"hard_us"'::jsonb)   -- 'hard_us' | 'us_preferred' | 'off'
on conflict (key) do nothing;

create or replace function set_sig_setting(p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'set_sig_setting: admin access required'; end if;
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

-- -----------------------------------------------------------------------------
-- 4. sig_submit_score gains p_geo / p_role (worker-only).
--    Added as a NEW overload (9 args) rather than replacing the 7-arg version,
--    so a worker still running the old code keeps working during rollout — the
--    DB push and the worker restart can happen in either order safely.
-- -----------------------------------------------------------------------------
create or replace function sig_submit_score(
  p_item_id    uuid,
  p_relevance  real,
  p_intent     int,
  p_pain_tags  text[] default '{}',
  p_competitor text default null,
  p_model      text default null,
  p_promote    boolean default false,
  p_geo        text default null,
  p_role       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  insert into sig_scores (item_id, relevance, intent, pain_tags, competitor, model, geo, role, scored_at)
  values (p_item_id, p_relevance, p_intent, coalesce(p_pain_tags, '{}'), p_competitor, p_model, p_geo, p_role, now())
  on conflict (item_id) do update
    set relevance = excluded.relevance,
        intent    = excluded.intent,
        pain_tags = excluded.pain_tags,
        competitor = excluded.competitor,
        model     = excluded.model,
        geo       = excluded.geo,
        role      = excluded.role,
        scored_at = now();

  if p_promote then
    update sig_items set status = 'promoted' where id = p_item_id;
    insert into sig_leads (item_id) values (p_item_id)
      on conflict (item_id) do nothing
      returning id into v_lead_id;
    if v_lead_id is null then
      select id into v_lead_id from sig_leads where item_id = p_item_id;
    end if;
    return v_lead_id;
  else
    update sig_items set status = 'archived' where id = p_item_id;
    return null;
  end if;
end;
$$;

revoke execute on function
  sig_submit_score(uuid,real,int,text[],text,text,boolean,text,text) from public;
grant execute on function
  sig_submit_score(uuid,real,int,text[],text,text,boolean,text,text) to service_role;

-- -----------------------------------------------------------------------------
-- 5. Seed pain-shaped, US-leaning Reddit sources (better inflow than bare nouns)
--    Disabled by default — admin reviews and enables in the Sources tab.
-- -----------------------------------------------------------------------------
insert into sig_sources (platform, query, captured_via, enabled, cadence_minutes) values
  ('reddit', 'behind on my bookkeeping small business',      'api_direct', false, 720),
  ('reddit', 'haven''t filed taxes need a bookkeeper',       'api_direct', false, 720),
  ('reddit', 'quickbooks too complicated alternative',       'api_direct', false, 720),
  ('reddit', 'catch up bookkeeping months behind',           'api_direct', false, 720),
  ('reddit', 'messy books 1099 schedule c help',             'api_direct', false, 720),
  ('reddit', 'bench shut down need new bookkeeper',          'api_direct', false, 720)
on conflict do nothing;
