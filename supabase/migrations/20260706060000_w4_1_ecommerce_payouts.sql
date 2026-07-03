-- W4.1 · E-commerce payout splitting (Stripe + Shopify first; PayPal/Square/Amazon extensible)
--
-- THE PAIN (roadmap theme #6, the #1 e-commerce bookkeeping pain): a Stripe or
-- Shopify payout lands in the bank as ONE lump deposit (e.g. +$4,820), but that
-- deposit is really gross sales − processing fees − refunds (± COGS), netted. If
-- the books record it as a single "Stripe payout → Revenue" line, revenue is
-- understated by the fees/refunds, fee expense is invisible, and the P&L is
-- silently wrong even though the bank reconciles to the cent.
--
-- THIS MIGRATION splits a payout/settlement into its COMPONENT journal lines so
-- the books show the true economics:
--   • gross sales        → Income  (Sales revenue)                 CREDIT
--   • processing fees     → Expense (Merchant processing fees)      DEBIT
--   • refunds             → contra-Income (Refunds & returns)       DEBIT
--   • adjustments/other   → the payout clearing account (net-zero over time)
--   • the NET deposit     → the org's bank/clearing account         DEBIT
-- and every payout ties to the cent (Σ debits = Σ credits, enforced by the
-- ledger's deferred balance trigger).
--
-- ── PROVIDER-AGNOSTIC FRAMEWORK (Nik 3 Jul: integrate the MAJOR providers) ────
-- The SPLIT MATH is provider-agnostic. Each provider only differs in how its
-- report/API rows map to the four component buckets — that mapping lives in the
-- TypeScript parser layer (apps/app/src/ecommerce/*, one parser per provider),
-- which normalizes any provider's payout into a common `PayoutComponents` shape.
-- This RPC consumes that normalized shape, so ADDING PAYPAL/SQUARE/AMAZON = one
-- connector-registry row + one parser, NOT a schema or RPC rewrite. File/report
-- import is the fallback + starting point (no OAuth lead time); the same RPC
-- serves an API path later.
--
-- ── IDEMPOTENCY (per-payout, mirrors ext:<source>:<id> discipline) ────────────
-- The whole payout posts as ONE balanced multi-line entry keyed
-- `ext:<provider>:payout:<payout_id>`. A re-import of the same payout collides on
-- unique(org_id, idempotency_key) inside post_journal_entry and returns the
-- original — NEVER double-posts (LEARNINGS #16 "balances ≠ correct" + F1
-- double-post-on-re-pull from SYNCTEST). This matches the QBO/Plaid `ext:` keying.
--
-- ── CORRECTIONS via the REVERSAL PATH (never edit posted entries) ─────────────
-- A payout later restated by the provider (a late refund/fee adjustment, or a
-- corrected report) is fixed by REVERSING the original payout entry and posting
-- the corrected split — the append-only correction discipline the whole ledger
-- uses (reverse_journal_entry). Posted lines are immutable (guard trigger).
--
-- Write-don't-deploy (LEARNINGS #3). Locked to service_role (isolation P0 rule).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Connector registry rows (CENTRAL-2). Adding a provider = one row here.
--    category 'commerce'; capabilities describe what each supports today.
--    logo_ref is a design-system asset id (no inline SVG/URL — centralization).
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.connectors (key, name, category, logo_ref, capabilities, scopes, status, sort_order) values
  ('stripe',  'Stripe',           'commerce', 'connector.stripe',
     '["payout_split","report_import","live_sync"]'::jsonb, '[]'::jsonb, 'available', 10),
  ('shopify', 'Shopify',          'commerce', 'connector.shopify',
     '["payout_split","report_import"]'::jsonb,             '[]'::jsonb, 'available', 20),
  ('paypal',  'PayPal',           'commerce', 'connector.paypal',
     '["payout_split","report_import"]'::jsonb,             '[]'::jsonb, 'planned',   30),
  ('square',  'Square',           'commerce', 'connector.square',
     '["payout_split","report_import"]'::jsonb,             '[]'::jsonb, 'planned',   40),
  ('amazon',  'Amazon',           'commerce', 'connector.amazon',
     '["payout_split","report_import"]'::jsonb,             '[]'::jsonb, 'planned',   50)
on conflict (key) do update set
  name = excluded.name, category = excluded.category, logo_ref = excluded.logo_ref,
  capabilities = excluded.capabilities, status = excluded.status,
  sort_order = excluded.sort_order, updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Standard commerce accounts resolver. Idempotent — resolves (or creates on
--    first use) the four accounts the split needs, so an org that has never sold
--    online still gets a clean split. Names/codes are conventional; an org that
--    already has matching accounts (by code) reuses them.
--      4000  Sales revenue        income   (reuse the org's revenue acct if present)
--      5200  Merchant processing fees  expense
--      4900  Refunds & returns    income   (contra-revenue; a debit reduces income)
--      1150  Payout clearing      asset    (in-transit / adjustment holding)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function resolve_commerce_accounts(p_actor uuid, p_org uuid)
returns table (sales_id uuid, fees_id uuid, refunds_id uuid, clearing_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_sales    uuid;
  v_fees     uuid;
  v_refunds  uuid;
  v_clearing uuid;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  -- Sales revenue: prefer an existing income account coded 4000 or named 'sales%'.
  select id into v_sales from ledger_accounts
   where org_id = p_org and is_archived = false and type = 'income'
     and (code = '4000' or lower(name) like 'sales%')
   order by (code = '4000') desc limit 1;
  if v_sales is null then
    v_sales := (upsert_ledger_account(p_actor, p_org, 'Sales revenue', 'income'::account_type, '4000')).id;
  end if;

  select id into v_fees from ledger_accounts
   where org_id = p_org and is_archived = false and type = 'expense'
     and (code = '5200' or lower(name) like '%processing fee%')
   order by (code = '5200') desc limit 1;
  if v_fees is null then
    v_fees := (upsert_ledger_account(p_actor, p_org, 'Merchant processing fees', 'expense'::account_type, '5200')).id;
  end if;

  select id into v_refunds from ledger_accounts
   where org_id = p_org and is_archived = false and type = 'income'
     and (code = '4900' or lower(name) like '%refund%')
   order by (code = '4900') desc limit 1;
  if v_refunds is null then
    v_refunds := (upsert_ledger_account(p_actor, p_org, 'Refunds & returns', 'income'::account_type, '4900')).id;
  end if;

  select id into v_clearing from ledger_accounts
   where org_id = p_org and is_archived = false and type = 'asset'
     and (code = '1150' or lower(name) like '%payout clearing%')
   order by (code = '1150') desc limit 1;
  if v_clearing is null then
    v_clearing := (upsert_ledger_account(p_actor, p_org, 'Payout clearing', 'asset'::account_type, '1150')).id;
  end if;

  sales_id := v_sales; fees_id := v_fees; refunds_id := v_refunds; clearing_id := v_clearing;
  return next;
end$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. post_ecommerce_payout — split one payout into component journal lines.
--
-- Inputs are the NORMALIZED payout shape the TS parser produces (any provider):
--   p_provider      'stripe' | 'shopify' | 'paypal' | 'square' | 'amazon'
--   p_payout_id     the provider's payout/settlement id (idempotency anchor)
--   p_payout_date   settlement date the deposit hits the bank
--   p_bank_account  the ledger account the net deposit lands in (bank/clearing)
--   p_gross_minor   gross sales, positive minor units          (>= 0)
--   p_fees_minor    processing fees withheld, positive          (>= 0)
--   p_refunds_minor refunds/returns netted out, positive        (>= 0)
--   p_adjust_minor  net other adjustments, SIGNED (+ increases the deposit)
--   p_net_minor     the actual net deposit (provider-reported), SIGNED
--   p_currency      ISO currency (defaults to the org home currency)
--   p_memo          human memo
--
-- INVARIANT (ties to the cent): gross − fees − refunds + adjust MUST equal net.
-- We compute it and reject a mismatch rather than plugging silently — a report
-- that doesn't reconcile is a parse bug the owner must see, not a hidden plug
-- (LEARNINGS #16: never let "it balanced" hide a wrong split).
--
-- LINES (net > 0, the normal payout): sum of debits = sum of credits.
--   D  bank            net + fees + refunds − adjust(+) ... actually built per-side:
-- We post exactly:
--   C  Sales revenue        gross
--   D  Merchant fees         fees          (if > 0)
--   D  Refunds & returns     refunds       (if > 0)
--   D  Payout clearing       adjust        (if adjust < 0, i.e. deposit reduced)
--   C  Payout clearing       adjust        (if adjust > 0, i.e. deposit increased)
--   D  Bank                  net           (if net > 0) / C Bank |net| (if net < 0)
-- which balances because net = gross − fees − refunds + adjust.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function post_ecommerce_payout(
  p_actor        uuid,
  p_org          uuid,
  p_provider     text,
  p_payout_id    text,
  p_payout_date  date,
  p_bank_account uuid,
  p_gross_minor  bigint,
  p_fees_minor   bigint default 0,
  p_refunds_minor bigint default 0,
  p_adjust_minor bigint default 0,
  p_net_minor    bigint default null,
  p_currency     char(3) default null,
  p_memo         text default null
) returns journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_acc     record;
  v_lines   jsonb := '[]'::jsonb;
  v_key     text;
  v_ccy     char(3);
  v_net     bigint;
  v_calc    bigint;
  v_entry   journal_entries;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;
  if p_provider is null or p_provider = '' then
    raise exception 'bad_provider: provider is required' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from connectors where key = p_provider and category = 'commerce') then
    raise exception 'unknown_provider: % is not a registered commerce connector', p_provider using errcode = 'foreign_key_violation';
  end if;
  if p_payout_id is null or p_payout_id = '' then
    raise exception 'bad_payout: payout id is required for idempotency' using errcode = 'invalid_parameter_value';
  end if;
  if p_payout_date is null then
    raise exception 'bad_date: payout date is required' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from ledger_accounts where id = p_bank_account and org_id = p_org and is_archived = false) then
    raise exception 'bad_bank: bank account not in org (or archived)' using errcode = 'foreign_key_violation';
  end if;
  if coalesce(p_gross_minor,0) < 0 or coalesce(p_fees_minor,0) < 0 or coalesce(p_refunds_minor,0) < 0 then
    raise exception 'bad_amounts: gross/fees/refunds must be non-negative minor units' using errcode = 'invalid_parameter_value';
  end if;

  -- reconcile: gross − fees − refunds + adjust must equal the reported net.
  v_calc := coalesce(p_gross_minor,0) - coalesce(p_fees_minor,0)
            - coalesce(p_refunds_minor,0) + coalesce(p_adjust_minor,0);
  v_net  := coalesce(p_net_minor, v_calc);
  if v_net <> v_calc then
    raise exception 'payout_does_not_reconcile: gross(%) − fees(%) − refunds(%) + adjust(%) = % but net = %',
      p_gross_minor, p_fees_minor, p_refunds_minor, p_adjust_minor, v_calc, v_net
      using errcode = 'check_violation';
  end if;
  if v_net = 0 and coalesce(p_gross_minor,0) = 0 then
    raise exception 'empty_payout: nothing to post' using errcode = 'no_data_found';
  end if;

  select coalesce(p_currency, home_currency, 'USD') into v_ccy from org_accounting_settings where org_id = p_org;
  v_ccy := coalesce(v_ccy, 'USD');

  select * into v_acc from resolve_commerce_accounts(p_actor, p_org);

  -- build the component lines. Every amount_minor must be strictly positive
  -- (post_journal_entry rejects <= 0), so we only emit a line when its bucket is non-zero.
  if coalesce(p_gross_minor,0) > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_acc.sales_id, 'amount_minor', p_gross_minor, 'side', 'C',
      'currency', v_ccy, 'memo', 'Gross sales'));
  end if;
  if coalesce(p_fees_minor,0) > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_acc.fees_id, 'amount_minor', p_fees_minor, 'side', 'D',
      'currency', v_ccy, 'memo', 'Processing fees'));
  end if;
  if coalesce(p_refunds_minor,0) > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_acc.refunds_id, 'amount_minor', p_refunds_minor, 'side', 'D',
      'currency', v_ccy, 'memo', 'Refunds & returns'));
  end if;
  if coalesce(p_adjust_minor,0) <> 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_acc.clearing_id, 'amount_minor', abs(p_adjust_minor),
      'side', case when p_adjust_minor > 0 then 'C' else 'D' end,
      'currency', v_ccy, 'memo', 'Payout adjustment'));
  end if;
  -- the net deposit into the bank/clearing account
  if v_net <> 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', p_bank_account, 'amount_minor', abs(v_net),
      'side', case when v_net > 0 then 'D' else 'C' end,
      'currency', v_ccy, 'memo', 'Net payout deposit'));
  end if;

  v_key := 'ext:' || p_provider || ':payout:' || p_payout_id;
  v_entry := post_journal_entry(
    p_actor, p_org, p_payout_date, v_key, v_lines,
    'ecommerce_payout', p_provider || ':' || p_payout_id,
    coalesce(p_memo, initcap(p_provider) || ' payout ' || p_payout_id));
  return v_entry;
end$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. reverse_ecommerce_payout — restated payout correction via the reversal path.
--    Looks up the original payout entry by its idempotency key and reverses it;
--    the caller then re-posts the corrected split with post_ecommerce_payout
--    (which is idempotent, so the corrected re-post is safe). Never edits lines.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function reverse_ecommerce_payout(
  p_actor       uuid,
  p_org         uuid,
  p_provider    text,
  p_payout_id   text,
  p_date        date default null,
  p_memo        text default null
) returns journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_orig journal_entries;
  v_key  text := 'ext:' || p_provider || ':payout:' || p_payout_id;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_orig from journal_entries
   where org_id = p_org and idempotency_key = v_key and status = 'posted';
  if not found then
    raise exception 'not_found: no posted payout entry for %:%', p_provider, p_payout_id using errcode = 'no_data_found';
  end if;
  return reverse_journal_entry(
    p_actor, p_org, v_orig.id,
    v_key || ':rev:' || v_orig.id::text,
    coalesce(p_date, current_date),
    coalesce(p_memo, 'Reversal of ' || initcap(p_provider) || ' payout ' || p_payout_id));
end$$;

-- ── grants: write-path locked to service_role (isolation P0: never anon/authed) ─
revoke all on function resolve_commerce_accounts(uuid, uuid) from public;
revoke all on function post_ecommerce_payout(uuid, uuid, text, text, date, uuid, bigint, bigint, bigint, bigint, bigint, char, text) from public;
revoke all on function reverse_ecommerce_payout(uuid, uuid, text, text, date, text) from public;
grant execute on function resolve_commerce_accounts(uuid, uuid) to service_role;
grant execute on function post_ecommerce_payout(uuid, uuid, text, text, date, uuid, bigint, bigint, bigint, bigint, bigint, char, text) to service_role;
grant execute on function reverse_ecommerce_payout(uuid, uuid, text, text, date, text) to service_role;
