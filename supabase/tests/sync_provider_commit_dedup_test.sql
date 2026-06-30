-- [stress:sync] QBO/Xero import → commit path (migration 20260630161500).
--   F0: a provider batch (source 'qbo'/'xero', bank_account_id set, cutover null,
--       rows with signed amount + contra, no `side`) commits through the BANK branch
--       — it used to fall into the opening-balance branch and raise no_cutover_date.
--   F1: a provider txn carries import_rows.external_id; the ledger idempotency key is
--       'ext:<source>:<external_id>', so a re-pull (new batch, same txn) re-committed
--       does NOT double-post. CSV rows (no external_id) keep the per-row key.
-- Same harness as phase3_import_test.sql: SECURITY DEFINER fns take an explicit
-- p_actor; everything rolls back.

begin;
select plan(11);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerSync@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz Sync', '00000000-0000-0000-0000-00000000000a');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'USD');

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', '1000', 'Cash',  'asset'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000b1', '5000', 'Rent',  'expense');

-- the new provenance column exists (migration 20260630161500)
select has_column('import_rows', 'external_id', 'import_rows.external_id exists');

-- ── F0: a QBO batch commits via the bank branch (was: no_cutover_date) ─────────
create temp table _q1 as
select * from create_import_batch(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  'qbo'::import_source, 'QuickBooks', '00000000-0000-0000-0000-00000000c001', null);  -- cutover NULL

select is(
  add_import_rows('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
    (select id from _q1),
    '[{"row_num":1,"txn_date":"2026-03-01","description":"SaaS","amount_minor":-4500,"account_id":"00000000-0000-0000-0000-00000000c003","status":"ready","external_id":"QBO-TXN-1"}]'::jsonb),
  1, 'one QBO row staged with external_id');

select is((select status::text from commit_import_batch(
  '00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _q1))),
  'committed', 'F0: QBO batch commits (bank branch, not no_cutover_date)');

select is((select count(*)::int from journal_entries
  where org_id='00000000-0000-0000-0000-0000000000b1' and source='import'),
  1, 'F0: one journal entry posted from the QBO row');

select is((select idempotency_key from journal_entries
  where org_id='00000000-0000-0000-0000-0000000000b1' and source='import' order by created_at limit 1),
  'ext:qbo:QBO-TXN-1', 'F1: provider entry keyed on ext:<source>:<external_id>');

-- ── F1: a SECOND pull of the SAME txn (new batch) does NOT double-post ─────────
create temp table _q2 as
select * from create_import_batch(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  'qbo'::import_source, 'QuickBooks', '00000000-0000-0000-0000-00000000c001', null);

select add_import_rows('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',
  (select id from _q2),
  '[{"row_num":1,"txn_date":"2026-03-01","description":"SaaS","amount_minor":-4500,"account_id":"00000000-0000-0000-0000-00000000c003","status":"ready","external_id":"QBO-TXN-1"},
    {"row_num":2,"txn_date":"2026-03-05","description":"Hosting","amount_minor":-9900,"account_id":"00000000-0000-0000-0000-00000000c003","status":"ready","external_id":"QBO-TXN-2"}]'::jsonb);

select is((select status::text from commit_import_batch(
  '00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _q2))),
  'committed', 'second QBO batch commits');

-- TXN-1 was already posted → only TXN-2 is new ⇒ 2 entries total, not 3
select is((select count(*)::int from journal_entries
  where org_id='00000000-0000-0000-0000-0000000000b1' and source='import'),
  2, 'F1: re-pulled txn did NOT double-post (TXN-1 once, TXN-2 once)');

-- the duplicate row points at the SAME entry as the first pull
select is(
  (select count(distinct journal_entry_id)::int from import_rows
   where external_id='QBO-TXN-1' and status='posted'),
  1, 'F1: both stagings of TXN-1 resolve to one journal entry');

-- ── back-compat: a provider row with NO external_id keeps the per-row key ──────
create temp table _q3 as
select * from create_import_batch(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  'xero'::import_source, 'Xero', '00000000-0000-0000-0000-00000000c001', null);
select add_import_rows('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',
  (select id from _q3),
  '[{"row_num":1,"txn_date":"2026-03-09","description":"No-ext","amount_minor":-1000,"account_id":"00000000-0000-0000-0000-00000000c003","status":"ready"}]'::jsonb);
select is((select status::text from commit_import_batch(
  '00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _q3))),
  'committed', 'F0: Xero batch (no external_id) also commits via bank branch');
select like(
  (select idempotency_key from journal_entries
   where org_id='00000000-0000-0000-0000-0000000000b1' and memo='No-ext'),
  'import:%', 'rows without external_id keep the per-row idempotency key');

select * from finish();
rollback;
