-- Phase 0 RLS isolation gate (ARCHITECTURE.md §4.5, §C5).
-- Asserts user A cannot read user B's org across all four relationship combinations,
-- that read_only vs full write capability is enforced, and that revoke cuts access
-- immediately. Isolation is TESTED, not assumed.
--
-- Run locally: `supabase test db` (auto-installs pgTAP into the local stack).
--
-- Technique: fixtures + pgTAP scaffolding run as the (superuser) test role; each
-- RLS read is executed AS the authenticated user (so the policies actually filter)
-- and its result captured into `_res`; assertions then run against `_res`. This
-- avoids running pgTAP's own machinery under the restricted authenticated role.

begin;
select plan(20);

-- ── fixtures (run as the default superuser test role — RLS bypassed) ──────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerA@test.dev',        'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'ownerB@test.dev',        'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'cpaAdmin@test.dev',      'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'cpaAssigned@test.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'cpaUnassigned@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz A', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b2', 'business', 'Biz B', '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000b3', 'business', 'Biz C', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000f1', 'firm',     'Firm F','00000000-0000-0000-0000-0000000000a1');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner',      'active'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2', 'owner',      'active'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 'cpa',        'active'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000f1', 'cpa',        'active');

-- Firm F engages Biz A (full) and Biz B (read_only). Biz C is NOT a client.
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1', 'active', 'full',      '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2', 'active', 'read_only', '00000000-0000-0000-0000-0000000000a1');

-- cpaAssigned is assigned to Biz A only; cpaUnassigned has no assignment.
insert into client_assignments (engagement_id, user_id, assigned_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1');

-- results table the authenticated reads write into (regular table; rolled back).
create table _res (name text primary key, got int);
grant insert, select on _res to authenticated;

-- helper: run a visibility read as a given user, capture 1/0 into _res.
-- (inlined per call because we change role/jwt via SET LOCAL.)

-- ── Combo 1: member-of-own-org ───────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into _res values ('c1_ownerA_bizA', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b1'));
insert into _res values ('c1_ownerA_bizB', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b2'));
insert into _res values ('c1_ownerA_firmF',(select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000f1'));
reset role;

-- ── Combo 2: engaged + assigned CPA ──────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into _res values ('c2_assigned_bizA', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b1'));
insert into _res values ('c2_assigned_firmF',(select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000f1'));
insert into _res values ('c2_assigned_bizB', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b2'));
insert into _res values ('c2_assigned_bizC', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b3'));
reset role;

-- ── Combo 3: engaged + UNassigned CPA ────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into _res values ('c3_unassigned_firmF',(select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000f1'));
insert into _res values ('c3_unassigned_bizA', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b1'));
insert into _res values ('c3_unassigned_bizB', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b2'));
reset role;

-- ── Combo 4: firm_admin sees all firm clients ────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into _res values ('c4_admin_bizA', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b1'));
insert into _res values ('c4_admin_bizB', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b2'));
insert into _res values ('c4_admin_firmF',(select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000f1'));
insert into _res values ('c4_admin_bizC', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b3'));
reset role;

-- ── Write capability (can_write_org): full vs read_only vs none ──────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into _res values ('w_ownerA_bizA',     can_write_org('00000000-0000-0000-0000-0000000000b1')::int);
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into _res values ('w_assigned_bizA',   can_write_org('00000000-0000-0000-0000-0000000000b1')::int);  -- full -> 1
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into _res values ('w_unassigned_bizA', can_write_org('00000000-0000-0000-0000-0000000000b1')::int);  -- not assigned -> 0
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into _res values ('w_admin_bizA',      can_write_org('00000000-0000-0000-0000-0000000000b1')::int);  -- admin + full -> 1
insert into _res values ('w_admin_bizB',      can_write_org('00000000-0000-0000-0000-0000000000b2')::int);  -- read_only -> 0
reset role;

-- ── Revoke cuts access immediately ───────────────────────────────────────────
update engagements set status='revoked', revoked_at=now()
  where id='00000000-0000-0000-0000-0000000000e1';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
insert into _res values ('rev_assigned_bizA', (select count(*)::int from organizations where id='00000000-0000-0000-0000-0000000000b1'));
reset role;

-- ── Assertions ───────────────────────────────────────────────────────────────
select is((select got from _res where name='c1_ownerA_bizA'),  1, 'C1: owner sees their own business');
select is((select got from _res where name='c1_ownerA_bizB'),  0, 'C1: owner CANNOT see another owner''s business');
select is((select got from _res where name='c1_ownerA_firmF'), 0, 'C1: owner cannot see an unrelated firm');

select is((select got from _res where name='c2_assigned_bizA'),  1, 'C2: assigned CPA sees the assigned client');
select is((select got from _res where name='c2_assigned_firmF'), 1, 'C2: CPA sees their own firm');
select is((select got from _res where name='c2_assigned_bizB'),  0, 'C2: assigned CPA cannot see an unassigned client');
select is((select got from _res where name='c2_assigned_bizC'),  0, 'C2: assigned CPA cannot see a non-client org');

select is((select got from _res where name='c3_unassigned_firmF'), 1, 'C3: unassigned CPA sees their own firm');
select is((select got from _res where name='c3_unassigned_bizA'),  0, 'C3: unassigned CPA CANNOT see the firm''s client');
select is((select got from _res where name='c3_unassigned_bizB'),  0, 'C3: unassigned CPA cannot see another client');

select is((select got from _res where name='c4_admin_bizA'),  1, 'C4: firm_admin sees firm client A');
select is((select got from _res where name='c4_admin_bizB'),  1, 'C4: firm_admin sees firm client B (no assignment needed)');
select is((select got from _res where name='c4_admin_firmF'), 1, 'C4: firm_admin sees their own firm');
select is((select got from _res where name='c4_admin_bizC'),  0, 'C4: firm_admin cannot see a non-client org');

select is((select got from _res where name='w_ownerA_bizA'),     1, 'W: owner can write their own books');
select is((select got from _res where name='w_assigned_bizA'),   1, 'W: assigned full CPA can write');
select is((select got from _res where name='w_unassigned_bizA'), 0, 'W: unassigned CPA cannot write');
select is((select got from _res where name='w_admin_bizA'),      1, 'W: firm_admin can write a full-access client');
select is((select got from _res where name='w_admin_bizB'),      0, 'W: firm_admin CANNOT write a read_only client');

select is((select got from _res where name='rev_assigned_bizA'), 0, 'REVOKE: access is cut immediately after engagement revoked');

select * from finish();
rollback;
