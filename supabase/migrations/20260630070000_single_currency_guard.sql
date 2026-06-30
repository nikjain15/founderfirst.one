-- P0-2 fix — gate posting to the org's home currency (pilot is single-currency).
--
-- WHY: reports.ts sums amount_minor across currencies into one integer, so a USD
-- line + a EUR line render as a fabricated total and can flip the "balanced"
-- verdict (audit P0). The write-path accepted per-line currency with no check, so
-- this was reachable. Until real multi-currency reporting lands, refuse any line
-- whose currency != the org home currency. This makes the books single-currency by
-- construction, so the derived reports are correct. (Also satisfies the audit's
-- "line currency not validated against account" P2.)
--
-- A DB trigger (not just an app check) so it holds against every path incl. import.

create or replace function public.assert_line_home_currency() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare home char(3);
begin
  select coalesce(home_currency, 'USD') into home
    from org_accounting_settings where org_id = new.org_id;
  home := coalesce(home, 'USD');
  if new.currency is distinct from home then
    raise exception
      'currency_unsupported: line currency % does not match the org home currency % (multi-currency is not enabled for the pilot)',
      new.currency, home
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists journal_lines_home_currency on public.journal_lines;
create trigger journal_lines_home_currency
  before insert on public.journal_lines
  for each row execute function public.assert_line_home_currency();

-- NOTE (follow-up): when real multi-currency support is built, drop this trigger
-- and make reports.ts partition every total by currency (key by account_id|currency,
-- evaluate "balanced" per currency, mirroring the per-currency DB balance trigger).
