-- #5 + #6 — import commit integrity.
--
-- #5 (silent partial data loss): the csv/bank branch marked invalid 'ready' rows
-- as 'error' and CONTINUED, then reported the batch 'committed' with no count —
-- so transactions could vanish with no signal and the frozen batch could never
-- re-post them. Now the commit is ATOMIC: an invalid 'ready' row RAISES (naming the
-- row), rolling the whole commit back so nothing is silently dropped — the user
-- fixes the row and re-imports.
--
-- #6 (trial-balance plug mis-sized): v_debits/v_credits summed over ALL ready rows
-- but v_lines posted only rows with account_id+side+amount, so the Opening Balance
-- Equity plug was sized off a superset and a legit import failed opaquely as
-- "unbalanced". Now ready opening-balance rows are validated up front (raise if any
-- is missing account/side/amount), so the plug and the posted lines are computed
-- over the identical, all-valid set.
--
-- Reproduces commit_import_batch verbatim except those two changes.

create or replace function commit_import_batch(p_actor uuid, p_org uuid, p_batch uuid)
returns import_batches language plpgsql security definer set search_path = public as $$
declare
  v_b      import_batches;
  v_row    import_rows;
  v_entry  journal_entries;
  v_bank   uuid;
  v_obe    uuid;
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
    -- one balanced entry per row: bank vs contra, sided by signed amount
    for v_row in select * from import_rows where batch_id = p_batch and status = 'ready' order by row_num loop
      if v_row.account_id is null or coalesce(v_row.amount_minor,0) = 0 or v_row.txn_date is null then
        -- #5: atomic — abort the whole commit rather than silently dropping the row.
        raise exception 'import_row_invalid: row % is missing date / amount / account — fix or remove it and re-import (no rows were posted)', v_row.row_num
          using errcode = 'invalid_parameter_value';
      end if;
      if v_row.amount_minor > 0 then  -- money into the bank
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_bank,         'amount_minor', v_row.amount_minor,  'side', 'D'),
          jsonb_build_object('account_id', v_row.account_id,'amount_minor', v_row.amount_minor,  'side', 'C'));
      else                            -- money out of the bank
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_row.account_id,'amount_minor', -v_row.amount_minor, 'side', 'D'),
          jsonb_build_object('account_id', v_bank,          'amount_minor', -v_row.amount_minor, 'side', 'C'));
      end if;
      v_entry := post_journal_entry(
        p_actor, p_org, v_row.txn_date,
        'import:' || p_batch::text || ':' || v_row.id::text,
        v_lines, 'import', p_batch::text, v_row.description);
      update import_rows set status = 'posted', journal_entry_id = v_entry.id, error = null where id = v_row.id;
    end loop;

  else  -- trial_balance / opening_balances → one balanced entry at cutover
    if v_b.cutover_date is null then raise exception 'no_cutover_date' using errcode = 'invalid_parameter_value'; end if;
    -- #6: every ready opening-balance row must have account + side + amount, else the
    -- plug would be sized over a different set than the posted lines. Fail clearly.
    if exists (select 1 from import_rows where batch_id = p_batch and status = 'ready'
                 and (account_id is null or side is null or coalesce(amount_minor,0) = 0)) then
      raise exception 'import_row_invalid: an opening-balance row is missing account / side / amount — fix or remove it and re-import (no rows were posted)'
        using errcode = 'invalid_parameter_value';
    end if;
    -- plug + lines now computed over the identical, all-valid set
    select coalesce(sum(case when side='D' then abs(amount_minor) else 0 end),0),
           coalesce(sum(case when side='C' then abs(amount_minor) else 0 end),0)
      into v_debits, v_credits
      from import_rows where batch_id = p_batch and status = 'ready';
    v_lines := (select jsonb_agg(jsonb_build_object(
                  'account_id', account_id, 'amount_minor', abs(amount_minor), 'side', side,
                  'memo', description))
                from import_rows where batch_id = p_batch and status = 'ready');
    -- plug any imbalance to Opening Balance Equity so the books open balanced
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

revoke all on function commit_import_batch(uuid, uuid, uuid) from public;
grant execute on function commit_import_batch(uuid, uuid, uuid) to service_role;
