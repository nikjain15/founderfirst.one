-- Phase 4 — Penny categorization, brick 2: the "Uncategorized" holding account
-- + the propose/approve loop's read side (ARCHITECTURE.md §6, §11).
--
-- Brick 1 (20260629170000) gave us the rule store, the matcher, and the
-- recategorize write-path. But imported bank transactions whose contra account
-- couldn't be resolved were SKIPPED at commit (marked 'error'), so nothing ever
-- actually "sat uncategorized" in the ledger for Penny to work on. This brick:
--   1. resolve_uncategorized_account — an idempotent, well-known holding account
--      per org (mirrors resolve_opening_balance_equity), so the contra always
--      exists and the books stay balanced.
--   2. commit_import_batch — null-contra rows now POST against that account
--      instead of erroring; the transaction lands, visibly uncategorized.
--   3. list_uncategorized_entries — the read the Penny UI + categorize fn use to
--      enumerate entries still posted against the holding account.

-- ── 1. the well-known holding account ───────────────────────────────────────
-- A single "Uncategorized" expense bucket (QuickBooks "Ask My Accountant"
-- pattern). Recategorize moves a line off it the moment Penny's proposal is
-- approved, so income mis-bucketed here is corrected on approve — it only ever
-- holds the not-yet-reviewed tail, and its P&L presence is the to-do signal.
create or replace function resolve_uncategorized_account(p_actor uuid, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts
   where org_id = p_org and is_archived = false
     and (code = '9999' or lower(name) = 'uncategorized')
   order by (code = '9999') desc limit 1;
  if v_id is not null then return v_id; end if;
  v_id := (upsert_ledger_account(p_actor, p_org, 'Uncategorized', 'expense'::account_type, '9999')).id;
  return v_id;
end$$;

-- ── 2. commit_import_batch — land null-contra rows on Uncategorized ──────────
-- Identical to 20260629160000 except the null-account branch resolves the
-- holding account (once per commit) and posts there rather than skipping.
create or replace function commit_import_batch(p_actor uuid, p_org uuid, p_batch uuid)
returns import_batches language plpgsql security definer set search_path = public as $$
declare
  v_b      import_batches;
  v_row    import_rows;
  v_entry  journal_entries;
  v_bank   uuid;
  v_obe    uuid;
  v_uncat  uuid;
  v_contra uuid;
  v_lines  jsonb;
  v_debits bigint := 0;
  v_credits bigint := 0;
  v_diff   bigint;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_b from import_batches where id = p_batch and org_id = p_org for update;
  if not found then raise exception 'not_found: batch % not in org %', p_batch, p_org using errcode = 'no_data_found'; end if;
  if v_b.status = 'committed' then return v_b; end if;            -- idempotent
  if v_b.status = 'discarded' then raise exception 'batch is discarded' using errcode = 'restrict_violation'; end if;
  if not exists (select 1 from import_rows where batch_id = p_batch and status = 'ready') then
    raise exception 'nothing_to_commit: no rows are marked ready' using errcode = 'no_data_found';
  end if;

  if v_b.source in ('csv', 'bank_statement') then
    v_bank := v_b.bank_account_id;
    if v_bank is null then raise exception 'no_bank_account: csv/statement import needs a bank account' using errcode = 'invalid_parameter_value'; end if;
    -- one balanced entry per row: bank vs contra, sided by signed amount.
    -- An unresolved contra falls back to the Uncategorized holding account so
    -- the transaction still posts (and shows up for Penny to categorize).
    for v_row in select * from import_rows where batch_id = p_batch and status = 'ready' order by row_num loop
      if coalesce(v_row.amount_minor,0) = 0 or v_row.txn_date is null then
        update import_rows set status = 'error', error = 'missing date / amount' where id = v_row.id;
        continue;
      end if;
      v_contra := v_row.account_id;
      if v_contra is null then
        if v_uncat is null then v_uncat := resolve_uncategorized_account(p_actor, p_org); end if;
        v_contra := v_uncat;
      end if;
      if v_row.amount_minor > 0 then  -- money into the bank
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_bank,   'amount_minor', v_row.amount_minor,  'side', 'D'),
          jsonb_build_object('account_id', v_contra, 'amount_minor', v_row.amount_minor,  'side', 'C'));
      else                            -- money out of the bank
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_contra, 'amount_minor', -v_row.amount_minor, 'side', 'D'),
          jsonb_build_object('account_id', v_bank,   'amount_minor', -v_row.amount_minor, 'side', 'C'));
      end if;
      v_entry := post_journal_entry(
        p_actor, p_org, v_row.txn_date,
        'import:' || p_batch::text || ':' || v_row.id::text,
        v_lines, 'import', p_batch::text, v_row.description);
      update import_rows set status = 'posted', journal_entry_id = v_entry.id, error = null where id = v_row.id;
    end loop;

  else  -- trial_balance / opening_balances → one balanced entry at cutover
    if v_b.cutover_date is null then raise exception 'no_cutover_date' using errcode = 'invalid_parameter_value'; end if;
    select coalesce(sum(case when side='D' then abs(amount_minor) else 0 end),0),
           coalesce(sum(case when side='C' then abs(amount_minor) else 0 end),0)
      into v_debits, v_credits
      from import_rows where batch_id = p_batch and status = 'ready';
    v_lines := (select jsonb_agg(jsonb_build_object(
                  'account_id', account_id, 'amount_minor', abs(amount_minor), 'side', side,
                  'memo', description))
                from import_rows where batch_id = p_batch and status = 'ready'
                  and account_id is not null and side is not null and coalesce(amount_minor,0) <> 0);
    v_diff := v_debits - v_credits;
    if v_diff <> 0 then
      v_obe := resolve_opening_balance_equity(p_actor, p_org);
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_obe, 'amount_minor', abs(v_diff),
        'side', case when v_diff > 0 then 'C' else 'D' end, 'memo', 'Opening balance plug'));
    end if;
    v_entry := post_journal_entry(
      p_actor, p_org, v_b.cutover_date,
      'import:' || p_batch::text || ':opening',
      v_lines, 'import', p_batch::text, 'Opening balances');
    update import_rows set status = 'posted', journal_entry_id = v_entry.id
      where batch_id = p_batch and status = 'ready';
  end if;

  update import_batches set status = 'committed', committed_by = p_actor, committed_at = now()
    where id = p_batch returning * into v_b;
  return v_b;
