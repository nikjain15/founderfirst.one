-- =============================================================================
-- W4.3 — Invoicing + AR nudges (modular, opt-in). BACKLOG.md "## W4.3".
-- =============================================================================
--
-- Owners send invoices and get paid faster with gentle AR (accounts-receivable)
-- nudges. Modular / opt-in — OFF by default (org_invoicing_settings.enabled),
-- nested under an existing owner job (Connections → "Getting paid"), no new
-- top-level nav (APP_PRINCIPLES §2 usability gate).
--
-- LEDGER INTEGRATION (the load-bearing part) — append-only, corrections via
-- reversal, money = positive minor-unit magnitude + D/C side:
--   • On SEND (accrual revenue recognition): Dr Accounts receivable (1200) /
--     Cr Revenue (4xxx, default 4000)  — for the invoice total.
--   • On PAYMENT (application): Dr Cash/bank (1000) / Cr Accounts receivable
--     (1200) — for the amount received, clearing AR.
--   • VOID / correction: reverse the send entry via reverse_journal_entry
--     (flip D/C, reverses_id, original → 'reversed'). Never edit/delete.
-- Every posting funnels through post_journal_entry — balanced, idempotent,
-- period-aware, authorized (can_write_org_as). Idempotency keys are stable
-- (invoice:send:<id> / invoice:pay:<payment_id>) so replays never double-post.
--
-- Config: the nudge cadence is DATA (platform_config.behavior, admin-tunable, no
-- redeploy) — NOT a magic number. Baked fallback lives in
-- apps/app/src/copy/config.ts CONFIG_DEFAULTS and MUST match the seed here.
--
-- Security: new tables are org-scoped + RLS (can_access_org read, no client
-- write). Every write RPC is p_actor/p_org-first, gates on can_write_org_as,
-- SECURITY DEFINER search_path=public, revoked from public, granted to
-- service_role only (ISOTEST pattern). Reads that the app calls direct grant to
-- authenticated.
-- =============================================================================

-- ── enums ────────────────────────────────────────────────────────────────────
create type invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'void');

-- ── per-org invoicing settings (opt-in, off by default) ──────────────────────
create table org_invoicing_settings (
  org_id             uuid primary key references organizations(id) on delete cascade,
  enabled            boolean not null default false,   -- OFF by default (usability gate)
  nudges_enabled     boolean not null default false,   -- AR nudges opt-in separately
  next_invoice_seq   int not null default 1,           -- human-friendly invoice numbers
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);

-- ── invoices (header) ────────────────────────────────────────────────────────
create table invoices (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  number             text not null,                    -- e.g. "INV-0001"
  status             invoice_status not null default 'draft',
  customer_name      text not null,
  customer_email     text,
  issue_date         date not null default current_date,
  due_date           date not null,
  currency           char(3) not null default 'USD',
  memo               text,
  -- denormalized totals in minor units (derived from lines; kept for fast reads
  -- + AR aging). amount_paid_minor is maintained by apply_invoice_payment.
  total_minor        bigint not null default 0 check (total_minor >= 0),
  amount_paid_minor  bigint not null default 0 check (amount_paid_minor >= 0),
  -- ledger linkage: the accrual (Dr AR / Cr Revenue) entry posted on send.
  post_entry_id      uuid references journal_entries(id),
  revenue_account_id uuid references ledger_accounts(id),  -- which 4xxx to credit
  sent_at            timestamptz,
  last_nudge_at      timestamptz,                       -- for cadence throttling
  created_by         uuid not null references auth.users(id),
  created_at         timestamptz not null default now(),
  unique (org_id, number)
);
create index invoices_org_idx        on invoices (org_id);
create index invoices_org_status_idx on invoices (org_id, status);

-- ── invoice line items ───────────────────────────────────────────────────────
create table invoice_lines (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,  -- for RLS
  description   text not null,
  quantity_milli bigint not null default 1000 check (quantity_milli > 0),  -- qty × 1000 (3dp)
  unit_price_minor bigint not null check (unit_price_minor >= 0),          -- per-unit, minor units
  amount_minor  bigint not null check (amount_minor >= 0),                 -- qty × unit, minor units
  position      int not null default 0
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id);
create index invoice_lines_org_idx     on invoice_lines (org_id);

