-- =============================================================================
-- FounderFirst — admin-editable email control + unified send tracking
-- =============================================================================
--
-- Moves the *data* an email pours into the shell out of code and into tables an
-- admin can edit (brand colors + per-email copy), and adds one unified log of
-- every send plus Resend delivery/open/click events. The SHELL markup stays in
-- code (_shared/email.ts) — only safe data is editable.
--
--   email_brand     — single row: colors + sender name + accent (mirrors BRAND)
--   email_templates — one row per email: subject/preheader/eyebrow/heading/intro/
--                     cta_label/footer, with {placeholder} tokens for dynamics
--   email_settings  — single row: Signals cadence knobs (was env/constant)
--   email_log       — one row per send (type, subject, count, trigger, status…)
--   email_events    — Resend webhook events (delivered/opened/clicked…) → rates
--
-- Edge functions read the config rows with the service role (bypasses RLS) and
-- fall back to code defaults if a row/field is missing, so a bad/empty config
-- can never brick a send. Seeds reproduce TODAY's exact copy, so cutover is a
-- no-op until an admin edits something.
--
-- Safe to re-run (idempotent: tables if-not-exists, seeds on-conflict-do-nothing).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- email_brand — single-row brand config. Mirrors packages/design-system tokens.
-- -----------------------------------------------------------------------------
create table if not exists public.email_brand (
  id          boolean primary key default true check (id),  -- singleton guard
  sender_name text not null default 'FounderFirst',
  ink         text not null default '#0a0a0a',
  ink2        text not null default '#2a2a2a',
  ink3        text not null default '#5a5a5a',
  ink4        text not null default '#8a8a8a',
  line        text not null default '#e8e8e5',
  paper       text not null default '#f6f6f4',
  white       text not null default '#ffffff',
  income      text not null default '#1A9E6A',
  amber       text not null default '#C97D1A',
  error       text not null default '#b2291e',
  updated_by  text,
  updated_at  timestamptz not null default now()
);
comment on table public.email_brand is
  'Single-row brand config for transactional emails. Edge functions read it and fall back to code BRAND if absent.';

