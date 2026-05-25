-- =============================================================================
-- SCHEMA-007 — Add ticket_status to fetch_undelivered_admin_messages()
-- =============================================================================
--
-- The Discord bridge needs to know whether the admin reply resolved the
-- ticket (so it can send a CSAT prompt) vs left it in-progress (stay quiet).
-- Adds the column to the RPC's return shape. Same security model — only
-- service_role can call.
--
-- Safe to re-run.
-- =============================================================================

drop function if exists fetch_undelivered_admin_messages();

create or replace function fetch_undelivered_admin_messages()
returns table (
  message_id          uuid,
  ticket_id           uuid,
  channel             text,
  channel_thread_ref  text,
  body                text,
  ticket_subject      text,
  ticket_status       text
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
    t.subject as ticket_subject,
    t.status  as ticket_status
  from claimed c
  join support_tickets t on t.id = c.ticket_id;
$$;

revoke all on function fetch_undelivered_admin_messages() from public, anon, authenticated;
grant execute on function fetch_undelivered_admin_messages() to service_role;

-- =============================================================================
-- End of SCHEMA-007.
-- =============================================================================
