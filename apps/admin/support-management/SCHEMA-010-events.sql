-- =============================================================================
-- FounderFirst — Unified events table (migration 010)
-- =============================================================================
--
-- Single store for product/marketing/admin events. Goal: every signal lands
-- in one queryable place that later feeds the learning agent.
--
-- We do NOT replace PostHog or GA — they keep doing what they're good at.
-- We mirror critical events here so we can join them to Supabase data
-- (waitlist, tickets, audit) without exporting from third parties.
--
-- Writers:
--   - Marketing site (anon role) via track_event() RPC — wires in Step 4.
--   - Admin app via track_event() with auth context.
--   - Backfill: existing waitlist signups inserted as 'waitlist_signup' events
--     so the funnel works from day one.
--
-- Reader:
--   - admin_list_events() — admin only, filtered list view.
--   - Aggregation RPCs added per-funnel as needed.
--
-- Safe to re-run.
-- =============================================================================

create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  event_name   text not null,
  props        jsonb not null default '{}'::jsonb,
  source       text,                    -- 'marketing' | 'admin' | 'penny' | 'backfill' | ...
  actor_email  text,                    -- set if known (admin actions, signed-in users)
  anon_id      text,                    -- client-generated cookie/localStorage ID for anon tracking
  user_agent   text,
  referrer     text,
  path         text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_events_created     on events (created_at desc);
create index if not exists idx_events_name_time   on events (event_name, created_at desc);
create index if not exists idx_events_anon        on events (anon_id, created_at) where anon_id is not null;
create index if not exists idx_events_actor       on events (actor_email, created_at) where actor_email is not null;

alter table events enable row level security;
-- No table policies — access via RPCs.

-- ---- track_event() — public write RPC --------------------------------------
-- Callable from anon (marketing site) and authenticated (admin/penny).
-- Intentionally permissive: low-trust events feed analytics, not security.
create or replace function track_event(
  p_event_name text,
  p_props      jsonb default '{}'::jsonb,
  p_source     text  default null,
  p_anon_id    text  default null,
  p_user_agent text  default null,
  p_referrer   text  default null,
  p_path       text  default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Cheap guardrails — drop empty/oversized names and oversized payloads.
  if p_event_name is null or length(p_event_name) = 0 or length(p_event_name) > 80 then
    raise exception 'track_event: invalid event_name';
  end if;
  if octet_length(coalesce(p_props::text, '')) > 16384 then
    raise exception 'track_event: payload too large';
  end if;

  insert into events (event_name, props, source, actor_email, anon_id, user_agent, referrer, path)
    values (
      p_event_name,
      coalesce(p_props, '{}'::jsonb),
      p_source,
      auth.email(),
      p_anon_id,
      p_user_agent,
      p_referrer,
      p_path
    )
    returning id into v_id;

  return v_id;
end;
$$;

grant execute on function track_event(text, jsonb, text, text, text, text, text) to anon, authenticated;

-- ---- admin_list_events() — admin read --------------------------------------
create or replace function admin_list_events(
  p_event_name text default null,
  p_since      timestamptz default null,
  p_limit      int default 200
)
returns table (
  id          uuid,
  event_name  text,
  props       jsonb,
  source      text,
  actor_email text,
  anon_id     text,
  created_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_list_events: admin access required';
  end if;

  return query
    select e.id, e.event_name, e.props, e.source, e.actor_email, e.anon_id, e.created_at
    from events e
    where (p_event_name is null or e.event_name = p_event_name)
      and (p_since is null or e.created_at >= p_since)
    order by e.created_at desc
    limit greatest(1, least(p_limit, 1000));
end;
$$;

grant execute on function admin_list_events(text, timestamptz, int) to authenticated;

-- ---- One-time backfill: existing waitlist signups as events ---------------
-- Idempotent: only inserts if no waitlist_signup event with that email exists.
insert into events (event_name, props, source, actor_email, created_at)
select
  'waitlist_signup',
  jsonb_build_object(
    'source',      w.source,
    'slug',        w.slug,
    'referred_by', w.referred_by,
    'email',       w.email
  ),
  'backfill',
  w.email,
  w.signed_up_at
from waitlist w
where not exists (
  select 1 from events e
  where e.event_name = 'waitlist_signup'
    and e.actor_email = w.email
);

-- =============================================================================
-- End of migration 010.
-- =============================================================================
