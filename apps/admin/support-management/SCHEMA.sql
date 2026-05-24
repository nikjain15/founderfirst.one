-- =============================================================================
-- FounderFirst Support — Database schema
-- =============================================================================
--
-- Three tables: contacts, tickets, messages. All access goes through
-- SECURITY DEFINER RPCs — same pattern as `signup_to_waitlist` in the
-- marketing app. The anon key has no direct table access; RLS denies
-- everything except via RPC.
--
-- Surfaces that call these RPCs:
--   - Dify (server-side, on escalation) — uses anon key, calls create_ticket
--     and append_message. Bot writes are unauthenticated, but bounded by the
--     RPC contract (no free-form SQL).
--   - Admin UI (browser, future) — uses anon key + Supabase Auth (magic link).
--     Calls list_tickets, get_ticket, reply_to_ticket. These RPCs require an
--     authenticated session (auth.uid() must be present).
--
-- Run this entire file in the Supabase SQL editor against the existing
-- FounderFirst project (the one with the waitlist tables already in it).
-- Safe to re-run — uses IF NOT EXISTS / CREATE OR REPLACE.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- A contact is a person who reached out. One per email + channel identity.
-- Same human across channels (Discord + web) = two contact rows for now;
-- merging is a later problem when we actually need it.
create table if not exists support_contacts (
  id                uuid primary key default gen_random_uuid(),
  email             text,
  discord_user_id   text,
  discord_username  text,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  -- At least one identifying field must be present.
  constraint support_contacts_has_identity
    check (email is not null or discord_user_id is not null)
);

create index if not exists idx_support_contacts_email
  on support_contacts (lower(email)) where email is not null;
create index if not exists idx_support_contacts_discord
  on support_contacts (discord_user_id) where discord_user_id is not null;

-- A ticket is a single conversation that needs a human. Created by the bot
-- when it escalates; resolved when the admin replies (or closes).
create table if not exists support_tickets (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid not null references support_contacts(id) on delete cascade,

  -- Where the user came from + how to route the reply back.
  channel             text not null check (channel in ('discord', 'web')),
  channel_thread_ref  text not null,  -- Discord thread id, or web session id

  -- Triage.
  status              text not null default 'open'
                      check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority            text not null default 'p2'
                      check (priority in ('p1', 'p2', 'p3')),

  -- Content.
  subject             text not null,
  first_message       text not null,

  -- Lifecycle.
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  resolved_at         timestamptz,

  -- Bot context — what the bot saw before deciding to escalate.
  bot_confidence      text,           -- 'low' | 'unknown' | etc.
  bot_reason          text            -- short string from the workflow
);

create index if not exists idx_support_tickets_status
  on support_tickets (status, created_at desc);
create index if not exists idx_support_tickets_contact
  on support_tickets (contact_id);
create index if not exists idx_support_tickets_channel_ref
  on support_tickets (channel, channel_thread_ref);

-- A message is one utterance on a ticket — user, bot, or admin.
create table if not exists support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references support_tickets(id) on delete cascade,
  author      text not null check (author in ('user', 'bot', 'admin')),
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_support_messages_ticket
  on support_messages (ticket_id, created_at);

-- -----------------------------------------------------------------------------
-- RLS — deny everything by default; access is via SECURITY DEFINER RPCs.
-- -----------------------------------------------------------------------------
alter table support_contacts enable row level security;
alter table support_tickets  enable row level security;
alter table support_messages enable row level security;

-- No policies = no access. That's the intent — RPCs run as the function owner
-- and bypass RLS.

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- ---- create_ticket -----------------------------------------------------------
-- Called by Dify when the bot escalates. Upserts the contact, creates the
-- ticket, inserts the first user message AND the bot's confirmation message.
-- Returns the new ticket id.
--
-- This is the only RPC Dify needs. Anon key may call this — there is no auth
-- check, because the bot is acting as an unauthenticated system. The RPC is
-- narrow enough that abuse risk is bounded (you can flood tickets, but you
-- can't read or modify others' data).
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
  p_bot_reason         text default null
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
  -- Lookup or create the contact. Email match wins if present; otherwise
  -- Discord user id.
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
    -- Refresh last_seen and fill any newly-known fields.
    update support_contacts
      set last_seen_at     = now(),
          email            = coalesce(email, p_email),
          discord_user_id  = coalesce(discord_user_id, p_discord_user_id),
          discord_username = coalesce(discord_username, p_discord_username)
      where id = v_contact_id;
  end if;

  -- Create the ticket.
  insert into support_tickets (
    contact_id, channel, channel_thread_ref,
    priority, subject, first_message,
    bot_confidence, bot_reason
  )
  values (
    v_contact_id, p_channel, p_channel_thread_ref,
    coalesce(p_priority, 'p2'), p_subject, p_first_message,
    p_bot_confidence, p_bot_reason
  )
  returning id into v_ticket_id;

  -- Seed the two opening messages.
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
  text, text, text, text, text, text, text, text, text, text, text
) to anon, authenticated;

-- ---- append_message ----------------------------------------------------------
-- Called by Dify when the user sends a follow-up after a ticket is open
-- but before an admin replies. The bot can also use this to log its own
-- holding response.
create or replace function append_message(
  p_ticket_id  uuid,
  p_author     text,
  p_body       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
begin
  if p_author not in ('user', 'bot') then
    raise exception 'append_message: author must be user or bot (admin uses reply_to_ticket)';
  end if;

  insert into support_messages (ticket_id, author, body)
    values (p_ticket_id, p_author, p_body)
    returning id into v_message_id;

  update support_tickets
    set updated_at = now()
    where id = p_ticket_id;

  return v_message_id;
end;
$$;

grant execute on function append_message(uuid, text, text) to anon, authenticated;

-- ---- list_tickets ------------------------------------------------------------
-- Admin UI only. Requires an authenticated session.
-- Returns tickets matching the status filter (or all if null), newest first.
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
      t.id,
      t.status,
      t.priority,
      t.channel,
      t.subject,
      t.first_message,
      c.email                 as contact_email,
      c.discord_username      as contact_discord,
      t.created_at,
      t.updated_at,
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

-- ---- get_ticket --------------------------------------------------------------
-- Admin UI only. Returns a single ticket with its full message history.
create or replace function get_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'get_ticket: authentication required';
  end if;

  select jsonb_build_object(
    'ticket',   to_jsonb(t.*) - 'contact_id'
                  || jsonb_build_object(
                       'contact_email',    c.email,
                       'contact_discord',  c.discord_username
                     ),
    'messages', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', m.id,
                'author', m.author,
                'body', m.body,
                'created_at', m.created_at
              ) order by m.created_at)
       from support_messages m
       where m.ticket_id = t.id),
      '[]'::jsonb
    )
  )
  into v_result
  from support_tickets t
  join support_contacts c on c.id = t.contact_id
  where t.id = p_ticket_id;

  if v_result is null then
    raise exception 'get_ticket: ticket not found';
  end if;

  return v_result;
end;
$$;

grant execute on function get_ticket(uuid) to authenticated;

-- ---- reply_to_ticket ---------------------------------------------------------
-- Admin UI only. Records the admin's reply, marks the ticket as resolved
-- (or in_progress if explicitly kept open).
create or replace function reply_to_ticket(
  p_ticket_id   uuid,
  p_body        text,
  p_resolve     boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
begin
  if auth.uid() is null then
    raise exception 'reply_to_ticket: authentication required';
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
$$;

grant execute on function reply_to_ticket(uuid, text, boolean) to authenticated;

-- =============================================================================
-- End of schema.
-- =============================================================================
