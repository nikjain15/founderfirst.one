-- [reconcile:cattest] Captured from LIVE prod — repo/prod parity, NOT re-applied here.
-- Idempotent CREATE OR REPLACE reflecting the exact deployed state after the
-- categorization + import stress-test fixes. Control tower backfills schema_migrations.

CREATE OR REPLACE FUNCTION public.append_import_rows(p_actor uuid, p_org uuid, p_batch uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         nullif(r->>'external_id','')
  from jsonb_array_elements(p_rows) r;
  get diagnostics v_n = row_count;

  update import_batches set status = 'previewed' where id = p_batch and status = 'draft';
  return v_n;
end$function$;
revoke all on function append_import_rows(uuid,uuid,uuid,jsonb) from public;
grant execute on function append_import_rows(uuid,uuid,uuid,jsonb) to service_role;
