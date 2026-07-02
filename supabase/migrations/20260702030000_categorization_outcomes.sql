-- Categorization multi-model validation — Phase A foundation.
-- (design: docs/plans/categorization-multimodel-validation.md)
--
-- The scorecard's source of truth: one row per categorization DECISION, linking
-- every model's proposed account (primary + the shadow panel) to the account a
-- human ultimately accepted — the built-in ground-truth label. Raw per-call cost
-- + latency already live in ai_decisions (keyed by entry_id); this table holds the
-- DERIVED outcome so the admin scorecard stays fast and carries NO customer free
-- text (account ids + weights only; the memo stays in ai_decisions under its
-- retention/erasure path).
--
-- Refinement 11a: a CPA's label outweighs an owner's; a later CPA correction
-- SUPERSEDES an owner's earlier one. label_weight + approver_role + superseded_by
-- capture that so model SELECTION optimizes for what a professional accepts.

-- ── authority weight for a human label (gold/silver) ─────────────────────────
create or replace function categorization_label_weight(p_role text)
returns numeric language sql immutable set search_path = public as $$
  select case p_role
           when 'cpa'    then 1.0      -- trained reviewer → gold
           when 'owner'  then 0.6      -- business member  → silver
           when 'member' then 0.6
           else 0.0                    -- auto-rule / unknown → not a fresh label
         end::numeric;
$$;

-- ── the outcome ledger ───────────────────────────────────────────────────────
create table categorization_outcomes (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  entry_id             uuid not null references journal_entries(id) on delete cascade,
  -- every model's pick for this txn: { "<model_id>": "<account_id>", ... }
  proposed             jsonb not null default '{}'::jsonb,
  primary_model        text,                       -- the model that served the live answer
  primary_account_id   uuid references ledger_accounts(id),
  -- the human label
  approved_account_id  uuid references ledger_accounts(id),
  approver_id          uuid references auth.users(id),
  approver_role        text,                        -- 'cpa' | 'owner' | 'member'
  label_weight         numeric not null default 0,  -- categorization_label_weight(approver_role)
  primary_correct      boolean,                     -- primary_account_id = approved_account_id
  panel_agreement      numeric,                     -- share of panel that matched the approved account (0..1)
  -- a later CPA correction re-labels an earlier (owner) outcome
  superseded_by        uuid references categorization_outcomes(id) on delete set null,
  created_at           timestamptz not null default now(),
  approved_at          timestamptz
);
create index categorization_outcomes_org_idx    on categorization_outcomes (org_id);
create index categorization_outcomes_model_idx   on categorization_outcomes (primary_model);
create index categorization_outcomes_entry_idx   on categorization_outcomes (entry_id);
create index categorization_outcomes_created_idx on categorization_outcomes (created_at);

alter table categorization_outcomes enable row level security;
-- org members/CPAs may read their own org's outcomes; no client writes (labeler is
-- service-role). The cross-org admin scorecard aggregates via a service-role fn.
create policy co_select  on categorization_outcomes for select using ( can_access_org(org_id) );
create policy co_nowrite on categorization_outcomes for all using (false) with check (false);
grant select on categorization_outcomes to authenticated;
grant select, insert, update, delete on categorization_outcomes to service_role;

-- ── record/label an outcome (service-role; called by the labeler on approve) ──
-- Idempotent per entry: a re-approve or a later CPA correction UPDATES the row and,
-- when a stronger (higher-weight) label arrives, overwrites the truth + flags the
-- prior label as superseded. Returns the row.
create or replace function record_categorization_outcome(
  p_org uuid, p_entry_id uuid, p_proposed jsonb, p_primary_model text,
  p_primary_account_id uuid, p_approved_account_id uuid,
  p_approver_id uuid, p_approver_role text
) returns categorization_outcomes
language plpgsql security definer set search_path = public as $$
declare
  v_row categorization_outcomes;
  v_weight numeric := categorization_label_weight(p_approver_role);
  v_agree numeric;
begin
  -- share of proposing models whose pick equals the accepted account
  select case when count(*) = 0 then null
              else sum((value = p_approved_account_id::text)::int)::numeric / count(*)
         end
    into v_agree
    from jsonb_each_text(coalesce(p_proposed, '{}'::jsonb)) as e(key, value);

  select * into v_row from categorization_outcomes where entry_id = p_entry_id and org_id = p_org;
  if not found then
    insert into categorization_outcomes
      (org_id, entry_id, proposed, primary_model, primary_account_id,
       approved_account_id, approver_id, approver_role, label_weight,
       primary_correct, panel_agreement, approved_at)
    values
      (p_org, p_entry_id, coalesce(p_proposed,'{}'::jsonb), p_primary_model, p_primary_account_id,
       p_approved_account_id, p_approver_id, p_approver_role, v_weight,
       p_primary_account_id is not distinct from p_approved_account_id, v_agree, now())
    returning * into v_row;
    return v_row;
  end if;

  -- only let a >= authoritative label overwrite the truth (CPA supersedes owner).
  if v_weight >= coalesce(v_row.label_weight, 0) then
    update categorization_outcomes set
      approved_account_id = p_approved_account_id,
      approver_id = p_approver_id, approver_role = p_approver_role, label_weight = v_weight,
      primary_correct = (v_row.primary_account_id is not distinct from p_approved_account_id),
      panel_agreement = v_agree, approved_at = now()
    where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end$$;

revoke all on function record_categorization_outcome(uuid, uuid, jsonb, text, uuid, uuid, uuid, text) from public;
grant execute on function record_categorization_outcome(uuid, uuid, jsonb, text, uuid, uuid, uuid, text) to service_role;

-- ── scorecard view: per-model accuracy (raw + CPA-weighted) ─────────────────
-- Cost/latency are joined from ai_decisions at query time in the admin fn; this
-- view is the accuracy spine. One row per model that has proposed at least once.
create or replace view categorization_model_scorecard as
with runs as (
  select o.org_id, o.approved_account_id, o.label_weight, o.approved_at,
         e.key   as model_id,
         e.value as proposed_account_id
    from categorization_outcomes o,
         lateral jsonb_each_text(o.proposed) as e(key, value)
   where o.approved_account_id is not null
)
select
  model_id,
  org_id,
  count(*)                                                            as labeled_n,
  avg((proposed_account_id = approved_account_id::text)::int)::numeric as accuracy_raw,
  case when sum(label_weight) = 0 then null
       else sum((proposed_account_id = approved_account_id::text)::int * label_weight)
              / sum(label_weight) end                                 as accuracy_weighted,
  max(approved_at)                                                    as last_labeled_at
from runs
group by model_id, org_id;

grant select on categorization_model_scorecard to authenticated, service_role;
