-- =============================================================================
-- RV2-D1 — AP / bill-pay, TRACKING ONLY (BACKLOG.md "## RV2-D1"). Nik 4 Jul:
-- bookkeeping RECORDS ONLY, NEVER moves money — no money transmission, no
-- payments partner, no API that sends funds. Mirrors how invoicing (W4.3)
-- shipped: modular / opt-in, off by default, nested under an existing owner
-- money surface (Connections → "Paying bills"), no new top-level nav.
-- =============================================================================
--
-- This is the money-OUT half of the cash picture, kept symmetric with invoicing
-- (the money-IN half). A "bill" is what the org OWES a vendor; "mark paid"
-- RECORDS a payment (posts the ledger), it does NOT send funds anywhere.
--
-- VENDOR REUSE (load-bearing, centralization gate): a bill points at the SAME
-- public.vendors row the 1099 model (W2.5) already owns — one payee store, no
-- duplicate. AP totals per vendor therefore tie to the 1099-NEC vendor totals.
--
-- LEDGER INTEGRATION — append-only, corrections via reversal, money = positive
-- minor-unit magnitude + D/C side:
--   • On ENTER (accrual expense recognition): Dr Expense (6xxx, default 6000) /
--     Cr Accounts payable (2000)  — for the bill total.
--   • On PAYMENT (records a payment, does NOT send money): Dr Accounts payable
--     (2000) / Cr Cash/bank (1000) — for the amount recorded, clearing AP.
--   • VOID / correction: reverse the enter entry via reverse_journal_entry (flip
--     D/C, reverses_id, original → 'reversed'). Never edit/delete.
-- Every posting funnels through post_journal_entry — balanced, idempotent,
-- period-aware, authorized (can_write_org_as). Idempotency keys are stable
-- (bill:enter:<id> / bill:pay:<payment_id>) so replays never double-post.
--
-- NO FUND MOVEMENT INVARIANT: no function here calls any transfer / disbursement
-- / payments API. The ONLY effect of "pay" is a journal posting + a
-- bill_payments record. There is no external side effect of any kind.
--
-- Config: aging buckets + payment-terms default are DATA (platform_config.behavior,
-- admin-tunable, no redeploy) — NOT magic numbers. Baked fallback lives in
-- apps/app/src/copy/config.ts CONFIG_DEFAULTS and MUST match the seed here.
--
-- Security: new tables are org-scoped + RLS (can_access_org read, no client
-- write). Every write RPC is p_actor/p_org-first, gates on can_write_org_as,
-- SECURITY DEFINER search_path=public, revoked from public, granted to
-- service_role only (ISOTEST pattern). Reads the app calls direct grant to
-- authenticated.
-- =============================================================================

-- ── enums ────────────────────────────────────────────────────────────────────
create type bill_status as enum ('draft', 'open', 'partial', 'paid', 'void');

-- ── per-org AP settings (opt-in, off by default) ─────────────────────────────
create table org_ap_settings (
  org_id             uuid primary key references organizations(id) on delete cascade,
  enabled            boolean not null default false,   -- OFF by default (usability gate)
  next_bill_seq      int not null default 1,           -- human-friendly bill numbers
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);

-- ── bills (header) — what the org owes a vendor ──────────────────────────────
create table bills (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  number             text not null,                    -- e.g. "BILL-0001"
  status             bill_status not null default 'draft',
  -- VENDOR REUSE: the payee is the existing 1099 vendor row (one store). Optional
  -- so a draft can be captured before the vendor is named, but required to enter.
  vendor_id          uuid references vendors(id),
  vendor_name_cache  text,                             -- denorm for display if vendor archived
  bill_date          date not null default current_date,
  due_date           date not null,
  currency           char(3) not null default 'USD',
  memo               text,
  -- denormalized totals in minor units (derived from lines; kept for fast reads
  -- + AP aging). amount_paid_minor is maintained by record_bill_payment.
  total_minor        bigint not null default 0 check (total_minor >= 0),
  amount_paid_minor  bigint not null default 0 check (amount_paid_minor >= 0),
  -- ledger linkage: the accrual (Dr Expense / Cr AP) entry posted on enter.
  post_entry_id      uuid references journal_entries(id),
  expense_account_id uuid references ledger_accounts(id),  -- which 6xxx to debit
  entered_at         timestamptz,
  created_by         uuid not null references auth.users(id),
  created_at         timestamptz not null default now(),
  unique (org_id, number)
);
create index bills_org_idx        on bills (org_id);
create index bills_org_status_idx on bills (org_id, status);
create index bills_org_vendor_idx on bills (org_id, vendor_id);

