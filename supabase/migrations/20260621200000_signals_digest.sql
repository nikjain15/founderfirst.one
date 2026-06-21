-- =============================================================================
-- FounderFirst — Signals daily digest
-- =============================================================================
--
-- Once a day, email the admins a summary of new high-intent leads + competitor
-- mentions. pg_cron fires sig_trigger_digest(), which POSTs to the
-- listening-digest Edge Function (shared secret from Vault, like notify_publish
-- in 20260621100000_publish_notify.sql). The function reads sig_digest() and
-- sends via Resend.
--
-- One-time setup (same shape as notify-content-change):
--   1. supabase secrets set LISTENING_INTAKE_SECRET=…  (reused by the digest)
--   2. select vault.create_secret('<same secret>', 'listening_intake_secret');
--   3. supabase functions deploy listening-digest
--
-- Safe to re-run.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- -----------------------------------------------------------------------------
-- sig_digest — the data the email is built from. service_role only.
-- -----------------------------------------------------------------------------
create or replace function sig_digest(p_hours int default 24)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'since_hours', p_hours,
    'lead_count', (
      select count(*) from sig_leads l
      where l.created_at > now() - make_interval(hours => p_hours)
    ),
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         l.id,
        'stage',      l.stage,
        'platform',   i.platform,
        'author',     i.author_handle,
        'url',        i.external_url,
        'title',      coalesce(nullif(i.title, ''), left(i.body, 90)),
        'intent',     s.intent,
        'competitor', s.competitor
      ) order by s.intent desc nulls last)
      from sig_leads l
      join sig_items i on i.id = l.item_id
      left join sig_scores s on s.item_id = l.item_id
      where l.created_at > now() - make_interval(hours => p_hours)
    ), '[]'::jsonb),
    'competitors', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.competitor, 'count', t.c) order by t.c desc)
      from (
        select s.competitor, count(*) as c
        from sig_items i
        join sig_scores s on s.item_id = i.id
        where i.captured_at > now() - make_interval(hours => p_hours)
          and s.competitor is not null
        group by s.competitor
      ) t
    ), '[]'::jsonb)
  );
$$;

revoke execute on function sig_digest(int) from public;
grant  execute on function sig_digest(int) to service_role;

-- -----------------------------------------------------------------------------
-- sig_trigger_digest — pg_cron calls this; it POSTs to the Edge Function.
-- -----------------------------------------------------------------------------
create or replace function sig_trigger_digest()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  fn_url text := 'https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/listening-digest';
  secret text;
begin
  -- Shared secret from Vault. If unset, skip silently — a digest must never error.
  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'listening_intake_secret'
    limit 1;
  exception when others then
    secret := null;
  end;

  if secret is null then
    return;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'x-listening-secret', secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Schedule — daily at 13:00 UTC (~09:00 ET). Idempotent.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'signals-daily-digest') then
    perform cron.unschedule('signals-daily-digest');
  end if;
  perform cron.schedule('signals-daily-digest', '0 13 * * *', 'select sig_trigger_digest();');
end;
$$;
