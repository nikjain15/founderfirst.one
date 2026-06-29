-- Phase 3 — history import (ARCHITECTURE.md §6.4, §11). A business runs its real
-- books from day one, so existing history comes in via a previewable, reversible
-- BATCH: raw rows are staged (provenance-preserving), normalized + mapped, then
-- committed to the canonical ledger. Before commit a batch is just staging data
-- (discardable, zero ledger impact); on commit each row posts through the verified
-- Phase 2 `post_journal_entry`, so every imported entry inherits the ledger
-- invariants (balanced · period-open · idempotent · immutable) and carries
-- `source = 'import:<batch>'` provenance. After commit, corrections are reversing
-- entries like anything else.
--
-- Two commit strategies (by source):
--   • csv / bank_statement  → one entry per row: the bank account vs a chosen
--     contra account, sided by the signed amount (+ = into the bank).
--   • trial_balance / opening_balances → ONE balanced entry dated at the cutover,
--     one line per account, plugged to an "Opening Balance Equity" account.
--
-- RLS: same pattern as the ledger — can_access_org read; client writes denied;
-- the service-role import API (next slice) calls these SECURITY DEFINER functions.

-- ── enums ─────────────────────────────────────────────────────────────────
create type import_source     as enum ('csv', 'bank_statement', 'trial_balance', 'opening_balances', 'qbo', 'xero');
create type import_status      as enum ('draft', 'previewed', 'committed', 'discarded');
create type import_row_status  as enum ('pending', 'ready', 'error', 'skipped', 'posted');

