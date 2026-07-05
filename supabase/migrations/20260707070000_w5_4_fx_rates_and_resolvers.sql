-- W5.4 — Multi-currency, slice 2: fx_rates snapshot + rate resolution + the
-- well-known FX gain/loss accounts + the opt-in gate rewrite.

-- ── D3: systematic daily rate snapshot (ECB daily reference, EUR-base, public,
-- keyless — re-based arithmetically to any org's home currency at lookup time).
-- One row per (quote_currency, as_of, source); base_currency is the snapshot's
-- own base (always 'EUR' for the ECB feed) so re-basing is rate[to]/rate[from].
create table fx_rates (
  id              uuid primary key default gen_random_uuid(),
  base_currency   char(3) not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency  char(3) not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate            numeric not null check (rate > 0),
  as_of           date not null,
  source          text not null default 'ECB',
  created_at      timestamptz not null default now(),
  unique (base_currency, quote_currency, as_of, source)
);
create index fx_rates_lookup_idx on fx_rates (quote_currency, as_of desc);

alter table fx_rates enable row level security;
create policy fx_rates_select  on fx_rates for select using (true); -- global reference data
create policy fx_rates_nowrite on fx_rates for all using (false) with check (false);
grant select on fx_rates to authenticated;
grant select, insert, update, delete on fx_rates to service_role;

-- The snapshot's own base currency always has an implicit rate of 1 against
-- itself — needed so resolve_fx_rate can convert home<->EUR when home==EUR.
create or replace function fx_rate_vs_snapshot_base(p_ccy char(3), p_date date, p_source text default 'ECB', p_snapshot_base char(3) default 'EUR')
returns numeric language sql stable as $$
  select case when p_ccy = p_snapshot_base then 1
    else (select rate from fx_rates
           where quote_currency = p_ccy and base_currency = p_snapshot_base
             and source = p_source and as_of <= p_date
           order by as_of desc limit 1)
  end;
$$;

-- resolve_fx_rate(from, to, date) — base units of `to` per 1 unit of `from`, via
-- the ECB EUR-base snapshot: 1 EUR = rate[from] `from` = rate[to] `to`, so
-- 1 `from` = rate[to]/rate[from] `to`. NULL if either side has no snapshot at
-- or before p_date (the write-path treats NULL as "no rate — ask for one",
-- design §4: never silently default to 1 for a genuinely foreign line).
create or replace function resolve_fx_rate(p_from char(3), p_to char(3), p_date date, p_source text default 'ECB')
returns numeric language plpgsql stable as $$
declare v_from numeric; v_to numeric;
begin
  if p_from = p_to then return 1; end if;
  v_from := fx_rate_vs_snapshot_base(p_from, p_date, p_source);
  v_to   := fx_rate_vs_snapshot_base(p_to,   p_date, p_source);
  if v_from is null or v_to is null then return null; end if;
  return v_to / v_from;
end$$;

-- ── D5: monetary classification — infer from account_type; is_monetary
-- overrides. See the column comment (20260707060000) for the documented
-- asset-subtype limitation.
create or replace function is_monetary_account(p_account_id uuid)
returns boolean language sql stable as $$
  select coalesce(
    (select is_monetary from ledger_accounts where id = p_account_id),
    (select type in ('asset', 'liability') from ledger_accounts where id = p_account_id),
    false
  );
$$;

-- ── Well-known FX gain/loss accounts — idempotent per org, mirrors
-- resolve_opening_balance_equity / resolve_uncategorized_account exactly.
create or replace function resolve_realized_fx_account(p_actor uuid, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts
   where org_id = p_org and is_archived = false
     and (code = '7900' or lower(name) = 'realized fx gain/loss')
   order by (code = '7900') desc limit 1;
  if v_id is not null then return v_id; end if;
  v_id := (upsert_ledger_account(p_actor, p_org, 'Realized FX gain/loss', 'income'::account_type, '7900')).id;
  return v_id;
end$$;

create or replace function resolve_unrealized_fx_account(p_actor uuid, p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from ledger_accounts
   where org_id = p_org and is_archived = false
     and (code = '7910' or lower(name) = 'unrealized fx gain/loss')
   order by (code = '7910') desc limit 1;
  if v_id is not null then return v_id; end if;
  v_id := (upsert_ledger_account(p_actor, p_org, 'Unrealized FX gain/loss', 'income'::account_type, '7910')).id;
  return v_id;
end$$;

-- ── D7 opt-in toggle. Folded into the existing owner-only org-settings write
-- (20260701160000) rather than a second org-settings RPC — one concept, one
-- source of truth (LEARNINGS #6). New trailing param ⇒ a strictly new
-- signature; drop the 5-arg overload first (same reasoning as
-- apply_invoice_payment above) so named-arg callers stay unambiguous.
drop function if exists set_org_accounting_settings(uuid, uuid, boolean, char, int);

create or replace function set_org_accounting_settings(
  p_actor                      uuid,
  p_org                        uuid,
  p_cpa_posts_require_approval boolean default null,
  p_home_currency              char(3) default null,
  p_fiscal_year_start_month    int     default null,
  p_multi_currency_enabled     boolean default null
) returns org_accounting_settings
language plpgsql security definer set search_path = public as $$
declare v_s org_accounting_settings;
begin
  if not exists (
    select 1 from memberships m
    where m.user_id = p_actor and m.org_id = p_org
      and m.role = 'owner' and m.status = 'active'
  ) then
    raise exception 'forbidden: only the business owner may change accounting settings'
      using errcode = 'insufficient_privilege';
  end if;

  if p_fiscal_year_start_month is not null
     and (p_fiscal_year_start_month < 1 or p_fiscal_year_start_month > 12) then
    raise exception 'bad_fiscal_month: must be 1-12' using errcode = 'invalid_parameter_value';
  end if;

  insert into org_accounting_settings (org_id) values (p_org)
    on conflict (org_id) do nothing;

  update org_accounting_settings
     set cpa_posts_require_approval = coalesce(p_cpa_posts_require_approval, cpa_posts_require_approval),
         home_currency              = coalesce(p_home_currency, home_currency),
         fiscal_year_start_month    = coalesce(p_fiscal_year_start_month, fiscal_year_start_month),
         multi_currency_enabled     = coalesce(p_multi_currency_enabled, multi_currency_enabled)
   where org_id = p_org
  returning * into v_s;
  return v_s;
end$$;

revoke all on function set_org_accounting_settings(uuid, uuid, boolean, char, int, boolean) from public;
grant execute on function set_org_accounting_settings(uuid, uuid, boolean, char, int, boolean) to service_role;

-- ── Rewire the single-currency gate (20260630070000) to the per-org flag ──────
-- D7: "the single-currency guard stays active for every org until its flag is
-- flipped." Opted-out orgs (the default) see byte-identical behavior to
-- before this migration. Opted-in orgs may post any line whose currency is a
-- known catalog code (defense-in-depth; the service-role write-path is the
-- only insert path — grants unchanged).
create or replace function assert_line_home_currency() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare home char(3); v_enabled boolean;
begin
  select coalesce(home_currency, 'USD'), coalesce(multi_currency_enabled, false)
    into home, v_enabled
    from org_accounting_settings where org_id = new.org_id;
  home := coalesce(home, 'USD');
  if not coalesce(v_enabled, false) then
    if new.currency is distinct from home then
      raise exception
        'currency_unsupported: line currency % does not match the org home currency % (multi-currency is not enabled for this org)',
        new.currency, home
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  -- multi-currency enabled: any known catalog code is allowed.
  if not exists (select 1 from currencies where code = new.currency and is_active) then
    raise exception 'currency_unsupported: % is not in the currency catalog', new.currency
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

grant execute on function resolve_fx_rate(char, char, date, text) to service_role;
grant execute on function is_monetary_account(uuid) to service_role;
revoke all on function resolve_realized_fx_account(uuid, uuid) from public;
revoke all on function resolve_unrealized_fx_account(uuid, uuid) from public;
grant execute on function resolve_realized_fx_account(uuid, uuid) to service_role;
grant execute on function resolve_unrealized_fx_account(uuid, uuid) to service_role;
