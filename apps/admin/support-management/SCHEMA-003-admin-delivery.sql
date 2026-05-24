-- =============================================================================
-- FounderFirst Support — Admin reply delivery tracking (migration 003)
-- =============================================================================
--
-- Adds the plumbing the Discord bridge needs to pick up admin replies and
-- post them back to the originating channel.
--
--   delivered_to_channel_at  — when (if ever) we pushed the admin's reply
--                              to the user's originating channel
--   fetch_undelivered_admin_messages()
--                            — atomic SELECT + UPDATE: bridge polls this,
--                              gets pending rows, they're marked delivered
--
-- The RPC uses service_role only — the bridge has the service-role key,
-- the browser admin app does not.
--
-- Safe to re-run.
-- =============================================================================

-- ---- delivered_to_channel_at column -----------------------------------------
alter table support_messages
  add column if not exists delivered_to_channel_at timestamptz;

-- Partial index — most rows are NOT admin or already delivered, so the index
-- only contains the small set of work-to-do rows. Fast even at scale.
create index if not exists idx_support_messages_admin_pending
  on support_messages (created_at)
  where author = 'admin' and delivered_to_channel_at is null;

-- ---- fetch_undelivered_admin_messages() -------------------------------------
-- Returns up to 50 pending admin messages with ticket context, and atomically
-- marks them as delivered. The bridge calls this from a poll loop. If the
-- bridge crashes between fetch and Discord post, those messages are lost
-- (at-most-once delivery) — acceptable for v1; we'll add a separate confirm
-- step if we ever care about exactly-once.
create or replace function fetch_undelivered_admin_messages()
returns table (
  message_id          uuid,
  ticket_id           uuid,
  channel             text,
  channel_thread_ref  text,
  body                text,
  ticket_subject      text
)
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update support_messages
    set delivered_to_channel_at = now()
    where id in (
      select id from support_messages
      where author = 'admin' and delivered_to_channel_at is null
      order by created_at
      limit 50
      for update skip locked
    )
    returning id as message_id, ticket_id, body
  )
  select
    c.message_id,
    c.ticket_id,
    t.channel,
    t.channel_thread_ref,
    c.body,
    t.subject as ticket_subject
  from claimed c
  join support_tickets t on t.id = c.ticket_id;
$$;

-- Only the bridge (service_role) can call this. Browser admin app never needs it.
revoke all on function fetch_undelivered_admin_messages() from public, anon, authenticated;
grant execute on function fetch_undelivered_admin_messages() to service_role;

-- =============================================================================
-- End of migration 003.
-- =============================================================================
