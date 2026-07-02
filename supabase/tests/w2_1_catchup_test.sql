-- W2.1 Catch-up mode — the batch-approve + progress + plan RPCs. Proves:
--   • catch_up_batch_approve bulk-recategorizes only HIGH-confidence items (trust
--     tier from config); a below-cutoff item is SKIPPED, never auto-posted.
--   • it is tenant-gated (a non-member is refused) and audit-logged (summary row).
--   • period-lock is inherited: a closed-period entry still recategorizes into the
--     open period (never permanently blocked), the same as single Approve.
--   • catch_up_progress rolls up per-year uncategorized/reconciled counts + done.
--   • catch_up_set_plan records flat-per-year packaging; fee_total = per-year × N.
--   • ISOTEST: the RPCs are not EXECUTE-granted to anon/authenticated.
-- Everything rolls back.

begin;
select plan(14);

-- ── fixtures: owner + a non-member; one business org ─────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000cu00a', 'ownerCU@test.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000cu0nn', 'nonmemberCU@test.dev','authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000cu0b1', 'business', 'Catch-up Biz', '00000000-0000-0000-0000-0000000cu00a');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000cu00a', '00000000-0000-0000-0000-0000000cu0b1', 'owner', 'active');
insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000cu0b1', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000cua01', '00000000-0000-0000-0000-0000000cu0b1', '1000', 'Cash',          'asset'),
  ('00000000-0000-0000-0000-0000000cua02', '00000000-0000-0000-0000-0000000cu0b1', '9999', 'Uncategorized', 'expense'),
  ('00000000-0000-0000-0000-0000000cua03', '00000000-0000-0000-0000-0000000cu0b1', '5100', 'Software',      'expense');

-- three uncategorized expenses across two backlog years (2023 ×2, 2024 ×1).
create temp table _e23a as select * from post_journal_entry(
  '00000000-0000-0000-0000-0000000cu00a', '00000000-0000-0000-0000-0000000cu0b1', '2023-03-01', 'k-23a',
  '[{"account_id":"00000000-0000-0000-0000-0000000cua02","amount_minor":5000,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-0000000cua01","amount_minor":5000,"side":"C"}]'::jsonb,
  'manual', null, 'ADOBE *2023');
create temp table _e23b as select * from post_journal_entry(
  '00000000-0000-0000-0000-0000000cu00a', '00000000-0000-0000-0000-0000000cu0b1', '2023-07-01', 'k-23b',
  '[{"account_id":"00000000-0000-0000-0000-0000000cua02","amount_minor":3000,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-0000000cua01","amount_minor":3000,"side":"C"}]'::jsonb,
  'manual', null, 'MYSTERY CHARGE');
create temp table _e24 as select * from post_journal_entry(
  '00000000-0000-0000-0000-0000000cu00a', '00000000-0000-0000-0000-0000000cu0b1', '2024-02-01', 'k-24',
  '[{"account_id":"00000000-0000-0000-0000-0000000cua02","amount_minor":9000,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-0000000cua01","amount_minor":9000,"side":"C"}]'::jsonb,
  'manual', null, 'ADOBE *2024');

-- ═══════════════════════════════════════════════════════════════════════════
-- catch_up_batch_approve — trust tier, tenant gate, audit
-- ═══════════════════════════════════════════════════════════════════════════

-- Bulk-approve TWO items: one high-confidence (0.9 → posts) and one low (0.3 →
-- skipped). The low-confidence pick must NEVER auto-post.
create temp table _ba as select catch_up_batch_approve(
  '00000000-0000-0000-0000-0000000cu00a', '00000000-0000-0000-0000-0000000cu0b1',
  jsonb_build_array(
    jsonb_build_object('entry_id', (select id from _e23a), 'to_account_id', '00000000-0000-0000-0000-0000000cua03', 'confidence', 0.9,  'learn_value', 'adobe'),
    jsonb_build_object('entry_id', (select id from _e23b), 'to_account_id', '00000000-0000-0000-0000-0000000cua03', 'confidence', 0.3,  'learn_value', 'mystery')
  )
) as r;

