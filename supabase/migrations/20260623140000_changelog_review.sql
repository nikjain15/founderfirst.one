-- =============================================================================
-- FounderFirst — changelog digest: review-then-send
-- =============================================================================
--
-- Changes the weekly behaviour from "auto-send the digest" to:
--   • Mondays, pg_cron asks the Edge Function (mode=remind) to email admins a
--     short nudge — "this week's digest is ready to review and send".
--   • The full digest only goes out when an admin clicks "Send" in the admin
--     (mode=send, authenticated by their JWT). Nothing is sent without that.
--
-- Also adds changelog_sends — one row per actual digest send, so the admin can
-- see when it last went out (and avoid double-sends).
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- changelog_sends — audit of actual digest sends. Written by the Edge Function
-- (service role); admins can read it to show "last sent".
-- -----------------------------------------------------------------------------
create table if not exists public.changelog_sends (
  id           uuid primary key default gen_random_uuid(),
  sent_at      timestamptz not null default now(),
  sent_by      text,
  entry_count  int not null default 0,
  recipients   int not null default 0
);

alter table public.changelog_sends enable row level security;

drop policy if exists "changelog_sends_select_admin" on public.changelog_sends;
create policy "changelog_sends_select_admin"
  on public.changelog_sends for select
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- changelog_trigger_digest — now asks for a REMINDER, not a send.
-- (The cron job created in 20260623120000_changelog.sql still calls this
-- function by name, so no reschedule is needed — only the body changes.)
-- -----------------------------------------------------------------------------
create or replace function changelog_trigger_digest()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  fn_url text := 'https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/changelog-digest';
  secret text;
begin
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
    body    := jsonb_build_object('mode', 'remind')
  );
end;
$$;
