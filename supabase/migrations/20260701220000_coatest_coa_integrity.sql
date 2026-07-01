-- [stress:chart-of-accounts] COA integrity hardening — COATEST findings F4–F9, F12.
--
-- ⚠️ WRITE-BUT-DON'T-DEPLOY (stress-test program rule). The integrator reviews,
--    sequences this behind any other ledger migrations, then applies it.
--
-- Closes the chart-of-accounts holes found by black-box stress test on prod:
--   F4  account.currency was unvalidated (char(3) accepted 'US$', '$$$', '1  '),
--       and Intl.NumberFormat THROWS on a non-ISO-shaped code → the Accounts tab
--       and every report row that renders it crash (RangeError). Validate the
--       shape at the write-path AND add a table CHECK (defense in depth).
--   F5  parent_id was never scoped to the actor's org → org A could parent its
--       account under org B's account (cross-tenant dangling reference, latent
--       read-leak via any future rollup join, and a cross-tenant delete-DoS).
--   F6  parent could be a different type (asset under income) → wrong rollups.
--   F7  DRIFT: the prod cycle-guard trigger `ledger_accounts_no_cycle` /
--       `assert_account_no_cycle()` exists on prod but in NO repo migration — a
--       rebuild-from-source silently loses cycle protection. Fold it in here so
--       source == prod and the guard is versioned. (Also hardens the walk so a
--       cross-tenant parent can't slip past the org-scoped chase.)
--   F9  account `type` could be changed after the account had posted entries →
--       retroactively reclassifies historical P&L / balance sheet; the tie-out
--       check can't catch it (the accounting equation stays internally consistent).
--   F8  an account with a non-zero balance could be archived → it vanishes from
--       the COA view while its balance persists in the reports → COA and the
--       financial statements stop agreeing.
--   F12 COA structural changes (rename / recode / re-parent / re-type / archive)
--       wrote NO ledger_audit row — no trail for changes that move money in the
--       reports. Mirror the entry/period audit pattern (action `account.*`).
--
-- NOTE: existing rows are not back-validated (the currency CHECK is NOT VALID),
-- so this applies cleanly on prod. After the COATEST fixtures are cleaned up the
-- integrator may `VALIDATE CONSTRAINT ledger_accounts_currency_iso` to lock the
-- legacy rows too (all real rows are 'USD'; only stress fixtures carry bad codes).

-- ── F7: cycle guard, folded in from prod (idempotent) ────────────────────────
-- Rejects self-parent and any parent chain that loops back to the row. The walk
-- is org-scoped; with the F5 same-org parent rule below, a cross-tenant parent
-- can no longer be used to escape the chase.
create or replace function public.assert_account_no_cycle() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare v_cur uuid; v_hops int := 0;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'account_cycle: an account cannot be its own parent' using errcode = 'check_violation';
  end if;
  v_cur := new.parent_id;
  while v_cur is not null loop
    if v_cur = new.id then
      raise exception 'account_cycle: parent_id would create a cycle' using errcode = 'check_violation';
    end if;
    v_hops := v_hops + 1;
    if v_hops > 1000 then  -- pre-existing-corruption backstop
      raise exception 'account_cycle: parent chain too deep' using errcode = 'check_violation';
    end if;
    select parent_id into v_cur from ledger_accounts where id = v_cur and org_id = new.org_id;
  end loop;
  return new;
end $$;

drop trigger if exists ledger_accounts_no_cycle on public.ledger_accounts;
create trigger ledger_accounts_no_cycle
  before insert or update of parent_id on public.ledger_accounts
  for each row execute function public.assert_account_no_cycle();

-- ── F4: belt — currency must be an ISO-4217-shaped 3-letter code ─────────────
alter table public.ledger_accounts drop constraint if exists ledger_accounts_currency_iso;
alter table public.ledger_accounts
  add constraint ledger_accounts_currency_iso check (currency ~ '^[A-Z]{3}$') not valid;

-- ── upsert_ledger_account — hardened write-path (suspenders) ─────────────────
create or replace function public.upsert_ledger_account(
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
declare
  v_acct   ledger_accounts;
  v_cur    ledger_accounts;
  v_ccy    char(3);
  v_net    bigint;
  v_action text;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;

  -- F4: normalize + validate the currency shape (NULL = inherit org home).
  if p_currency is not null then
    v_ccy := upper(trim(p_currency));
    if v_ccy !~ '^[A-Z]{3}$' then
      raise exception 'bad_currency: % is not a 3-letter currency code', p_currency using errcode = 'check_violation';
    end if;
  end if;

  -- F5/F6: a parent must exist in THIS org and share the account's type.
  if p_parent_id is not null then
    if p_parent_id = p_id then
      raise exception 'account_cycle: an account cannot be its own parent' using errcode = 'check_violation';
    end if;
    select * into v_cur from ledger_accounts where id = p_parent_id and org_id = p_org;
    if not found then
      raise exception 'bad_parent: parent account % is not in org %', p_parent_id, p_org using errcode = 'foreign_key_violation';
    end if;
    if v_cur.type <> p_type then
      raise exception 'bad_parent_type: a % account cannot roll up under a % parent', p_type, v_cur.type using errcode = 'check_violation';
    end if;
  end if;

  if p_id is null then
    insert into ledger_accounts (org_id, code, name, type, parent_id, currency)
    values (p_org, p_code, p_name, p_type, p_parent_id,
            coalesce(v_ccy, (select home_currency from org_accounting_settings where org_id = p_org), 'USD'))
    returning * into v_acct;
    v_action := 'account.create';
  else
    select * into v_cur from ledger_accounts where id = p_id and org_id = p_org;
    if not found then
      raise exception 'not_found: account % not in org %', p_id, p_org using errcode = 'no_data_found';
    end if;

    -- F9: an account's nature is locked once it carries posted activity. Changing
    -- it would silently rewrite every historical report. Reclassify by moving the
    -- entries to a new account instead.
    if p_type <> v_cur.type and exists (select 1 from journal_lines where account_id = p_id) then
      raise exception 'account_type_locked: cannot change the type of an account that already has posted entries'
        using errcode = 'check_violation';
    end if;

    -- F8: an account must net to zero before it can be archived, otherwise its
    -- balance lingers in the reports while it disappears from the chart.
    if coalesce(p_archived, false) and not coalesce(v_cur.is_archived, false) then
      select coalesce(sum(case when side = 'D' then amount_minor else -amount_minor end), 0)
        into v_net from journal_lines where account_id = p_id;
      if v_net <> 0 then
        raise exception 'account_nonzero_balance: cannot archive an account with a non-zero balance (% minor units); reverse or reclassify its entries first', v_net
          using errcode = 'check_violation';
      end if;
    end if;

    update ledger_accounts
       set name        = p_name,
           type        = p_type,
           code        = p_code,
           parent_id   = p_parent_id,
           currency    = coalesce(v_ccy, currency),
           is_archived = coalesce(p_archived, is_archived)
     where id = p_id and org_id = p_org
    returning * into v_acct;
    v_action := case
      when coalesce(p_archived, v_cur.is_archived) and not v_cur.is_archived then 'account.archive'
      else 'account.update'
    end;
  end if;

  -- F12: trail for every chart-of-accounts mutation (mirrors the entry/period audit).
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (p_org, p_actor, v_action, 'account', v_acct.id,
          jsonb_build_object('code', v_acct.code, 'name', v_acct.name, 'type', v_acct.type,
                             'parent_id', v_acct.parent_id, 'currency', v_acct.currency,
                             'is_archived', v_acct.is_archived));
  return v_acct;
end$$;

revoke all on function public.upsert_ledger_account(uuid, uuid, text, account_type, text, uuid, uuid, char, boolean) from public;
grant execute on function public.upsert_ledger_account(uuid, uuid, text, account_type, text, uuid, uuid, char, boolean) to service_role;
