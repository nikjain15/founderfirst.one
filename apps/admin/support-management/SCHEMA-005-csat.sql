-- =============================================================================
-- SCHEMA-005 — CSAT (customer satisfaction)
-- =============================================================================
--
-- Adds a support_feedback table + two RPCs (submit_feedback for the bot /
-- web widget, list_recent_feedback for the admin UI), and extends
-- get_analytics() to include a CSAT block.
--
-- Two sources of feedback are tracked separately:
--   - 'bot_resolved'   — Penny answered alone, user thumbs-up/down'd the answer
--   - 'admin_resolved' — admin replied via the inbox, user thumbs-up/down'd that
--
-- For bot-resolved conversations there usually IS no ticket row, so we
-- reference the conversation by (channel, conversation_ref) instead — same
-- ref format as channel_thread_ref on support_tickets (Discord thread id or
-- web session id). For admin-resolved we also store the ticket_id so the
-- inline UI on /admin/support/:ticketId can find the feedback fast.
--
-- Dedupe: a unique partial index per (source, ticket_id) and per
-- (source, channel, conversation_ref) prevents duplicate ratings from the
-- same conversation. Re-submitting updates the existing row.
--
-- Safe to re-run.
-- =============================================================================

-- ---- Table -------------------------------------------------------------------

