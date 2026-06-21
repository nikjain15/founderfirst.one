-- =============================================================================
-- FounderFirst Admin — publish notification trigger (migration 014)
-- =============================================================================
--
-- When an admin flips is_live = true on penny_voice or penny_prompts, fire a
-- POST to the notify-content-change Edge Function. The function reads the
-- admins table, excludes the author, and sends a Resend email to everyone
-- else.
--
-- Uses pg_net for async HTTP and Supabase Vault for the shared secret. The
-- function URL is public (anyone can call it), but a wrong / missing
-- x-notify-secret header makes the function reject the call, so blast
-- emails can't be triggered from outside.
--
-- One-time setup (already done if you're applying this from CI):
--   1. supabase secrets set RESEND_API_KEY=…  NOTIFY_WEBHOOK_SECRET=…
--      NOTIFY_FROM=…  ADMIN_URL=…
--   2. In SQL editor:
--      select vault.create_secret('<same secret>', 'notify_webhook_secret');
--   3. supabase functions deploy notify-content-change
-- =============================================================================

create extension if not exists pg_net;

create or replace function notify_publish()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  kind_text  text;
  author     text;
  fn_url     text := 'https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/notify-content-change';
  secret     text;
begin
  -- Fire only on the transition into live.
  if not (new.is_live = true and (old.is_live is distinct from true)) then
    return new;
  end if;

  -- Pull the shared secret from Vault. If it isn't set yet, skip silently —
  -- a notification bug must never block a publish.
  begin
    select decrypted_secret into secret
    from vault.decrypted_secrets
    where name = 'notify_webhook_secret'
    limit 1;
  exception when others then
    secret := null;
  end;

  if secret is null then
    return new;
  end if;

  kind_text := case tg_table_name when 'penny_voice' then 'voice' else 'prompt' end;
  author    := (select email from auth.users where id = new.created_by);

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-notify-secret', secret
    ),
    body    := jsonb_build_object(
      'kind',         kind_text,
      'version',      new.version,
      'author_email', author,
      'notes',        new.notes
    )
  );

  return new;
end;
$$;

drop trigger if exists penny_voice_notify_publish on penny_voice;
create trigger penny_voice_notify_publish
  after update of is_live on penny_voice
  for each row execute function notify_publish();

drop trigger if exists penny_prompts_notify_publish on penny_prompts;
create trigger penny_prompts_notify_publish
  after update of is_live on penny_prompts
  for each row execute function notify_publish();

-- =============================================================================
-- End of migration 014.
-- =============================================================================
