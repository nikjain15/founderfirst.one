-- [stress:sync] Two confirmed breaks in the QBO/Xero import → commit path.
--
-- F0 (P1) — provider-import commit was DEAD ON ARRIVAL. qbo-import / xero-import
--   stage bank-style rows (bank_account_id + signed amount + contra account_id, no
--   `side`, no cutover_date) under source 'qbo'/'xero'. But commit_import_batch only
--   routed source in ('csv','bank_statement') to the per-row bank branch; 'qbo'/'xero'
--   fell through to the opening-balance branch, which raises `no_cutover_date`
--   (cutover is null for provider pulls) — proven live on prod (SQLSTATE 22023).
--   So every staged provider batch was un-committable: "pull your history" produced
--   rows that could never post. FIX: treat 'qbo'/'xero' as bank-style.
--
-- F1 (P1) — DOUBLE-POST on re-pull. The per-row idempotency key was
--   'import:<batch>:<row>'; a second pull makes a new batch with new row ids → new
--   keys → the SAME provider transaction posts twice (unique(org,idempotency_key)
--   can't catch it). FIX: carry the provider's stable txn id (import_rows.external_id)
--   and key provider rows on 'ext:<source>:<external_id>', so a re-pulled+re-committed
--   txn collides and post_journal_entry returns the original (no double-post). CSV /
--   opening rows are unchanged (they keep the per-row key).
--
-- Reproduces add_import_rows (phase3 160000) and commit_import_batch (import-commit-
-- integrity 075000) VERBATIM except the changes noted inline.  ⚠ INTEGRATOR: this
-- redefines the shared commit_import_batch + add_import_rows and adds a column — do
-- NOT deploy in isolation; sequence with the qbo-import/xero-import edge-fn changes
-- in the same wave (the edge fns send `external_id`; older fns simply omit it → the
-- per-row key path, no regression).

-- 1. provider's stable transaction id, preserved on the staged row.
alter table import_rows add column if not exists external_id text;
create index if not exists import_rows_external_idx on import_rows (org_id, external_id) where external_id is not null;

-- 2. add_import_rows — persist external_id (everything else verbatim from phase3).
create or replace function add_import_rows(
  p_actor uuid, p_org uuid, p_batch uuid, p_rows jsonb
) returns int language plpgsql security definer set search_path = public as $$
declare v_status import_status; v_n int;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select status into v_status from import_batches where id = p_batch and org_id = p_org;
  if not found then raise exception 'not_found: batch % not in org %', p_batch, p_org using errcode = 'no_data_found'; end if;
  if v_status in ('committed','discarded') then
    raise exception 'batch is % — rows are frozen', v_status using errcode = 'restrict_violation';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'bad_rows: expected a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  delete from import_rows where batch_id = p_batch;  -- re-stage replaces
  insert into import_rows (batch_id, org_id, row_num, raw, txn_date, description, amount_minor, account_id, side, status, external_id)
  select p_batch, p_org,
         (r->>'row_num')::int,
         coalesce(r->'raw', '{}'::jsonb),
         nullif(r->>'txn_date','')::date,
         r->>'description',
         nullif(r->>'amount_minor','')::bigint,
         nullif(r->>'account_id','')::uuid,
         nullif(r->>'side',''),
         coalesce(nullif(r->>'status','')::import_row_status, 'pending'),
         nullif(r->>'external_id','')                       -- NEW: provider stable id
  from jsonb_array_elements(p_rows) r;
  get diagnostics v_n = row_count;

  update import_batches set status = 'previewed' where id = p_batch and status = 'draft';
  return v_n;
end$$;

-- 3. commit_import_batch — route 'qbo'/'xero' through the bank branch (F0) and use a
--    stable provider idempotency key (F1). Verbatim from 20260630075000 otherwise.
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
  v_key    text;
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

  -- F0: provider pulls (qbo/xero) are bank-style (bank vs contra, signed amount),
  -- exactly like csv/bank_statement — NOT opening balances.
  if v_b.source in ('csv', 'bank_statement', 'qbo', 'xero') then
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
      -- F1: a provider txn carries a stable external_id → key on it so a re-pull +
      -- re-commit collides (post_journal_entry returns the original, no double-post).
      -- CSV/manual rows have no external_id → keep the per-row key (unchanged).
      v_key := case
                 when v_row.external_id is not null and v_row.external_id <> ''
                   then 'ext:' || v_b.source::text || ':' || v_row.external_id
                 else 'import:' || p_batch::text || ':' || v_row.id::text
               end;
      v_entry := post_journal_entry(
        p_actor, p_org, v_row.txn_date,
        v_key,
        v_lines, 'import', p_batch::text, v_row.description);
      update import_rows set status = 'posted', journal_entry_id = v_entry.id, error = null where id = v_row.id;
    end loop;

  else  -- trial_balance / opening_balances → one balanced entry at cutover
    if v_b.cutover_date is null then raise exception 'no_cutover_date' using errcode = 'invalid_parameter_value'; end if;
    -- every ready opening-balance row must have account + side + amount, else the
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

revoke all on function add_import_rows(uuid, uuid, uuid, jsonb)   from public;
revoke all on function commit_import_batch(uuid, uuid, uuid)      from public;
grant execute on function add_import_rows(uuid, uuid, uuid, jsonb)   to service_role;
grant execute on function commit_import_batch(uuid, uuid, uuid)      to service_role;
