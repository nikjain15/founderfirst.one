-- Phase 4 categorization, brick 2 gate (ARCHITECTURE.md §6). The Uncategorized
-- holding account + the propose/approve read side: resolve is idempotent, an
-- import's null-contra row lands on the holding account (instead of being
-- skipped), list_uncategorized_entries surfaces it under the caller's JWT, and an
-- approved (recategorized) entry drops off the list. Everything rolls back.

begin;
select plan(12);

-- ── fixtures (note: Uncategorized is NOT pre-created — resolve must mint it) ──
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerA@test.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a9', 'stranger@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz A', '00000000-0000-0000-0000-00000000000a');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values ('00000000-0000-0000-0000-0000000000b1', 'USD') on conflict (org_id) do update set home_currency = excluded.home_currency;

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', '1000', 'Checking', 'asset'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000b1', '5100', 'Software', 'expense');

-- ── 1. resolve mints the holding account, idempotently ──────────────────────
create temp table _u as
select resolve_uncategorized_account('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1') as id;

select is(
  (select code from ledger_accounts where id = (select id from _u)),
  '9999', 'resolve_uncategorized_account mints a 9999 holding account');
select is(
  resolve_uncategorized_account('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1'),
  (select id from _u), 'resolve is idempotent — same account on a second call');

-- ── 2. an uncategorized entry shows up in the list (under the owner JWT) ─────
create temp table _orig as
select * from post_journal_entry(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '2026-02-01', 'k-orig',
  jsonb_build_array(
    jsonb_build_object('account_id',(select id from _u),'amount_minor',5000,'side','D'),
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000c001','amount_minor',5000,'side','C')),
  'import', 'batch:x', 'ADOBE *123');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  (select count(*)::int from list_uncategorized_entries('00000000-0000-0000-0000-0000000000b1')),
  1, 'list returns the one uncategorized entry');
select is(
  (select from_account_id from list_uncategorized_entries('00000000-0000-0000-0000-0000000000b1') limit 1),
  (select id from _u), 'listed entry points at the holding account');
select is(
  (select memo from list_uncategorized_entries('00000000-0000-0000-0000-0000000000b1') limit 1),
  'ADOBE *123', 'list carries the entry memo for Penny to read');

-- ── 3. approve (recategorize) → entry drops off the list ────────────────────
create temp table _rc as
select * from recategorize_entry(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  (select id from _orig), (select id from _u), '00000000-0000-0000-0000-00000000c003',
  'k-rc', true, 'adobe', 'description_contains'::cat_match_type);

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  (select count(*)::int from list_uncategorized_entries('00000000-0000-0000-0000-0000000000b1')),
  0, 'after approve the entry is gone (reversed original + reversal both excluded)');

-- ── 4. the holding account nets to zero once cleared ────────────────────────
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = (select id from _u)),
  0, 'Uncategorized nets to zero after recategorize');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = '00000000-0000-0000-0000-00000000c003'),
  5000, 'Software now carries the 5000 debit');

-- ── 5. non-member JWT cannot read the list ──────────────────────────────────
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000a9","role":"authenticated"}';
select throws_ok($$ select * from list_uncategorized_entries('00000000-0000-0000-0000-0000000000b1') $$,
  '42501', NULL, 'a non-member cannot list uncategorized entries');

-- ── 6. commit_import_batch lands a null-contra row on the holding account ────
create temp table _b as
select id from create_import_batch(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  'csv'::import_source, 'test.csv', '00000000-0000-0000-0000-00000000c001', null);

select add_import_rows('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',
  (select id from _b),
  jsonb_build_array(
    jsonb_build_object('row_num',1,'txn_date','2026-03-01','description','UNKNOWN VENDOR',
                       'amount_minor',-2500,'account_id',null,'status','ready'),
    jsonb_build_object('row_num',2,'txn_date','2026-03-02','description','NO AMOUNT',
                       'amount_minor',0,'account_id',null,'status','ready')));

select commit_import_batch('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',(select id from _b));

select is(
  (select status from import_rows where batch_id = (select id from _b) and row_num = 1),
  'posted', 'a null-contra row now posts (no longer skipped)');
select is(
  (select status from import_rows where batch_id = (select id from _b) and row_num = 2),
  'error', 'a zero-amount row still errors');
select is(
  (select count(*)::int from journal_lines jl
     join journal_entries je on je.id = jl.entry_id
    where je.source = 'import' and je.source_ref = (select id from _b)::text
      and jl.account_id = (select id from _u)),
  1, 'the posted import row lands its contra on the Uncategorized account');

select * from finish();
rollback;
