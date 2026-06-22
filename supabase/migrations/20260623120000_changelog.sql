-- =============================================================================
-- FounderFirst — "What's new" changelog + weekly admin digest
-- =============================================================================
--
-- An internal changelog so every admin sees what shipped. Entries are authored
-- in-app (apps/admin → How it works → What's new) and surfaced there. Once a
-- week, pg_cron fires changelog_trigger_digest(), which POSTs to the
-- changelog-digest Edge Function (shared secret from Vault — the SAME secret
-- already used by listening-digest, so no new secret to provision). The
-- function reads changelog_digest() and sends one Resend email to every admin
-- with a link back to the What's-new section.
--
-- One-time setup (the secret + Resend keys are already set if listening-digest
-- works; you only need to deploy the new function):
--   1. supabase functions deploy changelog-digest
--   2. (only if not already done for listening-digest)
--      supabase secrets set LISTENING_INTAKE_SECRET=…
--      select vault.create_secret('<same secret>', 'listening_intake_secret');
--
-- Safe to re-run.
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- -----------------------------------------------------------------------------
-- changelog_entries — one row per shipped change. Admin-only, read + write.
-- -----------------------------------------------------------------------------
create table if not exists public.changelog_entries (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'new'
                check (kind in ('new', 'improved', 'fixed')),
  title       text not null,
  body        text not null default '',
  created_at  timestamptz not null default now(),
  created_by  text default auth.email()
);

create index if not exists changelog_entries_created_at_idx
  on public.changelog_entries (created_at desc);

alter table public.changelog_entries enable row level security;

-- Any admin may read the changelog.
drop policy if exists "changelog_select_admin" on public.changelog_entries;
create policy "changelog_select_admin"
  on public.changelog_entries for select
  to authenticated
  using (public.is_admin());

-- Any admin may add an entry.
drop policy if exists "changelog_insert_admin" on public.changelog_entries;
create policy "changelog_insert_admin"
  on public.changelog_entries for insert
  to authenticated
  with check (public.is_admin());

-- Any admin may remove an entry (small, trusted group; writes are audited in-app).
drop policy if exists "changelog_delete_admin" on public.changelog_entries;
create policy "changelog_delete_admin"
  on public.changelog_entries for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- changelog_digest — the data the weekly email is built from. service_role only.
-- -----------------------------------------------------------------------------
create or replace function changelog_digest(p_days int default 7)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'since_days', p_days,
    'count', (
      select count(*) from changelog_entries
      where created_at > now() - make_interval(days => p_days)
    ),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',         e.id,
        'kind',       e.kind,
        'title',      e.title,
        'body',       e.body,
        'created_at', e.created_at,
        'created_by', e.created_by
      ) order by e.created_at desc)
      from changelog_entries e
      where e.created_at > now() - make_interval(days => p_days)
    ), '[]'::jsonb)
  );
$$;

revoke execute on function changelog_digest(int) from public;
grant  execute on function changelog_digest(int) to service_role;

-- -----------------------------------------------------------------------------
-- changelog_trigger_digest — pg_cron calls this; it POSTs to the Edge Function.
-- Mirrors sig_trigger_digest(); reuses the same Vault secret.
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
-- Schedule — weekly, Mondays at 13:00 UTC (~09:00 ET). Idempotent.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'changelog-weekly-digest') then
    perform cron.unschedule('changelog-weekly-digest');
  end if;
  perform cron.schedule('changelog-weekly-digest', '0 13 * * 1', 'select changelog_trigger_digest();');
end;
$$;
