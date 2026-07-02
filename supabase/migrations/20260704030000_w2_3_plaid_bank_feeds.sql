-- W2.3 · Plaid bank feeds (SANDBOX build) — Roadmap §W2.3.
--
-- Bank transactions flow in without CSVs. Plaid Link → `plaid-exchange` stores an
-- access token on external_connections (provider 'plaid', column-walled off the
-- browser, same as QBO/Xero). `/transactions/sync` (cursor-based) + a `plaid-webhook`
-- receiver feed raw rows through the ONE ingestion RPC below, which posts each
-- transaction into the SAME categorize queue as CSV/QBO imports (an Uncategorized
-- holding entry Penny then categorizes), with the exact per-row idempotency
-- discipline from the QBO/Xero F1 fix: `ext:plaid:<transaction_id>`.
--
-- Trust invariants baked in here (not in the edge fn / client):
--   • IDEMPOTENT INGEST: a replayed webhook (or overlapping cursor page) adds
--     NOTHING. `bank_transactions` is keyed unique on (org, plaid_transaction_id);
--     the ledger entry carries idempotency_key 'ext:plaid:<txn_id>' so even a
--     bypass of bank_transactions can't double-post (post_journal_entry dedups).
--   • REVERSAL-BASED CORRECTIONS: Plaid mutates history (pending→posted, removed,
--     amount/date modified). We NEVER edit a posted entry. A removed txn REVERSES
--     its prior ledger entry. A modified txn REVERSES the old entry and posts a
--     fresh one (net effect = correction, full audit trail preserved).
--   • pending→posted: a pending Plaid txn and its posted successor share the SAME
--     plaid_transaction_id, so the second sync is a no-op amount-wise unless the
--     amount changed — then it's a modify (reverse+repost). No duplicate.
--   • TENANT-SCOPED: RLS row-gate (can_access_org) read; NO client writes; the
--     ingestion RPC is SECURITY DEFINER, service_role-EXECUTE only, gated by
--     can_write_org_as (ISOTEST pattern — no p_actor forgery from anon).
--   • AUDIT-LOGGED: every add / modify / remove writes a ledger_audit row.
--
-- Companions: edge fns plaid-link-token / plaid-exchange / plaid-sync / plaid-webhook.
-- pgTAP: supabase/tests/w2_3_plaid_ingest_test.sql. Vitest: apps/app state machine.

-- ── enum extensions (plaid joins qbo/xero as a provider + import source) ──────
do $$ begin
  alter type external_provider add value if not exists 'plaid';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type import_source add value if not exists 'plaid';
exception when duplicate_object then null; end $$;

-- external_connections carries the Plaid item: realm_id = item_id, access_token =
-- the Plaid access token, plus a sync cursor (Plaid's /transactions/sync cursor is
-- per-item and must survive across syncs). Cursor is server-side only.
alter table external_connections
  add column if not exists sync_cursor text;   -- Plaid /transactions/sync cursor; null on first pull

-- The bank/cash ledger account this Plaid item posts into. The ingestion RPC reads
-- and (on first sync) sets this, so it MUST exist on external_connections — without
-- it every ingest raises 42703. (Red-team W2.3: migration parity with the RPC.)
alter table external_connections
  add column if not exists account_id uuid references ledger_accounts(id);

-- ── the Plaid-fed raw transaction store (W1.1 anticipated reconciling here) ───
-- One row per Plaid transaction, per org. This is the raw feed + the state machine
-- source; the ledger entry it produced is `journal_entry_id`. Corrections flip
-- `state` and set reversal bookkeeping — the row is never deleted (provenance).
do $$ begin
  create type bank_txn_state as enum ('pending', 'posted', 'removed');
exception when duplicate_object then null; end $$;

