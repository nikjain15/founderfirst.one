-- W2.2 — QBO one-click migration with history (BACKLOG §W2.2). Exercises the new
-- migration state + RPCs on top of the verified import write-path:
--   • record_provider_migration upserts one record per connection (re-pull updates it)
--   • provider rows commit via the bank branch with ext:qbo:<external_id> idempotency
--     → a SECOND commit of a re-staged pull adds NOTHING (W2.2-REPULL-IDEM)
--   • every posted entry balances; TB stays tied (W2.2-TBTIE)
--   • set_import_batch_cutover / set_provider_migration_cutover stamp + freeze
--   • tenant isolation: a foreign actor cannot record a migration or set cutover
-- Same technique as phase3_import_test: SECURITY DEFINER fns take p_actor; rollback.

begin;
select plan(16);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000d2201', 'ownerW22@test.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d2202', 'strangerW22@test.dev','authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000d22b1', 'business', 'Migrate Co', '00000000-0000-0000-0000-0000000d2201'),
  ('00000000-0000-0000-0000-0000000d22b2', 'business', 'Other Co',   '00000000-0000-0000-0000-0000000d2202');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000d2202', '00000000-0000-0000-0000-0000000d22b2', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000d22b1', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-000000d22a01', '00000000-0000-0000-0000-0000000d22b1', '1000', 'Checking', 'asset'),
  ('00000000-0000-0000-0000-000000d22a02', '00000000-0000-0000-0000-0000000d22b1', '4000', 'Sales',    'income'),
  ('00000000-0000-0000-0000-000000d22a03', '00000000-0000-0000-0000-0000000d22b1', '5000', 'Rent',     'expense');

insert into external_connections (id, org_id, provider, realm_id, tenant_name, status) values
  ('00000000-0000-0000-0000-000000d22c01', '00000000-0000-0000-0000-0000000d22b1', 'qbo', '99999', 'Migrate Co (QBO)', 'active');

-- ── per-year batch (source qbo → bank branch), rows carry QBO txn id as external_id ─
create temp table _y1 as
select * from create_import_batch(
  '00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1',
  'qbo'::import_source, 'Migrate Co · 2025', '00000000-0000-0000-0000-000000d22a01', null);

select is(
  append_import_rows('00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1',
    (select id from _y1),
    '[{"row_num":1,"txn_date":"2025-03-01","description":"Client deposit","amount_minor":120000,"account_id":"00000000-0000-0000-0000-000000d22a02","external_id":"deposit:D1","status":"ready"},
      {"row_num":2,"txn_date":"2025-04-01","description":"Rent","amount_minor":-30000,"account_id":"00000000-0000-0000-0000-000000d22a03","external_id":"purchase:P1","status":"ready"}]'::jsonb),
  2, 'two QBO rows staged with external_id');

create temp table _y1c as
select * from commit_import_batch('00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1', (select id from _y1), 4000);

select is((select status::text from _y1c), 'committed', 'QBO year batch commits via bank branch');
select is((select count(*)::int from journal_entries where org_id='00000000-0000-0000-0000-0000000d22b1' and source='import'), 2, 'one entry per provider txn');

-- balance: every entry ties (Dr == Cr) — post_journal_entry enforces; TB tie proof
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int from journal_lines
     where entry_id in (select id from journal_entries where org_id='00000000-0000-0000-0000-0000000d22b1' and source='import')),
  0, 'W2.2-TBTIE: migrated ledger nets to zero (balanced)');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id='00000000-0000-0000-0000-000000d22a01'),
  90000, 'Checking nets +90000 (deposit 120000 − rent 30000)');

-- idempotency key uses ext:qbo:<external_id>
select is(
  (select count(*)::int from journal_entries
     where org_id='00000000-0000-0000-0000-0000000d22b1' and idempotency_key = 'ext:qbo:deposit:D1'),
  1, 'deposit posted under ext:qbo:<external_id> key');

-- ── W2.2-REPULL-IDEM: re-stage the SAME pull into a NEW batch, commit → no double ─
create temp table _y2 as
select * from create_import_batch(
  '00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1',
  'qbo'::import_source, 'Migrate Co · 2025 (re-pull)', '00000000-0000-0000-0000-000000d22a01', null);
