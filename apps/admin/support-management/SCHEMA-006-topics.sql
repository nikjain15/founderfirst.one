-- =============================================================================
-- SCHEMA-006 — Topic tagging
-- =============================================================================
--
-- Adds a `topic` column to support_tickets and the plumbing so:
--   - Dify's classify step can write a topic when escalating (via
--     create_ticket(..., p_topic text))
--   - the admin can override the topic from /admin/support/:ticketId
--     (via set_ticket_topic(p_ticket_id, p_topic))
--   - list_tickets returns topic so the inbox can show + filter on it
--   - get_analytics reports a 30-day topic_30d breakdown
--
-- Vocabulary is enforced at the admin UI layer, not in the database — we
-- want the bot to be able to invent new topic names if it sees something
-- new (we'll tighten later if quality drops). The recommended vocabulary
-- is documented in TOPICS-VOCABULARY.md.
--
-- Safe to re-run.
-- =============================================================================

-- ---- Column + index ----------------------------------------------------------

alter table support_tickets
  add column if not exists topic text;

create index if not exists idx_support_tickets_topic
  on support_tickets (topic, created_at desc)
  where topic is not null;

-- ---- create_ticket — replace with topic-aware version ------------------------
-- Drop the old signature first; the new one adds p_topic at the end (default
-- null) so existing callers that don't pass it still work.
drop function if exists create_ticket(
  text, text, text, text, text, text, text, text, text, text, text
);

create or replace function create_ticket(
  p_email              text,
  p_discord_user_id    text,
  p_discord_username   text,
  p_channel            text,
  p_channel_thread_ref text,
  p_subject            text,
  p_first_message      text,
  p_bot_reply          text,
  p_priority           text default 'p2',
  p_bot_confidence     text default 'low',
  p_bot_reason         text default null,
  p_topic              text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_ticket_id  uuid;
begin
  if p_email is not null then
    select id into v_contact_id
      from support_contacts
      where lower(email) = lower(p_email)
      limit 1;
  end if;

  if v_contact_id is null and p_discord_user_id is not null then
    select id into v_contact_id
      from support_contacts
      where discord_user_id = p_discord_user_id
      limit 1;
  end if;

  if v_contact_id is null then
    insert into support_contacts (email, discord_user_id, discord_username)
      values (p_email, p_discord_user_id, p_discord_username)
      returning id into v_contact_id;
  else
    update support_contacts
      set last_seen_at     = now(),
          email            = coalesce(email, p_email),
          discord_user_id  = coalesce(discord_user_id, p_discord_user_id),
          discord_username = coalesce(discord_username, p_discord_username)
      where id = v_contact_id;
  end if;

  insert into support_tickets (
    contact_id, channel, channel_thread_ref,
    priority, subject, first_message,
    bot_confidence, bot_reason, topic
  )
  values (
    v_contact_id, p_channel, p_channel_thread_ref,
    coalesce(p_priority, 'p2'), p_subject, p_first_message,
    p_bot_confidence, p_bot_reason, p_topic
  )
  returning id into v_ticket_id;

  insert into support_messages (ticket_id, author, body)
    values (v_ticket_id, 'user', p_first_message);

  if p_bot_reply is not null then
    insert into support_messages (ticket_id, author, body)
      values (v_ticket_id, 'bot', p_bot_reply);
  end if;

  return v_ticket_id;
end;
$$;

grant execute on function create_ticket(
  text, text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

-- ---- set_ticket_topic --------------------------------------------------------
-- Admin override. Empty string clears the topic.
create or replace function set_ticket_topic(
  p_ticket_id uuid,
  p_topic     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'set_ticket_topic: authentication required';
  end if;

  update support_tickets
    set topic      = nullif(trim(p_topic), ''),
        updated_at = now()
    where id = p_ticket_id;

  if not found then
    raise exception 'set_ticket_topic: ticket not found';
  end if;
end;
$$;

grant execute on function set_ticket_topic(uuid, text) to authenticated;

-- ---- list_tickets — re-create returning topic --------------------------------
drop function if exists list_tickets(text);

create or replace function list_tickets(p_status text default null)
returns table (
  id                  uuid,
  status              text,
  priority            text,
  channel             text,
  subject             text,
  first_message       text,
  contact_email       text,
  contact_discord     text,
  topic               text,
  created_at          timestamptz,
  updated_at          timestamptz,
  message_count       bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'list_tickets: authentication required';
  end if;

  return query
    select
      t.id, t.status, t.priority, t.channel, t.subject, t.first_message,
      c.email as contact_email, c.discord_username as contact_discord,
      t.topic,
      t.created_at, t.updated_at,
      (select count(*) from support_messages m where m.ticket_id = t.id) as message_count
    from support_tickets t
    join support_contacts c on c.id = t.contact_id
    where p_status is null or t.status = p_status
    order by
      case t.priority when 'p1' then 1 when 'p2' then 2 else 3 end,
      t.created_at desc;
end;
$$;

grant execute on function list_tickets(text) to authenticated;

-- ---- get_analytics — extend with topic_30d -----------------------------------
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
  v_topic_30d        jsonb;
  v_csat_up_7d       bigint;
  v_csat_down_7d     bigint;
  v_csat_total_7d    bigint;
  v_csat_score_pct   numeric;
begin
  if auth.uid() is null then
    raise exception 'get_analytics: authentication required';
  end if;

  select count(*) into v_open
    from support_tickets where status = 'open';
  select count(*) into v_in_progress
    from support_tickets where status = 'in_progress';
  select count(*) into v_stale
    from support_tickets
    where status in ('open', 'in_progress')
      and (case when status = 'open' then created_at else updated_at end)
          < v_now - interval '24 hours';
  select count(*) into v_resolved_7d
    from support_tickets
    where resolved_at is not null and resolved_at >= v_now - interval '7 days';
  select count(*) into v_opened_7d
    from support_tickets where created_at >= v_now - interval '7 days';

  with first_admin as (
    select t.id as ticket_id, t.created_at,
           min(m.created_at) as first_admin_at
      from support_tickets t
      join support_messages m on m.ticket_id = t.id and m.author = 'admin'
     where t.resolved_at is not null
       and t.resolved_at >= v_now - interval '7 days'
     group by t.id, t.created_at
  )
  select round(avg(extract(epoch from (first_admin_at - created_at)) / 60.0)::numeric, 1)
    into v_avg_resp_min from first_admin;

  with days as (
    select generate_series((v_now - interval '13 days')::date, v_now::date, interval '1 day')::date as day
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into v_opens_by_day
    from days d
    left join (
      select created_at::date as day, count(*)::int as n
        from support_tickets where created_at >= v_now - interval '14 days' group by 1
    ) c on c.day = d.day;

  with days as (
    select generate_series((v_now - interval '13 days')::date, v_now::date, interval '1 day')::date as day
  )
  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into v_resolves_by_day
    from days d
    left join (
      select resolved_at::date as day, count(*)::int as n
        from support_tickets where resolved_at is not null and resolved_at >= v_now - interval '14 days' group by 1
    ) c on c.day = d.day;

  select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) into v_channel_30d
    from (select channel, count(*)::int as n from support_tickets where created_at >= v_now - interval '30 days' group by channel) x;

  select coalesce(jsonb_object_agg(priority, n), '{}'::jsonb) into v_priority_30d
    from (select priority, count(*)::int as n from support_tickets where created_at >= v_now - interval '30 days' group by priority) x;

  -- topic_30d: { topic: n, ... } including 'untagged' bucket for nulls
  select coalesce(jsonb_object_agg(coalesce(topic, 'untagged'), n), '{}'::jsonb) into v_topic_30d
    from (
      select topic, count(*)::int as n
        from support_tickets
       where created_at >= v_now - interval '30 days'
       group by topic
    ) x;

  select count(*) filter (where rating = 'up'),
         count(*) filter (where rating = 'down'),
         count(*)
    into v_csat_up_7d, v_csat_down_7d, v_csat_total_7d
    from support_feedback where created_at >= v_now - interval '7 days';

  v_csat_score_pct := case
    when v_csat_total_7d = 0 then null
    else round((v_csat_up_7d::numeric / v_csat_total_7d::numeric) * 100, 0)
  end;

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
    'priority_30d',       v_priority_30d,
    'topic_30d',          v_topic_30d,
    'csat_7d', jsonb_build_object(
      'up', v_csat_up_7d, 'down', v_csat_down_7d,
      'count', v_csat_total_7d, 'score_pct', v_csat_score_pct
    )
  );
end;
$$;

grant execute on function get_analytics() to authenticated;

-- =============================================================================
-- End of SCHEMA-006
-- =============================================================================
