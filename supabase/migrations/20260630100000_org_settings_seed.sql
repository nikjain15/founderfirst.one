-- E2E P1-2 — every business org must have an org_accounting_settings row.
--
-- WHY: the table was EMPTY across all of prod and nothing created a row, so
-- cpa_posts_require_approval had nowhere to live → the CPA approval review queue
-- was unreachable, and home_currency / fiscal_year could never be configured
-- (E2E E3-gap, proven live: gate logic is correct, but no row ever existed).
--
-- FIX: a trigger seeds a default row on every new business org (one source of
-- truth, covers the orgs edge fn + any future path), plus a one-time backfill for
-- the business orgs that already exist. Firms keep no settings row (they hold no
-- books). The defaults match the column defaults (USD, Jan FY start, approval off).

create or replace function public.seed_org_accounting_settings() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.type = 'business' then
    insert into org_accounting_settings (org_id) values (new.id)
      on conflict (org_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists organizations_seed_settings on public.organizations;
create trigger organizations_seed_settings
  after insert on public.organizations
  for each row execute function public.seed_org_accounting_settings();

-- one-time backfill for business orgs created before this trigger existed.
insert into org_accounting_settings (org_id)
select o.id from organizations o
where o.type = 'business'
  and not exists (select 1 from org_accounting_settings s where s.org_id = o.id);
