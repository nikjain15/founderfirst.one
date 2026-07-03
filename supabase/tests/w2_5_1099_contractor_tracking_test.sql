-- W2.5 · 1099 contractor tracking (vendor entity · payment methods · NEC summary).
-- REG scenario ids: W2.5-VENDOR, W2.5-TAG, W2.5-THRESHOLD-LAW, W2.5-CARD-EXCLUDE,
--                   W2.5-SUMMARY, W2.5-REVERSAL, W2.5-ISO, W2.5-READONLY,
--                   W2.5-AUDIT, W2.5-LAW-VERSION.
--
-- Proves:
--   · a per-org vendor (1099 flag + W-9) is created + audit-logged; a full CPA can
--     write, a read_only CPA cannot; a forged foreign actor cannot.
--   · the $600/$2,000 threshold is READ from filing_obligations (LAW), never
--     inlined — and it is effective-dated: 2025 = $600, 2026 (OBBBA) = $2,000.
--   · card / third-party-network payments are EXCLUDED from the 1099-NEC total per
--     the data-driven payment_methods.nec_reportable flag (IRS 1099-K exclusion),
--     and flipping the flag changes the result — no code change.
--   · the year-end summary rolls up NEC-reportable per eligible vendor, marks who
--     crosses the threshold, and a REVERSED payment drops out.
--   · every write RPC is service_role-only (revoked from authenticated).
-- All rolls back.

begin;
select plan(21);

-- ── users: owner, full CPA, read_only CPA, outsider ──────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000009c1', 'owner@nec.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000009c2', 'cpa@nec.dev',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000009c3', 'ro@nec.dev',      'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000009c9', 'outsider@nec.dev','authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000009B1', 'business', 'NecCo',    '00000000-0000-0000-0000-0000000009c1'),
  ('00000000-0000-0000-0000-0000000009F1', 'firm',     'NecFirm',  '00000000-0000-0000-0000-0000000009c2'),
  ('00000000-0000-0000-0000-0000000009F2', 'firm',     'FarFirm',  '00000000-0000-0000-0000-0000000009c9');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009B1', 'owner',      'active'),
  ('00000000-0000-0000-0000-0000000009c2', '00000000-0000-0000-0000-0000000009F1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-0000000009c3', '00000000-0000-0000-0000-0000000009F1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-0000000009c9', '00000000-0000-0000-0000-0000000009F2', 'firm_admin', 'active');

-- Firm One → NecCo, FULL engagement (the full CPA can write).
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-0000000009E1', '00000000-0000-0000-0000-0000000009F1', '00000000-0000-0000-0000-0000000009B1', 'active', 'full', '00000000-0000-0000-0000-0000000009c1');

-- Org profile so the threshold lookup resolves the entity (CENTRAL-2). sole_prop
-- is the entity the seed keys the 1099 rule under.
insert into org_accounting_settings (org_id, entity_type, jurisdiction_code)
  values ('00000000-0000-0000-0000-0000000009B1', 'sole_prop', 'US-FED')
  on conflict (org_id) do update set entity_type = excluded.entity_type;

-- ── accounts + open periods (2025 + 2026) ────────────────────────────────────
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000009A100', '00000000-0000-0000-0000-0000000009B1', '1000', 'Cash',        'asset'),
  ('00000000-0000-0000-0000-00000009A600', '00000000-0000-0000-0000-0000000009B1', '6000', 'Contractors', 'expense');
insert into accounting_periods (id, org_id, period_start, period_end, status) values
  ('00000000-0000-0000-0000-0000000009d5', '00000000-0000-0000-0000-0000000009B1', date '2025-01-01', date '2025-12-31', 'open'),
  ('00000000-0000-0000-0000-0000000009d6', '00000000-0000-0000-0000-0000000009B1', date '2026-01-01', date '2026-12-31', 'open');

