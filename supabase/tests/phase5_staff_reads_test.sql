-- Phase 5b staff read layer (ARCHITECTURE.md §4.2). Staff see the org directory;
-- tenant books are readable ONLY while a break-glass window is open; closing the
-- window cuts access. Non-staff see nothing. All rolls back.

begin;
select plan(7);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000a1a1', 'staffuser@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a2a2', 'outsider@test.dev',  'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Tenant Co', '00000000-0000-0000-0000-00000000a2a2');
-- a2a2 is the tenant's own owner (NOT platform staff); lets the seed entry post.
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000a2a2', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active');
insert into org_accounting_settings (org_id, home_currency) values ('00000000-0000-0000-0000-0000000000b1', 'USD');
insert into admins (email, is_super, added_by, added_at) values ('staffuser@test.dev', false, 'seed', now());
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', '1000', 'Cash', 'asset'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', '4000', 'Sales', 'income');
select post_journal_entry('00000000-0000-0000-0000-00000000a2a2'::uuid, '00000000-0000-0000-0000-0000000000b1',
  '2026-02-01', 'k-1',
  '[{"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":1000,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-00000000c002","amount_minor":1000,"side":"C"}]'::jsonb);

-- ── staff directory ─────────────────────────────────────────────────────────
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a1a1","email":"staffuser@test.dev","role":"authenticated"}';
select is((select count(*)::int from staff_list_orgs() where id='00000000-0000-0000-0000-0000000000b1'),
  1, 'staff see the org in the directory');
select is((select entry_count::int from staff_list_orgs() where id='00000000-0000-0000-0000-0000000000b1'),
  1, 'directory reports the entry count');
select is((select count(*)::int from staff_list_accounts('00000000-0000-0000-0000-0000000000b1')),
  0, 'no tenant accounts visible before break-glass');

-- ── open a window → books readable ──────────────────────────────────────────
create temp table _g as
select * from open_break_glass('00000000-0000-0000-0000-0000000000b1', 'audit review', 60);
select is((select count(*)::int from staff_list_accounts('00000000-0000-0000-0000-0000000000b1')),
  2, 'both accounts visible during break-glass');
select is(jsonb_array_length(staff_list_entries('00000000-0000-0000-0000-0000000000b1')),
  1, 'the entry is readable during break-glass');

-- ── close → access cut ──────────────────────────────────────────────────────
select close_break_glass((select id from _g));
select is((select count(*)::int from staff_list_accounts('00000000-0000-0000-0000-0000000000b1')),
  0, 'accounts hidden again after close');

-- ── non-staff sees nothing ──────────────────────────────────────────────────
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a2a2","email":"outsider@test.dev","role":"authenticated"}';
select is((select count(*)::int from staff_list_orgs()), 0, 'a non-staff user sees no directory');

select * from finish();
rollback;
