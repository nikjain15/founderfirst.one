-- Phase 5 platform-staff gate (ARCHITECTURE.md §4.2, §11). is_platform_staff
-- mirrors the admins email allow-list; admins changes sync into platform_staff;
-- break-glass access to a tenant is staff-only, time-boxed, and audited. All
-- rolls back.

begin;
select plan(14);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000a1a1', 'staffuser@test.dev',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a2a2', 'outsider@test.dev',   'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Tenant Co', '00000000-0000-0000-0000-00000000a2a2');

-- adding to admins should sync into platform_staff via trigger
insert into admins (email, is_super, added_by, added_at) values
  ('staffuser@test.dev', false, 'seed', now());

select is(
  (select count(*)::int from platform_staff ps join auth.users u on u.id = ps.user_id
     where lower(u.email) = 'staffuser@test.dev'),
  1, 'inserting into admins syncs platform_staff (trigger)');

-- ── is_platform_staff mirrors the admins allow-list ─────────────────────────
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a1a1","email":"staffuser@test.dev","role":"authenticated"}';
select ok(is_platform_staff(),       'admins email IS platform staff');
select ok(not staff_can_access_org('00000000-0000-0000-0000-0000000000b1'), 'no tenant access before break-glass');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a2a2","email":"outsider@test.dev","role":"authenticated"}';
select ok(not is_platform_staff(),   'a non-admin email is NOT platform staff');
select throws_ok($$ select open_break_glass('00000000-0000-0000-0000-0000000000b1','snooping') $$,
  '42501', NULL, 'a non-staff user cannot open break-glass');

-- ── open break-glass (as staff) ─────────────────────────────────────────────
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000a1a1","email":"staffuser@test.dev","role":"authenticated"}';
select throws_ok($$ select open_break_glass('00000000-0000-0000-0000-0000000000b1','') $$,
  '22023', NULL, 'a reason is required to open break-glass');

create temp table _g as
select * from open_break_glass('00000000-0000-0000-0000-0000000000b1', 'investigating support ticket 42', 60);
select ok((select expires_at from _g) > now(), 'grant expires in the future');
select ok(staff_can_access_org('00000000-0000-0000-0000-0000000000b1'), 'tenant access granted during the window');
select is(
  (select count(*)::int from admin_audit where action = 'break_glass.open'
     and target_id = '00000000-0000-0000-0000-0000000000b1'),
  1, 'opening break-glass is audited');

-- ── expiry closes access ────────────────────────────────────────────────────
update break_glass_grants set expires_at = now() - interval '1 minute' where id = (select id from _g);
select ok(not staff_can_access_org('00000000-0000-0000-0000-0000000000b1'), 'access expires with the window');
update break_glass_grants set expires_at = now() + interval '1 hour' where id = (select id from _g);
select ok(staff_can_access_org('00000000-0000-0000-0000-0000000000b1'), 'access returns when the window is extended');

-- ── close (idempotent, audited) ─────────────────────────────────────────────
select is((select closed_at is not null from close_break_glass((select id from _g))), true, 'close sets closed_at');
select ok(not staff_can_access_org('00000000-0000-0000-0000-0000000000b1'), 'no access after close');
select is(
  (select count(*)::int from admin_audit where action = 'break_glass.close'),
  1, 'closing break-glass is audited');

select * from finish();
rollback;
