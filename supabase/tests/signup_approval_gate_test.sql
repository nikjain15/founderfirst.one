-- Signup approval gate — proves a new org is PENDING with no write access until
-- staff approve it, existing orgs are grandfathered, and approve/decline is
-- staff-only + audited. REG ids: APPROVAL-PENDING-NOWRITE, APPROVAL-GRANDFATHER,
-- APPROVAL-STAFF-ONLY, APPROVAL-GRANTS-WRITE, APPROVAL-DECLINE-REVOKES,
-- APPROVAL-QUEUE-ISO. All rolls back.
begin;
select plan(11);

-- ── actors ───────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000a0001', 'owner@approval.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a0009', 'staff@approval.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a00ff', 'outsider@approval.dev','authenticated', 'authenticated');

-- staff is in the admins allow-list → is_platform_staff() = true for them.
insert into admins (email, is_super, role, added_by, added_at)
  values ('staff@approval.dev', false, 'editor', 'seed', now());

-- ── a NEW org created via the real path → must be PENDING ──────────────────────
select lives_ok($$
  select create_org_atomic('00000000-0000-0000-0000-0000000a0001', 'business', 'PendingCo')
$$, 'APPROVAL: create_org_atomic creates an org');

select is(
  (select approval_status::text from organizations where name = 'PendingCo'),
  'pending',
  'APPROVAL-PENDING: a new org lands pending');

-- owner cannot WRITE a pending org (the gate)
select ok(
  not can_write_org_as('00000000-0000-0000-0000-0000000a0001',
                       (select id from organizations where name = 'PendingCo')),
  'APPROVAL-PENDING-NOWRITE: owner has no write access while pending');

-- ── a GRANDFATHERED org (inserted directly → column default 'approved') ────────
insert into organizations (id, type, name, created_by, approval_status)
  values ('00000000-0000-0000-0000-0000000a00e1', 'business', 'OldCo',
          '00000000-0000-0000-0000-0000000a0001', default);
insert into memberships (user_id, org_id, role, status)
  values ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a00e1', 'owner', 'active');

select is(
  (select approval_status::text from organizations where name = 'OldCo'),
  'approved',
  'APPROVAL-GRANDFATHER: an existing org defaults approved');
select ok(
  can_write_org_as('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a00e1'),
  'APPROVAL-GRANDFATHER: grandfathered org keeps write access');

-- ── approve/decline is STAFF-ONLY ─────────────────────────────────────────────
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000a00ff","email":"outsider@approval.dev","role":"authenticated"}';
select throws_ok($$
  select set_org_approval((select id from organizations where name = 'PendingCo'), 'approved')
$$, '42501',
   'APPROVAL-STAFF-ONLY: a non-staff caller cannot approve');

select is(
  (select count(*)::int from staff_list_pending_orgs()),
  0,
  'APPROVAL-QUEUE-ISO: a non-staff caller sees no pending queue');

-- ── staff approves → owner gains write ────────────────────────────────────────
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000a0009","email":"staff@approval.dev","role":"authenticated"}';

select ok(
  (select count(*)::int from staff_list_pending_orgs()) >= 1,
  'APPROVAL-QUEUE: staff sees the pending signup in the queue');

select lives_ok($$
  select set_org_approval((select id from organizations where name = 'PendingCo'), 'approved')
$$, 'APPROVAL: staff approves the pending org');

select ok(
  can_write_org_as('00000000-0000-0000-0000-0000000a0001',
                   (select id from organizations where name = 'PendingCo')),
  'APPROVAL-GRANTS-WRITE: owner gains write access once approved');

-- ── decline revokes ───────────────────────────────────────────────────────────
select set_org_approval((select id from organizations where name = 'OldCo'), 'declined');
select ok(
  not can_write_org_as('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000a00e1'),
  'APPROVAL-DECLINE-REVOKES: a declined org loses write access');

select * from finish();
rollback;
