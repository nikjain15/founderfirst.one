-- =============================================================================
-- FounderFirst Admin — Product funnel RPC (migration 011)
-- =============================================================================
--
-- Builds the activation funnel from the events table. We count distinct
-- anon_id at each stage so a single visitor counts once per stage.
--
-- Stages:
--   visited         — anon_id seen on any page_view
--   penny_opened    — opened the Penny widget
--   penny_messaged  — sent at least one message to Penny
--   signed_up       — completed waitlist signup
--   returned_d1     — return_visit within 1+ days
--   returned_d7     — return_visit within 7+ days
--
-- Notes on data quality:
--   - Aggregate-only (pre-consent) events have no anon_id, so they show up
--     in raw counts but NOT in the distinct funnel. We return both.
--   - waitlist_signup events from the backfill have no anon_id either
--     (we don't know who they were before consent existed), but their
--     `actor_email` lets us count them as a separate "total signups" number.
-- =============================================================================

create or replace function admin_funnel(
  p_since timestamptz default (now() - interval '30 days'),
  p_until timestamptz default now()
)
returns table (
  stage         text,
  unique_users  bigint,
  total_events  bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_funnel: admin access required';
  end if;

  return query
  with stages as (
    select 'visited'        as stage, 'page_view'             as event_name, 1 as ord
    union all select 'penny_opened',    'penny_opened',         2
    union all select 'penny_messaged',  'penny_message_sent',   3
    union all select 'signed_up',       'waitlist_signup',      4
    union all select 'returned_d1',     'return_visit',         5
  )
  select
    s.stage,
    (select count(distinct e.anon_id)
       from events e
       where e.event_name = s.event_name
         and e.anon_id is not null
         and e.created_at between p_since and p_until)                                   as unique_users,
    (select count(*) from events e
       where e.event_name = s.event_name
         and e.created_at between p_since and p_until)                                    as total_events
  from stages s
  order by s.ord;
end;
$$;

grant execute on function admin_funnel(timestamptz, timestamptz) to authenticated;

-- Event volume per day, for the small "events activity" sparkline in the UI.
create or replace function admin_events_daily(
  p_since timestamptz default (now() - interval '30 days')
)
returns table (day date, total bigint, identified bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_events_daily: admin access required';
  end if;

  return query
    select
      (e.created_at at time zone 'UTC')::date            as day,
      count(*)                                            as total,
      count(*) filter (where e.anon_id is not null)       as identified
    from events e
    where e.created_at >= p_since
    group by 1
    order by 1;
end;
$$;

grant execute on function admin_events_daily(timestamptz) to authenticated;

-- =============================================================================
-- End of migration 011.
-- =============================================================================