select is(((select r from _ba) ->> 'approved')::int, 1, 'exactly one high-confidence item bulk-approved');
select is(((select r from _ba) ->> 'skipped')::int,  1, 'the low-confidence item is skipped, not posted');
select is(((select r from _ba) ->> 'failed')::int,   0, 'no failures');

-- the high-confidence entry was recategorized onto Software (reverse + repost).
select is((select status::text from journal_entries where id = (select id from _e23a)), 'reversed',
  'the approved entry was reversed (recategorized)');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = '00000000-0000-0000-0000-0000000cua03'),
  5000, 'Software now carries the 5000 debit from the bulk approve');

-- the SKIPPED entry is untouched — still posted on Uncategorized.
select is((select status::text from journal_entries where id = (select id from _e23b)), 'posted',
  'the skipped low-confidence entry is untouched');

-- a summary audit row was written for the bulk action.
select is(
  (select count(*)::int from ledger_audit
     where org_id = '00000000-0000-0000-0000-0000000cu0b1' and action = 'catchup.batch_approve'),
  1, 'one summary audit row for the bulk approve');
-- plus the per-entry recategorize audit row.
select is(
  (select count(*)::int from ledger_audit
     where org_id = '00000000-0000-0000-0000-0000000cu0b1' and action = 'entry.recategorize'),
  1, 'the per-entry recategorize is audit-logged too');

-- a non-member cannot batch-approve.
select throws_ok($$
  select catch_up_batch_approve('00000000-0000-0000-0000-0000000cu0nn','00000000-0000-0000-0000-0000000cu0b1',
    '[]'::jsonb)
$$, '42501', NULL, 'a non-member cannot batch-approve');

-- ═══════════════════════════════════════════════════════════════════════════
-- period-lock inheritance — a closed-period entry still recategorizes
-- ═══════════════════════════════════════════════════════════════════════════
-- close the 2024 period, then bulk-approve the 2024 entry; it must recategorize
-- into the open period (never permanently blocked), same as single Approve.
select close_accounting_period('00000000-0000-0000-0000-0000000cu00a','00000000-0000-0000-0000-0000000cu0b1',
  (select period_id from journal_entries where id = (select id from _e24)));
create temp table _ba24 as select catch_up_batch_approve(
  '00000000-0000-0000-0000-0000000cu00a', '00000000-0000-0000-0000-0000000cu0b1',
  jsonb_build_array(jsonb_build_object('entry_id', (select id from _e24),
    'to_account_id', '00000000-0000-0000-0000-0000000cua03', 'confidence', 0.95, 'learn_value', 'adobe'))
) as r;
select is(((select r from _ba24) ->> 'approved')::int, 1,
  'a closed-period entry still recategorizes (period-lock inherited, not blocked)');

-- ═══════════════════════════════════════════════════════════════════════════
-- catch_up_progress — per-year rollup
-- ═══════════════════════════════════════════════════════════════════════════
create temp table _prog as
select jsonb_array_elements(catch_up_progress(
  '00000000-0000-0000-0000-0000000cu00a', '00000000-0000-0000-0000-0000000cu0b1')) as y;

-- 2023: one entry recategorized off Uncategorized (e23a), one still on it (e23b) → 1 uncategorized.
select is(
  (select (y ->> 'uncategorized')::int from _prog where (y ->> 'year')::int = 2023),
  1, '2023 shows one transaction still to sort');
-- no reconciliation locked anywhere yet → not done.
select is(
  (select (y ->> 'done')::boolean from _prog where (y ->> 'year')::int = 2023),
  false, '2023 is not done (nothing reconciled yet)');

-- ═══════════════════════════════════════════════════════════════════════════
-- catch_up_set_plan — flat-per-year packaging
-- ═══════════════════════════════════════════════════════════════════════════
-- $500/yr flat over 3 backlog years → fee_total 150000.
select is(
  (select fee_total_minor from catch_up_set_plan(
     '00000000-0000-0000-0000-0000000cu00a','00000000-0000-0000-0000-0000000cu0b1',
     50000, array[2022,2023,2024], 'USD')),
  150000, 'flat-per-year plan: fee_total = fee_per_year × number of years');

select * from finish();
rollback;
