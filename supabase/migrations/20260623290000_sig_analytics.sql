-- Read-only analytics for the Signals pipeline, surfaced under Analytics →
-- Signals. Two admin-gated RPCs, no schema/worker changes.
--
--  sig_analytics_pipeline(days)        — cohort funnel + outcome rates
--  sig_analytics_themes(days, gran)    — what the market is talking about:
--                                        trending pains/competitors + examples

-- 1. Pipeline funnel (cohort = items captured in the window, followed through
--    to their lead's current outcome) + reply/win rates + action backlog.
create or replace function sig_analytics_pipeline(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => p_days);
  v_prev  timestamptz := now() - make_interval(days => p_days * 2);
  v_out jsonb;
begin
  if not is_admin() then raise exception 'sig_analytics_pipeline: admin access required'; end if;

  with cohort as (
    select i.status, l.sent_at, l.stage, l.created_at as lead_created
    from sig_items i
    left join sig_leads l on l.item_id = i.id
    where i.captured_at >= v_since
  ),
  f as (
    select
      count(*)                                                          as ingested,
      count(*) filter (where status in ('scored','archived','promoted')) as scored,
      count(*) filter (where status = 'promoted')                       as promoted,
      count(*) filter (where sent_at is not null)                       as sent,
      count(*) filter (where stage in ('replied','won'))                as replied,
      count(*) filter (where stage = 'won')                             as won
    from cohort
  )
  select jsonb_build_object(
    'funnel', jsonb_build_object(
      'ingested', f.ingested, 'scored', f.scored, 'promoted', f.promoted,
      'sent', f.sent, 'replied', f.replied, 'won', f.won
    ),
    'prev_promoted', (
      select count(*) from sig_items
      where captured_at >= v_prev and captured_at < v_since and status = 'promoted'
    ),
    'needs_action', (
      select count(*) from sig_leads
      where stage in ('new','reviewing','drafted') and sent_at is null
    ),
    'avg_days_to_send', (
      select round(avg(extract(epoch from (sent_at - created_at)) / 86400.0)::numeric, 1)
      from sig_leads where sent_at is not null and sent_at >= v_since
    )
  )
  into v_out from f;

  return v_out;
end;
$$;

-- 2. Market themes — trending customer pains & competitor frustrations among
--    on-topic ("needs_help") posts, segmentable by day/week/month, with a few
--    representative posts to mine for content (blog / social / podcast).
create or replace function sig_analytics_themes(p_days int default 30, p_gran text default 'week')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => p_days);
  v_prev  timestamptz := now() - make_interval(days => p_days * 2);
  v_gran  text := case when p_gran in ('day','week','month') then p_gran else 'week' end;
  v_out jsonb;
begin
  if not is_admin() then raise exception 'sig_analytics_themes: admin access required'; end if;

  with base as (
    select s.pain_tags, s.competitor, i.platform,
           coalesce(i.posted_at, i.captured_at) as ts,
           i.title, i.body, i.external_url
    from sig_scores s
    join sig_items i on i.id = s.item_id
    where s.role = 'needs_help' and coalesce(i.posted_at, i.captured_at) >= v_since
  ),
  prev as (
    select s.pain_tags, s.competitor
    from sig_scores s
    join sig_items i on i.id = s.item_id
    where s.role = 'needs_help'
      and coalesce(i.posted_at, i.captured_at) >= v_prev
      and coalesce(i.posted_at, i.captured_at) <  v_since
  ),
  pain_now  as (select tag, count(*) c from base, unnest(pain_tags) tag group by tag),
  pain_prev as (select tag, count(*) c from prev, unnest(pain_tags) tag group by tag),
  comp_now  as (select competitor, count(*) c from base where competitor is not null group by competitor),
  comp_prev as (select competitor, count(*) c from prev where competitor is not null group by competitor)
  select jsonb_build_object(
    'pains', coalesce((
      select jsonb_agg(jsonb_build_object('tag', pn.tag, 'count', pn.c, 'prev', coalesce(pp.c, 0))
                       order by pn.c desc)
      from (select * from pain_now order by c desc limit 12) pn
      left join pain_prev pp on pp.tag = pn.tag
    ), '[]'::jsonb),
    'competitors', coalesce((
      select jsonb_agg(jsonb_build_object('name', cn.competitor, 'count', cn.c, 'prev', coalesce(cp.c, 0))
                       order by cn.c desc)
      from (select * from comp_now order by c desc limit 10) cn
      left join comp_prev cp on cp.competitor = cn.competitor
    ), '[]'::jsonb),
    'platforms', coalesce((
      select jsonb_agg(jsonb_build_object('platform', platform, 'count', c) order by c desc)
      from (select platform, count(*) c from base group by platform) p
    ), '[]'::jsonb),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', b, 'count', c) order by b)
      from (select date_trunc(v_gran, ts) b, count(*) c from base group by 1) bk
    ), '[]'::jsonb),
    'examples', coalesce((
      select jsonb_agg(jsonb_build_object(
               'title', title,
               'snippet', left(coalesce(body, title, ''), 220),
               'url', external_url, 'platform', platform, 'ts', ts,
               'pains', pain_tags, 'competitor', competitor))
      from (select * from base order by ts desc limit 8) ex
    ), '[]'::jsonb),
    'total_posts', (select count(*) from base)
  )
  into v_out;

  return v_out;
end;
$$;

grant execute on function sig_analytics_pipeline(int)         to authenticated;
grant execute on function sig_analytics_themes(int, text)     to authenticated;
