-- Categorization multi-model — Phase A: budget visibility + soft alert.
-- (design: docs/plans/categorization-multimodel-validation.md §6, §11)
--
-- Owner decision: the background validation panel has a $50/month budget. This is
-- a SOFT ceiling — we SURFACE running spend in the admin and ALERT when it crosses
-- the ceiling so the owner can raise it; we do NOT hard-stop categorization.
--
-- Cost is already recorded per call in ai_decisions.cost_usd. The shadow panel
-- writes its calls under use_case = 'penny_categorize_panel' (distinct from the
-- primary 'penny_categorize'), so panel spend is separable from the live answer's.

-- ── the ceiling (admin-editable single source of truth; NOT hardcoded per-file) ─
create table categorization_budget (
  id                   boolean primary key default true check (id),   -- singleton row
  monthly_ceiling_usd  numeric(10,2) not null default 50.00,
  updated_by           uuid references auth.users(id),
  updated_at           timestamptz not null default now()
);
insert into categorization_budget (id) values (true) on conflict (id) do nothing;

alter table categorization_budget enable row level security;
create policy cb_select  on categorization_budget for select using (true);       -- just a number; visible to signed-in admins
create policy cb_nowrite on categorization_budget for all using (false) with check (false);
grant select on categorization_budget to authenticated;
grant select, insert, update, delete on categorization_budget to service_role;

-- ── the alert ledger — fires ONCE per month on crossing (idempotent) ─────────
create table categorization_budget_alerts (
  month        date primary key,                 -- calendar month the crossing happened
  ceiling_usd  numeric(10,2) not null,
  spend_usd    numeric(12,6) not null,
  fired_at     timestamptz not null default now(),
  acknowledged boolean not null default false
);
alter table categorization_budget_alerts enable row level security;
create policy cba_select  on categorization_budget_alerts for select using (true);
create policy cba_nowrite on categorization_budget_alerts for all using (false) with check (false);
grant select on categorization_budget_alerts to authenticated;
grant select, insert, update, delete on categorization_budget_alerts to service_role;

-- ── running spend, per month (the admin gauge reads this) ────────────────────
create or replace view categorization_panel_spend as
select date_trunc('month', created_at)::date as month,
       coalesce(sum(cost_usd), 0)::numeric(12,6) as spend_usd,
       count(*)                                  as calls
  from ai_decisions
 where use_case = 'penny_categorize_panel'
 group by 1;
grant select on categorization_panel_spend to authenticated, service_role;

-- ── the soft check — call hourly (e.g. from email-dispatch); records an alert
-- row the FIRST time spend crosses the ceiling in a month. Returns the state for
-- the admin gauge. NEVER blocks or stops anything (soft, per owner decision).
create or replace function check_categorization_budget()
returns table (month date, spend_usd numeric, ceiling_usd numeric, pct numeric, crossed boolean, newly_alerted boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_month   date := date_trunc('month', now())::date;
  v_ceiling numeric;
  v_spend   numeric;
  v_already boolean;
  v_new     boolean := false;
begin
  select monthly_ceiling_usd into v_ceiling from categorization_budget limit 1;
  v_ceiling := coalesce(v_ceiling, 50.00);
  select coalesce(sum(cost_usd), 0) into v_spend
    from ai_decisions
   where use_case = 'penny_categorize_panel' and created_at >= v_month;
  select exists (select 1 from categorization_budget_alerts a where a.month = v_month) into v_already;

  if v_spend >= v_ceiling and not v_already then
    -- the `not v_already` guard already guarantees no row exists for this month
    insert into categorization_budget_alerts (month, ceiling_usd, spend_usd)
    values (v_month, v_ceiling, v_spend);
    v_new := true;   -- caller (dispatch) sends the admin email on newly_alerted = true
  end if;

  return query select
    v_month, v_spend, v_ceiling,
    case when v_ceiling > 0 then round(100 * v_spend / v_ceiling, 1) else null end,
    (v_spend >= v_ceiling),
    v_new;
end$$;

revoke all on function check_categorization_budget() from public;
grant execute on function check_categorization_budget() to service_role;
