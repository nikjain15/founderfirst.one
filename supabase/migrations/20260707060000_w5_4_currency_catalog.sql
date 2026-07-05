-- W5.4 — Multi-currency, slice 1: catalog + schema (docs/plans/multi-currency-design.md).
--
-- Additive + backward-compatible (design §7): every new column is
-- nullable-then-backfilled, every org stays single-currency until it opts in
-- (D7 — org_accounting_settings.multi_currency_enabled, default false). The
-- existing single-currency guard (20260630070000) keeps blocking non-home
-- lines for every org until its flag flips — this migration does not touch
-- that trigger's behavior for opted-out orgs (rewired in the next migration).
--
-- D2 (FULL CATALOG): a small seeded ISO-4217 catalog with minor_unit, so
-- decimalToMinor/formatMoney can stop assuming 2dp (JPY=0, BHD/KWD/OMR=3).
-- Pure-SQL seed, no `\i` (LEARNINGS #24).

create table currencies (
  code       char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name       text not null,
  minor_unit smallint not null default 2 check (minor_unit between 0 and 3),
  is_active  boolean not null default true
);

insert into currencies (code, name, minor_unit) values
  ('USD','US Dollar',2), ('EUR','Euro',2), ('GBP','British Pound',2),
  ('CAD','Canadian Dollar',2), ('AUD','Australian Dollar',2), ('NZD','New Zealand Dollar',2),
  ('CHF','Swiss Franc',2), ('CNY','Chinese Yuan',2), ('HKD','Hong Kong Dollar',2),
  ('SGD','Singapore Dollar',2), ('INR','Indian Rupee',2), ('MXN','Mexican Peso',2),
  ('BRL','Brazilian Real',2), ('ZAR','South African Rand',2), ('SEK','Swedish Krona',2),
  ('NOK','Norwegian Krone',2), ('DKK','Danish Krone',2), ('PLN','Polish Zloty',2),
  ('CZK','Czech Koruna',2), ('HUF','Hungarian Forint',2), ('RON','Romanian Leu',2),
  ('TRY','Turkish Lira',2), ('RUB','Russian Ruble',2), ('AED','UAE Dirham',2),
  ('SAR','Saudi Riyal',2), ('ILS','Israeli Shekel',2), ('THB','Thai Baht',2),
  ('PHP','Philippine Peso',2), ('MYR','Malaysian Ringgit',2), ('IDR','Indonesian Rupiah',2),
  ('TWD','New Taiwan Dollar',2), ('ARS','Argentine Peso',2), ('COP','Colombian Peso',2),
  ('PEN','Peruvian Sol',2), ('CLP','Chilean Peso',0), ('EGP','Egyptian Pound',2),
  ('NGN','Nigerian Naira',2), ('KES','Kenyan Shilling',2), ('PKR','Pakistani Rupee',2),
  ('BDT','Bangladeshi Taka',2), ('VND','Vietnamese Dong',0), ('JPY','Japanese Yen',0),
  ('KRW','South Korean Won',0), ('ISK','Icelandic Krona',0)
  on conflict (code) do nothing;
insert into currencies (code, name, minor_unit) values
  ('BHD','Bahraini Dinar',3), ('KWD','Kuwaiti Dinar',3), ('OMR','Omani Rial',3),
  ('JOD','Jordanian Dinar',3), ('TND','Tunisian Dinar',3), ('IQD','Iraqi Dinar',3),
  ('LYD','Libyan Dinar',3)
  on conflict (code) do nothing;

alter table currencies enable row level security;
create policy currencies_select on currencies for select using (true); -- global reference data
create policy currencies_nowrite on currencies for all using (false) with check (false);
grant select on currencies to authenticated, anon;
grant select, insert, update, delete on currencies to service_role;

-- ── per-org opt-in (D7) ───────────────────────────────────────────────────────
alter table org_accounting_settings
  add column multi_currency_enabled boolean not null default false;

-- ── journal_lines: base-currency equivalent + rate provenance (design §3) ────
-- base_amount_minor = amount_minor when currency == home (fx_rate = 1) — the
-- identity every existing row already satisfies, so the backfill is exact.
alter table journal_lines
  add column base_amount_minor bigint,
  add column fx_rate            numeric,
  add column fx_rate_source     text,      -- 'home' | 'manual' | 'fx_rates:<source>' | 'residual'
  add column fx_rate_date       date;

update journal_lines
   set base_amount_minor = amount_minor,
       fx_rate            = 1,
       fx_rate_source      = 'home'
 where base_amount_minor is null;

alter table journal_lines
  alter column base_amount_minor set not null,
  alter column fx_rate set not null,
  alter column fx_rate set default 1,
  add constraint journal_lines_base_amount_minor_check check (base_amount_minor >= 0);

-- Same ISO-shape guard the CoA integrity pass added to ledger_accounts.currency
-- (20260701220000) — NOT VALID so it doesn't lock/scan the existing table.
alter table journal_lines
  add constraint journal_lines_currency_iso check (currency ~ '^[A-Z]{3}$') not valid;

-- ── D5: monetary classification — infer from account_type, override per account ─
-- Default (no override): asset/liability = monetary (cash, AR, AP, loans — the
-- common foreign-denominated cases); equity/income/expense = non-monetary
-- (already recognized). Fixed-asset/prepaid accounts are type 'asset' too and
-- are NOT monetary by the strict accounting definition — is_monetary lets a CPA
-- flag those false explicitly (documented limitation of the type-only default,
-- design §5 "Which balances are monetary?").
alter table ledger_accounts
  add column is_monetary boolean; -- null = infer from type; true/false = override

-- ── NEW base-currency balance invariant (design §3, invariant 2) ─────────────
-- Additive alongside assert_entry_balanced (per-transaction-currency, unchanged
-- — LEARNINGS #6, one concept per trigger). Every entry's Σ base_amount_minor
-- must net to zero across D/C regardless of how many currencies it touches;
-- FX gain/loss lines (posted by the write-path) are what makes this hold for a
-- genuine cross-currency entry (design §5).
create or replace function assert_entry_base_balanced()
returns trigger language plpgsql as $$
declare
  v_entry uuid := coalesce(NEW.entry_id, OLD.entry_id);
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum(case when side = 'D' then base_amount_minor else 0 end), 0),
         coalesce(sum(case when side = 'C' then base_amount_minor else 0 end), 0)
    into v_debit, v_credit
    from journal_lines where entry_id = v_entry;
  if v_debit <> v_credit then
    raise exception 'journal entry % is not balanced in base currency: base debits (%) <> base credits (%)',
      v_entry, v_debit, v_credit
      using errcode = 'check_violation';
  end if;
  return null;
end$$;

create constraint trigger journal_lines_base_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function assert_entry_base_balanced();
