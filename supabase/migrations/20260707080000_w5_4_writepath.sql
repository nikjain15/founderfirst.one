-- W5.4 — Multi-currency, slice 3: the write-path. post_journal_entry resolves
-- a base-currency equivalent for every line (design §3/§4); invoices carry a
-- booking rate so settlement can compute realized FX (design §5); period close
-- runs the unrealized-FX revaluation + auto-reverse (D4).
--
-- Signature of post_journal_entry is UNCHANGED (p_lines stays jsonb) — grants
-- from 20260629125000 still apply. Two new optional per-line keys, both
-- backward compatible (absent → today's single-currency behavior byte-for-byte):
--   fx_rate            — manual override; skips the fx_rates lookup
--   base_amount_minor  — explicit base value (system-generated FX plug/
--                         revaluation lines only; amount_minor is then the
--                         real transaction-currency face value, typically 0 for
--                         a pure base-currency adjustment — design §5).

create or replace function post_journal_entry(
  p_actor           uuid,
  p_org             uuid,
  p_entry_date      date,
  p_idempotency_key text,
  p_lines           jsonb,
  p_source          text default 'manual',
  p_source_ref      text default null,
  p_memo            text default null
) returns journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_entry     journal_entries;
  v_existing  journal_entries;
  v_period_id uuid;
  v_home_ccy  char(3);
  v_line      jsonb;
  v_debits    bigint := 0;
  v_credits   bigint := 0;
  v_bad       int;
  v_status    entry_status := 'posted';
  v_require   boolean;
  v_ccy       char(3);
  v_rate      numeric;
  v_base      bigint;
  v_source    text;
begin
  -- 1. authorization (actor from verified JWT; auth.uid() is null under service role)
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;

  -- 2. idempotency — a replay returns the original, never double-posts
  select * into v_existing from journal_entries
   where org_id = p_org and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  -- 3. line shape
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'bad_lines: expected a JSON array of lines' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'bad_lines: an entry needs at least two lines' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(home_currency, 'USD') into v_home_ccy from org_accounting_settings where org_id = p_org;
  v_home_ccy := coalesce(v_home_ccy, 'USD');

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if (v_line->>'account_id') is null
       or coalesce(v_line->>'side', '') not in ('D', 'C')
       or (v_line->>'amount_minor') is null then
      raise exception 'bad_line: each line needs account_id, side D|C, amount_minor' using errcode = 'invalid_parameter_value';
    end if;
    if (v_line->>'amount_minor')::bigint < 0 then
      raise exception 'bad_line: amount_minor must be a non-negative integer in minor units' using errcode = 'invalid_parameter_value';
    end if;
    if (v_line->>'base_amount_minor') is null and (v_line->>'amount_minor')::bigint = 0 then
      raise exception 'bad_line: amount_minor may only be 0 for a system FX plug line (base_amount_minor required)' using errcode = 'invalid_parameter_value';
    end if;
    if (v_line->>'side') = 'D' then v_debits := v_debits + (v_line->>'amount_minor')::bigint;
    else                            v_credits := v_credits + (v_line->>'amount_minor')::bigint;
    end if;
  end loop;

  -- 4. every referenced account belongs to this org and is not archived
  select count(*) into v_bad
  from jsonb_array_elements(p_lines) l
  left join ledger_accounts a
    on a.id = (l->>'account_id')::uuid and a.org_id = p_org and a.is_archived = false
  where a.id is null;
  if v_bad > 0 then
    raise exception 'bad_account: a line references an account not in this org (or archived)' using errcode = 'foreign_key_violation';
  end if;

  -- 5. balanced (belt). Friendly early error for the common single-currency case;
  --    the deferred trigger enforces per-currency balance authoritatively at commit.
  if v_debits <> v_credits then
    raise exception 'unbalanced: debits (%) <> credits (%)', v_debits, v_credits using errcode = 'check_violation';
  end if;

  -- 6. period: auto-create an open monthly period; reject a closed one
  v_period_id := ensure_open_period(p_org, p_entry_date);

  -- 7. approval gate: a CPA acting via engagement (not a business member) lands
  --    pending_review when the org requires it; members post directly.
  select coalesce(cpa_posts_require_approval, false) into v_require
    from org_accounting_settings where org_id = p_org;
  if coalesce(v_require, false) and not has_membership_as(p_actor, p_org) then
    v_status := 'pending_review';
  end if;

  -- 8. atomic insert (one txn; the deferred balance triggers fire at commit)
  insert into journal_entries
    (org_id, entry_date, period_id, memo, status, source, source_ref, reverses_id, idempotency_key, posted_by)
  values
    (p_org, p_entry_date, v_period_id, p_memo, v_status, coalesce(p_source, 'manual'), p_source_ref, null, p_idempotency_key, p_actor)
  returning * into v_entry;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ccy := coalesce(v_line->>'currency', v_home_ccy);
    if (v_line->>'base_amount_minor') is not null then
      -- system-generated FX plug/revaluation line: base value is given directly.
      v_base   := (v_line->>'base_amount_minor')::bigint;
      v_rate   := nullif(v_line->>'fx_rate', '')::numeric;
      v_source := coalesce(v_line->>'fx_rate_source', 'residual');
    elsif v_ccy = v_home_ccy then
      v_base := (v_line->>'amount_minor')::bigint;
      v_rate := 1;
      v_source := 'home';
    else
      v_rate := nullif(v_line->>'fx_rate', '')::numeric;
      if v_rate is not null then
        v_source := 'manual';
      else
        v_rate := resolve_fx_rate(v_ccy, v_home_ccy, p_entry_date);
        v_source := 'fx_rates:ECB';
        if v_rate is null then
          raise exception 'fx_rate_required: no rate found for % -> % on % — provide fx_rate explicitly',
            v_ccy, v_home_ccy, p_entry_date
            using errcode = 'invalid_parameter_value';
        end if;
      end if;
      v_base := round((v_line->>'amount_minor')::bigint * v_rate)::bigint;
    end if;

    insert into journal_lines
      (entry_id, org_id, account_id, amount_minor, currency, side, memo,
       base_amount_minor, fx_rate, fx_rate_source, fx_rate_date)
    values
      (v_entry.id, p_org, (v_line->>'account_id')::uuid, (v_line->>'amount_minor')::bigint,
       v_ccy, v_line->>'side', v_line->>'memo',
       v_base, v_rate, v_source, p_entry_date);
  end loop;

  return v_entry;
exception
  when unique_violation then
    -- a concurrent post with the same idempotency_key won the race; return theirs
    select * into v_existing from journal_entries
     where org_id = p_org and idempotency_key = p_idempotency_key;
    return v_existing;
end$$;

-- reverse_journal_entry (last redefined 20260702000000) copied the original
-- lines' (account_id, amount_minor, currency, side, memo) but NOT the new
-- base_amount_minor/fx_rate/fx_rate_source/fx_rate_date columns — since
-- base_amount_minor is NOT NULL with no default, every reversal (not just an
-- FX one) would now fail. Flipping `side` alone is still correct: the base
-- magnitude is unchanged, only its direction flips, exactly mirroring the
-- transaction-currency flip. Byte-identical otherwise (still FOR UPDATE +
-- roll-forward, LEARNINGS #15).
create or replace function reverse_journal_entry(p_actor uuid, p_org uuid, p_entry_id uuid, p_idempotency_key text, p_entry_date date default null, p_memo text default null)
returns journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_orig     journal_entries;
  v_new      journal_entries;
  v_existing journal_entries;
  v_period   uuid;
  v_date     date;
  v_probe    date;
  v_pstatus  period_status;
  v_pid      uuid;
  v_guard    int := 0;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from journal_entries where org_id = p_org and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  select * into v_orig from journal_entries where id = p_entry_id and org_id = p_org for update;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_orig.status = 'reversed' then raise exception 'already_reversed' using errcode = 'restrict_violation'; end if;
  if v_orig.status <> 'posted'  then raise exception 'not_posted: only a posted entry can be reversed' using errcode = 'restrict_violation'; end if;

  if p_entry_date is not null then
    v_date := p_entry_date;
  else
    v_probe := current_date;
    loop
      select id, status into v_pid, v_pstatus
      from accounting_periods
      where org_id = p_org and v_probe between period_start and period_end
      order by period_start desc
      limit 1;
      exit when v_pid is null or v_pstatus = 'open';
      v_probe := (date_trunc('month', v_probe) + interval '1 month')::date;
      v_guard := v_guard + 1;
      if v_guard > 120 then
        raise exception 'no_open_period: no open period within 10 years to post the reversal'
          using errcode = 'restrict_violation';
      end if;
    end loop;
    v_date := v_probe;
  end if;

  v_period := ensure_open_period(p_org, v_date);

  insert into journal_entries
    (org_id, entry_date, period_id, memo, status, source, source_ref, reverses_id, idempotency_key, posted_by)
  values
    (p_org, v_date, v_period, coalesce(p_memo, 'Reversal of ' || v_orig.id::text),
     'posted', 'reversal', v_orig.id::text, v_orig.id, p_idempotency_key, p_actor)
  returning * into v_new;

  insert into journal_lines
    (entry_id, org_id, account_id, amount_minor, currency, side, memo,
     base_amount_minor, fx_rate, fx_rate_source, fx_rate_date)
  select v_new.id, p_org, account_id, amount_minor, currency,
         case when side = 'D' then 'C' else 'D' end, memo,
         base_amount_minor, fx_rate, fx_rate_source, fx_rate_date
  from journal_lines where entry_id = v_orig.id;

  update journal_entries set status = 'reversed' where id = v_orig.id;

  return v_new;
exception
  when unique_violation then
    select * into v_existing from journal_entries where org_id = p_org and idempotency_key = p_idempotency_key;
    return v_existing;
end$$;

-- =============================================================================
-- Invoicing — foreign-currency booking rate + realized FX on settlement.
-- =============================================================================

alter table invoices add column fx_rate numeric; -- booking-date rate vs home; null = home-currency invoice

-- send_invoice: resolve ONE rate for both the AR and Revenue lines (same rate on
-- both legs ⇒ their base values are identical ⇒ base-balances trivially, no plug
-- needed) and store it on the invoice for apply_invoice_payment to reuse when
-- clearing AR (design §5: AR must clear at its BOOKING rate, not the settlement
-- rate — the difference between the two is the realized gain/loss).
create or replace function send_invoice(p_actor uuid, p_org uuid, p_invoice_id uuid)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_inv    invoices;
  v_ar     uuid;
  v_rev    uuid;
  v_entry  journal_entries;
  v_home   char(3);
  v_rate   numeric;
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

  select coalesce(home_currency, 'USD') into v_home from org_accounting_settings where org_id = p_org;
  if v_inv.currency = coalesce(v_home, 'USD') then
    v_rate := null; -- home-currency invoice: post_journal_entry resolves rate=1 itself
  else
    v_rate := resolve_fx_rate(v_inv.currency, v_home, v_inv.issue_date);
    if v_rate is null then
      raise exception 'fx_rate_required: no rate found for % -> % on % — provide a manual rate before sending',
        v_inv.currency, v_home, v_inv.issue_date using errcode = 'invalid_parameter_value';
    end if;
  end if;

  v_entry := post_journal_entry(
    p_actor, p_org, v_inv.issue_date, 'invoice:send:' || v_inv.id::text,
    jsonb_build_array(
      jsonb_build_object('account_id', v_ar,  'amount_minor', v_inv.total_minor, 'side', 'D', 'memo', v_inv.number, 'currency', v_inv.currency, 'fx_rate', v_rate),
      jsonb_build_object('account_id', v_rev, 'amount_minor', v_inv.total_minor, 'side', 'C', 'memo', v_inv.number, 'currency', v_inv.currency, 'fx_rate', v_rate)
    ), 'invoice', v_inv.id::text, 'Invoice ' || v_inv.number || ' — ' || v_inv.customer_name);

  update invoices set status = 'sent', sent_at = now(),
    post_entry_id = v_entry.id, revenue_account_id = v_rev, fx_rate = coalesce(v_rate, 1)
   where id = v_inv.id returning * into v_inv;
  return v_inv;
end$$;

-- apply_invoice_payment: clear AR at its BOOKING rate (v_inv.fx_rate), book Cash
-- at the settlement rate (p_fx_rate override, else resolved for p_paid_date),
-- and fold the base-currency residual into Realized FX — a single zero-amount
-- plug line in the invoice's OWN transaction currency, so it doesn't perturb
-- the per-currency invariant (design §5; that trigger is unchanged, LEARNINGS #6).
--
-- Adds a trailing p_fx_rate param — a strictly new signature (7 args vs the
-- original 6), so DROP the old overload first or callers using named args
-- become ambiguous between the two.
drop function if exists apply_invoice_payment(uuid, uuid, uuid, bigint, date, text);

create or replace function apply_invoice_payment(
  p_actor uuid, p_org uuid, p_invoice_id uuid, p_amount_minor bigint,
  p_paid_date date default null, p_method text default null, p_fx_rate numeric default null
) returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_inv       invoices;
  v_pay       invoice_payments;
  v_cash      uuid;
  v_ar        uuid;
  v_fx        uuid;
  v_entry     journal_entries;
  v_balance   bigint;
  v_newpaid   bigint;
  v_date      date := coalesce(p_paid_date, current_date);
  v_home      char(3);
  v_settle    numeric;
  v_booking   numeric;
  v_base_cash bigint;
  v_base_ar   bigint;
  v_residual  bigint;
  v_lines     jsonb;
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

  select coalesce(home_currency, 'USD') into v_home from org_accounting_settings where org_id = p_org;
  v_booking := coalesce(v_inv.fx_rate, 1);

  if v_inv.currency = coalesce(v_home, 'USD') then
    -- home-currency invoice: no FX dimension, unchanged behavior.
    v_entry := post_journal_entry(
      p_actor, p_org, v_date, 'invoice:pay:' || v_pay.id::text,
      jsonb_build_array(
        jsonb_build_object('account_id', v_cash, 'amount_minor', p_amount_minor, 'side', 'D', 'memo', v_inv.number),
        jsonb_build_object('account_id', v_ar,   'amount_minor', p_amount_minor, 'side', 'C', 'memo', v_inv.number)
      ), 'invoice_payment', v_inv.id::text, 'Payment on ' || v_inv.number);
  else
    v_settle := coalesce(p_fx_rate, resolve_fx_rate(v_inv.currency, v_home, v_date));
    if v_settle is null then
      raise exception 'fx_rate_required: no rate found for % -> % on % — pass fx_rate explicitly',
        v_inv.currency, v_home, v_date using errcode = 'invalid_parameter_value';
    end if;
    v_base_cash := round(p_amount_minor * v_settle)::bigint;
    v_base_ar   := round(p_amount_minor * v_booking)::bigint; -- clears AR at ITS booking rate
    v_residual  := v_base_cash - v_base_ar; -- + = realized gain, - = realized loss

    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_cash, 'amount_minor', p_amount_minor, 'side', 'D', 'memo', v_inv.number, 'currency', v_inv.currency, 'fx_rate', v_settle),
      jsonb_build_object('account_id', v_ar,   'amount_minor', p_amount_minor, 'side', 'C', 'memo', v_inv.number, 'currency', v_inv.currency, 'fx_rate', v_booking)
    );
    if v_residual <> 0 then
      v_fx := resolve_realized_fx_account(p_actor, p_org);
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_fx, 'amount_minor', 0,
        'side', case when v_residual > 0 then 'C' else 'D' end,
        'memo', 'Realized FX on ' || v_inv.number,
        'currency', v_inv.currency,
        'base_amount_minor', abs(v_residual),
        'fx_rate_source', 'residual'));
    end if;
    v_entry := post_journal_entry(
      p_actor, p_org, v_date, 'invoice:pay:' || v_pay.id::text,
      v_lines, 'invoice_payment', v_inv.id::text, 'Payment on ' || v_inv.number);
  end if;

  update invoice_payments set post_entry_id = v_entry.id where id = v_pay.id;

  v_newpaid := v_inv.amount_paid_minor + p_amount_minor;
  update invoices set amount_paid_minor = v_newpaid,
    status = case when v_newpaid >= v_inv.total_minor then 'paid'::invoice_status else 'partial'::invoice_status end
   where id = v_inv.id returning * into v_inv;
  return v_inv;
