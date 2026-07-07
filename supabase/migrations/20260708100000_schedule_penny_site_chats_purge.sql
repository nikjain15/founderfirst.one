-- Weekly audit (2026-07-06, #301) P1: penny_site_chats_purge() exists
-- (20260620153619_remote_commit.sql) but was never cron.schedule'd, so the
-- README-advertised 90-day chat/lead retention never actually ran — visitor
-- chat transcripts + captured email/phone accumulated indefinitely.
--
create extension if not exists pg_cron;

-- Schedule — daily at 03:00 UTC (off-peak, staggered from the other digests).
-- Idempotent re-schedule, same guard as changelog/signals/geo/fx-rates.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'penny-site-chats-purge') then
    perform cron.unschedule('penny-site-chats-purge');
  end if;
  perform cron.schedule('penny-site-chats-purge', '0 3 * * *', 'select public.penny_site_chats_purge();');
end;
$$;