-- ── bill line items ──────────────────────────────────────────────────────────
create table bill_lines (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references bills(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,  -- for RLS
  description   text not null,
  quantity_milli bigint not null default 1000 check (quantity_milli > 0),  -- qty × 1000 (3dp)
  unit_price_minor bigint not null check (unit_price_minor >= 0),          -- per-unit, minor units
  amount_minor  bigint not null check (amount_minor >= 0),                 -- qty × unit, minor units
  position      int not null default 0
);
create index bill_lines_bill_idx on bill_lines (bill_id);
create index bill_lines_org_idx  on bill_lines (org_id);

-- ── bill payments (RECORDS a payment — does NOT send money) ───────────────────
-- A row here is a bookkeeping record that a payment happened (or is scheduled).
-- It NEVER triggers a transfer. paid_date may be in the future (a "scheduled"
-- record) — it is still just a record. method is a free-text note ("check 1042",
-- "ACH", ...) — no method value routes to any payments rail.
create table bill_payments (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references bills(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  amount_minor  bigint not null check (amount_minor > 0),
  paid_date     date not null default current_date,
  method        text,                                 -- free-text note only
  -- ledger linkage: the Dr AP / Cr Cash entry posted when the payment is recorded.
  post_entry_id uuid references journal_entries(id),
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);
create index bill_payments_bill_idx on bill_payments (bill_id);
create index bill_payments_org_idx  on bill_payments (org_id);

-- ── RLS + grants (reads gated on can_access_org; NO client write) ─────────────
alter table org_ap_settings enable row level security;
alter table bills           enable row level security;
alter table bill_lines      enable row level security;
alter table bill_payments   enable row level security;

create policy aps_select   on org_ap_settings for select using ( can_access_org(org_id) );
create policy aps_nowrite  on org_ap_settings for all using (false) with check (false);
create policy bill_select  on bills           for select using ( can_access_org(org_id) );
create policy bill_nowrite on bills           for all using (false) with check (false);
create policy bll_select   on bill_lines      for select using ( can_access_org(org_id) );
create policy bll_nowrite  on bill_lines      for all using (false) with check (false);
create policy bpay_select  on bill_payments   for select using ( can_access_org(org_id) );
create policy bpay_nowrite on bill_payments   for all using (false) with check (false);

grant select on org_ap_settings, bills, bill_lines, bill_payments to authenticated;
grant select, insert, update, delete on
  org_ap_settings, bills, bill_lines, bill_payments to service_role;

-- =============================================================================
-- Account resolvers — well-known AP / Expense accounts (mirror
-- resolve_ar_account / resolve_cash_account: SELECT by well-known code, else
-- create idempotently). resolve_cash_account (1000) already exists from W4.3.
-- =============================================================================

-- Accounts payable — base code 2000 (liability). Created if missing.
create or replace function resolve_ap_account(p_actor uuid, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts
   where org_id = p_org and is_archived = false
     and (code = '2000' or lower(name) = 'accounts payable')
   order by (code = '2000') desc limit 1;
  if v_id is not null then return v_id; end if;
  v_id := (upsert_ledger_account(p_actor, p_org, 'Accounts payable', 'liability'::account_type, '2000')).id;
  return v_id;
end$$;

-- The org's default expense account — first expense account (prefer code 6000),
-- else create "General expenses" (6000). Used when a bill doesn't name one.
create or replace function resolve_expense_account(p_actor uuid, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts
   where org_id = p_org and is_archived = false and type = 'expense'
   order by (code = '6000') desc, code asc nulls last limit 1;
  if v_id is not null then return v_id; end if;
  v_id := (upsert_ledger_account(p_actor, p_org, 'General expenses', 'expense'::account_type, '6000')).id;
  return v_id;
end$$;

-- =============================================================================
-- AP write RPCs (service_role only, p_actor-gated). NONE of these move money —
-- their only effects are DB rows + journal postings.
-- =============================================================================

-- Opt-in toggle for the whole feature. Owner/full-CPA only.
create or replace function set_ap_settings(
  p_actor uuid, p_org uuid, p_enabled boolean default null
) returns org_ap_settings language plpgsql security definer set search_path = public as $$
declare v_row org_ap_settings;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  insert into org_ap_settings (org_id, enabled, updated_by)
  values (p_org, coalesce(p_enabled, false), p_actor)
  on conflict (org_id) do update set
    enabled    = coalesce(p_enabled, org_ap_settings.enabled),
    updated_at = now(), updated_by = p_actor
  returning * into v_row;
  return v_row;
end$$;

-- Create or replace a DRAFT bill with its line items. Only a draft may be edited
-- (an entered bill is immutable at the header level — corrections are new bills /
-- reversals). The vendor is the EXISTING 1099 vendor row (reuse, no dup store);
-- if given it must belong to the org.
--   p_lines: jsonb array of { description, quantity_milli?, unit_price_minor }
create or replace function upsert_bill(
  p_actor uuid, p_org uuid, p_lines jsonb,
  p_vendor_id uuid default null,
  p_due_date date default null, p_bill_date date default null,
  p_currency char(3) default null, p_memo text default null,
  p_expense_account_id uuid default null, p_bill_id uuid default null
) returns bills language plpgsql security definer set search_path = public as $$
declare
  v_bill    bills;
  v_seq     int;
  v_line    jsonb;
  v_qty     bigint;
  v_unit    bigint;
  v_amt     bigint;
  v_total   bigint := 0;
  v_pos     int := 0;
  v_ccy     char(3);
  v_vname   text;
  v_bdate   date := coalesce(p_bill_date, current_date);
  v_due     date;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception 'bad_lines: at least one line item required' using errcode = 'invalid_parameter_value';
  end if;

  -- vendor (reused 1099 store) must belong to the org if supplied
  if p_vendor_id is not null then
    select name into v_vname from vendors
     where id = p_vendor_id and org_id = p_org and is_archived = false;
    if not found then
      raise exception 'bad_vendor: vendor not in org' using errcode = 'foreign_key_violation';
    end if;
  end if;

  v_ccy := coalesce(p_currency,
    (select home_currency from org_accounting_settings where org_id = p_org), 'USD');
  v_due := coalesce(p_due_date, v_bdate + 30);
  if v_due < v_bdate then
    raise exception 'bad_due: due_date before bill_date' using errcode = 'invalid_parameter_value';
  end if;

  -- optional explicit expense account must belong to the org and be expense-type
  if p_expense_account_id is not null then
    if not exists (select 1 from ledger_accounts
       where id = p_expense_account_id and org_id = p_org and type = 'expense' and is_archived = false) then
      raise exception 'bad_expense_account' using errcode = 'foreign_key_violation';
    end if;
  end if;

  if p_bill_id is null then
    -- allocate the next human-friendly number (atomic per org)
    insert into org_ap_settings (org_id, next_bill_seq, updated_by)
    values (p_org, 2, p_actor)
    on conflict (org_id) do update set
      next_bill_seq = org_ap_settings.next_bill_seq + 1,
      updated_at = now(), updated_by = p_actor
    returning next_bill_seq - 1 into v_seq;

    insert into bills (org_id, number, status, vendor_id, vendor_name_cache,
      bill_date, due_date, currency, memo, expense_account_id, created_by)
    values (p_org, 'BILL-' || lpad(v_seq::text, 4, '0'), 'draft', p_vendor_id, v_vname,
      v_bdate, v_due, v_ccy, p_memo, p_expense_account_id, p_actor)
    returning * into v_bill;
  else
    select * into v_bill from bills where id = p_bill_id and org_id = p_org;
    if not found then raise exception 'not_found: bill' using errcode = 'no_data_found'; end if;
    if v_bill.status <> 'draft' then
      raise exception 'not_draft: only a draft bill may be edited' using errcode = 'restrict_violation';
    end if;
    update bills set vendor_id = p_vendor_id, vendor_name_cache = v_vname,
      bill_date = v_bdate, due_date = v_due, currency = v_ccy, memo = p_memo,
      expense_account_id = p_expense_account_id
     where id = p_bill_id returning * into v_bill;
    delete from bill_lines where bill_id = p_bill_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if coalesce(trim(v_line->>'description'), '') = '' or (v_line->>'unit_price_minor') is null then
      raise exception 'bad_line: description + unit_price_minor required' using errcode = 'invalid_parameter_value';
    end if;
    v_qty  := coalesce((v_line->>'quantity_milli')::bigint, 1000);
    v_unit := (v_line->>'unit_price_minor')::bigint;
    if v_qty <= 0 or v_unit < 0 then
      raise exception 'bad_line: quantity>0, unit_price>=0' using errcode = 'invalid_parameter_value';
    end if;
    -- amount = qty(3dp) × unit / 1000, rounded to the minor unit
    v_amt := round((v_qty::numeric * v_unit) / 1000.0)::bigint;
    v_total := v_total + v_amt;
    insert into bill_lines (bill_id, org_id, description, quantity_milli, unit_price_minor, amount_minor, position)
    values (v_bill.id, p_org, v_line->>'description', v_qty, v_unit, v_amt, v_pos);
    v_pos := v_pos + 1;
  end loop;

  update bills set total_minor = v_total where id = v_bill.id returning * into v_bill;
  return v_bill;
end$$;

-- ENTER: post the accrual entry (Dr Expense / Cr AP) and flip status → 'open'.
-- The bill now sits in AP aging. A vendor is REQUIRED to enter (so AP ties to a
-- payee). Idempotent: re-entering returns the already-open bill (the ledger post
-- has a stable idempotency key so it never double-posts). NO money moves.
create or replace function enter_bill(p_actor uuid, p_org uuid, p_bill_id uuid)
returns bills language plpgsql security definer set search_path = public as $$
declare
  v_bill   bills;
  v_ap     uuid;
  v_exp    uuid;
  v_entry  journal_entries;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_bill from bills where id = p_bill_id and org_id = p_org for update;
  if not found then raise exception 'not_found: bill' using errcode = 'no_data_found'; end if;
  if v_bill.status = 'void' then
    raise exception 'voided: cannot enter a voided bill' using errcode = 'restrict_violation';
  end if;
  if v_bill.status <> 'draft' then return v_bill; end if;  -- already entered — idempotent
  if v_bill.vendor_id is null then
    raise exception 'no_vendor: name the vendor before entering the bill' using errcode = 'restrict_violation';
  end if;
  if v_bill.total_minor <= 0 then
    raise exception 'empty_bill: nothing owed' using errcode = 'restrict_violation';
  end if;

  v_ap  := resolve_ap_account(p_actor, p_org);
  v_exp := coalesce(v_bill.expense_account_id, resolve_expense_account(p_actor, p_org));

  v_entry := post_journal_entry(
    p_actor, p_org, v_bill.bill_date, 'bill:enter:' || v_bill.id::text,
    jsonb_build_array(
      jsonb_build_object('account_id', v_exp, 'amount_minor', v_bill.total_minor, 'side', 'D', 'memo', v_bill.number),
      jsonb_build_object('account_id', v_ap,  'amount_minor', v_bill.total_minor, 'side', 'C', 'memo', v_bill.number)
    ), 'bill', v_bill.id::text, 'Bill ' || v_bill.number || ' — ' || coalesce(v_bill.vendor_name_cache, ''));

  update bills set status = 'open', entered_at = now(),
    post_entry_id = v_entry.id, expense_account_id = v_exp
   where id = v_bill.id returning * into v_bill;
  return v_bill;
end$$;

-- RECORD A PAYMENT: this RECORDS that a payment happened — it does NOT send any
-- funds. Posts Dr AP / Cr Cash for the amount and advances status →
-- 'partial'/'paid'. Idempotent per payment row (the ledger post keys on the
-- payment id). Over-payment beyond the balance is rejected. paid_date may be
-- future-dated (a scheduled record) — still just a bookkeeping record.
create or replace function record_bill_payment(
  p_actor uuid, p_org uuid, p_bill_id uuid, p_amount_minor bigint,
  p_paid_date date default null, p_method text default null
) returns bills language plpgsql security definer set search_path = public as $$
declare
  v_bill    bills;
  v_pay     bill_payments;
  v_cash    uuid;
  v_ap      uuid;
  v_entry   journal_entries;
  v_balance bigint;
  v_newpaid bigint;
  v_date    date := coalesce(p_paid_date, current_date);
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'bad_amount: payment must be positive' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_bill from bills where id = p_bill_id and org_id = p_org for update;
  if not found then raise exception 'not_found: bill' using errcode = 'no_data_found'; end if;
  if v_bill.status not in ('open', 'partial') then
    raise exception 'not_payable: bill is % (must be open/partial)', v_bill.status using errcode = 'restrict_violation';
  end if;
  v_balance := v_bill.total_minor - v_bill.amount_paid_minor;
  if p_amount_minor > v_balance then
    raise exception 'overpayment: % exceeds balance %', p_amount_minor, v_balance using errcode = 'check_violation';
  end if;

  insert into bill_payments (bill_id, org_id, amount_minor, paid_date, method, created_by)
  values (p_bill_id, p_org, p_amount_minor, v_date, p_method, p_actor)
  returning * into v_pay;

  v_ap   := resolve_ap_account(p_actor, p_org);
  v_cash := resolve_cash_account(p_actor, p_org);

  v_entry := post_journal_entry(
    p_actor, p_org, v_date, 'bill:pay:' || v_pay.id::text,
    jsonb_build_array(
      jsonb_build_object('account_id', v_ap,   'amount_minor', p_amount_minor, 'side', 'D', 'memo', v_bill.number),
      jsonb_build_object('account_id', v_cash, 'amount_minor', p_amount_minor, 'side', 'C', 'memo', v_bill.number)
    ), 'bill_payment', v_bill.id::text, 'Payment recorded on ' || v_bill.number);

  update bill_payments set post_entry_id = v_entry.id where id = v_pay.id;

  v_newpaid := v_bill.amount_paid_minor + p_amount_minor;
  update bills set amount_paid_minor = v_newpaid,
    status = case when v_newpaid >= v_bill.total_minor then 'paid'::bill_status else 'partial'::bill_status end
   where id = v_bill.id returning * into v_bill;
  return v_bill;
end$$;

-- VOID: reverse the accrual entry (append-only) and mark the bill void. Only an
-- open/partial bill with NO payments recorded may be voided (a paid bill needs a
-- debit-note / refund path — out of scope). A draft is simply deleted by the
-- caller. Voiding a void is a no-op. NO money moves.
create or replace function void_bill(p_actor uuid, p_org uuid, p_bill_id uuid, p_memo text default null)
returns bills language plpgsql security definer set search_path = public as $$
declare v_bill bills;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_bill from bills where id = p_bill_id and org_id = p_org for update;
  if not found then raise exception 'not_found: bill' using errcode = 'no_data_found'; end if;
  if v_bill.status = 'void' then return v_bill; end if;
  if v_bill.amount_paid_minor > 0 then
    raise exception 'has_payments: void not allowed after a recorded payment; use a debit note' using errcode = 'restrict_violation';
  end if;
  if v_bill.status = 'draft' then
    raise exception 'draft_delete: delete a draft rather than voiding it' using errcode = 'restrict_violation';
  end if;

  if v_bill.post_entry_id is not null then
    perform reverse_journal_entry(p_actor, p_org, v_bill.post_entry_id,
      'bill:void:' || v_bill.id::text, current_date,
      coalesce(p_memo, 'Void of bill ' || v_bill.number));
  end if;
  update bills set status = 'void' where id = v_bill.id returning * into v_bill;
  return v_bill;
end$$;

-- =============================================================================
-- AP aging (read) — 0-30 / 31-60 / 61-90 / 90+ buckets over OPEN balances
-- (open/partial, not fully paid). Symmetric with invoice_ar_aging. granted to
-- authenticated (RLS-safe: gated on can_access_org). p_asof defaults to today.
-- =============================================================================
create or replace function bill_ap_aging(p_org uuid, p_asof date default null)
returns table (
  bucket text, bill_count int, balance_minor bigint
) language sql stable security definer set search_path = public as $$
  with asof as (select coalesce(p_asof, current_date) d),
  open_bill as (
    select b.id,
           (b.total_minor - b.amount_paid_minor) as bal,
           ((select d from asof) - b.due_date) as days_overdue
    from bills b
    where b.org_id = p_org
      and can_access_org(p_org)
      and b.status in ('open', 'partial')
      and (b.total_minor - b.amount_paid_minor) > 0
  ),
  bucketed as (
    select case
             when days_overdue <= 0  then 'current'
             when days_overdue <= 30 then '1-30'
             when days_overdue <= 60 then '31-60'
             when days_overdue <= 90 then '61-90'
             else '90+'
           end as bucket, bal
    from open_bill
  )
  select ord.bucket,
         count(b.bucket)::int,
         coalesce(sum(b.bal), 0)::bigint
  from (values ('current'),('1-30'),('31-60'),('61-90'),('90+')) as ord(bucket)
  left join bucketed b on b.bucket = ord.bucket
  group by ord.bucket
  order by array_position(array['current','1-30','31-60','61-90','90+'], ord.bucket);
$$;

-- AP owed per vendor (open balances) — this is the read that MUST tie to the
-- 1099 vendor totals (same vendors store). granted to authenticated.
create or replace function bill_ap_by_vendor(p_org uuid)
returns table (
  vendor_id uuid, vendor_name text, open_balance_minor bigint
) language sql stable security definer set search_path = public as $$
  select b.vendor_id,
         coalesce(v.name, b.vendor_name_cache, '(no vendor)') as vendor_name,
         sum(b.total_minor - b.amount_paid_minor)::bigint as open_balance_minor
  from bills b
  left join vendors v on v.id = b.vendor_id
  where b.org_id = p_org
    and can_access_org(p_org)
    and b.status in ('open', 'partial')
    and (b.total_minor - b.amount_paid_minor) > 0
  group by b.vendor_id, coalesce(v.name, b.vendor_name_cache, '(no vendor)')
  order by open_balance_minor desc;
$$;

-- =============================================================================
-- Grants — lock write RPCs to service_role; reads the app calls direct → authenticated.
-- =============================================================================
revoke all on function resolve_ap_account(uuid, uuid)      from public;
revoke all on function resolve_expense_account(uuid, uuid)  from public;
revoke all on function set_ap_settings(uuid, uuid, boolean) from public;
revoke all on function upsert_bill(uuid, uuid, jsonb, uuid, date, date, char, text, uuid, uuid) from public;
revoke all on function enter_bill(uuid, uuid, uuid)         from public;
revoke all on function record_bill_payment(uuid, uuid, uuid, bigint, date, text) from public;
revoke all on function void_bill(uuid, uuid, uuid, text)    from public;

grant execute on function set_ap_settings(uuid, uuid, boolean) to service_role;
grant execute on function upsert_bill(uuid, uuid, jsonb, uuid, date, date, char, text, uuid, uuid) to service_role;
grant execute on function enter_bill(uuid, uuid, uuid)         to service_role;
grant execute on function record_bill_payment(uuid, uuid, uuid, bigint, date, text) to service_role;
grant execute on function void_bill(uuid, uuid, uuid, text)    to service_role;

-- AP aging + per-vendor are client reads (owner sees "what do I owe and when").
grant execute on function bill_ap_aging(uuid, date)    to authenticated;
grant execute on function bill_ap_by_vendor(uuid)      to authenticated;

-- =============================================================================
-- Config: seed the default payment terms (DATA, admin-tunable). Merge into the
-- singleton so existing keys stay intact. MUST match apps/app/src/copy/config.ts.
-- Aging buckets stay the classic fixed 30-day rule (mirrors AR), not a knob.
-- =============================================================================
update platform_config
   set behavior = behavior || jsonb_build_object('bill_payment_terms_days', 30),
       updated_at = now()
 where id = true;

-- =============================================================================
-- End of migration. (No email templates: tracking-only — bills are never sent
-- and no reminder emails are dispatched. No fund-movement code exists here.)
-- =============================================================================
