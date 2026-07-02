-- W2 gate fix (P1) · Cross-source ingest de-dup — LEARNINGS #16 "balances ≠ correct".
--
-- DEFECT: the ledger now has THREE ingest paths — CSV/QBO/Xero import
-- (commit_import_batch) and Plaid sync (plaid_ingest_transactions) — that each
-- dedup only WITHIN their own source namespace (`ext:csv:*` / `ext:qbo:<id>` /
-- `ext:plaid:<txn_id>`, or the CSV content-key `import:org:bank:date:amt:md5`).
-- So the SAME real-world bank transaction imported once via CSV and later synced
-- via Plaid on the SAME bank account posts TWICE: both entries balance, the trial
-- balance still ties, and the books are silently wrong (double bank + double
-- expense/income).
--
-- POLICY (already locked — CSV F4 = skip dupes; extended across sources): a
-- transaction that is the same real-world bank txn as one already posted from ANY
-- OTHER source on the same org+bank-account is SKIPPED (not posted again), while
-- genuine distinct txns still post.
--
-- ── CONTENT-HASH RECIPE (the transaction's economic identity) ────────────────
--   ingest_content_hash(org, bank_account, posted_date, amount_minor, description)
--     = md5( org_id
--          | bank_account_id            -- which cash/bank account
--          | posted_date                -- the txn date as posted
--          | amount_minor (SIGNED)      -- sign carries debit/credit direction
--          | normalized_description )   -- lower / trim / collapse-whitespace
--   normalized_description = regexp_replace(lower(btrim(desc)), '\s+', ' ', 'g').
-- Two rows with the same recipe are the same real bank txn regardless of source.
--
-- ── DEDUP RULE: CROSS-SOURCE ONLY (why) ──────────────────────────────────────
-- We dedup ONLY when a matching active entry exists from a DIFFERENT source.
--   • same content_hash + DIFFERENT source  → SKIP (the CSV↔Plaid double-post).
--   • same content_hash + SAME source        → NOT touched here; the source's own
--     `ext:<source>:<id>` / CSV content-key idempotency decides (unchanged), so
--     Plaid webhook replay + QBO re-pull dedup EXACTLY as the red-teams verified,
--     and two genuinely-distinct same-day/same-amount/same-desc txns from ONE
--     source (e.g. two $5 coffees) still BOTH post — a single source hands us
--     distinct external ids, so it never collapses its own distinct rows.
-- This is the safe choice: "same real txn from two SOURCES = one entry" WITHOUT
-- ever wrongly merging two real distinct txns from one source. There is no
-- reliable automatic tie-breaker to distinguish two identical-looking txns that
-- arrive from two DIFFERENT sources (that IS the case we intend to collapse), so
-- cross-source collapse is exactly the intended and only ambiguous case.
--
-- ── REVERSAL-AWARE ───────────────────────────────────────────────────────────
-- The index is consulted for ACTIVE entries only (journal_entries.status <>
-- 'reversed'). A reversed/removed prior entry does NOT block a later legitimate
-- re-post — its index row is pruned when the entry is reversed.

-- ── the cross-source content index ───────────────────────────────────────────
-- One row per posted ingest entry, carrying its economic content hash + the
-- source it came from. Kept separate from journal_entries so post_journal_entry
-- (20 callers) is untouched; the ingest paths own this index.
create table if not exists ingest_content_index (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  bank_account_id uuid not null references ledger_accounts(id) on delete cascade,
  content_hash    text not null,
  source          text not null,               -- 'csv' | 'qbo' | 'xero' | 'plaid' | …
  entry_id        uuid not null references journal_entries(id) on delete cascade,
  created_at      timestamptz not null default now()
);
create index if not exists ingest_content_index_lookup_idx
  on ingest_content_index (org_id, bank_account_id, content_hash);
create index if not exists ingest_content_index_entry_idx
  on ingest_content_index (entry_id);

alter table ingest_content_index enable row level security;
-- service-role only (SECURITY DEFINER RPCs write it); no public policy.

-- ── content-hash: the economic identity of a bank transaction ────────────────
create or replace function ingest_content_hash(
  p_org             uuid,
  p_bank_account    uuid,
  p_posted_date     date,
  p_amount_minor    bigint,          -- SIGNED: sign carries debit/credit direction
  p_description     text
) returns text language sql immutable set search_path = public as $$
  select md5(
    p_org::text || '|' ||
    coalesce(p_bank_account::text, '') || '|' ||
    coalesce(p_posted_date::text, '') || '|' ||
    p_amount_minor::text || '|' ||
    regexp_replace(lower(btrim(coalesce(p_description, ''))), '\s+', ' ', 'g')
  );
$$;

-- ── find a CROSS-SOURCE active duplicate (else null) ─────────────────────────
-- Returns the entry_id of an ACTIVE (not reversed) entry with the same content
-- hash on the same org+bank account that came from a DIFFERENT source. Same-source
-- matches are intentionally ignored (the source's own ext-key idempotency governs).
create or replace function find_crosssource_dup(
  p_org           uuid,
  p_bank_account  uuid,
  p_content_hash  text,
  p_source        text
) returns uuid language sql stable security definer set search_path = public as $$
  select i.entry_id
    from ingest_content_index i
    join journal_entries je on je.id = i.entry_id
   where i.org_id = p_org
     and i.bank_account_id = p_bank_account
     and i.content_hash = p_content_hash
     and i.source is distinct from p_source     -- CROSS-source only
     and je.status <> 'reversed'                -- reversal-aware: skip cancelled
   limit 1;
$$;

-- ── record an entry's content in the index (called after a successful post) ──
create or replace function record_ingest_content(
  p_org           uuid,
  p_bank_account  uuid,
  p_content_hash  text,
  p_source        text,
  p_entry_id      uuid
) returns void language sql security definer set search_path = public as $$
  insert into ingest_content_index (org_id, bank_account_id, content_hash, source, entry_id)
  values (p_org, p_bank_account, p_content_hash, p_source, p_entry_id);
$$;

revoke all on function ingest_content_hash(uuid, uuid, date, bigint, text) from public;
revoke all on function find_crosssource_dup(uuid, uuid, text, text) from public;
revoke all on function record_ingest_content(uuid, uuid, text, text, uuid) from public;
grant execute on function ingest_content_hash(uuid, uuid, date, bigint, text) to service_role;
grant execute on function find_crosssource_dup(uuid, uuid, text, text) to service_role;
grant execute on function record_ingest_content(uuid, uuid, text, text, uuid) to service_role;

-- ── prune the index when an entry is reversed (reversal-aware re-post) ───────
-- A reversed entry must not block a later legitimate re-post of the same content,
-- so drop its index rows the moment it flips to 'reversed'. (ON DELETE CASCADE
-- covers hard deletes; this covers soft-reversal, the normal correction path.)
create or replace function prune_ingest_index_on_reversal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'reversed' and old.status <> 'reversed' then
    delete from ingest_content_index where entry_id = new.id;
  end if;
  return new;
end$$;

drop trigger if exists trg_prune_ingest_index_on_reversal on journal_entries;
create trigger trg_prune_ingest_index_on_reversal
  after update of status on journal_entries
  for each row execute function prune_ingest_index_on_reversal();

-- ═══════════════════════════════════════════════════════════════════════════
-- Re-wire commit_import_batch (CSV / bank_statement / QBO / Xero) to consult
-- the cross-source index. Body copied verbatim from 20260701210000 (the live
-- fold); ONLY the bank branch's dedup adds the cross-source check + records the
-- content on a successful post. Same-source ext-key/content-key dedup unchanged.
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_chash  text;
  v_dupe   uuid;
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
  if not exists (select 1 from import_rows where batch_id = p_batch and status = 'ready')
     and not exists (select 1 from import_rows where batch_id = p_batch and status in ('posted','error')) then
    raise exception 'nothing_to_commit: no rows are marked ready' using errcode = 'no_data_found';
  end if;

  if v_b.source in ('csv', 'bank_statement', 'qbo', 'xero') then
    v_bank := v_b.bank_account_id;
    if v_bank is null then raise exception 'no_bank_account: csv/statement import needs a bank account' using errcode = 'invalid_parameter_value'; end if;
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
      -- Same-source idempotency key (UNCHANGED): provider feeds use their txn id so a
      -- re-pull collides; CSV/manual rows use the content key so re-uploading the same
      -- file collides. This preserves QBO re-pull + CSV re-upload dedup exactly.
      v_key := case
                 when v_row.external_id is not null and v_row.external_id <> ''
                   then 'ext:' || v_b.source::text || ':' || v_row.external_id
                 else 'import:' || p_org::text || ':' || coalesce(v_bank::text, '') || ':'
                      || coalesce(v_row.txn_date::text, '') || ':' || v_row.amount_minor::text || ':'
                      || md5(lower(btrim(coalesce(v_row.description, ''))))
               end;
      if exists (select 1 from journal_entries where org_id = p_org and idempotency_key = v_key) then
        update import_rows set status = 'skipped', error = 'duplicate of an already-imported transaction' where id = v_row.id;
        continue;
      end if;
      -- CROSS-SOURCE dedup (NEW): the SAME real bank txn already posted from a
      -- DIFFERENT source (e.g. this row is CSV but Plaid already synced it) → skip,
      -- surfaced as 'skipped' (never silently dropped), per the skip-dupes policy.
      v_chash := ingest_content_hash(p_org, v_bank, v_row.txn_date, v_row.amount_minor, v_row.description);
      v_dupe  := find_crosssource_dup(p_org, v_bank, v_chash, v_b.source::text);
      if v_dupe is not null then
        update import_rows set status = 'skipped',
          error = 'duplicate of a transaction already imported from another source' where id = v_row.id;
        continue;
      end if;
      begin
        v_entry := post_journal_entry(
          p_actor, p_org, v_row.txn_date,
          v_key,
          v_lines, 'import', p_batch::text, v_row.description);
        update import_rows set status = 'posted', journal_entry_id = v_entry.id, error = null where id = v_row.id;
        -- record this entry's economic content so a LATER other-source ingest skips it
        perform record_ingest_content(p_org, v_bank, v_chash, v_b.source::text, v_entry.id);
      exception when others then
        update import_rows set status = 'error', error = left(SQLERRM, 300) where id = v_row.id;
      end;
    end loop;

  else  -- trial_balance / opening_balances → ONE balanced entry at cutover (unchanged)
    if v_b.cutover_date is null then raise exception 'no_cutover_date' using errcode = 'invalid_parameter_value'; end if;
    if exists (select 1 from import_rows where batch_id = p_batch and status = 'ready'
                 and (account_id is null or side is null or coalesce(amount_minor,0) = 0)) then
      raise exception 'import_row_invalid: an opening-balance row is missing account / side / amount — fix or remove it and re-import (no rows were posted)'
        using errcode = 'invalid_parameter_value';
    end if;
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

  if exists (select 1 from import_rows where batch_id = p_batch and status = 'ready') then
    return v_b;
  end if;
  update import_batches set status = 'committed', committed_by = p_actor, committed_at = now()
    where id = p_batch returning * into v_b;
  return v_b;
end$$;

revoke all on function commit_import_batch(uuid, uuid, uuid, integer) from public;
grant execute on function commit_import_batch(uuid, uuid, uuid, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Re-wire plaid_ingest_transactions (Plaid sync/webhook) to consult the
-- cross-source index. Body copied verbatim from 20260704030000; ONLY the ADD
-- branch adds the cross-source check (after the same-source plaid replay guard),
-- and every successful ADD/MODIFY post records its content into the index so a
-- LATER CSV/QBO import of the same real txn is skipped. Same-source replay +
-- reversal-based modify/remove semantics are UNCHANGED (red-team-verified).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.plaid_ingest_transactions(
  p_actor uuid,
  p_org   uuid,
  p_conn  uuid,
  p_added    jsonb default '[]'::jsonb,
  p_modified jsonb default '[]'::jsonb,
  p_removed  jsonb default '[]'::jsonb
) returns jsonb
  language plpgsql security definer set search_path to 'public' as $$
declare
  v_bank    uuid;
  v_uncat   uuid;
  v_txn     jsonb;
  v_bt      bank_transactions;
  v_entry   journal_entries;
  v_lines   jsonb;
  v_key     text;
  v_amt     bigint;
  v_date    date;
  v_desc    text;
  v_tid     text;
  v_chash   text;
  v_dupe    uuid;
  n_added   int := 0;
  n_modified int := 0;
  n_removed int := 0;
  n_skipped int := 0;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from external_connections where id = p_conn and org_id = p_org and provider = 'plaid') then
    raise exception 'no_connection: plaid connection % not in org %', p_conn, p_org using errcode = 'no_data_found';
  end if;

  select account_id into v_bank from external_connections where id = p_conn;
  if v_bank is null then
    v_bank := (upsert_ledger_account(p_actor, p_org, 'Bank (Plaid)', 'asset'::account_type, '1050')).id;
    update external_connections set account_id = v_bank where id = p_conn;
  end if;
  v_uncat := resolve_uncategorized_account(p_actor, p_org);

  -- ADD: a new transaction. Same-source replay guard, then CROSS-SOURCE guard.
  for v_txn in select * from jsonb_array_elements(coalesce(p_added, '[]'::jsonb)) loop
    v_tid  := v_txn->>'transaction_id';
    if v_tid is null or v_tid = '' then continue; end if;
    -- same-source replay guard (UNCHANGED): already have this Plaid txn → skip.
    if exists (select 1 from bank_transactions where org_id = p_org and plaid_transaction_id = v_tid) then
      n_skipped := n_skipped + 1;
      continue;
    end if;
    v_amt  := coalesce((v_txn->>'amount_minor')::bigint, 0);
    v_date := nullif(v_txn->>'date','')::date;
    v_desc := coalesce(nullif(v_txn->>'name',''), 'Bank transaction');
    if v_amt = 0 or v_date is null then n_skipped := n_skipped + 1; continue; end if;

    -- CROSS-SOURCE guard (NEW): this real txn was already imported from a DIFFERENT
    -- source (e.g. CSV) on the same bank account → skip, don't double-post. We still
    -- record the raw bank_transactions row so Plaid's own future modify/remove of
    -- this txn resolves; but we bind it to the EXISTING ledger entry (no new post).
    v_chash := ingest_content_hash(p_org, v_bank, v_date, v_amt, v_desc);
    v_dupe  := find_crosssource_dup(p_org, v_bank, v_chash, 'plaid');
    if v_dupe is not null then
      insert into bank_transactions (org_id, connection_id, account_id, plaid_transaction_id,
          plaid_account_id, txn_date, amount_minor, description, iso_currency, raw, state, journal_entry_id)
      values (p_org, p_conn, v_bank, v_tid, v_txn->>'account_id', v_date, v_amt, v_desc,
          nullif(v_txn->>'iso_currency','')::char(3), coalesce(v_txn->'raw', v_txn),
          case when coalesce((v_txn->>'pending')::boolean, false) then 'pending'::bank_txn_state else 'posted'::bank_txn_state end,
          v_dupe);
      perform reconcile_plaid_audit(p_org, p_actor, 'plaid_txn_deduped', v_dupe,
        jsonb_build_object('transaction_id', v_tid, 'reason', 'cross_source_duplicate'));
      n_skipped := n_skipped + 1;
      continue;
    end if;

    if v_amt > 0 then
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_bank,  'amount_minor', v_amt, 'side', 'D'),
        jsonb_build_object('account_id', v_uncat, 'amount_minor', v_amt, 'side', 'C'));
    else
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_uncat, 'amount_minor', -v_amt, 'side', 'D'),
        jsonb_build_object('account_id', v_bank,  'amount_minor', -v_amt, 'side', 'C'));
    end if;
    v_key := 'ext:plaid:' || v_tid;
    v_entry := post_journal_entry(p_actor, p_org, v_date, v_key, v_lines, 'import', p_conn::text, v_desc);

    insert into bank_transactions (org_id, connection_id, account_id, plaid_transaction_id,
        plaid_account_id, txn_date, amount_minor, description, iso_currency, raw, state, journal_entry_id)
    values (p_org, p_conn, v_bank, v_tid, v_txn->>'account_id', v_date, v_amt, v_desc,
        nullif(v_txn->>'iso_currency','')::char(3),
        coalesce(v_txn->'raw', v_txn),
        case when coalesce((v_txn->>'pending')::boolean, false) then 'pending'::bank_txn_state else 'posted'::bank_txn_state end,
        v_entry.id);
    perform record_ingest_content(p_org, v_bank, v_chash, 'plaid', v_entry.id);
    perform reconcile_plaid_audit(p_org, p_actor, 'plaid_txn_added', v_entry.id,
      jsonb_build_object('transaction_id', v_tid, 'amount_minor', v_amt));
    n_added := n_added + 1;
  end loop;

  -- MODIFY: pending→posted, amount/date changed. Reverse prior + post fresh.
  for v_txn in select * from jsonb_array_elements(coalesce(p_modified, '[]'::jsonb)) loop
    v_tid := v_txn->>'transaction_id';
    select * into v_bt from bank_transactions where org_id = p_org and plaid_transaction_id = v_tid;
    if not found then
      if exists (select 1 from bank_transactions where org_id = p_org and plaid_transaction_id = v_tid) then
        continue;
      end if;
      v_amt  := coalesce((v_txn->>'amount_minor')::bigint, 0);
      v_date := nullif(v_txn->>'date','')::date;
      v_desc := coalesce(nullif(v_txn->>'name',''), 'Bank transaction');
      if v_amt = 0 or v_date is null then n_skipped := n_skipped + 1; continue; end if;
      if v_amt > 0 then
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_bank,  'amount_minor', v_amt, 'side', 'D'),
          jsonb_build_object('account_id', v_uncat, 'amount_minor', v_amt, 'side', 'C'));
      else
        v_lines := jsonb_build_array(
          jsonb_build_object('account_id', v_uncat, 'amount_minor', -v_amt, 'side', 'D'),
          jsonb_build_object('account_id', v_bank,  'amount_minor', -v_amt, 'side', 'C'));
      end if;
      v_entry := post_journal_entry(p_actor, p_org, v_date, 'ext:plaid:' || v_tid, v_lines, 'import', p_conn::text, v_desc);
      insert into bank_transactions (org_id, connection_id, account_id, plaid_transaction_id,
          plaid_account_id, txn_date, amount_minor, description, iso_currency, raw, state, journal_entry_id)
      values (p_org, p_conn, v_bank, v_tid, v_txn->>'account_id', v_date, v_amt, v_desc,
          nullif(v_txn->>'iso_currency','')::char(3), coalesce(v_txn->'raw', v_txn),
          case when coalesce((v_txn->>'pending')::boolean, false) then 'pending'::bank_txn_state else 'posted'::bank_txn_state end,
          v_entry.id);
      perform record_ingest_content(p_org, v_bank,
        ingest_content_hash(p_org, v_bank, v_date, v_amt, v_desc), 'plaid', v_entry.id);
      n_added := n_added + 1;
      continue;
    end if;

    v_amt  := coalesce((v_txn->>'amount_minor')::bigint, v_bt.amount_minor);
    v_date := coalesce(nullif(v_txn->>'date','')::date, v_bt.txn_date);
    v_desc := coalesce(nullif(v_txn->>'name',''), v_bt.description);
    if v_amt = v_bt.amount_minor and v_date = v_bt.txn_date then
      update bank_transactions set
        state = case when coalesce((v_txn->>'pending')::boolean, false) then 'pending'::bank_txn_state else 'posted'::bank_txn_state end,
        raw = coalesce(v_txn->'raw', v_txn), description = v_desc, updated_at = now()
      where id = v_bt.id;
      n_skipped := n_skipped + 1;
      continue;
    end if;

    if v_bt.journal_entry_id is not null and v_bt.reversal_entry_id is null then
      v_entry := reverse_journal_entry(p_actor, p_org, v_bt.journal_entry_id,
        'ext:plaid:rev:' || v_tid || ':' || v_bt.journal_entry_id::text, v_date,
        'Plaid modified ' || v_tid);
      update bank_transactions set reversal_entry_id = v_entry.id where id = v_bt.id;
    end if;
    if v_amt > 0 then
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_bank,  'amount_minor', v_amt, 'side', 'D'),
        jsonb_build_object('account_id', v_uncat, 'amount_minor', v_amt, 'side', 'C'));
    else
      v_lines := jsonb_build_array(
        jsonb_build_object('account_id', v_uncat, 'amount_minor', -v_amt, 'side', 'D'),
        jsonb_build_object('account_id', v_bank,  'amount_minor', -v_amt, 'side', 'C'));
    end if;
    v_entry := post_journal_entry(p_actor, p_org, v_date,
      'ext:plaid:v:' || v_tid || ':' || v_amt::text || ':' || v_date::text,
      v_lines, 'import', p_conn::text, v_desc);
    update bank_transactions set
      amount_minor = v_amt, txn_date = v_date, description = v_desc,
      raw = coalesce(v_txn->'raw', v_txn), journal_entry_id = v_entry.id, reversal_entry_id = null,
      state = case when coalesce((v_txn->>'pending')::boolean, false) then 'pending'::bank_txn_state else 'posted'::bank_txn_state end,
      updated_at = now()
    where id = v_bt.id;
    perform record_ingest_content(p_org, v_bank,
      ingest_content_hash(p_org, v_bank, v_date, v_amt, v_desc), 'plaid', v_entry.id);
    perform reconcile_plaid_audit(p_org, p_actor, 'plaid_txn_modified', v_entry.id,
      jsonb_build_object('transaction_id', v_tid, 'amount_minor', v_amt));
    n_modified := n_modified + 1;
  end loop;

  -- REMOVE: Plaid deleted the transaction. Reverse its entry (UNCHANGED). The
  -- reversal trigger prunes its index row so a legitimate re-add can re-post.
  for v_txn in select * from jsonb_array_elements(coalesce(p_removed, '[]'::jsonb)) loop
    v_tid := v_txn->>'transaction_id';
    select * into v_bt from bank_transactions where org_id = p_org and plaid_transaction_id = v_tid;
    if not found then continue; end if;
    if v_bt.state = 'removed' then n_skipped := n_skipped + 1; continue; end if;
    if v_bt.journal_entry_id is not null and v_bt.reversal_entry_id is null then
      v_entry := reverse_journal_entry(p_actor, p_org, v_bt.journal_entry_id,
        'ext:plaid:rm:' || v_tid || ':' || v_bt.journal_entry_id::text, null,
        'Plaid removed ' || v_tid);
      update bank_transactions set reversal_entry_id = v_entry.id, state = 'removed', updated_at = now() where id = v_bt.id;
    else
      update bank_transactions set state = 'removed', updated_at = now() where id = v_bt.id;
    end if;
    perform reconcile_plaid_audit(p_org, p_actor, 'plaid_txn_removed', v_bt.journal_entry_id,
      jsonb_build_object('transaction_id', v_tid));
    n_removed := n_removed + 1;
  end loop;

  return jsonb_build_object('added', n_added, 'modified', n_modified, 'removed', n_removed, 'skipped', n_skipped);
end$$;

revoke all on function public.plaid_ingest_transactions(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.plaid_ingest_transactions(uuid, uuid, uuid, jsonb, jsonb, jsonb) to service_role;
