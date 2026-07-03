-- W4.1 · E-commerce payout splitting gate.
-- Exercises post_ecommerce_payout / reverse_ecommerce_payout / resolve_commerce_accounts:
--   split into component lines · ties to the cent · idempotent re-import (no
--   double-post) · reconcile guard rejects a mismatched split · unknown provider
--   rejected · reversal-based correction · authorization (read_only cannot post).
--
-- Run locally: `supabase test db`. SECURITY DEFINER fns take an explicit p_actor,
-- so the (superuser) test role calls them directly with each actor passed in.

begin;
select plan(16);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000e0001', 'ecomOwner@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e0002', 'ecomCpaRO@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000e00b1', 'business', 'Ecom Biz', '00000000-0000-0000-0000-0000000e0001'),
  ('00000000-0000-0000-0000-0000000e00f1', 'firm',     'RO Firm',  '00000000-0000-0000-0000-0000000e0002');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e00b1', 'owner',      'active'),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000e00f1', 'firm_admin', 'active');

-- RO firm engages the biz read_only (may NOT post)
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-0000000e00e1', '00000000-0000-0000-0000-0000000e00f1',
   '00000000-0000-0000-0000-0000000e00b1', 'active', 'read_only', '00000000-0000-0000-0000-0000000e0002');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000e00b1', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

-- bank account the net deposit lands in
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000e0c01', '00000000-0000-0000-0000-0000000e00b1', '1000', 'Cash', 'asset');

-- ── connector-registry rows are seeded by the migration ──────────────────────
select ok(exists(select 1 from connectors where key = 'stripe'  and category = 'commerce'), 'stripe connector registered');
select ok(exists(select 1 from connectors where key = 'shopify' and category = 'commerce'), 'shopify connector registered');
select is((select status from connectors where key = 'paypal'), 'planned', 'paypal registered as planned');

-- ── 1. post a Stripe payout: gross 8000, fees 292, refunds 1000 → net 6708 ────
create temp table _p1 as
select * from post_ecommerce_payout(
  p_actor => '00000000-0000-0000-0000-0000000e0001',
  p_org   => '00000000-0000-0000-0000-0000000e00b1',
  p_provider => 'stripe',
  p_payout_id => 'po_test_1',
  p_payout_date => '2026-07-03',
  p_bank_account => '00000000-0000-0000-0000-0000000e0c01',
  p_gross_minor => 8000,
  p_fees_minor => 292,
  p_refunds_minor => 1000,
  p_adjust_minor => 0,
  p_net_minor => 6708,
  p_memo => 'Stripe payout po_test_1');

select ok((select id from _p1) is not null, 'stripe payout posts an entry');

-- component lines exist: sales (C 8000), fees (D 292), refunds (D 1000), bank (D 6708)
select is(
  (select amount_minor from journal_lines
     where entry_id = (select id from _p1)
       and side = 'C'
       and account_id = (select id from ledger_accounts where org_id='00000000-0000-0000-0000-0000000e00b1' and code='4000')),
  8000::bigint, 'gross sales credited to revenue (4000)');

select is(
  (select amount_minor from journal_lines
     where entry_id = (select id from _p1)
       and account_id = (select id from ledger_accounts where org_id='00000000-0000-0000-0000-0000000e00b1' and code='5200')),
  292::bigint, 'processing fees debited to fee expense (5200)');

select is(
  (select amount_minor from journal_lines
     where entry_id = (select id from _p1)
       and account_id = (select id from ledger_accounts where org_id='00000000-0000-0000-0000-0000000e00b1' and code='4900')),
  1000::bigint, 'refunds debited to refunds/returns (4900)');

select is(
  (select amount_minor from journal_lines
     where entry_id = (select id from _p1)
       and account_id = '00000000-0000-0000-0000-0000000e0c01' and side = 'D'),
  6708::bigint, 'net deposit debited to the bank');

-- ── 2. ties to the cent: Σ debits = Σ credits ────────────────────────────────
select is(
  (select sum(amount_minor) filter (where side='D') from journal_lines where entry_id = (select id from _p1)),
  (select sum(amount_minor) filter (where side='C') from journal_lines where entry_id = (select id from _p1)),
  'payout entry ties to the cent (debits = credits)');

-- ── 3. idempotent re-import: same payout id returns the SAME entry, no dupe ───
create temp table _p1b as
select * from post_ecommerce_payout(
  '00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e00b1',
  'stripe', 'po_test_1', '2026-07-03', '00000000-0000-0000-0000-0000000e0c01',
  8000, 292, 1000, 0, 6708, null, null);
select is((select id from _p1b), (select id from _p1), 'idempotent re-import returns the original entry');
select is(
  (select count(*) from journal_entries
     where org_id='00000000-0000-0000-0000-0000000e00b1' and idempotency_key='ext:stripe:payout:po_test_1'),
  1::bigint, 're-import did NOT double-post (one entry only)');

-- ── 4. reconcile guard: a split that does not tie to the reported net is rejected ─
select throws_ok(
  $$ select post_ecommerce_payout(
       '00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e00b1',
       'stripe', 'po_bad', '2026-07-03', '00000000-0000-0000-0000-0000000e0c01',
       5000, 0, 0, 0, 4999, null, null) $$,
  'P0001', NULL, 'a payout that does not reconcile is rejected (never plugged)');

-- ── 5. unknown provider rejected ─────────────────────────────────────────────
select throws_ok(
  $$ select post_ecommerce_payout(
       '00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e00b1',
       'wompwomp', 'po_x', '2026-07-03', '00000000-0000-0000-0000-0000000e0c01',
       100, 0, 0, 0, 100, null, null) $$,
  '23503', NULL, 'unknown provider rejected');

-- ── 6. correction via the reversal path (never edits posted lines) ───────────
create temp table _rev as
select * from reverse_ecommerce_payout(
  '00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e00b1',
  'stripe', 'po_test_1', '2026-07-04', 'restated');
select is(
  (select status from journal_entries where id = (select id from _p1)),
  'reversed', 'original payout entry is marked reversed after correction');
select ok(
  (select reverses_id from journal_entries where id = (select id from _rev)) = (select id from _p1),
  'reversal references the original payout entry');

-- ── 7. authorization: a read_only CPA cannot post a payout ───────────────────
select throws_ok(
  $$ select post_ecommerce_payout(
       '00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000e00b1',
       'shopify', 'po_ro', '2026-07-03', '00000000-0000-0000-0000-0000000e0c01',
       100, 0, 0, 0, 100, null, null) $$,
  '42501', NULL, 'read_only actor may not post a payout (forbidden)');

select * from finish();
rollback;
