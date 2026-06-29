-- Phase 3 external-connections gate: row isolation + the token column-grant wall.
begin;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerA@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'ownerB@test.dev', 'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz A', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b2', 'business', 'Biz B', '00000000-0000-0000-0000-00000000000b');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2', 'owner', 'active');

insert into external_connections (org_id, provider, realm_id, tenant_name, access_token, refresh_token, status, connected_by)
values ('00000000-0000-0000-0000-0000000000b1', 'xero', 'tenant-1', 'Biz A Books', 'SECRET_ACCESS', 'SECRET_REFRESH', 'active', '00000000-0000-0000-0000-00000000000a');

create table _res (name text primary key, got int);
grant insert, select on _res to authenticated;

-- owner A sees their connection
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into _res values ('a_sees', (select count(*)::int from external_connections where org_id='00000000-0000-0000-0000-0000000000b1'));
reset role;
-- owner B cannot see org A's connection
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
insert into _res values ('b_sees', (select count(*)::int from external_connections where org_id='00000000-0000-0000-0000-0000000000b1'));
reset role;

select is((select got from _res where name='a_sees'), 1, 'owner sees their own connection');
select is((select got from _res where name='b_sees'), 0, 'another org cannot see the connection (RLS)');

-- the token / state columns are NOT granted to authenticated; safe columns are
select ok(not has_column_privilege('authenticated', 'external_connections', 'access_token',  'SELECT'), 'access_token is hidden from authenticated');
select ok(not has_column_privilege('authenticated', 'external_connections', 'refresh_token', 'SELECT'), 'refresh_token is hidden from authenticated');
select ok(    has_column_privilege('authenticated', 'external_connections', 'tenant_name',   'SELECT'), 'tenant_name is readable by authenticated');

select * from finish();
rollback;
