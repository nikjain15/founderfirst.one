-- =============================================================================
-- FounderFirst — unify recurring-email timing under email_schedules
-- =============================================================================
--
-- Until now, timing lived in three places: hardcoded pg_cron jobs
-- (signals-daily-digest, changelog-weekly-digest), email_settings, and
-- email_schedules (custom emails only). The admin Scheduled tab read only the
-- last one, so the built-in recurring emails were invisible and their cadence
-- un-editable.
--
-- This migration makes email_schedules the single source of truth for the
-- timing of every recurring email. The hourly email-dispatch function becomes
-- the only timing driver; for built-in rows it *invokes* the specialised edge
-- function that assembles the content (so dynamic digests still work). Two
-- emails are event-driven (Penny's brain on publish, What's-new digest on
-- manual review) — they appear as toggle-only rows, no frequency.
--
-- Safe to re-run.
-- =============================================================================

-- ---- Classify schedules ----------------------------------------------------
alter table public.email_schedules
  add column if not exists is_builtin    boolean not null default false,
  add column if not exists kind          text    not null default 'schedule'
                                           check (kind in ('schedule', 'event')),
  add column if not exists dispatch      text    not null default 'generic'
                                           check (dispatch in ('generic', 'invoke', 'event')),
  add column if not exists invoke_fn     text,
  add column if not exists invoke_mode   text,
  add column if not exists trigger_label text;

comment on column public.email_schedules.is_builtin is
  'True for the four built-in emails (protected: no delete, content edited via Templates).';
comment on column public.email_schedules.kind is
  'schedule = time-based, frequency editable. event = trigger-driven, toggle only.';
comment on column public.email_schedules.dispatch is
  'How email-dispatch sends it: generic = render+send (custom); invoke = call invoke_fn; event = not time-dispatched.';
comment on column public.email_schedules.invoke_fn is
  'For dispatch=invoke: the edge function to POST (e.g. listening-digest, changelog-digest).';
comment on column public.email_schedules.invoke_mode is
  'Optional {mode} body for the invoked function (e.g. remind for the What''s-new nudge).';

-- One built-in row per email_key (idempotent seeding below).
create unique index if not exists email_schedules_builtin_key_idx
  on public.email_schedules (email_key) where is_builtin;

-- ---- Seed the four built-in rows -------------------------------------------
-- email_key references email_templates(email_key); those rows are already seeded
-- by 20260623160000_email_control.sql, so the FK is satisfied.
do $$
begin
  -- Signals digest — daily check, invokes listening-digest (intent/floor logic
  -- stays inside that function).
  if not exists (select 1 from public.email_schedules where email_key = 'signals_digest' and is_builtin) then
    insert into public.email_schedules
      (email_key, is_builtin, kind, dispatch, invoke_fn, frequency, send_hour, send_dow, audience_kind, enabled)
    values
      ('signals_digest', true, 'schedule', 'invoke', 'listening-digest', 'daily', 13, null, 'admins', true);
  end if;

  -- What's-new nudge — weekly Monday, invokes changelog-digest in 'remind' mode.
  if not exists (select 1 from public.email_schedules where email_key = 'changelog_nudge' and is_builtin) then
    insert into public.email_schedules
      (email_key, is_builtin, kind, dispatch, invoke_fn, invoke_mode, frequency, send_hour, send_dow, audience_kind, enabled)
    values
      ('changelog_nudge', true, 'schedule', 'invoke', 'changelog-digest', 'remind', 'weekly', 13, 1, 'admins', true);
  end if;

  -- What's-new digest — manual review & send (event, toggle only).
  if not exists (select 1 from public.email_schedules where email_key = 'changelog_digest' and is_builtin) then
    insert into public.email_schedules
      (email_key, is_builtin, kind, dispatch, trigger_label, audience_kind, enabled)
    values
      ('changelog_digest', true, 'event', 'event', 'Manual review & send', 'admins', true);
  end if;

  -- Penny's brain — fires on publish (event, toggle only).
  if not exists (select 1 from public.email_schedules where email_key = 'penny_brain' and is_builtin) then
    insert into public.email_schedules
      (email_key, is_builtin, kind, dispatch, trigger_label, audience_kind, enabled)
    values
      ('penny_brain', true, 'event', 'event', 'On publish', 'admins', true);
  end if;
end;
$$;

-- ---- Protect built-in rows from deletion -----------------------------------
-- The admin-all policy stays for reads/updates; deletes of built-ins are blocked
-- so the UI (and a stray client) can't orphan a recurring email.
drop policy if exists "email_schedules_admin_all" on public.email_schedules;

create policy "email_schedules_admin_read"
  on public.email_schedules for select to authenticated
  using (public.is_admin());
create policy "email_schedules_admin_insert"
  on public.email_schedules for insert to authenticated
  with check (public.is_admin());
create policy "email_schedules_admin_update"
  on public.email_schedules for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "email_schedules_admin_delete"
  on public.email_schedules for delete to authenticated
  using (public.is_admin() and is_builtin = false);

-- ---- Retire the now-duplicate timing crons ---------------------------------
-- Timing for signals_digest and changelog_nudge now comes from email_schedules
-- rows dispatched by email-dispatch-hourly. The standalone trigger functions
-- (sig_trigger_digest, changelog_trigger_digest) remain callable for ad-hoc use.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'signals-daily-digest') then
    perform cron.unschedule('signals-daily-digest');
  end if;
  if exists (select 1 from cron.job where jobname = 'changelog-weekly-digest') then
    perform cron.unschedule('changelog-weekly-digest');
  end if;
end;
$$;