create table if not exists public.bank_transactions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  connection_id        uuid references external_connections(id) on delete set null,
  account_id           uuid references ledger_accounts(id),      -- the bank/cash ledger account
  plaid_transaction_id text not null,                            -- Plaid's stable transaction_id
  plaid_account_id     text,                                     -- Plaid's account_id (which bank account)
  txn_date             date,
  amount_minor         bigint not null,       -- signed, our convention: +into bank / −out. Plaid amount>0 = outflow.
  description          text,
  iso_currency         char(3),
  raw                  jsonb not null default '{}'::jsonb,       -- the full Plaid transaction object, preserved
  state                bank_txn_state not null default 'posted',
  journal_entry_id     uuid references journal_entries(id),      -- the posted entry (null until posted)
  reversal_entry_id    uuid references journal_entries(id),      -- the reversal, once removed/modified
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- IDEMPOTENCY: one row per Plaid transaction per org. A replayed webhook that
  -- re-sends the same transaction_id collides here and is skipped.
  unique (org_id, plaid_transaction_id)
);
create index if not exists bank_transactions_org_idx  on public.bank_transactions (org_id, txn_date desc);
create index if not exists bank_transactions_conn_idx on public.bank_transactions (connection_id);
create index if not exists bank_transactions_entry_idx on public.bank_transactions (journal_entry_id);

-- ── RLS: read-only to org members + engaged CPAs; no client writes ────────────
alter table public.bank_transactions enable row level security;
drop policy if exists bank_transactions_select on public.bank_transactions;
create policy bank_transactions_select on public.bank_transactions for select using (can_access_org(org_id));
drop policy if exists bank_transactions_nowrite on public.bank_transactions;
create policy bank_transactions_nowrite on public.bank_transactions for all using (false) with check (false);

grant select on public.bank_transactions to authenticated;
grant select, insert, update, delete on public.bank_transactions to service_role;

-- ── the ONE Plaid ingestion RPC — idempotent + reversal-based corrections ─────
-- p_added / p_modified: jsonb arrays of {transaction_id, account_id, date,
--   amount_minor (signed, +into bank), name, iso_currency, pending, raw}.
-- p_removed: jsonb array of {transaction_id}.
-- The edge fn (plaid-sync / plaid-webhook) hands raw Plaid sync pages straight in;
-- normalization (sign, minor units) happens in the fn. This RPC is the trust
-- boundary: everything below runs in ONE transaction and is replay-safe.
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
  n_added   int := 0;
  n_modified int := 0;
  n_removed int := 0;
  n_skipped int := 0;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;
  -- the connection must belong to this org (tenant scope)
  if not exists (select 1 from external_connections where id = p_conn and org_id = p_org and provider = 'plaid') then
    raise exception 'no_connection: plaid connection % not in org %', p_conn, p_org using errcode = 'no_data_found';
  end if;

  -- the bank/cash account: reuse the connection's staged account if set, else the
  -- Uncategorized holding pattern reuses resolve_uncategorized_account as CONTRA.
  select account_id into v_bank from external_connections where id = p_conn;
  if v_bank is null then
    -- first sync with no chosen bank account: create/resolve a generic "Plaid Bank"
    -- cash account so entries post; the owner can rename it. type=asset.
    v_bank := (upsert_ledger_account(p_actor, p_org, 'Bank (Plaid)', 'asset'::account_type, '1050')).id;
    update external_connections set account_id = v_bank where id = p_conn;
  end if;
  v_uncat := resolve_uncategorized_account(p_actor, p_org);

  -- helper to post one transaction into the categorize queue (bank vs Uncategorized)
  -- inlined per branch below to keep a single RPC.

  -- ADD: a new transaction. Insert the raw row (idempotent on plaid_transaction_id)
  -- then post the ledger entry (idempotent on ext:plaid:<id>). A replay skips both.
  for v_txn in select * from jsonb_array_elements(coalesce(p_added, '[]'::jsonb)) loop
    v_tid  := v_txn->>'transaction_id';
    if v_tid is null or v_tid = '' then continue; end if;
    -- replay guard: if we already have this Plaid txn, skip entirely.
    if exists (select 1 from bank_transactions where org_id = p_org and plaid_transaction_id = v_tid) then
      n_skipped := n_skipped + 1;
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
    v_key := 'ext:plaid:' || v_tid;
    v_entry := post_journal_entry(p_actor, p_org, v_date, v_key, v_lines, 'import', p_conn::text, v_desc);

    insert into bank_transactions (org_id, connection_id, account_id, plaid_transaction_id,
        plaid_account_id, txn_date, amount_minor, description, iso_currency, raw, state, journal_entry_id)
    values (p_org, p_conn, v_bank, v_tid, v_txn->>'account_id', v_date, v_amt, v_desc,
        nullif(v_txn->>'iso_currency','')::char(3),
        coalesce(v_txn->'raw', v_txn),
        case when coalesce((v_txn->>'pending')::boolean, false) then 'pending'::bank_txn_state else 'posted'::bank_txn_state end,
        v_entry.id);
    perform reconcile_plaid_audit(p_org, p_actor, 'plaid_txn_added', v_entry.id,
      jsonb_build_object('transaction_id', v_tid, 'amount_minor', v_amt));
    n_added := n_added + 1;
  end loop;

  -- MODIFY: pending→posted, amount/date changed. Reverse the prior entry (if the
  -- economically-relevant fields changed) and post a fresh one. Never edit in place.
  for v_txn in select * from jsonb_array_elements(coalesce(p_modified, '[]'::jsonb)) loop
    v_tid := v_txn->>'transaction_id';
    select * into v_bt from bank_transactions where org_id = p_org and plaid_transaction_id = v_tid;
    if not found then
      -- we've never seen it — treat as an add (Plaid can send modify before add on replay)
      if exists (select 1 from bank_transactions where org_id = p_org and plaid_transaction_id = v_tid) then
        continue;
      end if;
      -- fall through by pushing into the add path via a recursive-safe inline post
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
      n_added := n_added + 1;
      continue;
    end if;

    v_amt  := coalesce((v_txn->>'amount_minor')::bigint, v_bt.amount_minor);
    v_date := coalesce(nullif(v_txn->>'date','')::date, v_bt.txn_date);
    v_desc := coalesce(nullif(v_txn->>'name',''), v_bt.description);
    -- nothing economically changed? just refresh pending flag + raw, no ledger move.
    if v_amt = v_bt.amount_minor and v_date = v_bt.txn_date then
      update bank_transactions set
        state = case when coalesce((v_txn->>'pending')::boolean, false) then 'pending'::bank_txn_state else 'posted'::bank_txn_state end,
        raw = coalesce(v_txn->'raw', v_txn), description = v_desc, updated_at = now()
      where id = v_bt.id;
      n_skipped := n_skipped + 1;
      continue;
    end if;

    -- amount or date changed → REVERSAL-BASED correction: reverse the old entry,
    -- post a fresh one under a NEW idempotency key (the old one is spent).
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
    perform reconcile_plaid_audit(p_org, p_actor, 'plaid_txn_modified', v_entry.id,
      jsonb_build_object('transaction_id', v_tid, 'amount_minor', v_amt));
    n_modified := n_modified + 1;
  end loop;

  -- REMOVE: Plaid deleted the transaction. Reverse its ledger entry (never delete),
  -- mark the row removed. Idempotent: a second remove of the same txn is a no-op.
  for v_txn in select * from jsonb_array_elements(coalesce(p_removed, '[]'::jsonb)) loop
    v_tid := v_txn->>'transaction_id';
    select * into v_bt from bank_transactions where org_id = p_org and plaid_transaction_id = v_tid;
    if not found then continue; end if;
    if v_bt.state = 'removed' then n_skipped := n_skipped + 1; continue; end if;   -- already reversed
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

