-- W2.3 · Plaid bank-feed ingestion gate (migration 20260704030000_w2_3_plaid_bank_feeds).
-- Guards the ingestion RPC's idempotency (replay-safe), tenant scope, the ledger
-- balance, and reversal-based removed/modified corrections.
-- Scenario ids: W2.3-LINK, W2.3-REPLAY, W2.3-REMOVED.  Run: `supabase test db`.

begin;
select plan(16);

-- ── fixtures: one business (owner), a Plaid connection, plus a second org ─────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000e0a01', 'pOwner@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000e0d02', 'pOther@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000e0b01', 'business', 'P Biz',   '00000000-0000-0000-0000-0000000e0a01'),
  ('00000000-0000-0000-0000-0000000e0b02', 'business', 'P Other', '00000000-0000-0000-0000-0000000e0d02');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0b01', 'owner', 'active'),
  ('00000000-0000-0000-0000-0000000e0d02', '00000000-0000-0000-0000-0000000e0b02', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000e0b01', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

-- the Plaid connection (item) for the biz.
insert into external_connections (id, org_id, provider, realm_id, tenant_name, access_token, status, connected_by) values
  ('00000000-0000-0000-0000-0000000ec001', '00000000-0000-0000-0000-0000000e0b01', 'plaid',
   'item-abc', 'Test Bank', 'access-sandbox-xyz', 'active', '00000000-0000-0000-0000-0000000e0a01');

-- ── 1. ISOTEST: the ingestion RPC is NOT execute-granted to authenticated/anon ─
select is(
  has_function_privilege('authenticated', 'public.plaid_ingest_transactions(uuid,uuid,uuid,jsonb,jsonb,jsonb)', 'execute'),
  false, 'plaid_ingest_transactions is not EXECUTE-grantable to authenticated');
select is(
  has_function_privilege('anon', 'public.plaid_ingest_transactions(uuid,uuid,uuid,jsonb,jsonb,jsonb)', 'execute'),
  false, 'plaid_ingest_transactions is not EXECUTE-grantable to anon');

-- ── 2. W2.3-LINK: adding two transactions lands two rows + two entries ────────
select lives_ok($$
  select plaid_ingest_transactions(
    '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0b01',
    '00000000-0000-0000-0000-0000000ec001',
    '[{"transaction_id":"t1","date":"2026-07-01","amount_minor":-2500,"name":"Coffee","pending":false},
      {"transaction_id":"t2","date":"2026-07-01","amount_minor":4000,"name":"Deposit","pending":false}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb)
$$, 'W2.3-LINK: initial add ingests');

select is((select count(*)::int from bank_transactions where org_id='00000000-0000-0000-0000-0000000e0b01'),
  2, 'two bank_transactions rows created');
select is((select count(distinct journal_entry_id)::int from bank_transactions where org_id='00000000-0000-0000-0000-0000000e0b01'),
  2, 'each transaction posted a distinct ledger entry');

-- the ledger balances (every posted entry Dr==Cr — sum of all lines nets to 0).
select is(
  (select coalesce(sum(case when side='D' then amount_minor else -amount_minor end),0)
   from journal_lines where org_id='00000000-0000-0000-0000-0000000e0b01'),
  0::bigint, 'ledger balances after add (Dr==Cr across all lines)');

-- ── 3. W2.3-REPLAY: re-ingesting the same page is a NO-OP (webhook replay) ────
select is((select (plaid_ingest_transactions(
    '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0b01',
    '00000000-0000-0000-0000-0000000ec001',
    '[{"transaction_id":"t1","date":"2026-07-01","amount_minor":-2500,"name":"Coffee","pending":false},
      {"transaction_id":"t2","date":"2026-07-01","amount_minor":4000,"name":"Deposit","pending":false}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb))->>'skipped')::int,
  2, 'W2.3-REPLAY: a duplicate add page skips both transactions');
select is((select count(*)::int from bank_transactions where org_id='00000000-0000-0000-0000-0000000e0b01'),
  2, 'replay added no new bank_transactions rows');
select is((select count(*)::int from journal_entries where org_id='00000000-0000-0000-0000-0000000e0b01' and source='import'),
  2, 'replay posted no new ledger entries (idempotent on ext:plaid:<id>)');

-- ── 4. modified (amount change) → reversal + repost, never edit in place ──────
select lives_ok($$
  select plaid_ingest_transactions(
    '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0b01',
    '00000000-0000-0000-0000-0000000ec001',
    '[]'::jsonb,
    '[{"transaction_id":"t1","date":"2026-07-01","amount_minor":-3000,"name":"Coffee","pending":false}]'::jsonb,
    '[]'::jsonb)
$$, 'modify t1 amount → -3000');

-- the original t1 entry is now status=reversed (a reversal cancelled it), not edited.
select is(
  (select je.status::text from journal_entries je
   where je.org_id='00000000-0000-0000-0000-0000000e0b01' and je.idempotency_key='ext:plaid:t1'),
  'reversed', 'modified: original entry reversed (not mutated in place)');
-- the live posted amount for t1 now ties to the corrected -3000 on the bank side.
select is(
  (select bt.amount_minor from bank_transactions bt
   where bt.org_id='00000000-0000-0000-0000-0000000e0b01' and bt.plaid_transaction_id='t1'),
  -3000::bigint, 'modified: bank_transactions amount updated to corrected value');
-- ledger still balances after the reversal + repost.
select is(
  (select coalesce(sum(case when side='D' then amount_minor else -amount_minor end),0)
   from journal_lines where org_id='00000000-0000-0000-0000-0000000e0b01'),
  0::bigint, 'ledger still balances after modify (reverse + repost)');

-- ── 5. W2.3-REMOVED: removing t2 reverses its entry, marks the row removed ────
select lives_ok($$
  select plaid_ingest_transactions(
    '00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-0000000e0b01',
    '00000000-0000-0000-0000-0000000ec001',
    '[]'::jsonb, '[]'::jsonb,
    '[{"transaction_id":"t2"}]'::jsonb)
$$, 'W2.3-REMOVED: remove t2');
select is(
  (select state::text from bank_transactions where org_id='00000000-0000-0000-0000-0000000e0b01' and plaid_transaction_id='t2'),
  'removed', 'removed: t2 row state = removed (never deleted)');
select is(
  (select je.status::text from journal_entries je
   where je.org_id='00000000-0000-0000-0000-0000000e0b01' and je.idempotency_key='ext:plaid:t2'),
  'reversed', 'removed: t2 original entry reversed');

-- ── 6. tenant scope: the other org's owner cannot ingest into P Biz's item ────
select throws_ok($$
  select plaid_ingest_transactions(
    '00000000-0000-0000-0000-0000000e0d02', '00000000-0000-0000-0000-0000000e0b01',
    '00000000-0000-0000-0000-0000000ec001',
    '[{"transaction_id":"tX","date":"2026-07-01","amount_minor":-100,"name":"X"}]'::jsonb,
    '[]'::jsonb, '[]'::jsonb)
$$, 'forbidden: actor may not write org 00000000-0000-0000-0000-0000000e0b01',
   'tenant scope: a non-member actor is refused (can_write_org_as)');

select * from finish();
rollback;
