-- =============================================================================
-- FounderFirst — custom scheduled emails (no-code triggers)
-- =============================================================================
--
-- Admins can compose a brand-new email (copy + a free-form body) and schedule it
-- to recurring-send, all from Settings → Emails. A single hourly cron calls the
-- email-dispatch function, which finds due schedules and sends them through the
-- same sendEmail() path (so they're branded, logged, and open-tracked).
--
--   • email_templates gains is_custom + body (built-in templates build their body
--     in code; custom ones store an admin-authored body here).
--   • email_schedules — one row per scheduled custom email (frequency, hour, dow,
--     audience). The dispatcher reads it; the UI writes it.
--
-- Recipients may be the admins list OR an explicit address list (the From stays
-- the verified domain). Safe to re-run.
-- =============================================================================

-- ---- Extend email_templates for custom emails ------------------------------
alter table public.email_templates
  add column if not exists is_custom boolean not null default false,
  add column if not exists body      text    not null default '';

comment on column public.email_templates.is_custom is
  'True for admin-composed emails (have a body here). Built-in emails build their body in code.';

-- Admins may create / delete CUSTOM templates only (built-ins stay protected).
drop policy if exists "email_templates_insert_custom" on public.email_templates;
create policy "email_templates_insert_custom"
  on public.email_templates for insert to authenticated
  with check (public.is_admin() and is_custom = true);

drop policy if exists "email_templates_delete_custom" on public.email_templates;
create policy "email_templates_delete_custom"
  on public.email_templates for delete to authenticated
  using (public.is_admin() and is_custom = true);

-- ---- email_schedules -------------------------------------------------------
create table if not exists public.email_schedules (
  id            uuid primary key default gen_random_uuid(),
  email_key     text not null references public.email_templates(email_key) on delete cascade,
  frequency     text not null default 'weekly'
                  check (frequency in ('once', 'daily', 'weekly')),
  send_hour     int  not null default 13 check (send_hour between 0 and 23),  -- UTC
  send_dow      int  check (send_dow between 0 and 6),                        -- 0=Sun (weekly)
  run_at        timestamptz,                                                  -- for 'once'
  audience_kind text not null default 'admins' check (audience_kind in ('admins', 'list')),
  audience_list text[] not null default '{}',
  cta_href      text not null default '',
  enabled       boolean not null default true,
  last_run_at   timestamptz,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.email_schedules is
  'One scheduled custom email. The email-dispatch function (hourly cron) sends due rows.';

create index if not exists email_schedules_enabled_idx on public.email_schedules (enabled);

alter table public.email_schedules enable row level security;
drop policy if exists "email_schedules_admin_all" on public.email_schedules;
create policy "email_schedules_admin_all"
  on public.email_schedules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- Dispatcher trigger (hourly cron → email-dispatch function) ------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function email_dispatch_tick()
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  fn_url text := 'https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/email-dispatch';
  secret text;
begin
  begin
    select decrypted_secret into secret from vault.decrypted_secrets
    where name = 'listening_intake_secret' limit 1;
  exception when others then secret := null;
  end;
  if secret is null then return; end if;
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-listening-secret', secret),
    body    := '{}'::jsonb
  );
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'email-dispatch-hourly') then
    perform cron.unschedule('email-dispatch-hourly');
  end if;
  perform cron.schedule('email-dispatch-hourly', '0 * * * *', 'select email_dispatch_tick();');
end;
$$;
