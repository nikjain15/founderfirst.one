-- Console audit read — staff_list_admin_audit surfaces the platform audit log to
-- platform staff only. Proves: a staff user sees audit rows newest-first; a
-- non-staff user sees nothing (gate). All rolls back.

begin;
select plan(3);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000e1e1', 'staff@aud.dev',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e2e2', 'outsider@aud.dev', 'authenticated', 'authenticated');
insert into admins (email, is_super, role, added_by, added_at)
  values ('staff@aud.dev', false, 'viewer', 'seed', now());

-- Explicit, distinct created_at so newest-first ordering is deterministic
-- (both rows would otherwise share the statement's now()).
insert into admin_audit (actor_email, action, target_type, target_id, payload, created_at) values
  ('someone@x.dev', 'admin.invited',  'admin',  'a-1', '{}'::jsonb, now() - interval '2 minutes'),
  ('someone@x.dev', 'ticket.replied', 'ticket', 't-9', '{}'::jsonb, now() - interval '1 minute');

-- staff sees the log, newest-first
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000e1e1","email":"staff@aud.dev","role":"authenticated"}';
select ok(
  (select count(*) from staff_list_admin_audit(200)) >= 2,
  'staff sees audit rows');
select is(
  (select action from staff_list_admin_audit(200) limit 1),
  'ticket.replied', 'audit is newest-first');
reset "request.jwt.claims";

-- non-staff sees nothing (gate)
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000e2e2","email":"outsider@aud.dev","role":"authenticated"}';
select is(
  (select count(*)::int from staff_list_admin_audit(200)),
  0, 'non-staff sees no audit rows');
reset "request.jwt.claims";

select * from finish();
rollback;
