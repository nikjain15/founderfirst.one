-- Invoicing Slice C — business profile. Owner can save the profile and read it
-- back; a non-owner is forbidden. All rolls back.

begin;
select plan(3);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'owner@inv.dev',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f9', 'outsider@inv.dev', 'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000F0', 'business', 'Acme Co', '00000000-0000-0000-0000-0000000000f1');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000F0', 'owner', 'active');

-- owner saves the profile
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","email":"owner@inv.dev","role":"authenticated"}';
select is(
  (select (set_invoicing_profile('00000000-0000-0000-0000-0000000000F0', 'Acme Inc', '1 Main St', 'billing@acme.dev', 'Net 30')).business_name),
  'Acme Inc', 'owner saves the business profile');
select is(
  (select business_name from org_invoicing_settings where org_id = '00000000-0000-0000-0000-0000000000F0'),
  'Acme Inc', 'profile persisted to org_invoicing_settings');
reset "request.jwt.claims";

-- a non-owner outsider is forbidden
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f9","email":"outsider@inv.dev","role":"authenticated"}';
select throws_ok(
  $$ select set_invoicing_profile('00000000-0000-0000-0000-0000000000F0', 'Hijack Inc') $$,
  '42501', NULL, 'non-owner cannot set the profile');
reset "request.jwt.claims";

select * from finish();
rollback;
