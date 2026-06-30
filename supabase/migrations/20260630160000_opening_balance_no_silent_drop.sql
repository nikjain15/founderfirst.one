-- OBTEST (stress: opening-balances) — opening-balance commit must NOT silently drop rows.
--
-- ⚠️ INTEGRATOR — PROD LEDGER DRIFT. The live `commit_import_batch` on prod
-- (ejqsfzggyfsjzrcevlnq) does NOT match any migration in the repo. The migration
-- ledger records `20260630075000_import_commit_integrity` as the latest definition
-- (which RAISES `import_row_invalid` and posts nothing when an opening row is missing
-- account/side/amount), but the deployed function is a later, out-of-band version
-- (it adds `set local statement_timeout='170s'` and a per-row sub-block in the CSV
-- branch). That out-of-band version REVERTED the #6 opening-balance guard: its
-- opening branch silently marks an invalid `ready` row as 'error', drops it, posts
-- the remaining rows as a "balanced" entry (the imbalance is absorbed by the Opening
-- Balance Equity plug), and returns `committed` (HTTP 200) with no signal. Verified
-- live 2026-06-30:
--   ready rows: [Cash D 100000] + [<no account> C 30000]
--   → posted: Cash D 100000, OBE C 100000  (the C 30000 the user entered VANISHED;
--      OBE inflated from the correct 70000 to 100000; balance sheet wrong but ties).
--
-- This migration reproduces the DEPLOYED body VERBATIM (so the CSV/bank_statement
-- branch, statement_timeout, and per-row isolation are preserved untouched for the
-- parallel CSV-import work) and changes ONLY the opening_balances/trial_balance
-- branch: an opening entry is ONE balanced entry where the OBE plug is the legitimate
-- debit/credit difference — you cannot partially post it correctly. So if any `ready`
-- opening row is missing account / side / amount, RAISE a clear, row-naming error and
-- post NOTHING (atomic), restoring the 20260630075000 intent. The companion client
-- fix (apps/app/src/import/ImportFlow.tsx) blocks half-filled rows before commit, so
-- this server guard is defense-in-depth for API misuse / non-UI callers.
--
-- ⚠️ WRITE-BUT-DON'T-DEPLOY (stress-program rule). Do NOT `db push` this. Integrator:
-- first reconcile the prod drift (decide whether the deployed body is the intended
-- baseline and back-fill it into a real migration), THEN apply this opening-branch
-- correction on top. Shared function — also touched by CSV import (#6) and Phase 4.

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
  -- A bulk history import legitimately runs longer than the API role's short
  -- default; lift it for THIS transaction only (still bounded, still atomic).
  set local statement_timeout = '170s';

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
      if v_row.amount_minor > 0 then
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_bank,   'amount_minor', v_row.amount_minor,  'side', 'D'),
          jsonb_build_object('account_id', v_contra, 'amount_minor', v_row.amount_minor,  'side', 'C'));
      else
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_contra, 'amount_minor', -v_row.amount_minor, 'side', 'D'),
          jsonb_build_object('account_id', v_bank,   'amount_minor', -v_row.amount_minor, 'side', 'C'));
      end if;
      -- Per-row sub-block: a single bad row (closed period, archived account, …) is
      -- isolated and reported, instead of aborting the whole import.
      begin
        v_entry := post_journal_entry(
          p_actor, p_org, v_row.txn_date,
          'import:' || p_batch::text || ':' || v_row.id::text,
          v_lines, 'import', p_batch::text, v_row.description);
        update import_rows set status = 'posted', journal_entry_id = v_entry.id, error = null where id = v_row.id;
      exception when others then
        update import_rows set status = 'error', error = left(SQLERRM, 300) where id = v_row.id;
      end;
    end loop;

  else  -- trial_balance / opening_balances → ONE balanced entry at cutover (all-or-nothing)
    if v_b.cutover_date is null then raise exception 'no_cutover_date' using errcode = 'invalid_parameter_value'; end if;
    -- OBTEST P0 fix: an opening entry is a single balanced entry whose OBE plug is the
    -- legitimate D/C difference. A `ready` row missing account/side/amount cannot be
    -- partially posted — dropping it and plugging the gap to OBE produces a silently
    -- WRONG (but balanced) opening balance sheet. Fail clearly and post NOTHING; the
    -- raise rolls back the whole transaction (atomic), so the user fixes and re-imports.
    if exists (select 1 from import_rows where batch_id = p_batch and status = 'ready'
                 and (account_id is null or side is null or coalesce(amount_minor,0) = 0)) then
      raise exception 'import_row_invalid: an opening-balance row is missing account / side / amount — fix or remove it and re-import (no rows were posted)'
        using errcode = 'invalid_parameter_value';
    end if;
    -- plug + lines computed over the identical, all-valid set
    select coalesce(sum(case when side='D' then abs(amount_minor) else 0 end),0),
           coalesce(sum(case when side='C' then abs(amount_minor) else 0 end),0)
      into v_debits, v_credits
      from import_rows where batch_id = p_batch and status = 'ready';
    v_lines := (select jsonb_agg(jsonb_build_object(
                  'account_id', account_id, 'amount_minor', abs(amount_minor), 'side', side,
                  'memo', description))
                from import_rows where batch_id = p_batch and status = 'ready');
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
