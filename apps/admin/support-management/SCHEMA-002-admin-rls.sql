-- =============================================================================
-- FounderFirst Support — Admin allowlist (migration 002)
-- =============================================================================
--
-- Tightens the ticket RPCs from "any authenticated user" to "specific admin
-- emails." Without this, anyone who can sign up with Supabase Auth could read
-- and reply to tickets.
--
-- Mechanism:
--   1. admin_users table — your allowlist. Add/remove rows here.
--   2. is_admin() — SECURITY DEFINER function that checks the current session's
--      email against the table.
--   3. list_tickets, get_ticket, reply_to_ticket — updated to call is_admin().
--
-- Adding more admins later:
--   insert into admin_users (email) values ('teammate@founderfirst.one');
--
-- Removing an admin:
--   delete from admin_users where email = 'someone@example.com';
--
-- Safe to re-run.
-- =============================================================================

-- ---- admin_users table ------------------------------------------------------
create table if not exists admin_users (
  id        uuid primary key default gen_random_uuid(),
  email     text unique not null,
  added_at  timestamptz not null default now(),
  added_by  text
);

create index if not exists idx_admin_users_email_lower
  on admin_users (lower(email));

-- RLS: locked. Manage via SQL only.
alter table admin_users enable row level security;
-- (No policies = no access via PostgREST. Service role + SQL editor work.)

-- ---- Seed first admin --------------------------------------------------------
-- Replace the value below with the actual admin email. This row is idempotent —
-- re-running the migration won't duplicate it.
insert into admin_users (email, added_by)
values ('nikjain1588@gmail.com', 'schema-002-bootstrap')
on conflict (email) do nothing;

-- ---- is_admin() --------------------------------------------------------------
-- Returns true iff the current session's email is in admin_users. Case-insensitive.
-- SECURITY DEFINER so RPCs can call this without granting select on admin_users.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where lower(email) = lower(coalesce(auth.email(), ''))
  );
$$;

grant execute on function is_admin() to authenticated;

-- ---- Updated RPCs ------------------------------------------------------------

-- list_tickets — now requires is_admin() instead of just any auth.
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
  if not is_admin() then
    raise exception 'list_tickets: admin access required';
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

-- get_ticket — same lock.
create or replace function get_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not is_admin() then
    raise exception 'get_ticket: admin access required';
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

-- reply_to_ticket — same lock.
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
  if not is_admin() then
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
$$;

grant execute on function reply_to_ticket(uuid, text, boolean) to authenticated;

-- =============================================================================
-- End of migration 002.
-- =============================================================================