-- ── invoice payments (application to the ledger) ─────────────────────────────
create table invoice_payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  amount_minor  bigint not null check (amount_minor > 0),
  paid_date     date not null default current_date,
  method        text,
  -- ledger linkage: the Dr Cash / Cr AR entry posted on application.
  post_entry_id uuid references journal_entries(id),
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);
create index invoice_payments_invoice_idx on invoice_payments (invoice_id);
create index invoice_payments_org_idx     on invoice_payments (org_id);

-- ── RLS + grants ─────────────────────────────────────────────────────────────
alter table org_invoicing_settings enable row level security;
alter table invoices              enable row level security;
alter table invoice_lines         enable row level security;
alter table invoice_payments      enable row level security;

create policy ois_select  on org_invoicing_settings for select using ( can_access_org(org_id) );
create policy ois_nowrite on org_invoicing_settings for all using (false) with check (false);
create policy inv_select   on invoices         for select using ( can_access_org(org_id) );
create policy inv_nowrite  on invoices         for all using (false) with check (false);
create policy invl_select  on invoice_lines    for select using ( can_access_org(org_id) );
create policy invl_nowrite on invoice_lines    for all using (false) with check (false);
create policy invp_select  on invoice_payments for select using ( can_access_org(org_id) );
create policy invp_nowrite on invoice_payments for all using (false) with check (false);

grant select on org_invoicing_settings, invoices, invoice_lines, invoice_payments to authenticated;
grant select, insert, update, delete on
  org_invoicing_settings, invoices, invoice_lines, invoice_payments to service_role;

-- =============================================================================
-- Account resolvers — well-known AR / Revenue accounts (mirror
-- resolve_uncategorized_account: SELECT by well-known code, else create idempotently).
-- =============================================================================

