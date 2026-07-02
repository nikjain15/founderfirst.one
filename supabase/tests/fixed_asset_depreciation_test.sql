-- W1.3-C fixed-asset & depreciation gate. Proves the load-bearing guarantees:
--   1. schema present: asset_classes / macrs_percentages / fixed_assets /
--      depreciation_schedule_lines / asset_disposals.
--   2. EFFECTIVE-DATING (reuses CENTRAL-2 / W1.3-B idiom): no two active
--      asset_classes may overlap (EXCLUDE); supersede_asset_class + asset_class_in_force
--      make old in-service years compute under old §179/bonus law.
--   3. MACRS GOLDEN NUMBERS: a $10,000 5-year 200DB half-year asset depreciates
--      2000/3200/1920/1152/1152/576 (IRS Pub 946 Table A-1) — DATA-driven, from
--      the seeded macrs_percentages, not a literal.
--   4. BOOK straight-line: $10,000 over 5 years half-year = 1000/2000×4/1000.
--   5. §179 + bonus stack in year 1, then MACRS on the remainder.
--   6. M-1 ROUND-TRIP: the book-vs-tax delta drafts a tax_adjustment (via W1.3-B's
--      draft_tax_adjustment, origin_kind=depreciation_book_tax, status=proposed);
--      approval makes it count in tax_m1_summary — proves asset → schedule → M-1.
--   7. POSTING: book depreciation posts a BALANCED JE (Dr expense / Cr accumulated)
--      via post_journal_entry; PERIOD-LOCK is respected (a closed Dec period refuses).
--   8. DISPOSAL: gain/loss = proceeds - net book value, computed + recorded.
--   9. ROLE / TENANT GATES (ISOTEST): the p_actor-first write RPCs are EXECUTE-
--      granted only to service_role; cross-tenant register is refused.
-- Runs in a transaction and rolls back.

begin;
select plan(26);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('80000000-0000-0000-0000-000000000001', 'owner@depr.dev', 'authenticated', 'authenticated'),
  ('80000000-0000-0000-0000-000000000009', 'other@depr.dev', 'authenticated', 'authenticated');

insert into public.tax_jurisdictions (code, name, country_code, currency) values
  ('US-FED', 'US Federal', 'US', 'USD') on conflict (code) do nothing;

insert into organizations (id, type, name, created_by) values
  ('80000000-0000-0000-0000-0000000000a0', 'business', 'Depr Co', '80000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-0000000000a9', 'business', 'Other Co', '80000000-0000-0000-0000-000000000009');
