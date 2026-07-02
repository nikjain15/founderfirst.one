-- [reconcile:import] Fold QBO/Xero routing + #135's opening-balance guard into the
-- CURRENT LIVE commit_import_batch(4-arg).
--
-- Base = the live 4-arg (categorization session's version: external_id dedup +
-- content-key md5 dedup + chunking + per-row isolation). This single CREATE OR
-- REPLACE preserves ALL of that and folds in, without removing any behavior:
--   (a) QBO/Xero ROUTING — source in ('qbo','xero') runs the bank/contra branch so
--       provider rows commit (was clobbered by an out-of-band rebuild), AND
--   (b) OBTEST #135's OPENING-BALANCE GUARD — a `ready` opening row missing
--       account/side/amount RAISES import_row_invalid and posts NOTHING (atomic),
--       instead of silently dropping it into the OBE plug ("balanced" but wrong).
--
-- Only the opening/trial-balance `else` branch changes vs. live; the bank branch
-- (routing, ext-key + content-key dedup, dup-skip, chunking, per-row isolation) is
-- copied verbatim. The 3-arg wrapper (delegates with p_limit = 2147483647) is
-- unchanged and NOT redefined here.
--
-- Invariants (verify on prod after apply):
--   • routes qbo/xero → bank branch (provider rows commit)                     ✅
--   • raises import_row_invalid (22023 path → SQLSTATE from errcode) on a
--     ready opening row missing account/side/amount, posts nothing              ✅
--   • preserves external_id dedup + content-key (md5) dedup + chunking           ✅
--   • every posted entry balances (post_journal_entry enforces Dr==Cr)          ✅
--
-- NOTE (control tower): repo-only. Do NOT db push blindly — the live body carries
-- statement_timeout/other out-of-band bits recorded in no migration; the tower
-- baselines live → back-fills the ledger → applies this opening-branch fold on top.

create or replace function commit_import_batch(p_actor uuid, p_org uuid, p_batch uuid, p_limit integer)
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
  -- nothing to do AND nothing was ever staged-then-processed → genuine empty commit
  if not exists (select 1 from import_rows where batch_id = p_batch and status = 'ready')
     and not exists (select 1 from import_rows where batch_id = p_batch and status in ('posted','error')) then
    raise exception 'nothing_to_commit: no rows are marked ready' using errcode = 'no_data_found';
  end if;

  -- F0 (folded): provider pulls (qbo/xero) are bank-style, exactly like csv/bank_statement.
  if v_b.source in ('csv', 'bank_statement', 'qbo', 'xero') then
    v_bank := v_b.bank_account_id;
    if v_bank is null then raise exception 'no_bank_account: csv/statement import needs a bank account' using errcode = 'invalid_parameter_value'; end if;
    -- CHUNK: process at most p_limit ready rows this call (each call = one statement
    -- under the timeout). The edge fn re-invokes until the batch is 'committed'.
    for v_row in select * from import_rows where batch_id = p_batch and status = 'ready' order by row_num limit greatest(p_limit, 1) loop
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
      -- Stable dedup key. Provider feeds use their transaction id so a re-pull
      -- collides; CSV/manual rows (no external_id) use a CONTENT key
      -- (org+bank+date+amount+description) so re-uploading the same file collides.
      v_key := case
                 when v_row.external_id is not null and v_row.external_id <> ''
                   then 'ext:' || v_b.source::text || ':' || v_row.external_id
                 else 'import:' || p_org::text || ':' || coalesce(v_bank::text, '') || ':'
                      || coalesce(v_row.txn_date::text, '') || ':' || v_row.amount_minor::text || ':'
                      || md5(lower(btrim(coalesce(v_row.description, ''))))
               end;
      -- If we've imported this exact transaction before (any prior batch), skip +
      -- report instead of doubling. Never silently drops — surfaced as 'skipped'.
      if exists (select 1 from journal_entries where org_id = p_org and idempotency_key = v_key) then
        update import_rows set status = 'skipped', error = 'duplicate of an already-imported transaction' where id = v_row.id;
        continue;
      end if;
      -- Per-row sub-block: a single bad row (closed period, archived account, …) is
      -- isolated and reported, instead of aborting the whole import.
      begin
        v_entry := post_journal_entry(
          p_actor, p_org, v_row.txn_date,
          v_key,
          v_lines, 'import', p_batch::text, v_row.description);
        update import_rows set status = 'posted', journal_entry_id = v_entry.id, error = null where id = v_row.id;
      exception when others then
        update import_rows set status = 'error', error = left(SQLERRM, 300) where id = v_row.id;
      end;
    end loop;

  else  -- trial_balance / opening_balances → ONE balanced entry at cutover (all-or-nothing)
    if v_b.cutover_date is null then raise exception 'no_cutover_date' using errcode = 'invalid_parameter_value'; end if;
    -- OBTEST #135 guard: an opening entry is a single balanced entry whose OBE plug is
    -- the legitimate D/C difference. A `ready` row missing account/side/amount cannot
    -- be partially posted — dropping it and plugging the gap to OBE produces a silently
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

  -- Finalize only when no 'ready' rows remain. Chunking may leave a tail for the next
  -- call → return the still-open batch so the edge fn loops again.
  if exists (select 1 from import_rows where batch_id = p_batch and status = 'ready') then
    return v_b;
  end if;
  update import_batches set status = 'committed', committed_by = p_actor, committed_at = now()
    where id = p_batch returning * into v_b;
  return v_b;
end$$;

revoke all on function commit_import_batch(uuid, uuid, uuid, integer) from public;
grant execute on function commit_import_batch(uuid, uuid, uuid, integer) to service_role;