-- helper to post a simple contractor payment (expense debit / cash credit)
create or replace function _nec_pay(p_id uuid, p_period uuid, p_date date, p_amt bigint) returns void
language plpgsql as $$
begin
  insert into journal_entries (id, org_id, entry_date, period_id, status, source, memo, idempotency_key, posted_by)
    values (p_id, '00000000-0000-0000-0000-0000000009B1', p_date, p_period, 'posted', 'manual', 'pay', p_id::text,
            '00000000-0000-0000-0000-0000000009c1');
  insert into journal_lines (entry_id, org_id, account_id, amount_minor, side) values
    (p_id, '00000000-0000-0000-0000-0000000009B1', '00000000-0000-0000-0000-00000009A600', p_amt, 'D'),
    (p_id, '00000000-0000-0000-0000-0000000009B1', '00000000-0000-0000-0000-00000009A100', p_amt, 'C');
end$$;

-- ════════════════════════════════════════════════════════════════════════════
-- THRESHOLD comes from the kernel (LAW), effective-dated
-- ════════════════════════════════════════════════════════════════════════════
select is(ninetynine_nec_threshold_minor('00000000-0000-0000-0000-0000000009B1', 2025), 60000::bigint,
  'W2.5-THRESHOLD-LAW: 2025 threshold = $600 read from filing_obligations');
select is(ninetynine_nec_threshold_minor('00000000-0000-0000-0000-0000000009B1', 2026), 200000::bigint,
  'W2.5-LAW-VERSION: 2026 (OBBBA) threshold = $2,000 — same lookup, effective-dated seed row');

-- ════════════════════════════════════════════════════════════════════════════
-- VENDOR upsert — full CPA can; read_only cannot; outsider cannot
-- ════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  select vendor_upsert('00000000-0000-0000-0000-0000000009c2','00000000-0000-0000-0000-0000000009B1',
    null, 'Ace Plumbing', true, null, 'ein', '1234', null, true)
$$, 'W2.5-VENDOR: full CPA creates a 1099-eligible vendor');

select is((select is_1099_eligible from vendors where org_id='00000000-0000-0000-0000-0000000009B1' and name='Ace Plumbing'),
  true, 'W2.5-VENDOR: the 1099 flag persisted');
select is((select count(*)::int from ledger_audit where action='vendor.upsert' and org_id='00000000-0000-0000-0000-0000000009B1'),
  1, 'W2.5-AUDIT: vendor.upsert wrote a ledger_audit row');

-- read_only leg: demote the engagement to read_only → can_write_org_as false.
update engagements set access='read_only' where id='00000000-0000-0000-0000-0000000009E1';
select throws_ok($$
  select vendor_upsert('00000000-0000-0000-0000-0000000009c2','00000000-0000-0000-0000-0000000009B1',
    null, 'Blocked Co', true, null, null, null, null, false)
$$, '42501', null, 'W2.5-READONLY: a read_only CPA cannot create a vendor');
update engagements set access='full' where id='00000000-0000-0000-0000-0000000009E1';

select throws_ok($$
  select vendor_upsert('00000000-0000-0000-0000-0000000009c9','00000000-0000-0000-0000-0000000009B1',
    null, 'Forged Co', true, null, null, null, null, false)
$$, '42501', null, 'W2.5-ISO: a forged foreign actor cannot create a vendor');

-- a second vendor: eligible but paid only by card; and a non-eligible vendor.
select vendor_upsert('00000000-0000-0000-0000-0000000009c1','00000000-0000-0000-0000-0000000009B1',
  null, 'Card Contractor', true, null, null, null, null, false);
select vendor_upsert('00000000-0000-0000-0000-0000000009c1','00000000-0000-0000-0000-0000000009B1',
  null, 'Utility Corp', false, null, null, null, null, false);

