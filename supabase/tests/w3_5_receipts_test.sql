-- W3.5 · Receipt capture + match — the attach/link RPC + audit row + feed row.
-- Proves: record_receipt persists a parsed receipt (audit-logged), attach_receipt
-- links it to a ledger entry + writes ledger_audit, the "one live receipt per
-- entry" unique index holds, autoattach_receipt records a penny_activity feed row
-- (reusing the W3.2 pipeline with the new 'receipt_matched' kind), detach unlinks
-- without touching the ledger, and dismiss discards. Readers are can_access_org-
-- gated (JWT context, not exercised here); we assert the underlying table state,
-- as the W3.2 test does for penny_activity. Everything rolls back.

begin;
select plan(21);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'ownerR@test.dev', 'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000f3', 'business', 'Biz R', '00000000-0000-0000-0000-0000000000f1');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3', 'owner', 'active');
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000000f3', '1000', 'Cash',     'asset'),
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000000f3', '5100', 'Software', 'expense');

-- two posted entries: e1 (the receipt's match) + e2 (a second target for dedup).
create temp table _e1 as
select * from post_journal_entry(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3',
  '2026-05-20', 'k-r1',
  '[{"account_id":"00000000-0000-0000-0000-0000000f0002","amount_minor":4599,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-0000000f0001","amount_minor":4599,"side":"C"}]'::jsonb,
  'manual', null, 'STAPLES #44');
create temp table _e2 as
select * from post_journal_entry(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3',
  '2026-05-21', 'k-r2',
  '[{"account_id":"00000000-0000-0000-0000-0000000f0002","amount_minor":4599,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-0000000f0001","amount_minor":4599,"side":"C"}]'::jsonb,
  'manual', null, 'STAPLES #44 second');

-- ── record_receipt: persists + audit-logs ────────────────────────────────────
create temp table _r as
select * from record_receipt(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3',
  'photo', '00000000-0000-0000-0000-0000000000f3/rcpt-1.jpg',
  'Staples', -4599, '2026-05-20', null);

select is((select status from _r), 'unmatched', 'a fresh receipt starts unmatched');
select is((select vendor from _r), 'Staples', 'vendor is parsed through');
select is(
  (select count(*)::int from ledger_audit
    where org_id = '00000000-0000-0000-0000-0000000000f3'
      and action = 'receipt.capture' and target_type = 'receipt'),
  1, 'record_receipt writes a receipt.capture audit row');

-- appears in the unmatched queue (the reader is can_access_org-gated, which needs
-- a JWT context pgTAP doesn't set; assert the underlying state directly, as the
-- W3.2 test does for penny_activity).
select is(
  (select count(*)::int from receipts
    where org_id = '00000000-0000-0000-0000-0000000000f3' and status = 'unmatched'),
  1, 'the captured receipt is in the unmatched state');

-- ── attach_receipt: links to the entry + audit-logs ──────────────────────────
create temp table _a as
select * from attach_receipt(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3',
  (select id from _r), (select id from _e1), 'exact', 1.0);

select is((select status from _a), 'attached', 'attach flips status to attached');
select is((select entry_id from _a), (select id from _e1), 'receipt is linked to the entry');
select is(
  (select count(*)::int from ledger_audit
    where org_id = '00000000-0000-0000-0000-0000000000f3'
      and action = 'receipt.attach' and target_type = 'receipt'),
  1, 'attach_receipt writes a receipt.attach audit row');

-- visible ON the transaction (the row indicator's underlying state).
select is(
  (select count(*)::int from receipts
    where org_id = '00000000-0000-0000-0000-0000000000f3'
      and entry_id = (select id from _e1) and status = 'attached'),
  1, 'the receipt is linked to its transaction (visible on the row)');
select is(
  (select count(*)::int from receipts
    where org_id = '00000000-0000-0000-0000-0000000000f3' and status = 'unmatched'),
  0, 'an attached receipt leaves the unmatched state');

-- ── idempotent re-attach to the SAME entry is a no-op ────────────────────────
select lives_ok($$
  select attach_receipt(
    '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3',
    (select id from _r), (select id from _e1), 'exact', 1.0)$$,
  're-attaching to the same entry is idempotent (no error)');

-- ── one live receipt per entry — a SECOND receipt cannot take e1 ─────────────
create temp table _r2 as
select * from record_receipt(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3',
  'text', null, 'Staples', -4599, '2026-05-20', 'STAPLES total 45.99');
select throws_ok($$
  select attach_receipt(
    '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3',
    (select id from _r2), (select id from _e1), 'manual', null)$$,
  null, null, 'a second receipt cannot attach to an entry that already has one');

-- ── autoattach_receipt records a penny_activity feed row (W3.2 reuse) ────────
create temp table _fa as
select * from autoattach_receipt(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3',
  (select id from _r2), (select id from _e2), 'exact', 0.92, 'Filed your $45.99 receipt from Staples.');
select is((select kind from _fa), 'receipt_matched', 'auto-attach records a receipt_matched feed row');
select is(
  (select count(*)::int from penny_activity
    where org_id = '00000000-0000-0000-0000-0000000000f3' and kind = 'receipt_matched'),
  1, 'the receipt attach is recorded in the Penny-did-this feed');

-- ── REG-W3-F5: feed dedup/undo key off the receipt_id FK, not a summary LIKE ──
-- Audit Program 4, F5: dedup/undo used `summary like '%uuid%'` over free-text
-- copy. These assert the fix — the feed row carries a real receipt_id FK, dedup
-- is a no-op on retry keyed off it, and (the regression teeth) dedup + undo still
-- work when the summary's `[uuid]` suffix is REMOVED (the copy-change failure the
-- old LIKE could never survive).
select is(
  (select receipt_id from _fa), (select id from _r2),
  'the feed row carries the real receipt_id foreign key (not just a summary suffix)');

-- Strip the `[uuid]` suffix the old LIKE relied on — the FK path must not care.
update penny_activity
   set summary = 'Filed your receipt.'   -- no bracketed uuid anymore
 where org_id = '00000000-0000-0000-0000-0000000000f3' and kind = 'receipt_matched';

-- Dedup on retry: with the suffix gone, a second autoattach for the SAME receipt
-- must still be a no-op (one feed row). Under the old LIKE this created a duplicate.
select lives_ok($$
  select autoattach_receipt(
    '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3',
    (select id from _r2), (select id from _e2), 'exact', 0.92, 'Filed again.')$$,
  're-autoattach for the same receipt does not error (idempotent)');
select is(
  (select count(*)::int from penny_activity
    where org_id = '00000000-0000-0000-0000-0000000000f3'
      and kind = 'receipt_matched' and receipt_id = (select id from _r2)),
  1, 'dedup keyed off receipt_id yields exactly one feed row even with the suffix stripped');

-- Undo: detach the auto-attached receipt; its feed row must be marked undone via
-- the FK even though the summary no longer contains the uuid.
select detach_receipt(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3', (select id from _r2));
select is(
  (select count(*)::int from penny_activity
    where org_id = '00000000-0000-0000-0000-0000000000f3'
      and receipt_id = (select id from _r2) and undone_at is not null),
  1, 'detach marks the feed row undone via receipt_id (survives a copy change)');
select is(
  (select status from receipts where id = (select id from _r2)),
  'unmatched', 'the auto-attached receipt returns to the unmatched queue on detach');

-- ── detach unlinks WITHOUT touching the ledger entry ─────────────────────────
create temp table _tb_before as
  SELECT coalesce(sum(case when side='D' then amount_minor else -amount_minor end),0) AS net
    FROM journal_lines WHERE org_id = '00000000-0000-0000-0000-0000000000f3';
select detach_receipt(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3', (select id from _r));
select is(
  (select status from receipts where id = (select id from _r)),
  'unmatched', 'detach returns the receipt to the unmatched queue');
select is(
  (select coalesce(sum(case when side='D' then amount_minor else -amount_minor end),0)
     from journal_lines where org_id = '00000000-0000-0000-0000-0000000000f3'),
  (select net from _tb_before),
  'detach does NOT touch the ledger — the trial balance is unchanged');

-- ── dismiss discards an unmatched receipt ────────────────────────────────────
select dismiss_receipt(
  '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f3', (select id from _r));
select is(
  (select status from receipts where id = (select id from _r)),
  'dismissed', 'dismiss discards an unmatched receipt');

select * from finish();
rollback;
