-- [LOOP-1] loop_runs / loop_events RLS gate.
--
-- The Build dashboard is admin-read-only and the ONLY write path is the
-- loop-heartbeat edge fn via service_role (which bypasses RLS). This test proves
-- the browser-JWT trust boundary the migration claims:
--   • an admin JWT may SELECT both tables
--   • a non-admin authenticated JWT may NOT SELECT (RLS denies)
--   • an authenticated JWT may NOT INSERT/UPDATE loop_runs — no write policy is
--     granted, so a caller cannot forge loop state (the ISOTEST forged-actor class)
begin;
select plan(6);

-- Seed: one admin, one ordinary user, and a pre-existing run row (written as the
-- service_role would, before RLS is exercised below).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000ad0aa', 'loopadmin@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ad0bb', 'nobody@test.dev',    'authenticated', 'authenticated');
insert into public.admins (email, added_by) values ('loopadmin@test.dev', 'test');

insert into public.loop_runs (session_tag, role, card, status)
  values ('loop-1-fixture', 'builder', 'LOOP-1', 'running');
insert into public.loop_events (session_tag, message)
  values ('loop-1-fixture', 'seeded step');

create table _r (name text primary key, got int);
grant insert, select on _r to authenticated;

-- (1)(2) admin JWT can read both tables ------------------------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ad0aa","email":"loopadmin@test.dev","role":"authenticated"}';
insert into _r values ('admin_runs',   (select count(*)::int from public.loop_runs   where session_tag='loop-1-fixture'));
insert into _r values ('admin_events', (select count(*)::int from public.loop_events where session_tag='loop-1-fixture'));
reset role;

-- (3)(4) non-admin JWT sees NOTHING (RLS is_admin() gate) -------------------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ad0bb","email":"nobody@test.dev","role":"authenticated"}';
insert into _r values ('nobody_runs',   (select count(*)::int from public.loop_runs));
insert into _r values ('nobody_events', (select count(*)::int from public.loop_events));
reset role;

select is((select got from _r where name='admin_runs'),   1, 'admin can read loop_runs');
select is((select got from _r where name='admin_events'), 1, 'admin can read loop_events');
select is((select got from _r where name='nobody_runs'),   0, 'non-admin cannot read loop_runs (RLS)');
select is((select got from _r where name='nobody_events'), 0, 'non-admin cannot read loop_events (RLS)');

-- (5) authenticated cannot forge a run row — no INSERT policy exists ---------
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ad0aa","email":"loopadmin@test.dev","role":"authenticated"}';
select throws_ok(
  $$ insert into public.loop_runs (session_tag, role, status) values ('forged', 'builder', 'running') $$,
  '42501',
  null,
  'authenticated (even an admin) cannot INSERT loop_runs — writes are service_role-only'
);

-- (6) authenticated cannot UPDATE an existing run to overwrite its status ----
select throws_ok(
  $$ update public.loop_runs set status='done' where session_tag='loop-1-fixture' $$,
  '42501',
  null,
  'authenticated cannot UPDATE loop_runs — no write policy, forge blocked'
);
reset role;

select * from finish();
rollback;