-- ════════════════════════════════════════════════════════════════════════════
-- TAG payments + build the year-end summary (2025)
-- ════════════════════════════════════════════════════════════════════════════
-- Ace Plumbing: $1,200 check (reportable, over $600) + $900 card (excluded).
select _nec_pay('00000000-0000-0000-0000-0000000EE001','00000000-0000-0000-0000-0000000009d5', date '2025-03-01', 120000);
select _nec_pay('00000000-0000-0000-0000-0000000EE002','00000000-0000-0000-0000-0000000009d5', date '2025-04-01', 90000);
-- Card Contractor: $2,000 by card only → $0 reportable.
select _nec_pay('00000000-0000-0000-0000-0000000EE003','00000000-0000-0000-0000-0000000009d5', date '2025-05-01', 200000);
-- Utility Corp (not eligible): $5,000 check → must NOT appear.
select _nec_pay('00000000-0000-0000-0000-0000000EE004','00000000-0000-0000-0000-0000000009d5', date '2025-06-01', 500000);

-- capture vendor ids
create temporary table _v as
  select id, name from vendors where org_id='00000000-0000-0000-0000-0000000009B1';

select entry_tag_vendor('00000000-0000-0000-0000-0000000009c2','00000000-0000-0000-0000-0000000009B1',
  '00000000-0000-0000-0000-0000000EE001', (select id from _v where name='Ace Plumbing'), 'check');
select entry_tag_vendor('00000000-0000-0000-0000-0000000009c2','00000000-0000-0000-0000-0000000009B1',
  '00000000-0000-0000-0000-0000000EE002', (select id from _v where name='Ace Plumbing'), 'card');
select entry_tag_vendor('00000000-0000-0000-0000-0000000009c2','00000000-0000-0000-0000-0000000009B1',
  '00000000-0000-0000-0000-0000000EE003', (select id from _v where name='Card Contractor'), 'card');
select entry_tag_vendor('00000000-0000-0000-0000-0000000009c2','00000000-0000-0000-0000-0000000009B1',
  '00000000-0000-0000-0000-0000000EE004', (select id from _v where name='Utility Corp'), 'check');

select is((select count(*)::int from ledger_audit where action='1099.tag' and org_id='00000000-0000-0000-0000-0000000009B1'),
  4, 'W2.5-AUDIT: each tag wrote a 1099.tag audit row');

-- summary for 2025 (must set a JWT so can_access_org passes for the SECDEF read)
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000009c1","email":"owner@nec.dev","role":"authenticated"}';

-- Ace Plumbing: reportable $1,200 (card $900 excluded), meets $600.
select is(
  (select reportable_minor from ninetynine_nec_summary('00000000-0000-0000-0000-0000000009B1', 2025)
     where vendor_name='Ace Plumbing'),
  120000::bigint, 'W2.5-CARD-EXCLUDE: Ace reportable = $1,200 (the $900 card payment is excluded)');
select is(
  (select excluded_minor from ninetynine_nec_summary('00000000-0000-0000-0000-0000000009B1', 2025)
     where vendor_name='Ace Plumbing'),
  90000::bigint, 'W2.5-CARD-EXCLUDE: Ace excluded total = $900 (reported on 1099-K)');
select is(
  (select meets_threshold from ninetynine_nec_summary('00000000-0000-0000-0000-0000000009B1', 2025)
     where vendor_name='Ace Plumbing'),
  true, 'W2.5-SUMMARY: Ace crosses the $600 threshold → must file');

-- Card Contractor: $2,000 all by card → $0 reportable, does not meet threshold.
select is(
  (select reportable_minor from ninetynine_nec_summary('00000000-0000-0000-0000-0000000009B1', 2025)
     where vendor_name='Card Contractor'),
  0::bigint, 'W2.5-CARD-EXCLUDE: card-only contractor reports $0');
select is(
  (select meets_threshold from ninetynine_nec_summary('00000000-0000-0000-0000-0000000009B1', 2025)
     where vendor_name='Card Contractor'),
  false, 'W2.5-SUMMARY: card-only contractor does NOT meet the threshold');

-- Utility Corp is not 1099-eligible → absent from the summary entirely.
select is(
  (select count(*)::int from ninetynine_nec_summary('00000000-0000-0000-0000-0000000009B1', 2025)
     where vendor_name='Utility Corp'),
  0, 'W2.5-SUMMARY: a non-eligible vendor never appears');