insert into public.email_brand (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- email_templates — per-email copy. {placeholder} tokens filled at send time.
-- -----------------------------------------------------------------------------
create table if not exists public.email_templates (
  email_key   text primary key,
  label       text not null,              -- human name for the editor
  eyebrow     text not null default '',
  subject     text not null default '',
  preheader   text not null default '',
  heading     text not null default '',
  intro       text not null default '',
  cta_label   text not null default '',
  footer      text not null default '',
  updated_by  text,
  updated_at  timestamptz not null default now()
);
comment on table public.email_templates is
  'Per-email copy (subject/preheader/heading/intro/cta/footer) with {placeholder} tokens. The shell markup stays in code; only this text is admin-editable.';

-- Seed defaults = today's exact copy. {n}/{leadword}/{topIntent}/{topShipped}/
-- {thingword}/{count}/{updateword}/{kindLabel}/{version}/{author} are filled by
-- the sending function. on-conflict-do-nothing preserves later admin edits.
insert into public.email_templates (email_key, label, eyebrow, subject, preheader, heading, intro, cta_label, footer) values
  ('signals_digest', 'Signals daily digest',
   'FounderFirst · Signals',
   '{n} new {leadword} · top intent {topIntent}',
   'The hottest scores {topIntent}/100 — reach out before it cools.',
   '{n} new {leadword}, highest-intent first.',
   'Scored and sorted. Skim the top one, approve a draft, and reach out while it''s warm.',
   'Open Signals',
   'You''re getting this because you''re a FounderFirst admin. It only sends when there''s a lead worth your time.'),
  ('changelog_digest', 'What''s new — weekly digest',
   'FounderFirst · What''s new',
   '{n} {thingword} shipped this week',
   'Starting with: {topShipped}.',
   '{n} {thingword} shipped this week.',
   'New, Improved, and Fixed — newest first. The short version of where Penny got better.',
   'See what shipped',
   'You''re getting this because you''re a FounderFirst admin. It goes out weekly, only when an admin sends it.'),
  ('changelog_nudge', 'What''s new — review nudge',
   'FounderFirst · What''s new',
   '{count} {updateword} ready to send',
   '{count} {updateword} to review before they reach the team.',
   'This week''s digest is ready for you.',
   '<strong>{count}</strong> {thingword} shipped this week. Give it a read, then send it to the team when it looks right.',
   'Review & send',
   'You''re getting this because you can send the weekly digest. It''s a nudge, not the digest itself.'),
  ('penny_brain', 'Penny''s brain updated',
   'Penny''s brain',
   '{kindLabel} v{version} is live',
   '{author} just changed how Penny replies — site, support, in-product.',
   '{kindLabel} v{version} is live on every surface.',
   '',
   'Review the change',
   'You''re getting this because you''re a FounderFirst admin. If you published this yourself, you won''t see this email.')
on conflict (email_key) do nothing;

-- -----------------------------------------------------------------------------
-- email_settings — single-row operational knobs (Signals cadence).
-- -----------------------------------------------------------------------------
create table if not exists public.email_settings (
  id                 boolean primary key default true check (id),
  signals_intent_min int not null default 70,
  signals_floor_days int not null default 7,
  updated_by         text,
  updated_at         timestamptz not null default now()
);
comment on table public.email_settings is
  'Single-row email operational settings. signals_intent_min/floor_days drive the listening-digest cadence (was an env var).';

insert into public.email_settings (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- email_log — one row per send attempt. Written by _shared/send.ts sendEmail().
-- -----------------------------------------------------------------------------
create table if not exists public.email_log (
  id              uuid primary key default gen_random_uuid(),
  email_key       text not null,
  subject         text not null default '',
  recipient_count int not null default 0,
  trigger         text not null default 'cron'
                    check (trigger in ('cron', 'admin', 'db_trigger', 'test')),
  status          text not null default 'sent'
                    check (status in ('sent', 'failed', 'skipped')),
  resend_id       text,
  error           text,
  created_at      timestamptz not null default now()
);
comment on table public.email_log is
  'One row per email send attempt across all functions. resend_id links to email_events for open/click rates.';

create index if not exists email_log_created_at_idx on public.email_log (created_at desc);
create index if not exists email_log_key_idx        on public.email_log (email_key, created_at desc);
create index if not exists email_log_resend_idx      on public.email_log (resend_id);

-- -----------------------------------------------------------------------------
-- email_events — Resend webhook events (delivered/opened/clicked/bounced…).
-- -----------------------------------------------------------------------------
create table if not exists public.email_events (
  id          uuid primary key default gen_random_uuid(),
  resend_id   text,
  type        text not null,
  recipient   text,
  occurred_at timestamptz not null default now(),
  raw         jsonb,
  created_at  timestamptz not null default now()
);
comment on table public.email_events is
  'Resend webhook events keyed by resend_id. Joined to email_log for delivery/open/click rates.';

create index if not exists email_events_resend_idx on public.email_events (resend_id);
create index if not exists email_events_type_idx   on public.email_events (type, occurred_at desc);

-- -----------------------------------------------------------------------------
-- RLS — admins manage config + read logs; writes to logs are service-role only.
-- -----------------------------------------------------------------------------
alter table public.email_brand     enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_settings  enable row level security;
alter table public.email_log       enable row level security;
alter table public.email_events    enable row level security;

-- Config tables: admins select + update (single/seeded rows; no insert/delete).
do $$
declare t text;
begin
  foreach t in array array['email_brand', 'email_templates', 'email_settings'] loop
    execute format('drop policy if exists "%1$s_select_admin" on public.%1$s;', t);
    execute format('create policy "%1$s_select_admin" on public.%1$s for select to authenticated using (public.is_admin());', t);
    execute format('drop policy if exists "%1$s_update_admin" on public.%1$s;', t);
    execute format('create policy "%1$s_update_admin" on public.%1$s for update to authenticated using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

-- Log tables: admins read-only. Inserts come from the service role (bypasses RLS).
drop policy if exists "email_log_select_admin" on public.email_log;
create policy "email_log_select_admin"
  on public.email_log for select to authenticated using (public.is_admin());

drop policy if exists "email_events_select_admin" on public.email_events;
create policy "email_events_select_admin"
  on public.email_events for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- email_activity — admin-facing rollup: sends + delivery/open/click rates.
-- security definer so the join over email_events is allowed under RLS.
-- -----------------------------------------------------------------------------
create or replace function public.email_activity(p_days int default 30)
returns jsonb
language sql
security definer
set search_path = public
as $$
  -- Definer bypasses RLS, so gate on admin explicitly: non-admins get nothing.
  with guard as (select public.is_admin() as ok),
  logs as (
    select * from email_log
    where created_at > now() - make_interval(days => p_days)
      and (select ok from guard)
  ),
  ev as (
    select resend_id,
           bool_or(type = 'email.delivered') as delivered,
           bool_or(type = 'email.opened')    as opened,
           bool_or(type = 'email.clicked')    as clicked
    from email_events
    group by resend_id
  )
  select jsonb_build_object(
    'since_days', p_days,
    'sends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'email_key', l.email_key, 'subject', l.subject,
        'recipient_count', l.recipient_count, 'trigger', l.trigger,
        'status', l.status, 'created_at', l.created_at,
        'delivered', coalesce(e.delivered, false),
        'opened',    coalesce(e.opened, false),
        'clicked',   coalesce(e.clicked, false)
      ) order by l.created_at desc)
      from logs l left join ev e on e.resend_id = l.resend_id
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'sent',      count(*) filter (where l.status = 'sent'),
        'failed',    count(*) filter (where l.status = 'failed'),
        'opened',    count(*) filter (where e.opened),
        'clicked',   count(*) filter (where e.clicked)
      )
      from logs l left join ev e on e.resend_id = l.resend_id
    )
  );
$$;

revoke execute on function public.email_activity(int) from public;
grant  execute on function public.email_activity(int) to authenticated, service_role;
