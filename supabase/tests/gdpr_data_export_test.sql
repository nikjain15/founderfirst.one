-- GDPR data export & erasure (org-data fn) — the DB invariants the function rests on:
--   • the export reads via RLS (can_access_org), so cross-tenant reads return nothing;
--   • integration tokens AND the OAuth state nonce are never granted to `authenticated`
--     (the export hand-picks safe columns, but the column wall is the real guarantee);
--   • ledger_audit is append-only & read-isolated to the org — posted-entry / disconnect
--     trail is retained and a client can never forge or read another org's audit.
begin;
select plan(10);

insert into auth.users (id, email, aud, role) values
  ('0d000000-0000-0000-0000-0000000000a1', 'ownerA@gdpr.dev', 'authenticated', 'authenticated'),
  ('0d000000-0000-0000-0000-0000000000b2', 'ownerB@gdpr.dev', 'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('0d000000-0000-0000-0000-00000000a001', 'business', 'GDPR Biz A', '0d000000-0000-0000-0000-0000000000a1'),
  ('0d000000-0000-0000-0000-00000000b002', 'business', 'GDPR Biz B', '0d000000-0000-0000-0000-0000000000b2');
insert into memberships (user_id, org_id, role, status) values
  ('0d000000-0000-0000-0000-0000000000a1', '0d000000-0000-0000-0000-00000000a001', 'owner', 'active'),
  ('0d000000-0000-0000-0000-0000000000b2', '0d000000-0000-0000-0000-00000000b002', 'owner', 'active');

-- a connection (with live tokens + state nonce) and an audit row for org A
insert into external_connections (org_id, provider, realm_id, tenant_name, access_token, refresh_token, state, status, connected_by)
values ('0d000000-0000-0000-0000-00000000a001', 'xero', 'tnt-1', 'A Books', 'SECRET_ACCESS', 'SECRET_REFRESH', 'CSRF_NONCE', 'active', '0d000000-0000-0000-0000-0000000000a1');
insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
values ('0d000000-0000-0000-0000-00000000a001', '0d000000-0000-0000-0000-0000000000a1', 'integration.disconnect', 'connection', gen_random_uuid(), '{"provider":"xero"}');

create table _g (name text primary key, got int);
grant insert, select on _g to authenticated;

-- org A owner reads their own audit; org B owner must NOT see org A's audit (RLS)
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"0d000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into _g values ('a_audit', (select count(*)::int from ledger_audit where org_id='0d000000-0000-0000-0000-00000000a001'));
reset role;
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"0d000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
insert into _g values ('b_audit', (select count(*)::int from ledger_audit where org_id='0d000000-0000-0000-0000-00000000a001'));
reset role;

select is((select got from _g where name='a_audit'), 1, 'org member can read their own ledger_audit (export source)');
select is((select got from _g where name='b_audit'), 0, 'another org cannot read the ledger_audit (cross-tenant export blocked)');

-- token + state columns are hidden from authenticated; safe metadata is readable
select ok(not has_column_privilege('authenticated', 'external_connections', 'access_token',  'SELECT'), 'access_token hidden from authenticated');
select ok(not has_column_privilege('authenticated', 'external_connections', 'refresh_token', 'SELECT'), 'refresh_token hidden from authenticated');
select ok(not has_column_privilege('authenticated', 'external_connections', 'state',         'SELECT'), 'OAuth state nonce hidden from authenticated');
select ok(    has_column_privilege('authenticated', 'external_connections', 'tenant_name',   'SELECT'), 'tenant_name readable by authenticated');

-- ledger_audit is append-only / read-only from any client: authenticated has SELECT but
-- not INSERT/UPDATE/DELETE — the retention trail can't be forged or wiped from the browser.
select ok(    has_table_privilege('authenticated', 'ledger_audit', 'SELECT'), 'ledger_audit is client-readable (for export)');
select ok(not has_table_privilege('authenticated', 'ledger_audit', 'INSERT'), 'ledger_audit cannot be written by a client (append-only)');
select ok(not has_table_privilege('authenticated', 'ledger_audit', 'UPDATE'), 'ledger_audit cannot be mutated by a client');
select ok(not has_table_privilege('authenticated', 'ledger_audit', 'DELETE'), 'ledger_audit cannot be deleted by a client (retention)');

select * from finish();
rollback;