-- Accounts receivable — base code 1200 (asset). Created if missing.
create or replace function resolve_ar_account(p_actor uuid, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts
   where org_id = p_org and is_archived = false
     and (code = '1200' or lower(name) = 'accounts receivable')
   order by (code = '1200') desc limit 1;
  if v_id is not null then return v_id; end if;
  v_id := (upsert_ledger_account(p_actor, p_org, 'Accounts receivable', 'asset'::account_type, '1200')).id;
  return v_id;
end$$;

-- The org's default revenue account — first income account (prefer code 4000),
-- else create "Sales income" (4000). Used when an invoice doesn't name one.
create or replace function resolve_revenue_account(p_actor uuid, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts
   where org_id = p_org and is_archived = false and type = 'income'
   order by (code = '4000') desc, code asc nulls last limit 1;
  if v_id is not null then return v_id; end if;
  v_id := (upsert_ledger_account(p_actor, p_org, 'Sales income', 'income'::account_type, '4000')).id;
  return v_id;
end$$;

-- The org's default cash/bank account for received payments — first asset with
-- code 1000, else create "Cash". (Owner can pick a specific account later.)
create or replace function resolve_cash_account(p_actor uuid, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts
   where org_id = p_org and is_archived = false and type = 'asset'
     and (code = '1000' or lower(name) in ('cash', 'cash and bank', 'bank'))
   order by (code = '1000') desc, code asc nulls last limit 1;
  if v_id is not null then return v_id; end if;
  v_id := (upsert_ledger_account(p_actor, p_org, 'Cash', 'asset'::account_type, '1000')).id;
  return v_id;
end$$;

-- =============================================================================
-- Invoicing write RPCs (service_role only, p_actor-gated).
-- =============================================================================

-- Opt-in toggle for the whole feature (and nudges). Owner/full-CPA only.
create or replace function set_invoicing_settings(
  p_actor uuid, p_org uuid, p_enabled boolean default null, p_nudges_enabled boolean default null
) returns org_invoicing_settings language plpgsql security definer set search_path = public as $$
declare v_row org_invoicing_settings;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  insert into org_invoicing_settings (org_id, enabled, nudges_enabled, updated_by)
  values (p_org, coalesce(p_enabled, false), coalesce(p_nudges_enabled, false), p_actor)
  on conflict (org_id) do update set
    enabled        = coalesce(p_enabled, org_invoicing_settings.enabled),
    nudges_enabled = coalesce(p_nudges_enabled, org_invoicing_settings.nudges_enabled),
    updated_at     = now(), updated_by = p_actor
  returning * into v_row;
  return v_row;
end$$;

-- Create or replace a DRAFT invoice with its line items. Only a draft may be
-- edited (a sent invoice is immutable at the header level — corrections are
-- new invoices / reversals). Returns the invoice row.
--   p_lines: jsonb array of { description, quantity_milli?, unit_price_minor }
create or replace function upsert_invoice(
  p_actor uuid, p_org uuid, p_lines jsonb,
  p_customer_name text, p_customer_email text default null,
  p_due_date date default null, p_issue_date date default null,
  p_currency char(3) default null, p_memo text default null,
  p_revenue_account_id uuid default null, p_invoice_id uuid default null
) returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_inv     invoices;
  v_seq     int;
  v_line    jsonb;
  v_qty     bigint;
  v_unit    bigint;
  v_amt     bigint;
  v_total   bigint := 0;
  v_pos     int := 0;
  v_ccy     char(3);
  v_issue   date := coalesce(p_issue_date, current_date);
  v_due     date;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_customer_name), '') = '' then
    raise exception 'bad_customer: customer_name required' using errcode = 'invalid_parameter_value';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception 'bad_lines: at least one line item required' using errcode = 'invalid_parameter_value';
  end if;

  v_ccy := coalesce(p_currency,
    (select home_currency from org_accounting_settings where org_id = p_org), 'USD');
  v_due := coalesce(p_due_date, v_issue + 30);
  if v_due < v_issue then
    raise exception 'bad_due: due_date before issue_date' using errcode = 'invalid_parameter_value';
  end if;

  -- optional explicit revenue account must belong to the org and be income-type
  if p_revenue_account_id is not null then
    if not exists (select 1 from ledger_accounts
       where id = p_revenue_account_id and org_id = p_org and type = 'income' and is_archived = false) then
      raise exception 'bad_revenue_account' using errcode = 'foreign_key_violation';
    end if;
  end if;

  if p_invoice_id is null then
    -- allocate the next human-friendly number (atomic per org)
    insert into org_invoicing_settings (org_id, next_invoice_seq, updated_by)
    values (p_org, 2, p_actor)
    on conflict (org_id) do update set
      next_invoice_seq = org_invoicing_settings.next_invoice_seq + 1,
      updated_at = now(), updated_by = p_actor
    returning next_invoice_seq - 1 into v_seq;

    insert into invoices (org_id, number, status, customer_name, customer_email,
      issue_date, due_date, currency, memo, revenue_account_id, created_by)
    values (p_org, 'INV-' || lpad(v_seq::text, 4, '0'), 'draft', p_customer_name, p_customer_email,
      v_issue, v_due, v_ccy, p_memo, p_revenue_account_id, p_actor)
    returning * into v_inv;
  else
    select * into v_inv from invoices where id = p_invoice_id and org_id = p_org;
    if not found then raise exception 'not_found: invoice' using errcode = 'no_data_found'; end if;
    if v_inv.status <> 'draft' then
      raise exception 'not_draft: only a draft invoice may be edited' using errcode = 'restrict_violation';
    end if;
    update invoices set customer_name = p_customer_name, customer_email = p_customer_email,
      issue_date = v_issue, due_date = v_due, currency = v_ccy, memo = p_memo,
      revenue_account_id = p_revenue_account_id
     where id = p_invoice_id returning * into v_inv;
    delete from invoice_lines where invoice_id = p_invoice_id;
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
    insert into invoice_lines (invoice_id, org_id, description, quantity_milli, unit_price_minor, amount_minor, position)
    values (v_inv.id, p_org, v_line->>'description', v_qty, v_unit, v_amt, v_pos);
    v_pos := v_pos + 1;
  end loop;

  update invoices set total_minor = v_total where id = v_inv.id returning * into v_inv;
  return v_inv;
end$$;

-- SEND: post the accrual entry (Dr AR / Cr Revenue) and flip status → 'sent'.
-- Idempotent: a re-send returns the already-sent invoice (the ledger post has a
-- stable idempotency key so it never double-posts). The actual EMAIL is sent by
-- the edge function AFTER this returns (email failure must not un-post the books).
create or replace function send_invoice(p_actor uuid, p_org uuid, p_invoice_id uuid)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_inv    invoices;
  v_ar     uuid;
  v_rev    uuid;
  v_entry  journal_entries;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_inv from invoices where id = p_invoice_id and org_id = p_org for update;
  if not found then raise exception 'not_found: invoice' using errcode = 'no_data_found'; end if;
  if v_inv.status = 'void' then
    raise exception 'voided: cannot send a voided invoice' using errcode = 'restrict_violation';
  end if;
  if v_inv.status <> 'draft' then return v_inv; end if;  -- already sent — idempotent
  if v_inv.total_minor <= 0 then
    raise exception 'empty_invoice: nothing to bill' using errcode = 'restrict_violation';
  end if;

  v_ar  := resolve_ar_account(p_actor, p_org);
  v_rev := coalesce(v_inv.revenue_account_id, resolve_revenue_account(p_actor, p_org));

  v_entry := post_journal_entry(
    p_actor, p_org, v_inv.issue_date, 'invoice:send:' || v_inv.id::text,
    jsonb_build_array(
      jsonb_build_object('account_id', v_ar,  'amount_minor', v_inv.total_minor, 'side', 'D', 'memo', v_inv.number),
      jsonb_build_object('account_id', v_rev, 'amount_minor', v_inv.total_minor, 'side', 'C', 'memo', v_inv.number)
    ), 'invoice', v_inv.id::text, 'Invoice ' || v_inv.number || ' — ' || v_inv.customer_name);

  update invoices set status = 'sent', sent_at = now(),
    post_entry_id = v_entry.id, revenue_account_id = v_rev
   where id = v_inv.id returning * into v_inv;
  return v_inv;
end$$;

-- APPLY PAYMENT: record a payment and post Dr Cash / Cr AR for the amount.
-- Advances status → 'partial' or 'paid'. Idempotent per payment row (the ledger
-- post keys on the payment id). Over-payment beyond the balance is rejected.
create or replace function apply_invoice_payment(
  p_actor uuid, p_org uuid, p_invoice_id uuid, p_amount_minor bigint,
  p_paid_date date default null, p_method text default null
) returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_inv     invoices;
  v_pay     invoice_payments;
  v_cash    uuid;
  v_ar      uuid;
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
  select * into v_inv from invoices where id = p_invoice_id and org_id = p_org for update;
  if not found then raise exception 'not_found: invoice' using errcode = 'no_data_found'; end if;
  if v_inv.status not in ('sent', 'partial') then
    raise exception 'not_payable: invoice is % (must be sent/partial)', v_inv.status using errcode = 'restrict_violation';
  end if;
  v_balance := v_inv.total_minor - v_inv.amount_paid_minor;
  if p_amount_minor > v_balance then
    raise exception 'overpayment: % exceeds balance %', p_amount_minor, v_balance using errcode = 'check_violation';
  end if;

  insert into invoice_payments (invoice_id, org_id, amount_minor, paid_date, method, created_by)
  values (p_invoice_id, p_org, p_amount_minor, v_date, p_method, p_actor)
  returning * into v_pay;

  v_cash := resolve_cash_account(p_actor, p_org);
  v_ar   := resolve_ar_account(p_actor, p_org);

  v_entry := post_journal_entry(
    p_actor, p_org, v_date, 'invoice:pay:' || v_pay.id::text,
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash, 'amount_minor', p_amount_minor, 'side', 'D', 'memo', v_inv.number),
      jsonb_build_object('account_id', v_ar,   'amount_minor', p_amount_minor, 'side', 'C', 'memo', v_inv.number)
    ), 'invoice_payment', v_inv.id::text, 'Payment on ' || v_inv.number);

  update invoice_payments set post_entry_id = v_entry.id where id = v_pay.id;

  v_newpaid := v_inv.amount_paid_minor + p_amount_minor;
  update invoices set amount_paid_minor = v_newpaid,
    status = case when v_newpaid >= v_inv.total_minor then 'paid'::invoice_status else 'partial'::invoice_status end
   where id = v_inv.id returning * into v_inv;
  return v_inv;
