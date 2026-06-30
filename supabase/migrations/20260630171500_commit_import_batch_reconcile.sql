-- [stress:sync] Reconcile the THREE concurrent edits to commit_import_batch into ONE
-- canonical body + resolve the PGRST203 overload ambiguity.
--
-- Prod had two overloads that collided:
--   • 3-arg (this session, PR #142): F0 qbo/xero bank branch + F1 'ext:' dedup key.
--   • 4-arg (parallel session): chunked commit (p_limit) + per-row error isolation,
--     but MISSING F0/F1, and its `p_limit integer DEFAULT 4000` made a 3-arg call
--     ambiguous → PostgREST PGRST203 (HTTP 300).
--
-- Fix: the 4-arg becomes the SINGLE implementation = chunking + per-row isolation
-- (kept verbatim) MERGED WITH F0 (qbo/xero) + F1 (ext: key). The DEFAULT is removed,
-- so `commit_import_batch(uuid,uuid,uuid)` matches ONLY the 3-arg, which is now a thin
-- wrapper that commits everything in one call (a very high limit) — preserving today's
-- single-call contract for the app's `imports` edge fn.
--
-- ⚠ INTEGRATOR / OBTEST (PR #135): the opening-balance branch below is kept exactly as
-- the parallel session deployed it (partial-post + error-mark). If OBTEST's "raise +
-- post-nothing" opening fix is the chosen behavior, merge it INTO this one body — do not
-- reintroduce a competing overload.

-- must drop to remove the DEFAULT (CREATE OR REPLACE can't change a param's default away).
drop function if exists commit_import_batch(uuid, uuid, uuid, integer);

create function commit_import_batch(p_actor uuid, p_org uuid, p_batch uuid, p_limit integer)
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
      -- F1: stable provider key so a re-pull + re-commit collides (no double-post);
      -- csv/manual rows (no external_id) keep the per-row key.
      v_key := case
                 when v_row.external_id is not null and v_row.external_id <> ''
                   then 'ext:' || v_b.source::text || ':' || v_row.external_id
                 else 'import:' || p_batch::text || ':' || v_row.id::text
               end;
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
end$$;

-- 3-arg wrapper: commit everything in one call (no chunking) — preserves the single-call
-- contract the `imports` edge fn relies on. Because the 4-arg has NO default, a 3-arg call
-- is unambiguous → no more PGRST203.
create or replace function commit_import_batch(p_actor uuid, p_org uuid, p_batch uuid)
returns import_batches language plpgsql security definer set search_path = public as $$
begin
  return commit_import_batch(p_actor, p_org, p_batch, 2147483647);
end$$;

revoke all on function commit_import_batch(uuid, uuid, uuid)          from public;
revoke all on function commit_import_batch(uuid, uuid, uuid, integer) from public;
grant execute on function commit_import_batch(uuid, uuid, uuid)          to service_role;
grant execute on function commit_import_batch(uuid, uuid, uuid, integer) to service_role;
