-- Security invariants added by the pre-onboarding fixes:
--   • #4 admin tiers: viewer is read-only, editor/super can write (is_admin_editor)
--   • #4 roster: only admins may read the `admins` list (no longer world-readable)
--   • P0-2: a journal line whose currency != org home currency is rejected
-- Technique mirrors phase0_isolation_test.sql: fixtures run as the superuser test
-- role; capability checks run AS the authenticated user via SET LOCAL jwt claims.

begin;
select plan(9);

-- ── fixtures ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000ad001', 'super@test.dev',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ad002', 'editor@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ad003', 'viewer@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ad004', 'nobody@test.dev', 'authenticated', 'authenticated');

insert into public.admins (email, role, added_by) values
  ('super@test.dev',  'super',  'test'),
  ('editor@test.dev', 'editor', 'test'),
  ('viewer@test.dev', 'viewer', 'test');

-- minimal ledger fixture for the currency-guard trigger
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000c0001', 'business', 'Curr Co', '00000000-0000-0000-0000-0000000ad001');
insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000c0001', 'USD')
  on conflict (org_id) do update set home_currency = 'USD';
insert into ledger_accounts (id, org_id, name, type, code) values
  ('00000000-0000-0000-0000-0000000ca001', '00000000-0000-0000-0000-0000000c0001', 'Cash',  'asset',  '1000'),
  ('00000000-0000-0000-0000-0000000ca002', '00000000-0000-0000-0000-0000000c0001', 'Sales', 'income', '4000');
insert into accounting_periods (id, org_id, period_start, period_end, status) values
  ('00000000-0000-0000-0000-0000000c9001', '00000000-0000-0000-0000-0000000c0001', '2026-03-01', '2026-03-31', 'open');
insert into journal_entries (id, org_id, entry_date, period_id, status, source, idempotency_key, posted_by) values
  ('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000c0001', '2026-03-15',
   '00000000-0000-0000-0000-0000000c9001', 'posted', 'manual', 'curtest-1', '00000000-0000-0000-0000-0000000ad001');

create table _r (name text primary key, got boolean);
grant insert, select on _r to authenticated;

-- ── capability helpers per tier ─────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ad003","email":"viewer@test.dev","role":"authenticated"}';
insert into _r values ('viewer_is_admin',        public.is_admin());
insert into _r values ('viewer_is_editor',       public.is_admin_editor());
insert into _r values ('viewer_sees_roster',     (select count(*) from public.admins) > 0);
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ad002","email":"editor@test.dev","role":"authenticated"}';
insert into _r values ('editor_is_editor',       public.is_admin_editor());
reset role;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ad001","email":"super@test.dev","role":"authenticated"}';
insert into _r values ('super_is_editor',        public.is_admin_editor());
insert into _r values ('super_is_super',         public.is_super());
reset role;

-- a non-admin signed-in user must NOT be able to read the roster (leak fix)
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ad004","email":"nobody@test.dev","role":"authenticated"}';
insert into _r values ('nobody_sees_roster',     (select count(*) from public.admins) > 0);
reset role;

-- ── assertions ──────────────────────────────────────────────────────────────
select ok((select got from _r where name='viewer_is_admin'),     'viewer is recognised as an admin (can sign in / read)');
select ok(not (select got from _r where name='viewer_is_editor'),'viewer is NOT an editor (read-only)');
select ok((select got from _r where name='viewer_sees_roster'),  'an admin (viewer) can read the admins roster');
select ok((select got from _r where name='editor_is_editor'),    'editor has write capability');
select ok((select got from _r where name='super_is_editor'),     'super has write capability');
select ok((select got from _r where name='super_is_super'),      'super is super');
select ok(not (select got from _r where name='nobody_sees_roster'), 'a non-admin user CANNOT read the admins roster (leak fixed)');

-- ── currency guard ───────────────────────────────────────────────────────────
select lives_ok($$
  insert into journal_lines (entry_id, org_id, account_id, amount_minor, currency, side)
  values ('00000000-0000-0000-0000-0000000ce001','00000000-0000-0000-0000-0000000c0001',
          '00000000-0000-0000-0000-0000000ca001', 1000, 'USD', 'D')
$$, 'a home-currency (USD) line posts fine');

select throws_ok($$
  insert into journal_lines (entry_id, org_id, account_id, amount_minor, currency, side)
  values ('00000000-0000-0000-0000-0000000ce001','00000000-0000-0000-0000-0000000c0001',
          '00000000-0000-0000-0000-0000000ca002', 1000, 'EUR', 'C')
$$, '23514', null, 'a non-home-currency (EUR) line is rejected by the single-currency guard');

select * from finish();
rollback;
