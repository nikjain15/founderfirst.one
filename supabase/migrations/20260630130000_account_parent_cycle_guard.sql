-- [reconcile] capture live account no-cycle guard (applied out-of-band, was not in repo)
-- [reconcile] capture live account no-cycle guard (was applied to prod out-of-band, not in repo)
CREATE OR REPLACE FUNCTION public.assert_account_no_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cur uuid; v_hops int := 0;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'account_cycle: an account cannot be its own parent' using errcode = 'check_violation';
  end if;
  -- walk up from the proposed parent; if we reach new.id, it's a cycle.
  v_cur := new.parent_id;
  while v_cur is not null loop
    if v_cur = new.id then
      raise exception 'account_cycle: parent_id would create a cycle' using errcode = 'check_violation';
    end if;
    v_hops := v_hops + 1;
    if v_hops > 1000 then  -- pre-existing corruption backstop
      raise exception 'account_cycle: parent chain too deep' using errcode = 'check_violation';
    end if;
    select parent_id into v_cur from ledger_accounts where id = v_cur and org_id = new.org_id;
  end loop;
  return new;
end $function$
;

drop trigger if exists ledger_accounts_no_cycle on public.ledger_accounts;
create trigger ledger_accounts_no_cycle before insert or update of parent_id on public.ledger_accounts for each row execute function assert_account_no_cycle();