end$$;

-- =============================================================================
-- Period close — unrealized FX revaluation (D4: auto at close + auto-reverse).
-- =============================================================================
--
-- For every foreign-currency monetary account with an open balance in the
-- closing period, revalue its base carrying value to the period-end rate and
-- post the delta against Unrealized FX. Both lines of each adjustment share the
-- account's OWN foreign currency at amount_minor=0 (no face-value/cash
-- movement — design §5), so the existing per-currency trigger sees a trivial
-- 0=0 group and only the new base-balance trigger sees the real delta. The
-- adjustment auto-reverses at the START of the next period (first-class
-- reversing entry, LEARNINGS #15/#16) so realized recognition later isn't
-- double-counted. Idempotent per (period, account) — a retry is a no-op.
create or replace function run_period_fx_revaluation(p_actor uuid, p_org uuid, p_period_id uuid)
returns setof journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_enabled   boolean;
  v_home      char(3);
  v_period    accounting_periods;
  v_next_date date;
  v_acct      record;
  v_rate      numeric;
  v_carried   bigint;
  v_revalued  bigint;
  v_delta     bigint;
  v_entry     journal_entries;
  v_rev_entry journal_entries;
  v_unreal    uuid;
begin
  select coalesce(multi_currency_enabled, false), coalesce(home_currency, 'USD')
    into v_enabled, v_home
    from org_accounting_settings where org_id = p_org;
  if not coalesce(v_enabled, false) then return; end if;

  select * into v_period from accounting_periods where id = p_period_id and org_id = p_org;
  if not found then raise exception 'not_found: period % not in org %', p_period_id, p_org using errcode = 'no_data_found'; end if;

  v_unreal := resolve_unrealized_fx_account(p_actor, p_org);

  -- Grouped by (account, LINE currency) — not the account's own nominal
  -- currency. Shared accounts (e.g. the single org-wide AR/Cash resolved by
  -- resolve_ar_account/resolve_cash_account) hold lines in whatever currency
  -- each invoice/payment used, independent of ledger_accounts.currency, so the
  -- foreign sub-balance only shows up by grouping on l.currency.
  for v_acct in
    select a.id, l.currency as l_ccy,
           coalesce(sum(case when l.side = 'D' then coalesce(l.base_amount_minor, l.amount_minor) else -coalesce(l.base_amount_minor, l.amount_minor) end), 0) as carried_base,
           coalesce(sum(case when l.side = 'D' then l.amount_minor      else -l.amount_minor end), 0)      as face_amount
    from ledger_accounts a
    join journal_lines l on l.account_id = a.id
    join journal_entries e on e.id = l.entry_id and e.status <> 'pending_review'
    where a.org_id = p_org and l.currency <> v_home and is_monetary_account(a.id)
      and e.entry_date <= v_period.period_end
    group by a.id, l.currency
    having coalesce(sum(case when l.side = 'D' then l.amount_minor else -l.amount_minor end), 0) <> 0
  loop
    v_rate := resolve_fx_rate(v_acct.l_ccy, v_home, v_period.period_end);
    if v_rate is null then continue; end if; -- no snapshot for this date — skip, don't guess (design §4)

    v_carried  := v_acct.carried_base;
    v_revalued := round(v_acct.face_amount * v_rate)::bigint;
    v_delta    := v_revalued - v_carried;
    if v_delta = 0 then continue; end if;

    v_entry := post_journal_entry(
      p_actor, p_org, v_period.period_end,
      'fxreval:' || p_period_id::text || ':' || v_acct.id::text || ':' || v_acct.l_ccy,
      jsonb_build_array(
        jsonb_build_object('account_id', v_acct.id, 'amount_minor', 0,
          'side', case when v_delta > 0 then 'D' else 'C' end,
          'memo', 'Period-end FX revaluation', 'currency', v_acct.l_ccy,
          'base_amount_minor', abs(v_delta), 'fx_rate_source', 'residual'),
        jsonb_build_object('account_id', v_unreal, 'amount_minor', 0,
          'side', case when v_delta > 0 then 'C' else 'D' end,
          'memo', 'Period-end FX revaluation', 'currency', v_acct.l_ccy,
          'base_amount_minor', abs(v_delta), 'fx_rate_source', 'residual')
      ), 'fx_revaluation', v_acct.id::text, 'Unrealized FX revaluation');
    return next v_entry;

    -- auto-reverse at the start of the NEXT period (D4).
    v_next_date := v_period.period_end + 1;
    perform ensure_open_period(p_org, v_next_date);
    v_rev_entry := reverse_journal_entry(
      p_actor, p_org, v_entry.id,
      'fxreval:' || p_period_id::text || ':' || v_acct.id::text || ':' || v_acct.l_ccy || ':reverse',
      v_next_date, 'Reversal of period-end FX revaluation');
    return next v_rev_entry;
  end loop;
end$$;

-- close_accounting_period: run the revaluation BEFORE flipping status (it must
-- post INTO the closing period — design §5 "guarded by the close-vs-post
-- lock"), same lock order (entry → period) the FOR SHARE hardening established.
create or replace function close_accounting_period(p_actor uuid, p_org uuid, p_period_id uuid)
returns accounting_periods language plpgsql security definer set search_path = public as $$
declare v_p accounting_periods;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  perform run_period_fx_revaluation(p_actor, p_org, p_period_id);
  update accounting_periods set status = 'closed', closed_by = p_actor, closed_at = now()
   where id = p_period_id and org_id = p_org
  returning * into v_p;
  if not found then raise exception 'not_found: period % not in org %', p_period_id, p_org using errcode = 'no_data_found'; end if;
  return v_p;
end$$;

revoke all on function run_period_fx_revaluation(uuid, uuid, uuid) from public;
grant execute on function run_period_fx_revaluation(uuid, uuid, uuid) to service_role;
grant execute on function apply_invoice_payment(uuid, uuid, uuid, bigint, date, text, numeric) to service_role;
revoke all on function apply_invoice_payment(uuid, uuid, uuid, bigint, date, text, numeric) from public;
