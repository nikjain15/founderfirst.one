-- =============================================================================
-- FounderFirst — Signals (social listening + outreach)
-- =============================================================================
--
-- Finds founders/SMB owners voicing bookkeeping pain on social media, scores
-- them for intent, surfaces them as leads, and drafts human-approved outreach.
-- Full design: SIGNALS_SOLUTION.md. Strategy: SOCIAL_LISTENING_STRATEGY.md.
--
-- Surfaces / callers
--   - Admin UI ("Signals" tab) — authenticated, gated on is_admin(), audited
--     via log_admin_action. Calls the sig_admin_* / list_* RPCs.
--   - Intake edge function (listening-intake) — holds the service-role key,
--     calls sig_ingest_item after checking its shared secret. The browser
--     extension and Quick-Add reach the DB only through it (extension) or via
--     sig_quick_add_item (admin, authenticated).
--   - VM pull-worker (service-role key, server-side) — claims pending items,
--     scores them locally (Ollama + embeddings), writes results back. Calls
--     sig_claim_pending / sig_submit_score / sig_set_lead_draft and the
--     embedding helpers. These are NEVER granted to anon/authenticated.
--
-- Safety model
--   - All tables RLS deny-all. Access only through security-definer RPCs.
--   - Admin RPCs check is_admin(); worker/ingest RPCs are revoked from public
--     and granted only to service_role (so the public anon key can't call them).
--   - Data minimization (GDPR): we store post text, public handle, URL,
--     timestamp. Deleting a lead cascades its events; deleting an item cascades
--     its score and lead.
--
-- Safe to re-run (idempotent).
-- =============================================================================

create extension if not exists "vector";  -- pgvector, for ICP relevance

-- Embedding dimension is tied to the model (nomic-embed-text = 768). If the
-- embedding model changes to a different dimensionality, that needs a migration.

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- Keyword prefilter terms: pain phrases (relevance) + competitor names (flag).
create table if not exists sig_keywords (
  id          uuid primary key default gen_random_uuid(),
  term        text not null,
  kind        text not null check (kind in ('pain', 'competitor')),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists uniq_sig_keywords_term_kind
  on sig_keywords (lower(term), kind);

-- Reference examples of our ICP's pain. The worker embeds each (fills embedding
-- where null) and scores incoming items by similarity against this set.
create table if not exists sig_icp_examples (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  embedding   vector(768),
  created_at  timestamptz not null default now()
);

-- Configured searches / communities to collect from.
create table if not exists sig_sources (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null,
  query           text,
  captured_via    text not null default 'extension'
                  check (captured_via in ('extension','quick_add','api_direct','bright_data','octolens')),
  enabled         boolean not null default true,
  cadence_minutes int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Normalized intake — one row per caught post.
create table if not exists sig_items (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  external_url  text,                 -- nullable: pure-text manual captures may have none
  author_handle text,
  author_url    text,
  title         text,
  body          text,
  posted_at     timestamptz,
  captured_via  text not null default 'extension'
                check (captured_via in ('extension','quick_add','api_direct','bright_data','octolens')),
  source_id     uuid references sig_sources (id) on delete set null,
  raw           jsonb not null default '{}'::jsonb,
  status        text not null default 'pending'
                check (status in ('pending','scoring','scored','archived','promoted')),
  captured_at   timestamptz not null default now()
);
-- Dedup by URL when present (multiple null URLs are allowed).
create unique index if not exists uniq_sig_items_url
  on sig_items (external_url) where external_url is not null;
create index if not exists idx_sig_items_status on sig_items (status, captured_at desc);

-- Brain output, 1:1 with an item.
create table if not exists sig_scores (
  item_id     uuid primary key references sig_items (id) on delete cascade,
  relevance   real,
  intent      int,
  pain_tags   text[] not null default '{}',
  competitor  text,
  model       text,
  scored_at   timestamptz not null default now()
);

-- Outreach pipeline — one lead per promoted item.
create table if not exists sig_leads (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null unique references sig_items (id) on delete cascade,
  stage        text not null default 'new'
               check (stage in ('new','reviewing','drafted','sent','replied','won','dead')),
  channel      text not null default 'on_platform'
               check (channel in ('on_platform','email')),
  assignee     text,
  draft        text,
  draft_model  text,
  send_method  text check (send_method in ('copy','api','email')),
  sent_at      timestamptz,
  outcome      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_sig_leads_stage on sig_leads (stage, created_at desc);

-- Per-lead audit trail.
create table if not exists sig_lead_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references sig_leads (id) on delete cascade,
  actor_email text,
  kind        text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sig_lead_events_lead on sig_lead_events (lead_id, created_at desc);

-- RLS: deny-all on every table. Access via RPCs only.
alter table sig_keywords     enable row level security;
alter table sig_icp_examples enable row level security;
alter table sig_sources      enable row level security;
alter table sig_items        enable row level security;
alter table sig_scores       enable row level security;
alter table sig_leads        enable row level security;
alter table sig_lead_events  enable row level security;

-- =============================================================================
-- Worker + intake RPCs  (service_role only — revoked from public)
-- =============================================================================

-- Insert a normalized item. Used by the intake edge function (extension feed)
-- and reused by sig_quick_add_item. Dedups on external_url. Returns the item id
-- (existing id on conflict).
create or replace function sig_ingest_item(
  p_platform      text,
  p_external_url  text default null,
  p_author_handle text default null,
  p_author_url    text default null,
  p_title         text default null,
  p_body          text default null,
  p_posted_at     timestamptz default null,
  p_captured_via  text default 'extension',
  p_raw           jsonb default '{}'::jsonb,
  p_source_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_platform is null or length(trim(p_platform)) = 0 then
    raise exception 'sig_ingest_item: platform required';
  end if;

  -- Dedup on URL when present.
  if p_external_url is not null then
    select id into v_id from sig_items where external_url = p_external_url;
    if found then
      return v_id;
    end if;
  end if;

  insert into sig_items (
    platform, external_url, author_handle, author_url, title, body,
    posted_at, captured_via, raw, source_id
  ) values (
    p_platform, p_external_url, p_author_handle, p_author_url, p_title, p_body,
    p_posted_at, p_captured_via, coalesce(p_raw, '{}'::jsonb), p_source_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Claim up to N pending items for scoring. Flips them to 'scoring' atomically
-- (skip-locked) so two worker runs don't double-process.
create or replace function sig_claim_pending(p_limit int default 20)
returns setof sig_items
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id from sig_items
    where status = 'pending'
    order by captured_at asc
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  update sig_items s
     set status = 'scoring'
    from picked
   where s.id = picked.id
  returning s.*;
end;
$$;

-- Write a score and route the item. p_promote = item cleared both thresholds.
-- On promote: creates a lead (stage 'new') and returns its id. Otherwise the
-- item is archived (below relevance/intent) or left 'scored'.
create or replace function sig_submit_score(
  p_item_id    uuid,
  p_relevance  real,
  p_intent     int,
  p_pain_tags  text[] default '{}',
  p_competitor text default null,
  p_model      text default null,
  p_promote    boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  insert into sig_scores (item_id, relevance, intent, pain_tags, competitor, model, scored_at)
  values (p_item_id, p_relevance, p_intent, coalesce(p_pain_tags, '{}'), p_competitor, p_model, now())
  on conflict (item_id) do update
    set relevance = excluded.relevance,
        intent    = excluded.intent,
        pain_tags = excluded.pain_tags,
        competitor = excluded.competitor,
        model     = excluded.model,
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

-- Worker attaches the managed-AI draft to a promoted lead, advancing it to
-- 'drafted'. Separate call because drafting happens after scoring (managed AI).
create or replace function sig_set_lead_draft(
  p_lead_id uuid,
  p_draft   text,
  p_model   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update sig_leads
     set draft = p_draft,
         draft_model = p_model,
         stage = case when stage = 'new' then 'drafted' else stage end,
         updated_at = now()
   where id = p_lead_id;

  insert into sig_lead_events (lead_id, actor_email, kind, detail)
    values (p_lead_id, 'worker', 'draft_generated', jsonb_build_object('model', p_model));
end;
$$;

-- Embedding helpers — the worker fills embeddings for ICP examples, then scores
-- item relevance by nearest-neighbour cosine similarity against them.
create or replace function sig_unembedded_examples(p_limit int default 100)
returns table (id uuid, body text)
language sql
security definer
set search_path = public
as $$
  select id, body from sig_icp_examples
  where embedding is null
  order by created_at asc
  limit greatest(1, least(p_limit, 500));
$$;

create or replace function sig_set_example_embedding(p_id uuid, p_embedding vector(768))
returns void
language sql
security definer
set search_path = public
as $$
  update sig_icp_examples set embedding = p_embedding where id = p_id;
$$;

-- Max cosine similarity of an item embedding vs the ICP reference set
-- (1 - cosine distance). Returns null if no embedded examples exist.
create or replace function sig_relevance(p_embedding vector(768))
returns real
language sql
security definer
set search_path = public
as $$
  select max(1 - (embedding <=> p_embedding))::real
  from sig_icp_examples
  where embedding is not null;
$$;

-- =============================================================================
-- Admin RPCs  (authenticated, gated on is_admin(); mutations audited)
-- =============================================================================

create or replace function list_sig_items(
  p_status     text default null,
  p_platform   text default null,
  p_min_intent int default null,
  p_limit      int default 200
)
returns table (
  id            uuid,
  platform      text,
  external_url  text,
  author_handle text,
  title         text,
  body          text,
  posted_at     timestamptz,
  captured_via  text,
  status        text,
  captured_at   timestamptz,
  relevance     real,
  intent        int,
  pain_tags     text[],
  competitor    text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'list_sig_items: admin access required'; end if;
  return query
    select i.id, i.platform, i.external_url, i.author_handle, i.title, i.body,
           i.posted_at, i.captured_via, i.status, i.captured_at,
           s.relevance, s.intent, s.pain_tags, s.competitor
    from sig_items i
    left join sig_scores s on s.item_id = i.id
    where (p_status is null or i.status = p_status)
      and (p_platform is null or i.platform = p_platform)
      and (p_min_intent is null or coalesce(s.intent, 0) >= p_min_intent)
    order by i.captured_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

create or replace function list_sig_leads(
  p_stage text default null,
  p_limit int default 200
)
returns table (
  id            uuid,
  item_id       uuid,
  stage         text,
  channel       text,
  platform      text,
  author_handle text,
  external_url  text,
  title         text,
  intent        int,
  competitor    text,
  has_draft     boolean,
  sent_at       timestamptz,
  created_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'list_sig_leads: admin access required'; end if;
  return query
    select l.id, l.item_id, l.stage, l.channel, i.platform, i.author_handle,
           i.external_url, i.title, s.intent, s.competitor,
           (l.draft is not null) as has_draft, l.sent_at, l.created_at
    from sig_leads l
    join sig_items i on i.id = l.item_id
    left join sig_scores s on s.item_id = l.item_id
    where (p_stage is null or l.stage = p_stage)
    order by l.created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

-- Full bundle for the lead detail view: lead + item + score + recent events.
create or replace function get_sig_lead(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_out jsonb;
begin
  if not is_admin() then raise exception 'get_sig_lead: admin access required'; end if;
  select jsonb_build_object(
    'lead', to_jsonb(l.*),
    'item', to_jsonb(i.*),
    'score', to_jsonb(s.*),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e.*) order by e.created_at desc)
      from sig_lead_events e where e.lead_id = l.id
    ), '[]'::jsonb)
  )
  into v_out
  from sig_leads l
  join sig_items i on i.id = l.item_id
  left join sig_scores s on s.item_id = l.item_id
  where l.id = p_lead_id;

  if v_out is null then raise exception 'get_sig_lead: not found'; end if;
  return v_out;
end;
$$;

create or replace function update_sig_lead_stage(p_lead_id uuid, p_stage text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'update_sig_lead_stage: admin access required'; end if;
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

create or replace function save_sig_lead_draft(p_lead_id uuid, p_draft text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'save_sig_lead_draft: admin access required'; end if;
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

create or replace function mark_sig_lead_sent(p_lead_id uuid, p_channel text default 'on_platform')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'mark_sig_lead_sent: admin access required'; end if;
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

-- Quick-Add: admin pastes a URL/text. Reuses sig_ingest_item, then audits.
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
  if not is_admin() then raise exception 'sig_quick_add_item: admin access required'; end if;
  v_id := sig_ingest_item(
    p_platform, p_external_url, p_author_handle, p_author_url,
    p_title, p_body, null, 'quick_add', '{}'::jsonb, null
  );
  perform log_admin_action('sig_quick_add', 'sig_item', v_id::text,
                           jsonb_build_object('platform', p_platform, 'url', p_external_url));
  return v_id;
end;
$$;

create or replace function list_sig_keywords()
returns setof sig_keywords
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'list_sig_keywords: admin access required'; end if;
  return query select * from sig_keywords order by kind, term;
end;
$$;

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
  if p_kind not in ('pain','competitor') then
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

create or replace function add_sig_icp_example(p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'add_sig_icp_example: admin access required'; end if;
  insert into sig_icp_examples (body) values (p_body) returning id into v_id;
  perform log_admin_action('sig_icp_example_add', 'sig_icp_example', v_id::text, '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function list_sig_sources()
returns setof sig_sources
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'list_sig_sources: admin access required'; end if;
  return query select * from sig_sources order by platform, created_at;
end;
$$;

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
  if not is_admin() then raise exception 'upsert_sig_source: admin access required'; end if;
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

-- =============================================================================
-- Grants
-- =============================================================================

-- Worker + intake RPCs: revoke from public, grant ONLY to service_role.
revoke execute on function
  sig_ingest_item(text,text,text,text,text,text,timestamptz,text,jsonb,uuid),
  sig_claim_pending(int),
  sig_submit_score(uuid,real,int,text[],text,text,boolean),
  sig_set_lead_draft(uuid,text,text),
  sig_unembedded_examples(int),
  sig_set_example_embedding(uuid,vector),
  sig_relevance(vector)
  from public;

grant execute on function
  sig_ingest_item(text,text,text,text,text,text,timestamptz,text,jsonb,uuid),
  sig_claim_pending(int),
  sig_submit_score(uuid,real,int,text[],text,text,boolean),
  sig_set_lead_draft(uuid,text,text),
  sig_unembedded_examples(int),
  sig_set_example_embedding(uuid,vector),
  sig_relevance(vector)
  to service_role;

-- The VM worker drafts outreach in brand voice; it reads the live voice via the
-- existing RPC. Grant it to service_role explicitly (it's already public, but be
-- robust if public execute is ever revoked).
grant execute on function get_live_voice() to service_role;

-- Admin RPCs: authenticated (each gated internally on is_admin()).
grant execute on function list_sig_items(text,text,int,int)                      to authenticated;
grant execute on function list_sig_leads(text,int)                               to authenticated;
grant execute on function get_sig_lead(uuid)                                     to authenticated;
grant execute on function update_sig_lead_stage(uuid,text)                       to authenticated;
grant execute on function save_sig_lead_draft(uuid,text)                         to authenticated;
grant execute on function mark_sig_lead_sent(uuid,text)                          to authenticated;
grant execute on function sig_quick_add_item(text,text,text,text,text,text)      to authenticated;
grant execute on function list_sig_keywords()                                    to authenticated;
grant execute on function upsert_sig_keyword(text,text,boolean,uuid)             to authenticated;
grant execute on function add_sig_icp_example(text)                              to authenticated;
grant execute on function list_sig_sources()                                     to authenticated;
grant execute on function upsert_sig_source(text,text,text,boolean,int,uuid)     to authenticated;

-- =============================================================================
-- Seed — starter keywords from the strategy (ICP pain phrases + competitors)
-- =============================================================================

insert into sig_keywords (term, kind) values
  ('behind on my books', 'pain'),
  ('bookkeeping nightmare', 'pain'),
  ('hate QuickBooks', 'pain'),
  ('QuickBooks too expensive', 'pain'),
  ('QuickBooks too complicated', 'pain'),
  ('need a bookkeeper', 'pain'),
  ('catch-up bookkeeping', 'pain'),
  ('categorize transactions', 'pain'),
  ('reconcile transactions', 'pain'),
  ('year-end tax scramble', 'pain'),
  ('DIY accounting spreadsheet', 'pain'),
  ('1099 mess', 'pain'),
  ('QuickBooks', 'competitor'),
  ('Xero', 'competitor'),
  ('Wave', 'competitor'),
  ('FreshBooks', 'competitor'),
  ('Pilot', 'competitor'),
  ('Puzzle', 'competitor'),
  ('Digits', 'competitor'),
  ('Bench', 'competitor')
on conflict (lower(term), kind) do nothing;