select append_import_rows('00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1',
    (select id from _y2),
    '[{"row_num":1,"txn_date":"2025-03-01","description":"Client deposit","amount_minor":120000,"account_id":"00000000-0000-0000-0000-000000d22a02","external_id":"deposit:D1","status":"ready"},
      {"row_num":2,"txn_date":"2025-04-01","description":"Rent","amount_minor":-30000,"account_id":"00000000-0000-0000-0000-000000d22a03","external_id":"purchase:P1","status":"ready"}]'::jsonb);
create temp table _y2c as
select * from commit_import_batch('00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1', (select id from _y2), 4000);

select is((select count(*)::int from journal_entries where org_id='00000000-0000-0000-0000-0000000d22b1' and source='import'), 2, 'W2.2-REPULL-IDEM: re-pull adds NO new entries');
select is((select count(*)::int from import_rows where batch_id=(select id from _y2) and status='skipped'), 2, 're-pulled rows marked skipped (duplicate), not posted');

-- ── record_provider_migration: upsert one record per connection + TB snapshot ─
create temp table _m1 as
select * from record_provider_migration(
  '00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1',
  '00000000-0000-0000-0000-000000d22c01', 'qbo'::external_provider,
  array[(select id from _y1)]::uuid[], 3, 2,
  '[{"name":"Checking","debit_minor":90000,"credit_minor":0}]'::jsonb, '2025-12-31'::date);

select is((select status::text from _m1), 'review', 'migration recorded in review status');
select is((select txn_count from _m1), 2, 'migration records txn_count');
select is((select provider_tb_as_of from _m1), '2025-12-31'::date, 'migration snapshots QBO TB as-of date');

-- re-pull upserts the SAME record (not a second row)
select record_provider_migration(
  '00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1',
  '00000000-0000-0000-0000-000000d22c01', 'qbo'::external_provider,
  array[(select id from _y1),(select id from _y2)]::uuid[], 3, 2,
  '[{"name":"Checking","debit_minor":90000,"credit_minor":0}]'::jsonb, '2025-12-31'::date);
select is((select count(*)::int from provider_migrations where connection_id='00000000-0000-0000-0000-000000d22c01'), 1, 're-pull upserts one migration record, not many');

-- ── cutover: set on a fresh pre-commit batch, then freeze on the migration ────
-- (_y1/_y2 are already committed — a committed batch's cutover is frozen.)
create temp table _y3 as
select * from create_import_batch(
  '00000000-0000-0000-0000-0000000d2201', '00000000-0000-0000-0000-0000000d22b1',
  'qbo'::import_source, 'Migrate Co · 2026 (uncommitted)', '00000000-0000-0000-0000-000000d22a01', null);
select is(
  (select cutover_date from set_import_batch_cutover(
     '00000000-0000-0000-0000-0000000d2201','00000000-0000-0000-0000-0000000d22b1',(select id from _y3),'2026-01-01'::date)),
  '2026-01-01'::date, 'set_import_batch_cutover stamps a pre-commit batch');

-- and it refuses on a committed batch (frozen). restrict_violation = SQLSTATE 23001.
-- (4-arg throws_ok(sql, errcode, errmsg, desc); a bare NULL 2nd arg is an ambiguous
--  overload that aborts the plan — use the explicit errcode form.)
select throws_ok($$
  select set_import_batch_cutover(
    '00000000-0000-0000-0000-0000000d2201','00000000-0000-0000-0000-0000000d22b1',(select id from _y1),'2026-01-01'::date)
$$, '23001', NULL, 'set_import_batch_cutover refuses a committed (frozen) batch');

select is(
  (select status::text from set_provider_migration_cutover(
     '00000000-0000-0000-0000-0000000d2201','00000000-0000-0000-0000-0000000d22b1',(select id from _m1),'2026-01-01'::date)),
  'committed', 'set_provider_migration_cutover marks the migration committed');

-- ── tenant isolation: a stranger cannot record a migration on this org ───────
select throws_ok($$
  select record_provider_migration(
    '00000000-0000-0000-0000-0000000d2202', '00000000-0000-0000-0000-0000000d22b1',
    '00000000-0000-0000-0000-000000d22c01', 'qbo'::external_provider,
    '{}'::uuid[], 0, 0, '[]'::jsonb, null)
$$, '42501', NULL, 'foreign actor cannot record a migration (forbidden)');

rollback;
