-- =============================================================================
-- SCHEMA-004 — Analytics RPC
-- =============================================================================
--
-- Adds a single SECURITY DEFINER function `get_analytics()` that returns
-- a JSON blob with all admin-dashboard KPIs and time series. No new tables.
-- All counts computed live from support_tickets + support_messages.
--
-- Authenticated admin only (auth.uid() must be present).
--
-- Returns shape:
--   {
--     "now":            "<iso>",
--     "open_count":     n,
--     "in_progress":    n,
--     "stale_count":    n,            -- open with created_at older than 24h
--     "resolved_7d":    n,
--     "opened_7d":      n,
--     "avg_first_response_minutes_7d": float | null,
--     "opens_by_day":   [{ "day": "YYYY-MM-DD", "count": n }, ...]    -- 14 days
--     "resolves_by_day":[{ "day": "YYYY-MM-DD", "count": n }, ...]    -- 14 days
--     "channel_30d":    { "discord": n, "web": n },
--     "priority_30d":   { "p1": n, "p2": n, "p3": n }
--   }
--
-- Safe to re-run.
-- =============================================================================

create or replace function get_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now              timestamptz := now();
  v_open             bigint;
  v_in_progress      bigint;
  v_stale            bigint;
  v_resolved_7d      bigint;
  v_opened_7d        bigint;
  v_avg_resp_min     numeric;
  v_opens_by_day     jsonb;
  v_resolves_by_day  jsonb;
  v_channel_30d      jsonb;
  v_priority_30d     jsonb;
begin
  if auth.uid() is null then
    raise exception 'get_analytics: authentication required';
  end if;

  -- Current state counts
  select count(*) into v_open
    from support_tickets where status = 'open';

  select count(*) into v_in_progress
    from support_tickets where status = 'in_progress';

  select count(*) into v_stale
    from support_tickets
    where status in ('open', 'in_progress')
      and (case when status = 'open' then created_at else updated_at end)
          < v_now - interval '24 hours';

  -- 7-day windows
  select count(*) into v_resolved_7d
    from support_tickets
    where resolved_at is not null
      and resolved_at >= v_now - interval '7 days';

  select count(*) into v_opened_7d
    from support_tickets
    where created_at >= v_now - interval '7 days';

  -- Avg first admin response time (minutes) over tickets resolved in last 7d
  with first_admin as (
    select t.id as ticket_id,
           t.created_at,
           min(m.created_at) as first_admin_at
      from support_tickets t
      join support_messages m
        on m.ticket_id = t.id and m.author = 'admin'
     where t.resolved_at is not null
       and t.resolved_at >= v_now - interval '7 days'
     group by t.id, t.created_at
  )
  select round(avg(extract(epoch from (first_admin_at - created_at)) / 60.0)::numeric, 1)
    into v_avg_resp_min
    from first_admin;

  -- 14-day daily series for opens
  with days as (
    select generate_series(
             (v_now - interval '13 days')::date,
             v_now::date,
             interval '1 day'
           )::date as day
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into v_opens_by_day
    from days d
    left join (
      select created_at::date as day, count(*)::int as n
        from support_tickets
       where created_at >= v_now - interval '14 days'
       group by 1
    ) c on c.day = d.day;

  -- 14-day daily series for resolves
  with days as (
    select generate_series(
             (v_now - interval '13 days')::date,
             v_now::date,
             interval '1 day'
           )::date as day
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into v_resolves_by_day
    from days d
    left join (
      select resolved_at::date as day, count(*)::int as n
        from support_tickets
       where resolved_at is not null
         and resolved_at >= v_now - interval '14 days'
       group by 1
    ) c on c.day = d.day;

  -- 30-day channel mix
  select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb)
    into v_channel_30d
    from (
      select channel, count(*)::int as n
        from support_tickets
       where created_at >= v_now - interval '30 days'
       group by channel
    ) x;

  -- 30-day priority mix
  select coalesce(jsonb_object_agg(priority, n), '{}'::jsonb)
    into v_priority_30d
    from (
      select priority, count(*)::int as n
        from support_tickets
       where created_at >= v_now - interval '30 days'
       group by priority
    ) x;

  return jsonb_build_object(
    'now',                v_now,
    'open_count',         v_open,
    'in_progress',        v_in_progress,
    'stale_count',        v_stale,
    'resolved_7d',        v_resolved_7d,
    'opened_7d',          v_opened_7d,
    'avg_first_response_minutes_7d', v_avg_resp_min,
    'opens_by_day',       v_opens_by_day,
    'resolves_by_day',    v_resolves_by_day,
    'channel_30d',        v_channel_30d,
    'priority_30d',       v_priority_30d
  );
end;
$$;

grant execute on function get_analytics() to authenticated;

-- =============================================================================
-- End of SCHEMA-004
-- =============================================================================
