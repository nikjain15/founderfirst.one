-- [stress:cpa-scope] CPATEST-F1 — make the CPA approval gate REACHABLE.
--
-- WHY: post_journal_entry already implements the owner control "a CPA's posts land
-- pending_review until I approve" (gated on org_accounting_settings.
-- cpa_posts_require_approval), approve_journal_entry + the reports inBooks() filter
-- complete it, and CpaLens.tsx documents it. But the flag defaults to FALSE and
-- NOTHING in the product can set it to true — no edge fn, no UI (proven live:
-- `grep cpa_posts_require_approval` hits only migrations). So the whole owner-side
-- approval-review control is unreachable in production — same class of gap as the
-- engagement-revoke hole that 20260630110000_engagement_lifecycle.sql was created
-- to close. This adds the sanctioned write-path the `org-settings` edge fn calls.
--
-- The control belongs to the CLIENT'S OWNER (it governs the CPA relationship), so
-- the function gates to an active owner membership — a CPA (engagement) or a plain
-- member cannot flip their own oversight off. Settings rows are seeded for every
-- business org by 20260630100000_org_settings_seed.sql; we upsert to be safe.

create or replace function set_org_accounting_settings(
  p_actor                     uuid,
  p_org                       uuid,
  p_cpa_posts_require_approval boolean default null,
  p_home_currency             char(3) default null,
  p_fiscal_year_start_month   int     default null
) returns org_accounting_settings
language plpgsql security definer set search_path = public as $$
declare v_s org_accounting_settings;
begin
  -- owner-only: the approval gate is the owner's oversight of their CPA, not a
  -- setting a CPA (engagement) or non-owner member may change.
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
         fiscal_year_start_month    = coalesce(p_fiscal_year_start_month, fiscal_year_start_month)
   where org_id = p_org
  returning * into v_s;
  return v_s;
end$$;

revoke all on function set_org_accounting_settings(uuid, uuid, boolean, char, int) from public;
grant execute on function set_org_accounting_settings(uuid, uuid, boolean, char, int) to service_role;