end$$;

-- VOID: reverse the accrual entry (append-only) and mark the invoice void. Only a
-- sent/partial invoice with NO payments applied may be voided (a paid invoice
-- must be handled with a credit note / refund path — out of scope). A draft is
-- simply deleted by the caller. Idempotent-ish: voiding a void is a no-op.
create or replace function void_invoice(p_actor uuid, p_org uuid, p_invoice_id uuid, p_memo text default null)
returns invoices language plpgsql security definer set search_path = public as $$
declare v_inv invoices;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_inv from invoices where id = p_invoice_id and org_id = p_org for update;
  if not found then raise exception 'not_found: invoice' using errcode = 'no_data_found'; end if;
  if v_inv.status = 'void' then return v_inv; end if;
  if v_inv.amount_paid_minor > 0 then
    raise exception 'has_payments: void not allowed after a payment; use a credit note' using errcode = 'restrict_violation';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'draft_delete: delete a draft rather than voiding it' using errcode = 'restrict_violation';
  end if;

  if v_inv.post_entry_id is not null then
    perform reverse_journal_entry(p_actor, p_org, v_inv.post_entry_id,
      'invoice:void:' || v_inv.id::text, current_date,
      coalesce(p_memo, 'Void of invoice ' || v_inv.number));
  end if;
  update invoices set status = 'void' where id = v_inv.id returning * into v_inv;
  return v_inv;