create table if not exists support_feedback (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null check (source in ('bot_resolved', 'admin_resolved')),

  -- One of (ticket_id) or (channel + conversation_ref) must be present.
  ticket_id           uuid references support_tickets(id) on delete cascade,
  channel             text check (channel in ('discord', 'web')),
  conversation_ref    text,

  rating              text not null check (rating in ('up', 'down')),
  comment             text,

  contact_id          uuid references support_contacts(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint support_feedback_has_target
    check (ticket_id is not null or (channel is not null and conversation_ref is not null))
);

-- Dedupe one rating per (source, ticket) and per (source, channel+ref).
create unique index if not exists idx_support_feedback_ticket_source
  on support_feedback (ticket_id, source)
  where ticket_id is not null;

create unique index if not exists idx_support_feedback_conv_source
  on support_feedback (channel, conversation_ref, source)
  where ticket_id is null and conversation_ref is not null;

create index if not exists idx_support_feedback_created
  on support_feedback (created_at desc);

alter table support_feedback enable row level security;
-- No policies = RPC-only access.

-- ---- submit_feedback ---------------------------------------------------------
-- Called by Dify (bot-resolved) or the Discord bridge / web widget after the
-- admin's reply is delivered (admin-resolved). Anon-callable; the rate
-- limiting comes from the unique indexes above plus the bounded shape of
-- the input.
create or replace function submit_feedback(
  p_source            text,
  p_ticket_id         uuid default null,
  p_channel           text default null,
  p_conversation_ref  text default null,
  p_rating            text default null,
  p_comment           text default null,
  p_contact_email     text default null,
  p_discord_user_id   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_id         uuid;
begin
  if p_rating not in ('up', 'down') then
    raise exception 'submit_feedback: rating must be up or down';
  end if;
  if p_source not in ('bot_resolved', 'admin_resolved') then
    raise exception 'submit_feedback: invalid source';
  end if;
  if p_ticket_id is null and (p_channel is null or p_conversation_ref is null) then
    raise exception 'submit_feedback: need ticket_id OR (channel + conversation_ref)';
  end if;

  -- Best-effort contact lookup so the score can be attributed.
  if p_contact_email is not null then
    select id into v_contact_id
      from support_contacts
      where lower(email) = lower(p_contact_email)
      limit 1;
  end if;
  if v_contact_id is null and p_discord_user_id is not null then
    select id into v_contact_id
      from support_contacts
      where discord_user_id = p_discord_user_id
      limit 1;
  end if;

  -- Upsert. Use ticket_id when present, else (channel, conversation_ref).
  if p_ticket_id is not null then
    insert into support_feedback (
      source, ticket_id, channel, conversation_ref,
      rating, comment, contact_id
    )
    values (
      p_source, p_ticket_id, p_channel, p_conversation_ref,
      p_rating, p_comment, v_contact_id
    )
    on conflict (ticket_id, source)
    where ticket_id is not null
    do update set
      rating = excluded.rating,
      comment = excluded.comment,
      contact_id = coalesce(excluded.contact_id, support_feedback.contact_id),
      updated_at = now()
    returning id into v_id;
  else
    insert into support_feedback (
      source, channel, conversation_ref,
      rating, comment, contact_id
    )
    values (
      p_source, p_channel, p_conversation_ref,
      p_rating, p_comment, v_contact_id
    )
    on conflict (channel, conversation_ref, source)
    where ticket_id is null and conversation_ref is not null
    do update set
      rating = excluded.rating,
      comment = excluded.comment,
      contact_id = coalesce(excluded.contact_id, support_feedback.contact_id),
      updated_at = now()
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function submit_feedback(text, uuid, text, text, text, text, text, text)
  to anon, authenticated;

-- ---- list_recent_feedback ----------------------------------------------------
-- Admin UI only. Recent ratings with comments, newest first.
create or replace function list_recent_feedback(p_limit int default 20)
returns table (
  id                uuid,
  source            text,
  rating            text,
  comment           text,
  channel           text,
  ticket_id         uuid,
  ticket_subject    text,
  created_at        timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'list_recent_feedback: authentication required';
  end if;

  return query
    select
      f.id,
      f.source,
      f.rating,
      f.comment,
      coalesce(f.channel, t.channel) as channel,
      f.ticket_id,
      t.subject as ticket_subject,
      f.created_at
    from support_feedback f
    left join support_tickets t on t.id = f.ticket_id
    order by f.created_at desc
    limit greatest(1, least(p_limit, 100));
end;
$$;

grant execute on function list_recent_feedback(int) to authenticated;

-- ---- get_feedback_for_ticket -------------------------------------------------
-- Used by TicketDetail to show inline whether the user rated this ticket.
create or replace function get_feedback_for_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  if auth.uid() is null then
    raise exception 'get_feedback_for_ticket: authentication required';
  end if;

  select to_jsonb(f.*) into v_row
    from support_feedback f
    where f.ticket_id = p_ticket_id
    order by f.created_at desc
    limit 1;

  return v_row;
end;
$$;

grant execute on function get_feedback_for_ticket(uuid) to authenticated;

-- ---- get_analytics — extend with CSAT block ----------------------------------
-- Wraps the existing function with a CSAT block. The previous function is
-- replaced wholesale to keep the implementation single-source.

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
    where resolved_at is not null
      and resolved_at >= v_now - interval '7 days';

  select count(*) into v_opened_7d
    from support_tickets
    where created_at >= v_now - interval '7 days';

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

  select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) into v_channel_30d
    from (select channel, count(*)::int as n from support_tickets where created_at >= v_now - interval '30 days' group by channel) x;

  select coalesce(jsonb_object_agg(priority, n), '{}'::jsonb) into v_priority_30d
    from (select priority, count(*)::int as n from support_tickets where created_at >= v_now - interval '30 days' group by priority) x;

  -- CSAT — last 7 days
  select
    count(*) filter (where rating = 'up'),
    count(*) filter (where rating = 'down'),
    count(*)
    into v_csat_up_7d, v_csat_down_7d, v_csat_total_7d
    from support_feedback
    where created_at >= v_now - interval '7 days';

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
    'csat_7d', jsonb_build_object(
      'up',        v_csat_up_7d,
      'down',      v_csat_down_7d,
      'count',     v_csat_total_7d,
      'score_pct', v_csat_score_pct
    )
  );
end;
$$;

grant execute on function get_analytics() to authenticated;

-- =============================================================================
-- End of SCHEMA-005
-- =============================================================================
