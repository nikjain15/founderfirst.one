-- =============================================================================
-- FounderFirst — admin welcome email (event-driven, when an admin is added)
-- =============================================================================
--
-- Adding someone to the `admins` allow-list wrote the row but sent nothing — the
-- new admin got no email, no link, no "here's how to sign in." This adds a
-- transactional "admin_welcome" email sent once when an admin is added, reusing
-- the shared send path (_shared/send.ts → Resend) so it's on-brand and on-voice.
--
-- Mirrors the waitlist-welcome shape exactly. Three idempotent parts:
--   1. email_templates row 'admin_welcome' — admin-editable copy (Settings →
--      Emails → Templates). {firstName} and {addedBy} filled by the
--      admin-welcome function. Body lives in `intro` (built-in emails build no
--      DB body), consistent with penny_brain / welcome.
--   2. admin_welcome_sends ledger — one row per emailed address, so re-adding or
--      a retry can never send twice.
--   3. email_schedules built-in row — event/toggle-only, so it shows in
--      Settings → Emails → Scheduled and can be paused (NOT time-dispatched; the
--      admin-welcome function fires it and respects this enabled flag).
--
-- Safe to re-run.
-- =============================================================================

-- ---- 1. Template copy -------------------------------------------------------
-- on-conflict-do-nothing preserves later admin edits.
insert into public.email_templates
  (email_key, label, eyebrow, subject, preheader, heading, intro, cta_label, footer)
values
  ('admin_welcome', 'Admin welcome',
   'FounderFirst · Admin',
   'You''ve got FounderFirst admin access',
   'Sign in any time with a one-tap magic link — no password.',
   'You''re an admin now, {firstName}.',
   '{addedBy} added you to the FounderFirst admin. Sign in any time at founderfirst.one/admin — enter this email and we''ll send a one-tap magic link, no password to remember. You''ll also get the weekly "What''s new" and the Signals digests.',
   'Open the admin',
   'You''re getting this because {addedBy} gave you FounderFirst admin access.')
on conflict (email_key) do nothing;

-- ---- 2. Idempotency ledger --------------------------------------------------
create table if not exists public.admin_welcome_sends (
  email      text primary key,
  added_by   text,
  sent_at    timestamptz not null default now()
);
comment on table public.admin_welcome_sends is
  'One row per address that has received the admin welcome email. Insert-on-conflict-do-nothing guarantees a single send per address.';

alter table public.admin_welcome_sends enable row level security;
-- Admin read only; the function uses the service role (bypasses RLS).
drop policy if exists "admin_welcome_sends_admin_read" on public.admin_welcome_sends;
create policy "admin_welcome_sends_admin_read"
  on public.admin_welcome_sends for select to authenticated
  using (public.is_admin());

-- ---- 3. Scheduled-tab row (event, toggle only) ------------------------------
do $$
begin
  if not exists (select 1 from public.email_schedules where email_key = 'admin_welcome' and is_builtin) then
    insert into public.email_schedules
      (email_key, is_builtin, kind, dispatch, trigger_label, audience_kind, enabled)
    values
      ('admin_welcome', true, 'event', 'event', 'When an admin is added', 'list', true);
  end if;
end;
$$;