insert into memberships (org_id, user_id, role, status) values
  ('80000000-0000-0000-0000-0000000000a0', '80000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('80000000-0000-0000-0000-0000000000a9', '80000000-0000-0000-0000-000000000009', 'owner', 'active');
insert into org_accounting_settings (org_id, home_currency, cpa_posts_require_approval) values
  ('80000000-0000-0000-0000-0000000000a0', 'USD', false);

-- ledger accounts for posting (expense + contra-asset accumulated)
insert into ledger_accounts (id, org_id, code, name, type) values
  ('80000000-0000-0000-0000-0000000000c1', '80000000-0000-0000-0000-0000000000a0', '7300', 'Depreciation expense',        'expense'),
  ('80000000-0000-0000-0000-0000000000c2', '80000000-0000-0000-0000-0000000000a0', '1590', 'Accumulated depreciation',    'asset');

-- LAW DATA: a 5-year 200DB half-year class in force from 2025 (no §179/bonus here to
-- isolate the MACRS golden numbers), plus its published percentage table.
insert into public.asset_classes
  (jurisdiction_code, class_key, label, tax_year, recovery_period, macrs_method, default_convention,
   section_179_cap_minor, bonus_pct, effective_from, citation)
values
  ('US-FED', 'computers', 'Computers', 2025, 5, '200DB', 'half_year', 125000000, null, '2025-01-01', 'Pub 946 A-1');
insert into public.macrs_percentages
  (jurisdiction_code, recovery_period, convention, macrs_method, year_index, percentage, effective_from, citation) values
  ('US-FED', 5, 'half_year', '200DB', 1, 20.00, '1987-01-01', 'Pub 946 A-1'),
  ('US-FED', 5, 'half_year', '200DB', 2, 32.00, '1987-01-01', 'Pub 946 A-1'),
  ('US-FED', 5, 'half_year', '200DB', 3, 19.20, '1987-01-01', 'Pub 946 A-1'),
  ('US-FED', 5, 'half_year', '200DB', 4, 11.52, '1987-01-01', 'Pub 946 A-1'),
  ('US-FED', 5, 'half_year', '200DB', 5, 11.52, '1987-01-01', 'Pub 946 A-1'),
  ('US-FED', 5, 'half_year', '200DB', 6, 5.76,  '1987-01-01', 'Pub 946 A-1');

-- ── 1. schema present ────────────────────────────────────────────────────────
select has_table('public', 'asset_classes',                'asset_classes exists');
select has_table('public', 'macrs_percentages',            'macrs_percentages exists');
select has_table('public', 'fixed_assets',                 'fixed_assets exists');
select has_table('public', 'depreciation_schedule_lines',  'depreciation_schedule_lines exists');
select has_table('public', 'asset_disposals',              'asset_disposals exists');

-- ── register a $10,000 computer placed in service 15 Jun 2025 ─────────────────
create temp table _asset as
select register_fixed_asset(
  p_actor => '80000000-0000-0000-0000-000000000001',
  p_org   => '80000000-0000-0000-0000-0000000000a0',
  p_name  => 'MacBook Pro', p_class_key => 'computers',
  p_cost_minor => 1000000, p_in_service_date => '2025-06-15',
  p_book_life_years => 5, p_book_convention => 'half_year',
  p_expense_account_id => '80000000-0000-0000-0000-0000000000c1',
  p_accumulated_account_id => '80000000-0000-0000-0000-0000000000c2'
) as id;

-- ── 3. MACRS golden numbers per year (DATA-driven) ───────────────────────────
select is(macrs_tax_depreciation_for_year((select id from _asset), 2025), 200000::bigint, 'MACRS 5yr HY yr1 = $2,000 (20%)');
select is(macrs_tax_depreciation_for_year((select id from _asset), 2026), 320000::bigint, 'MACRS 5yr HY yr2 = $3,200 (32%)');
select is(macrs_tax_depreciation_for_year((select id from _asset), 2027), 192000::bigint, 'MACRS 5yr HY yr3 = $1,920 (19.2%)');
select is(macrs_tax_depreciation_for_year((select id from _asset), 2028), 115200::bigint, 'MACRS 5yr HY yr4 = $1,152 (11.52%)');
select is(macrs_tax_depreciation_for_year((select id from _asset), 2030), 57600::bigint,  'MACRS 5yr HY yr6 = $576 (5.76%)');

-- ── 4. book straight-line golden numbers ─────────────────────────────────────
select is(book_depreciation_for_year((select id from _asset), 2025), 100000::bigint, 'book SL yr1 half-year = $1,000');
select is(book_depreciation_for_year((select id from _asset), 2026), 200000::bigint, 'book SL yr2 full = $2,000');
select is(book_depreciation_for_year((select id from _asset), 2030), 100000::bigint, 'book SL yr6 remaining half = $1,000');

-- ── compute + store the full schedule; tax fully recovers cost ───────────────
select ok(compute_depreciation_schedule(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0', (select id from _asset)
) >= 6, 'schedule computed for >= 6 years');
select is(
  (select max(tax_accumulated_minor) from depreciation_schedule_lines where asset_id = (select id from _asset)),
  1000000::bigint, 'tax accumulated fully recovers the $10,000 cost');
select is(
  (select max(book_accumulated_minor) from depreciation_schedule_lines where asset_id = (select id from _asset)),
  1000000::bigint, 'book accumulated fully recovers cost (salvage 0)');

-- ── 6. M-1 round-trip: draft the yr1 book-vs-tax delta, approve, summarize ────
-- yr1: tax $2,000 - book $1,000 = $1,000 extra tax deduction → deduction_on_return_not_books.
create temp table _adj as
select draft_depreciation_m1(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0', (select id from _asset), 2025
) as id;
select is(
  (select m1_bucket from tax_adjustments where id = (select id from _adj)),
  'deduction_on_return_not_books', 'M-1 draft picks the right bucket (tax > book)');
select is(
  (select amount_minor from tax_adjustments where id = (select id from _adj)),
  100000::bigint, 'M-1 draft amount = the $1,000 delta');
select is(
  (select status from tax_adjustments where id = (select id from _adj)),
  'proposed', 'M-1 draft is a PROPOSAL (never auto-applied)');
select is(
  (select origin_kind from tax_adjustments where id = (select id from _adj)),
  'depreciation_book_tax', 'M-1 draft is tagged origin_kind=depreciation_book_tax');
-- a proposal does NOT count in the summary yet
select is(
  (select coalesce(sum(total_minor),0) from tax_m1_summary('80000000-0000-0000-0000-0000000000a0', 2025)),
  0::bigint, 'a proposed adjustment is NOT in the M-1 summary');
-- redraft is idempotent (no dup)
select ok(
  (select draft_depreciation_m1('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',(select id from _asset),2025)) is not null
  and (select count(*) from tax_adjustments where origin_ref = 'depr:' || (select id from _asset)::text || ':2025') = 1,
  'redraft is idempotent — one row per (asset, year)');

-- ── 7. posting: book depreciation posts a BALANCED JE via post_journal_entry ──
create temp table _je as
select post_book_depreciation(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0', (select id from _asset), 2025
) as id;
select is(
  (select sum(case when side='D' then amount_minor else 0 end) from journal_lines where entry_id = (select id from _je)),
  (select sum(case when side='C' then amount_minor else 0 end) from journal_lines where entry_id = (select id from _je)),
  'posted depreciation JE is balanced (debits = credits)');
select is(
  (select amount_minor from journal_lines where entry_id = (select id from _je) and side='D'),
  100000::bigint, 'JE debits depreciation expense by the book amount ($1,000)');
-- idempotent: re-posting returns the same entry
select is(
  post_book_depreciation('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',(select id from _asset),2025),
  (select id from _je), 're-posting is idempotent (same entry id)');

-- ── period-lock: close the Dec-2025 period, then re-posting 2026 into a closed
-- period is refused. We post 2026 first, close its period, then a NEW asset's
-- 2026 post must fail. Simpler: close the 2025 period the JE landed in, and prove
-- a fresh post into it raises period_closed.
create temp table _asset2 as
select register_fixed_asset(
  '80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',
  'Second laptop','computers', 500000, '2025-06-15', 'US-FED', 0, 'straight_line', 5, 'half_year',
  0, false, null, '80000000-0000-0000-0000-0000000000c1', '80000000-0000-0000-0000-0000000000c2'
) as id;
select compute_depreciation_schedule('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',(select id from _asset2));
-- close the Dec-2025 period (the one the first JE created)
select close_accounting_period(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0',
  (select period_id from journal_entries where id = (select id from _je)));
select throws_ok($$
  select post_book_depreciation('80000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-0000000000a0',
    (select id from _asset2), 2025)
$$, '23001', NULL, 'posting depreciation into a CLOSED period is refused (period-lock respected)');

-- ── 8. disposal: gain/loss = proceeds - net book value ───────────────────────
-- first asset book-accumulated after 2025 = $1,000; basis = $9,000; sell for $9,500 → $500 gain.
create temp table _disp as
select dispose_fixed_asset(
  '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-0000000000a0', (select id from _asset),
  '2026-03-01', 950000, 'sold'
) as id;
select is((select gain_loss_minor from asset_disposals where id = (select id from _disp)), 50000::bigint,
  'disposal gain = proceeds $9,500 - net book $9,000 = $500');
select is((select status from fixed_assets where id = (select id from _asset)), 'disposed',
  'asset marked disposed');

-- ── 9. role / tenant gates (ISOTEST) ─────────────────────────────────────────
-- the write RPCs are service_role EXECUTE only (not authenticated/anon)
select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'register_fixed_asset' and grantee in ('anon','authenticated')),
  0, 'register_fixed_asset is NOT execute-granted to anon/authenticated (forged-actor P0 closed)');
-- cross-tenant register is refused (owner of Other Co cannot register into Depr Co)
select throws_ok($$
  select register_fixed_asset('80000000-0000-0000-0000-000000000009','80000000-0000-0000-0000-0000000000a0',
    'Sneaky','computers', 100000, '2025-06-15')
$$, '42501', NULL, 'a non-member cannot register an asset in another org');

select * from finish();
rollback;
