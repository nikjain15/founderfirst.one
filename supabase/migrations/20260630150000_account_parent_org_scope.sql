-- Fix (audit: upsert-account-parent-not-org-scoped, P3): upsert_ledger_account
-- wrote parent_id straight through with only a bare org-agnostic FK to
-- ledger_accounts(id). An actor authorized to write its own org could set an
-- account's parent_id to an account in ANOTHER org, building a cross-tenant
-- parent chain. Validate that p_parent_id resolves to a non-archived account in
-- the SAME org before insert/update. Body is otherwise identical to the original.

create or replace function upsert_ledger_account(
  p_actor     uuid,
  p_org       uuid,
  p_name      text,
  p_type      account_type,
  p_code      text default null,
  p_id        uuid default null,
  p_parent_id uuid default null,
  p_currency  char(3) default null,
  p_archived  boolean default null
) returns ledger_accounts
language plpgsql security definer set search_path = public as $$
declare v_acct ledger_accounts;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;

  -- A parent must belong to this org (and not be archived) — no cross-tenant chains.
  if p_parent_id is not null and not exists (
    select 1 from ledger_accounts
     where id = p_parent_id and org_id = p_org and is_archived = false
  ) then
    raise exception 'invalid_parent: parent account % not in org %', p_parent_id, p_org
      using errcode = 'insufficient_privilege';
  end if;

  if p_id is null then
    insert into ledger_accounts (org_id, code, name, type, parent_id, currency)
    values (p_org, p_code, p_name, p_type, p_parent_id,
            coalesce(p_currency, (select home_currency from org_accounting_settings where org_id = p_org), 'USD'))
    returning * into v_acct;
  else
    update ledger_accounts
       set name        = p_name,
           type        = p_type,
           code        = p_code,
           parent_id   = p_parent_id,
           currency    = coalesce(p_currency, currency),
           is_archived = coalesce(p_archived, is_archived)
     where id = p_id and org_id = p_org
    returning * into v_acct;
    if not found then
      raise exception 'not_found: account % not in org %', p_id, p_org using errcode = 'no_data_found';
    end if;
  end if;
  return v_acct;
end$$;

revoke all on function upsert_ledger_account(uuid, uuid, text, account_type, text, uuid, uuid, char, boolean) from public;
grant execute on function upsert_ledger_account(uuid, uuid, text, account_type, text, uuid, uuid, char, boolean) to service_role;