-- flipping the payment-method exclusion flag changes the result (data-driven, no code)
update payment_methods set nec_reportable=true where key='card';
select is(
  (select reportable_minor from ninetynine_nec_summary('00000000-0000-0000-0000-0000000009B1', 2025)
     where vendor_name='Ace Plumbing'),
  210000::bigint, 'W2.5-CARD-EXCLUDE: with card flagged reportable, Ace = $2,100 (data-driven rule)');
update payment_methods set nec_reportable=false where key='card';

-- ── REVERSAL: a reversed payment drops out of the total ──────────────────────
reset "request.jwt.claims";
-- reverse Ace's $1,200 check: mark the original reversed + post the offsetting entry.
update journal_entries set status='reversed' where id='00000000-0000-0000-0000-0000000EE001';
insert into journal_entries (id, org_id, entry_date, period_id, status, source, memo, idempotency_key, posted_by, reverses_id)
  values ('00000000-0000-0000-0000-0000000EE0F1','00000000-0000-0000-0000-0000000009B1', date '2025-03-02',
          '00000000-0000-0000-0000-0000000009d5','posted','manual','reversal','ee0r1',
          '00000000-0000-0000-0000-0000000009c1','00000000-0000-0000-0000-0000000EE001');
insert into journal_lines (entry_id, org_id, account_id, amount_minor, side) values
  ('00000000-0000-0000-0000-0000000EE0F1','00000000-0000-0000-0000-0000000009B1','00000000-0000-0000-0000-00000009A100', 120000, 'D'),
  ('00000000-0000-0000-0000-0000000EE0F1','00000000-0000-0000-0000-0000000009B1','00000000-0000-0000-0000-00000009A600', 120000, 'C');

set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000009c1","email":"owner@nec.dev","role":"authenticated"}';
select is(
  (select reportable_minor from ninetynine_nec_summary('00000000-0000-0000-0000-0000000009B1', 2025)
     where vendor_name='Ace Plumbing'),
  0::bigint, 'W2.5-REVERSAL: reversing the check drops it from the reportable total');
reset "request.jwt.claims";

-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY: write RPCs are service_role only (revoked from authenticated)
-- ════════════════════════════════════════════════════════════════════════════
select is(
  has_function_privilege('authenticated',
    'public.vendor_upsert(uuid,uuid,uuid,text,boolean,text,text,text,text,boolean)', 'execute'),
  false, 'W2.5-ISO: vendor_upsert is NOT executable by authenticated (service_role only)');
select is(
  has_function_privilege('authenticated',
    'public.entry_tag_vendor(uuid,uuid,uuid,uuid,text)', 'execute'),
  false, 'W2.5-ISO: entry_tag_vendor is NOT executable by authenticated');
select is(
  has_function_privilege('authenticated', 'public.ninetynine_nec_summary(uuid,integer)', 'execute'),
  true, 'W2.5-SUMMARY: the read summary IS executable by authenticated (RLS-gated)');

-- tag validation: an unknown payment method is refused
select throws_ok($$
  select entry_tag_vendor('00000000-0000-0000-0000-0000000009c2','00000000-0000-0000-0000-0000000009B1',
    '00000000-0000-0000-0000-0000000EE003', (select id from _v where name='Ace Plumbing'), 'bitcoin')
$$, '22023', null, 'W2.5-TAG: an unknown payment method is rejected');

-- vendor archive is a soft-delete (LEARNINGS #4)
select vendor_archive('00000000-0000-0000-0000-0000000009c1','00000000-0000-0000-0000-0000000009B1',
  (select id from _v where name='Utility Corp'));
select is(
  (select is_archived from vendors where id=(select id from _v where name='Utility Corp')),
  true, 'W2.5-VENDOR: archive soft-deletes (row kept, is_archived=true)');

select * from finish();
rollback;
