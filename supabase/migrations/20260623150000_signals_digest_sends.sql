-- =============================================================================
-- FounderFirst — Signals digest send-log (smarter cadence)
-- =============================================================================
--
-- The daily cron still fires sig_trigger_digest() every day at 13:00 UTC, but the
-- listening-digest function now decides whether a send is *worth* an admin's inbox:
--   • send when a fresh lead clears the intent threshold, OR
--   • send on a weekly floor (≥7 days since the last send) so nothing rots.
--
-- To do that without losing sub-threshold leads, the function anchors its lookback
-- window to the last actual send recorded here, rather than a fixed 24h. Leads
-- accumulate across quiet days and all appear in the next real send.
--
-- This migration only adds the send-log table + a helper to read the last send.
-- The cron schedule (20260622110000_signals_digest.sql) is unchanged.
--
-- Safe to re-run.
-- =============================================================================

create table if not exists sig_digest_sends (
  id          uuid primary key default gen_random_uuid(),
  sent_at     timestamptz not null default now(),
  lead_count  int not null default 0,
  reason      text                       -- 'hot_lead' | 'weekly_floor'
);

comment on table sig_digest_sends is
  'One row per Signals digest email actually sent. Anchors the rolling lookback window so the digest can skip low-intent days without dropping leads.';

-- Hours since the last digest send, capped so a never-sent / long-quiet account
-- still gets a sane window. Returns 24 when nothing has ever been sent.
create or replace function sig_digest_window_hours(p_cap int default 168)
returns int
language sql
security definer
set search_path = public
as $$
  select least(
    p_cap,
    coalesce(
      ceil(extract(epoch from (now() - max(sent_at))) / 3600.0)::int,
      24
    )
  )
  from sig_digest_sends;
$$;

revoke execute on function sig_digest_window_hours(int) from public;
grant  execute on function sig_digest_window_hours(int) to service_role;

revoke all on sig_digest_sends from anon, authenticated;
grant  all on sig_digest_sends to service_role;