-- audit helper (actor-carrying, tenant-scoped) — same shape as reconciliation_audit
create or replace function public.reconcile_plaid_audit(
  p_org uuid, p_actor uuid, p_action text, p_target uuid, p_detail jsonb
) returns void language sql security definer set search_path to 'public' as $$
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, p_action, 'bank_transaction', p_target, coalesce(p_detail, '{}'::jsonb));
$$;

-- store the /transactions/sync cursor after a successful ingest (server-side only)
create or replace function public.plaid_set_cursor(p_actor uuid, p_org uuid, p_conn uuid, p_cursor text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update external_connections set sync_cursor = p_cursor, updated_at = now()
    where id = p_conn and org_id = p_org and provider = 'plaid';
end$$;

-- ── grants — service-role EXECUTE only (ISOTEST: no p_actor forgery from anon) ─
revoke all on function public.plaid_ingest_transactions(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.plaid_ingest_transactions(uuid, uuid, uuid, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.reconcile_plaid_audit(uuid, uuid, text, uuid, jsonb) from public;
grant execute on function public.reconcile_plaid_audit(uuid, uuid, text, uuid, jsonb) to service_role;
revoke all on function public.plaid_set_cursor(uuid, uuid, uuid, text) from public;
grant execute on function public.plaid_set_cursor(uuid, uuid, uuid, text) to service_role;