end$$;

-- ── 3. list_uncategorized_entries — the read for the propose/approve UI ──────
-- Every still-live entry with a line on the Uncategorized holding account.
-- Excludes the reversed originals (status) and the reversal entries (source) a
-- recategorize leaves behind, so an approved entry drops off the list at once.
create or replace function list_uncategorized_entries(p_org uuid)
returns table (
  entry_id        uuid,
  entry_date      date,
  memo            text,
  source          text,
  source_ref      text,
  line_id         uuid,
  amount_minor    bigint,
  side            char(1),
  currency        char(3),
  from_account_id uuid,
  created_at      timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare v_uncat uuid;
begin
  if not can_access_org(p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select id into v_uncat from ledger_accounts
   where org_id = p_org and is_archived = false
     and (code = '9999' or lower(name) = 'uncategorized')
   order by (code = '9999') desc limit 1;
  if v_uncat is null then return; end if;            -- no holding account yet → nothing uncategorized

  return query
    select je.id, je.entry_date, je.memo, je.source, je.source_ref,
           jl.id, jl.amount_minor, jl.side, jl.currency, jl.account_id, je.created_at
      from journal_entries je
      join journal_lines  jl on jl.entry_id = je.id and jl.account_id = v_uncat
     where je.org_id = p_org
       and je.status = 'posted'
       and je.source <> 'reversal'
     order by je.entry_date desc, je.created_at desc;
end$$;

-- ── grants ──────────────────────────────────────────────────────────────────
revoke all on function resolve_uncategorized_account(uuid, uuid) from public;
revoke all on function list_uncategorized_entries(uuid)          from public;
grant execute on function resolve_uncategorized_account(uuid, uuid) to service_role;
grant execute on function list_uncategorized_entries(uuid)          to authenticated, service_role;
