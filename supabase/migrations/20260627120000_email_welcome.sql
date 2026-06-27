-- =============================================================================
-- FounderFirst — waitlist welcome email (event-driven, on signup)
-- =============================================================================
--
-- Until now a waitlist signup wrote the row and showed /confirmed, but no email
-- ever went out. This adds a transactional "welcome" email sent immediately on
-- a *new* signup, reusing the shared send path (_shared/send.ts → Resend).
--
-- Three parts, all idempotent:
--   1. email_templates row 'welcome'  — admin-editable copy (Settings → Emails →
--      Templates), {firstName} token filled by the signup-confirmation function.
--   2. welcome_sends ledger           — one row per emailed address, so a retry
--      or a double-submit can never send twice.
--   3. email_schedules built-in row   — event/toggle-only, so the email shows in
--      Settings → Emails → Scheduled and can be paused (it is NOT time-dispatched;
--      the signup-confirmation function fires it and respects this enabled flag).
--
-- Safe to re-run.
-- =============================================================================

-- ---- 1. Template copy -------------------------------------------------------
-- on-conflict-do-nothing preserves later admin edits. Body lives in `intro`
-- (built-in emails build no DB body), consistent with penny_brain.
insert into public.email_templates
  (email_key, label, eyebrow, subject, preheader, heading, intro, cta_label, footer)
values
  ('welcome', 'Waitlist welcome',
   'FounderFirst',
   'You''re on the list, {firstName}',
   'Your spot is saved — here''s what happens next.',
   'Welcome to FounderFirst, {firstName}.',
   'You''re on the waitlist — your spot is saved. FounderFirst is building Penny, an autonomous bookkeeper that does the books so you can run the business. We''ll email you the moment your access is ready. Want to move up the list? Share your referral link from your welcome page.',
   'See your spot',
   'You''re getting this because you joined the FounderFirst waitlist. No other emails until your access is ready.')
on conflict (email_key) do nothing;

-- ---- 2. Idempotency ledger --------------------------------------------------
create table if not exists public.welcome_sends (
  email      text primary key,
  slug       text,
  sent_at    timestamptz not null default now()
);
comment on table public.welcome_sends is
  'One row per address that has received the waitlist welcome email. Insert-on-conflict-do-nothing guarantees a single send per address.';

alter table public.welcome_sends enable row level security;
-- Admin read only; the function uses the service role (bypasses RLS).
drop policy if exists "welcome_sends_admin_read" on public.welcome_sends;
create policy "welcome_sends_admin_read"
  on public.welcome_sends for select to authenticated
  using (public.is_admin());

-- ---- 3. Scheduled-tab row (event, toggle only) ------------------------------
do $$
begin
  if not exists (select 1 from public.email_schedules where email_key = 'welcome' and is_builtin) then
    insert into public.email_schedules
      (email_key, is_builtin, kind, dispatch, trigger_label, audience_kind, enabled)
    values
      ('welcome', true, 'event', 'event', 'On signup', 'list', true);
  end if;
end;
$$;
