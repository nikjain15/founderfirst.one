-- [stress:csv] Defense-in-depth for the history importer's staging step.
--
-- WHY: add_import_rows stages every row in ONE `insert … select`, casting each
-- row's txn_date with `nullif(r->>'txn_date','')::date`. A single un-real
-- calendar date (e.g. "2026-02-30", "2026-04-31", or Feb-29 of a non-leap year)
-- raises Postgres errcode 22008 ("date/time field value out of range"), which
-- aborts the WHOLE INSERT — so one bad cell discards every other (valid) row in
-- the file, and the importer sees only an opaque error with no row reference.
-- Verified live on prod: a Feb-30 row 400'd add_rows and staged 0 of 2 rows.
--
-- The client (apps/app/src/import/csv.ts → parseDateCell) now rejects impossible
-- dates so they never leave the browser as "valid". This migration closes the
-- same gap server-side for ANY caller (a direct API consumer, a future importer):
-- a malformed date degrades that ONE row to a NULL txn_date, which commit then
-- marks 'error' ("missing date / amount") and skips — the rest of the batch
-- stages and posts normally. Books still tie; no silent data loss; no batch-wide
-- detonation.
--
-- Pure hardening: signature, grants, and the happy path are unchanged. Only the
-- date coercion becomes total instead of partial.

-- ── safe_to_date — cast or NULL, never raise ────────────────────────────────
create or replace function safe_to_date(p text)
returns date language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::date;
exception
  when others then return null;   -- 22008 (out of range), 22007 (bad format), …
end$$;

-- ── add_import_rows — identical to phase3 except txn_date uses safe_to_date ──
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
         safe_to_date(r->>'txn_date'),                          -- was: nullif(r->>'txn_date','')::date
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

revoke all on function safe_to_date(text)                    from public;
revoke all on function add_import_rows(uuid, uuid, uuid, jsonb) from public;
grant execute on function add_import_rows(uuid, uuid, uuid, jsonb) to service_role;
