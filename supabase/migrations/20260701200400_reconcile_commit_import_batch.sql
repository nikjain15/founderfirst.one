-- [reconcile:cattest] Captured from LIVE prod — repo/prod parity, NOT re-applied here.
-- Idempotent CREATE OR REPLACE reflecting the exact deployed state after the
-- categorization + import stress-test fixes. Control tower backfills schema_migrations.

drop function if exists commit_import_batch(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.commit_import_batch(p_actor uuid, p_org uuid, p_batch uuid, p_limit integer)
 RETURNS import_batches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- F0: provider pulls (qbo/xero) are bank-style, exactly like csv/bank_statement.
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
      -- Stable dedup key. Provider feeds (OFX/bank) use their transaction id so a
      -- re-pull collides; CSV/manual rows (no external_id) use a CONTENT key
      -- (org+bank+date+amount+description) so re-uploading the same file collides
      -- too — the reported "re-upload doubled the books" bug.
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

  else  -- trial_balance / opening_balances → one balanced entry at cutover
        -- (kept verbatim from the parallel 4-arg deploy; OBTEST PR #135 may refine this).
    if v_b.cutover_date is null then raise exception 'no_cutover_date' using errcode = 'invalid_parameter_value'; end if;
    select coalesce(sum(case when side='D' then abs(amount_minor) else 0 end),0),
           coalesce(sum(case when side='C' then abs(amount_minor) else 0 end),0)
      into v_debits, v_credits
      from import_rows where batch_id = p_batch and status = 'ready'
        and account_id is not null and side is not null and coalesce(amount_minor,0) <> 0;
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
      where batch_id = p_batch and status = 'ready'
        and account_id is not null and side is not null and coalesce(amount_minor,0) <> 0;
    update import_rows set status = 'error', error = 'missing account / side / amount'
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
end$function$


revoke all on function commit_import_batch(uuid,uuid,uuid,integer) from public;
grant execute on function commit_import_batch(uuid,uuid,uuid,integer) to service_role;