-- ── batch header ──────────────────────────────────────────────────────────
create table import_batches (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  source          import_source not null,
  status          import_status not null default 'draft',
  filename        text,
  bank_account_id uuid references ledger_accounts(id),   -- csv / bank_statement: the bank side
  cutover_date    date,                                  -- trial_balance / opening_balances
  mapping         jsonb,                                 -- the confirmed column→field mapping
  notes           text,
  created_by      uuid not null references auth.users(id),
  committed_by    uuid references auth.users(id),
  committed_at    timestamptz,
  discarded_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index import_batches_org_idx on import_batches (org_id);

-- ── staged rows (raw + normalized) ─────────────────────────────────────────
create table import_rows (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references import_batches(id) on delete cascade,
  org_id           uuid not null references organizations(id) on delete cascade, -- denormalized for RLS
  row_num          int not null,
  raw              jsonb not null default '{}'::jsonb,   -- the original parsed row, preserved
  txn_date         date,
  description      text,
  amount_minor     bigint,                                -- signed; csv: +into bank / −out. TB: magnitude
  account_id       uuid references ledger_accounts(id),   -- csv: the contra/category; TB: the account
  side             char(1) check (side in ('D','C')),     -- TB only: which side the balance sits on
  status           import_row_status not null default 'pending',
  error            text,
  journal_entry_id uuid references journal_entries(id),   -- set on commit
  created_at       timestamptz not null default now(),
  unique (batch_id, row_num)
);
create index import_rows_batch_idx on import_rows (batch_id);
create index import_rows_org_idx   on import_rows (org_id);

-- ── guard: a committed batch is frozen (provenance) ─────────────────────────
create or replace function guard_import_batch_mutation()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    if OLD.status = 'committed' then
      raise exception 'a committed import batch cannot be deleted (it is the provenance of posted entries)'
        using errcode = 'restrict_violation';
    end if;
    return OLD;
  end if;
  if OLD.status = 'committed' and NEW.status <> 'committed' then
    raise exception 'a committed import batch cannot change status' using errcode = 'restrict_violation';
  end if;
  return NEW;
end$$;
create trigger import_batches_guard
  before update or delete on import_batches
  for each row execute function guard_import_batch_mutation();

-- ── RLS + grants ────────────────────────────────────────────────────────────
alter table import_batches enable row level security;
alter table import_rows    enable row level security;

create policy ib_select  on import_batches for select using ( can_access_org(org_id) );
create policy ib_nowrite on import_batches for all using (false) with check (false);
create policy ir_select  on import_rows    for select using ( can_access_org(org_id) );
create policy ir_nowrite on import_rows     for all using (false) with check (false);

grant select on import_batches, import_rows to authenticated;
grant select, insert, update, delete on import_batches, import_rows to service_role;

-- ── resolve (or create) the Opening Balance Equity plug account ─────────────
create or replace function resolve_opening_balance_equity(p_actor uuid, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts
   where org_id = p_org and type = 'equity' and is_archived = false
     and (lower(name) like '%opening balance%' or code = '3900')
   order by (code = '3900') desc limit 1;
  if v_id is not null then return v_id; end if;
  v_id := (upsert_ledger_account(p_actor, p_org, 'Opening Balance Equity', 'equity'::account_type, '3900')).id;
  return v_id;
end$$;

-- ── create_import_batch ─────────────────────────────────────────────────────
create or replace function create_import_batch(
  p_actor           uuid,
  p_org             uuid,
  p_source          import_source,
  p_filename        text default null,
  p_bank_account_id uuid default null,
  p_cutover_date    date default null
) returns import_batches
language plpgsql security definer set search_path = public as $$
declare v_b import_batches;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;
  if p_bank_account_id is not null
     and not exists (select 1 from ledger_accounts where id = p_bank_account_id and org_id = p_org) then
    raise exception 'bad_account: bank account not in this org' using errcode = 'foreign_key_violation';
  end if;
  insert into import_batches (org_id, source, filename, bank_account_id, cutover_date, created_by)
  values (p_org, p_source, p_filename, p_bank_account_id, p_cutover_date, p_actor)
  returning * into v_b;
  return v_b;
end$$;

-- ── add_import_rows — stage raw + normalized rows ───────────────────────────
-- p_rows: jsonb array of { row_num, raw, txn_date, description, amount_minor,
--         account_id, side, status }. Re-staging replaces the batch's rows
--         (so the mapping step can re-normalize); only allowed pre-commit.
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
  insert into import_rows (batch_id, org_id, row_num, raw, txn_date, description, amount_minor, account_id, side, status)
  select p_batch, p_org,
         (r->>'row_num')::int,
         coalesce(r->'raw', '{}'::jsonb),
         nullif(r->>'txn_date','')::date,
         r->>'description',
         nullif(r->>'amount_minor','')::bigint,
         nullif(r->>'account_id','')::uuid,
         nullif(r->>'side',''),
         coalesce(nullif(r->>'status','')::import_row_status, 'pending')
  from jsonb_array_elements(p_rows) r;
  get diagnostics v_n = row_count;

  update import_batches set status = 'previewed' where id = p_batch and status = 'draft';
  return v_n;
end$$;

-- ── commit_import_batch — post the staged rows to the ledger ────────────────
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
        update import_rows set status = 'error', error = 'missing date / amount / account' where id = v_row.id;
        continue;
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
    select coalesce(sum(case when side='D' then abs(amount_minor) else 0 end),0),
           coalesce(sum(case when side='C' then abs(amount_minor) else 0 end),0)
      into v_debits, v_credits
      from import_rows where batch_id = p_batch and status = 'ready';
    v_lines := (select jsonb_agg(jsonb_build_object(
                  'account_id', account_id, 'amount_minor', abs(amount_minor), 'side', side,
                  'memo', description))
                from import_rows where batch_id = p_batch and status = 'ready'
                  and account_id is not null and side is not null and coalesce(amount_minor,0) <> 0);
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

-- ── discard_import_batch — reversible BEFORE commit ─────────────────────────
create or replace function discard_import_batch(p_actor uuid, p_org uuid, p_batch uuid)
returns import_batches language plpgsql security definer set search_path = public as $$
declare v_b import_batches;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select * into v_b from import_batches where id = p_batch and org_id = p_org;
  if not found then raise exception 'not_found' using errcode = 'no_data_found'; end if;
  if v_b.status = 'committed' then
    raise exception 'committed: a committed batch cannot be discarded; reverse its entries instead' using errcode = 'restrict_violation';
  end if;
  delete from import_rows where batch_id = p_batch;
  update import_batches set status = 'discarded', discarded_at = now() where id = p_batch returning * into v_b;
  return v_b;
end$$;

-- ── grants: write-path functions locked to service_role ─────────────────────
revoke all on function resolve_opening_balance_equity(uuid, uuid)                     from public;
revoke all on function create_import_batch(uuid, uuid, import_source, text, uuid, date) from public;
revoke all on function add_import_rows(uuid, uuid, uuid, jsonb)                       from public;
revoke all on function commit_import_batch(uuid, uuid, uuid)                          from public;
revoke all on function discard_import_batch(uuid, uuid, uuid)                         from public;

grant execute on function create_import_batch(uuid, uuid, import_source, text, uuid, date) to service_role;
grant execute on function add_import_rows(uuid, uuid, uuid, jsonb)                       to service_role;
grant execute on function commit_import_batch(uuid, uuid, uuid)                          to service_role;
grant execute on function discard_import_batch(uuid, uuid, uuid)                         to service_role;
