-- W3.4 · Owner Home "am I okay?" pulse — the "Coming up" deadlines come from the
-- KERNEL, never a hardcoded calendar. Home reads exactly one source for deadlines:
-- upcoming_filing_deadlines(org, as_of, horizon) (CENTRAL-2). This proves:
--   • an org with a tax profile (entity_type + jurisdiction) gets its filing
--     deadlines resolved from filing_obligations via the effective-dated kernel;
--   • CHANGING A SEED ROW CHANGES HOME with no code edit — supersede the due date
--     and the resolved due_date moves (the acceptance's central invariant);
--   • the horizon filters correctly (a deadline outside the window is excluded);
--   • an org with NO tax profile yet returns [] (Home degrades to "nothing coming
--     up" rather than erroring — the pre-onboarding state);
--   • the function is EXECUTE-granted to authenticated (Home calls it from the
--     browser session), unlike the service-role-only write-path.
-- Everything rolls back.

begin;
select plan(9);

-- ── fixtures: an owner + two business orgs (settings seeded by the AFTER trigger) ─
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000c4001', 'ownerHOME@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c4009', 'outsiderHOME@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000c40a1', 'business', 'Home Pulse Biz',  '00000000-0000-0000-0000-0000000c4001'),
  ('00000000-0000-0000-0000-0000000c40a2', 'business', 'No Profile Biz',  '00000000-0000-0000-0000-0000000c4001');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000c4001', '00000000-0000-0000-0000-0000000c40a1', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000c4001', '00000000-0000-0000-0000-0000000c40a2', 'owner', 'active');

-- A real-shaped test entity in the kernel (entity_type is FK-checked).
insert into entity_types (key, label, description, diagnostic_questions, owner_draw_treatment) values
  ('t_home_sole', 'Test sole prop (home)', 'test', '[]'::jsonb, 'equity_distribution')
  on conflict (key) do nothing;

-- ── seed a single filing obligation for (US-FED, t_home_sole, 2026): a return due
--    2027-04-15 (due_year_offset = 1 → filed the following spring). This is the ONLY
--    place the date lives — the app never hardcodes it. ─────────────────────────
insert into filing_obligations
  (jurisdiction_code, entity_type, tax_year, obligation_key, kind, form_code, label,
   due_month, due_day, due_year_offset, effective_from, effective_to, citation, source, is_active)
values
  ('US-FED', 't_home_sole', 2026, 'annual_return', 'annual_return', 'SCH_C',
   'Sole-prop annual return (Schedule C)', 4, 15, 1, '2020-01-01', null,
   'https://irs.gov/test-home-schedule-c', 'seed', true);

-- Give org #1 a tax profile (what onboarding sets); leave org #2 without one.
update org_accounting_settings
   set entity_type = 't_home_sole', jurisdiction_code = 'US-FED'
 where org_id = '00000000-0000-0000-0000-0000000c40a1';

-- upcoming_filing_deadlines is DEFINER + can_access_org-gated (definer-tenant-
-- guard) — auth as the owner (a member of both test orgs) for the positive path.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000c4001","email":"ownerHOME@test.dev","role":"authenticated"}';

-- ── 1. the profiled org sees the deadline within a wide horizon (as_of before due) ─
select is(
  (select count(*)::int from upcoming_filing_deadlines(
     '00000000-0000-0000-0000-0000000c40a1', date '2027-03-01', 90)),
  1, 'profiled org: the kernel filing deadline shows in the 90-day window');

-- ── 2. it resolves the REAL calendar date from the seed (2026 + offset 1 → 2027) ──
select is(
  (select due_date from upcoming_filing_deadlines(
     '00000000-0000-0000-0000-0000000c40a1', date '2027-03-01', 90)),
  date '2027-04-15', 'due_date resolved from the seed row (kernel, not hardcoded)');

-- ── 3. the label + citation flow through from the kernel row ──────────────────
select is(
  (select form_code from upcoming_filing_deadlines(
     '00000000-0000-0000-0000-0000000c40a1', date '2027-03-01', 90)),
  'SCH_C', 'form_code comes from the kernel obligation');

-- ── 4. horizon filtering: too-short a window (as_of far before due) excludes it ──
select is(
  (select count(*)::int from upcoming_filing_deadlines(
     '00000000-0000-0000-0000-0000000c40a1', date '2027-01-01', 30)),
  0, 'a deadline outside the horizon window is excluded');

-- ── 5. THE CENTRAL INVARIANT: change the seed → Home moves, no code edit. ──────
--    Supersede the 04-15 rule with a 05-01 rule (close the old window, open a new
--    one from 2027) — the exact effective-dated supersede the kernel is built for.
update filing_obligations
   set effective_to = '2026-12-31'
 where jurisdiction_code = 'US-FED' and entity_type = 't_home_sole'
   and tax_year = 2026 and obligation_key = 'annual_return' and effective_to is null;
insert into filing_obligations
  (jurisdiction_code, entity_type, tax_year, obligation_key, kind, form_code, label,
   due_month, due_day, due_year_offset, effective_from, effective_to, citation, source, is_active)
values
  ('US-FED', 't_home_sole', 2026, 'annual_return', 'annual_return', 'SCH_C',
   'Sole-prop annual return (Schedule C)', 5, 1, 1, '2027-01-01', null,
   'https://irs.gov/test-home-schedule-c-v2', 'seed', true);

select is(
  (select due_date from upcoming_filing_deadlines(
     '00000000-0000-0000-0000-0000000c40a1', date '2027-03-01', 90)),
  date '2027-05-01', 'changing the seed row moves the deadline Home shows (no code edit)');
select is(
  (select citation from upcoming_filing_deadlines(
     '00000000-0000-0000-0000-0000000c40a1', date '2027-03-01', 90)),
  'https://irs.gov/test-home-schedule-c-v2', 'the superseding citation flows through too');

-- ── 6. an org with NO tax profile returns nothing (pre-onboarding Home state) ──
select is(
  (select count(*)::int from upcoming_filing_deadlines(
     '00000000-0000-0000-0000-0000000c40a2', date '2027-03-01', 365)),
  0, 'org without a tax profile yields no deadlines (Home shows "nothing coming up")');

-- definer-tenant-guard: an outsider (no membership on either test org) gets
-- ZERO deadlines for org #1, not the profiled org's filing calendar.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000c4009","email":"outsiderHOME@test.dev","role":"authenticated"}';
select is(
  (select count(*)::int from upcoming_filing_deadlines(
     '00000000-0000-0000-0000-0000000c40a1', date '2027-03-01', 90)),
  0, 'DEFINER-GUARD: a non-member gets ZERO deadlines for another org (was: the full filing calendar)');
reset "request.jwt.claims";

-- ── 7. Home reads this from the browser session → authenticated may EXECUTE ────
select ok(
  has_function_privilege('authenticated',
    'public.upcoming_filing_deadlines(uuid, date, int)', 'execute'),
  'upcoming_filing_deadlines is EXECUTE-grantable to authenticated (Home calls it)');

select * from finish();
rollback;