end$$;

-- Record a nudge was sent (throttles cadence). Called by the edge fn after a
-- reminder email goes out. Read-gated to service_role.
create or replace function mark_invoice_nudged(p_actor uuid, p_org uuid, p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update invoices set last_nudge_at = now() where id = p_invoice_id and org_id = p_org;
end$$;

-- =============================================================================
-- AR aging (read) — the classic 0-30 / 31-60 / 61-90 / 90+ buckets over OPEN
-- balances (sent/partial, not fully paid). granted to authenticated (RLS-safe:
-- gated on can_access_org). p_asof defaults to today.
-- =============================================================================
create or replace function invoice_ar_aging(p_org uuid, p_asof date default null)
returns table (
  bucket text, invoice_count int, balance_minor bigint
) language sql stable security definer set search_path = public as $$
  with asof as (select coalesce(p_asof, current_date) d),
  open_inv as (
    select i.id,
           (i.total_minor - i.amount_paid_minor) as bal,
           ((select d from asof) - i.due_date) as days_overdue
    from invoices i
    where i.org_id = p_org
      and can_access_org(p_org)
      and i.status in ('sent', 'partial')
      and (i.total_minor - i.amount_paid_minor) > 0
  ),
  bucketed as (
    select case
             when days_overdue <= 0  then 'current'
             when days_overdue <= 30 then '1-30'
             when days_overdue <= 60 then '31-60'
             when days_overdue <= 90 then '61-90'
             else '90+'
           end as bucket, bal
    from open_inv
  )
  -- Always return all five buckets (0 when empty) so the reader has a stable
  -- shape. count(b.bucket) counts only matched rows (NULL from the left join is
  -- not counted), so an empty bucket is a true 0 — not a spurious 1.
  select ord.bucket,
         count(b.bucket)::int,
         coalesce(sum(b.bal), 0)::bigint
  from (values ('current'),('1-30'),('31-60'),('61-90'),('90+')) as ord(bucket)
  left join bucketed b on b.bucket = ord.bucket
  group by ord.bucket
  order by array_position(array['current','1-30','31-60','61-90','90+'], ord.bucket);
$$;

-- Invoices due a nudge: opt-in orgs, sent/partial, past due, and not nudged
-- within p_cadence_days. p_cadence_days comes from platform_config (the caller
-- reads get_effective_behavior_config → invoice_nudge_cadence_days). Never a
-- hardcoded interval. granted to service_role (the nudge dispatcher).
create or replace function invoices_due_nudge(p_org uuid, p_cadence_days int, p_asof date default null)
returns setof invoices language sql stable security definer set search_path = public as $$
  select i.* from invoices i
  join org_invoicing_settings s on s.org_id = i.org_id
  where i.org_id = p_org
    and s.enabled and s.nudges_enabled
    and i.status in ('sent', 'partial')
    and i.customer_email is not null
    and i.due_date < coalesce(p_asof, current_date)
    and (i.last_nudge_at is null
         or i.last_nudge_at < now() - make_interval(days => greatest(p_cadence_days, 1)))
  order by i.due_date asc;
$$;

-- =============================================================================
-- Grants — lock write RPCs to service_role; reads the app calls direct → authenticated.
-- =============================================================================
revoke all on function resolve_ar_account(uuid, uuid)      from public;
revoke all on function resolve_revenue_account(uuid, uuid)  from public;
revoke all on function resolve_cash_account(uuid, uuid)     from public;
revoke all on function set_invoicing_settings(uuid, uuid, boolean, boolean) from public;
revoke all on function upsert_invoice(uuid, uuid, jsonb, text, text, date, date, char, text, uuid, uuid) from public;
revoke all on function send_invoice(uuid, uuid, uuid)      from public;
revoke all on function apply_invoice_payment(uuid, uuid, uuid, bigint, date, text) from public;
revoke all on function void_invoice(uuid, uuid, uuid, text) from public;
revoke all on function mark_invoice_nudged(uuid, uuid, uuid) from public;
revoke all on function invoices_due_nudge(uuid, int, date) from public;

grant execute on function set_invoicing_settings(uuid, uuid, boolean, boolean) to service_role;
grant execute on function upsert_invoice(uuid, uuid, jsonb, text, text, date, date, char, text, uuid, uuid) to service_role;
grant execute on function send_invoice(uuid, uuid, uuid)      to service_role;
grant execute on function apply_invoice_payment(uuid, uuid, uuid, bigint, date, text) to service_role;
grant execute on function void_invoice(uuid, uuid, uuid, text) to service_role;
grant execute on function mark_invoice_nudged(uuid, uuid, uuid) to service_role;
grant execute on function invoices_due_nudge(uuid, int, date) to service_role;

-- AR aging is a client read (owner sees "who owes me").
grant execute on function invoice_ar_aging(uuid, date) to authenticated;

-- =============================================================================
-- Config: seed the nudge cadence (DATA, admin-tunable). Merge into the singleton
-- so existing keys stay intact. MUST match apps/app/src/copy/config.ts.
-- =============================================================================
update platform_config
   set behavior = behavior || jsonb_build_object('invoice_nudge_cadence_days', 7),
       updated_at = now()
 where id = true;

-- =============================================================================
-- Email templates (admin-editable copy) — the send path falls back to the code
-- FALLBACK in _shared/send.ts if a row is missing, but seeding them lets admins
-- edit the invoice/reminder copy in Settings → Emails. on-conflict-do-nothing
-- preserves later admin edits. {number}/{customer}/{amount}/{due} are filled by
-- the invoicing fn. The email_templates table may not exist on an old stack, so
-- guard the insert.
-- =============================================================================
do $$
begin
  if to_regclass('public.email_templates') is not null then
    insert into public.email_templates (email_key, label, eyebrow, subject, preheader, heading, intro, cta_label, footer) values
      ('invoice_sent', 'Invoice — sent to customer',
       'Invoice · {number}',
       'Invoice {number} from FounderFirst — {amount} due {due}',
       'Here''s your invoice for {amount}, due {due}. View and pay online.',
       'Hi {customer}, here''s invoice {number}.',
       'Thanks for your business. The details are below — you can view and pay online any time.',
       'View & pay invoice',
       'Sent on behalf of your supplier via FounderFirst. Reply to this email with any questions.'),
      ('invoice_nudge', 'Invoice — gentle reminder',
       'Invoice · {number}',
       'A gentle reminder: invoice {number} — {amount} due',
       'Just a friendly nudge — invoice {number} for {amount} is now due.',
       'Hi {customer}, a quick reminder on invoice {number}.',
       'No rush — just flagging that this one''s now due. You can view and pay online whenever it''s convenient.',
       'View & pay invoice',
       'Sent on behalf of your supplier via FounderFirst. Already paid? Please ignore this note.')
    on conflict (email_key) do nothing;
  end if;
end$$;

-- =============================================================================
-- End of migration.
-- =============================================================================
