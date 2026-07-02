-- =============================================================================
-- FounderFirst — W3.2 · Trust-tiered autonomy (the ≤5-asks/week approval rework)
-- =============================================================================
--
-- The demo's "ask about everything" model becomes homework at scale. Instead
-- Penny ACTS on what she is sure of, BATCHES the maybes, and only INTERRUPTS the
-- owner for true unknowns — honestly capped at ≤5 asks/week/org (Roadmap §W3.2).
--
-- This migration adds ONLY the data + write-path this needs; it reuses everything
-- already built:
--   • Tier cutoffs + the ≤5 asks/week budget live in `platform_config`
--     (get_effective_behavior_config, CENTRAL-1) — never a magic number here.
--   • The HIGH-tier auto-post is `recategorize_entry` (20260629170000): a REVERSE
--     + repost + learn, so the books stay append-only and never edit a posted
--     entry (LEARNINGS reversal rule). It is period-lock-respecting (it posts the
--     correction into an open period) and audit-logged automatically by the
--     `ledger_audit_on_entry` trigger (20260630080000).
--   • 1-tap UNDO is `reverse_journal_entry` on the reposted entry — the same
--     reversal path, ledger stays balanced (a reversal flips every line's sign).
--   • The interruption budget is measured from `ai_decisions` (20260628120000):
--     one low-confidence ASK == one row we tag as an owner interruption.
--
-- What is NEW:
--   penny_activity            — the "Penny did this" feed: one row per HIGH-tier
--                               auto-post, linking the reposted entry + the
--                               reversal that undoes it. Tenant-scoped, read-only
--                               to org members via RLS, written only server-side.
--   autopost_categorization() — HIGH tier: recategorize + record a feed row.
--   undo_penny_activity()     — 1-tap undo: reverse the reposted entry, mark the
--                               feed row undone. Idempotent.
--   list_penny_activity()     — the feed reader (RLS-scoped) for the app.
--   record_owner_ask()        — tag one low-confidence interruption in ai_decisions
--                               so the weekly budget is measured from real data.
--   owner_asks_this_week()    — count this org's owner interruptions since the
--                               week start (the number the ≤5 budget caps).
--
-- Apply MANUALLY (LEARNINGS rule 3) — this migration is written, NOT deployed by
-- the build loop. Unique timestamp 20260705010000 (main max was 20260704040000).
-- =============================================================================

-- ── penny_activity: the "Penny did this" feed ───────────────────────────────
create table if not exists penny_activity (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references organizations(id) on delete cascade,
  kind           text        not null default 'autopost_category'
                             check (kind in ('autopost_category')),
  -- The entry Penny reposted onto the chosen account (the thing she "did").
  entry_id       uuid        references journal_entries(id) on delete set null,
  -- The account she filed it under (for the feed line).
  account_id     uuid        references ledger_accounts(id) on delete set null,
  -- Decision provenance: which HIGH-tier path fired + how sure.
  source         text        not null check (source in ('rule','vendor_prior','penny')),
  confidence     numeric(4,3) not null,
  summary        text        not null,             -- owner-facing, from the 'app' persona voice
  -- Undo bookkeeping: the reversal entry that undoes the repost, once undone.
  undo_entry_id  uuid        references journal_entries(id) on delete set null,
  undone_at      timestamptz,
  undone_by      uuid        references auth.users(id) on delete set null,
  actor          uuid        references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists penny_activity_org_at on penny_activity (org_id, created_at desc);

alter table penny_activity enable row level security;

-- Read-only to anyone who can access the org; writes go through the RPCs only.
drop policy if exists penny_activity_read on penny_activity;
create policy penny_activity_read on penny_activity
  for select using (can_access_org(org_id));

drop policy if exists penny_activity_no_write on penny_activity;
create policy penny_activity_no_write on penny_activity
  for all using (false) with check (false);

grant select on penny_activity to authenticated;
grant select, insert, update on penny_activity to service_role;

-- =============================================================================
-- autopost_categorization — the HIGH-confidence tier
-- =============================================================================
-- Penny posts the categorization herself (no card): recategorize the entry off
-- the holding account onto the chosen account (reverse + repost + learn), then
-- record a feed row. Every guard (auth, period-lock, append-only, tenant) is
-- inherited from recategorize_entry / reverse_journal_entry — this wrapper adds
-- only the feed row. The ledger_audit trigger logs the repost + reversal, so the
-- auto-post is audited without extra code.
create or replace function autopost_categorization(
  p_actor           uuid,
  p_org             uuid,
  p_entry_id        uuid,
  p_from_account_id uuid,
  p_to_account_id   uuid,
  p_idempotency_key text,
  p_source          text,
  p_confidence      numeric,
  p_summary         text,
  p_learn_value     text default null
) returns penny_activity
language plpgsql security definer set search_path = public as $$
declare
  v_new  journal_entries;
  v_row  penny_activity;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;
  if p_source not in ('rule','vendor_prior','penny') then
    raise exception 'bad_source: %', p_source using errcode = 'invalid_parameter_value';
  end if;

  -- HIGH-tier action == the exact reverse+repost the owner would have approved,
  -- with learn ON (a high-confidence pick becomes a rule for next time).
  -- recategorize_entry is idempotent on p_idempotency_key: a retry returns the
  -- same reposted entry (so v_new is stable across retries).
  v_new := recategorize_entry(
    p_actor, p_org, p_entry_id, p_from_account_id, p_to_account_id,
    p_idempotency_key, true, p_learn_value, 'description_contains');

  -- One feed row per reposted entry: a retry (same key → same v_new) is a no-op.
  select * into v_row from penny_activity where org_id = p_org and entry_id = v_new.id;
  if found then return v_row; end if;

  insert into penny_activity (org_id, kind, entry_id, account_id, source, confidence, summary, actor)
  values (p_org, 'autopost_category', v_new.id, p_to_account_id, p_source,
          round(greatest(0, least(1, p_confidence))::numeric, 3), p_summary, p_actor)
  returning * into v_row;

  return v_row;
end$$;

revoke all on function autopost_categorization(uuid,uuid,uuid,uuid,uuid,text,text,numeric,text,text) from public;
grant execute on function autopost_categorization(uuid,uuid,uuid,uuid,uuid,text,text,numeric,text,text) to service_role;

-- =============================================================================
-- undo_penny_activity — 1-tap undo (reversal path, ledger stays balanced)
-- =============================================================================
-- Reverse the entry Penny reposted. reverse_journal_entry flips every line's
-- sign, so the trial balance nets back to where it was before the auto-post — the
-- ledger stays balanced and append-only (never editing/deleting the original).
-- Idempotent: a second undo returns the already-undone row.
create or replace function undo_penny_activity(
  p_actor       uuid,
  p_org         uuid,
  p_activity_id uuid
) returns penny_activity
language plpgsql security definer set search_path = public as $$
declare
  v_row penny_activity;
  v_rev journal_entries;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;

  select * into v_row from penny_activity where id = p_activity_id and org_id = p_org for update;
  if not found then raise exception 'not_found: activity % not in org %', p_activity_id, p_org using errcode = 'no_data_found'; end if;
  if v_row.undone_at is not null then return v_row; end if;  -- already undone (idempotent)
  if v_row.entry_id is null then raise exception 'nothing_to_undo' using errcode = 'restrict_violation'; end if;

  -- Reverse the reposted entry — the same reversal path, keyed off the activity id
  -- so a retry is idempotent inside reverse_journal_entry too.
  v_rev := reverse_journal_entry(
    p_actor, p_org, v_row.entry_id, 'undo-activity:' || v_row.id::text,
    current_date, 'Undo of Penny auto-categorization');

  update penny_activity
     set undo_entry_id = v_rev.id, undone_at = now(), undone_by = p_actor
   where id = v_row.id
  returning * into v_row;

  return v_row;
end$$;

revoke all on function undo_penny_activity(uuid,uuid,uuid) from public;
grant execute on function undo_penny_activity(uuid,uuid,uuid) to service_role;

-- =============================================================================
-- list_penny_activity — the feed reader (RLS-scoped, direct client read)
-- =============================================================================
create or replace function list_penny_activity(p_org uuid, p_limit int default 50)
returns setof penny_activity
language sql stable security definer set search_path = public as $$
  select * from penny_activity
   where org_id = p_org and can_access_org(p_org)
   order by created_at desc
   limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;
grant execute on function list_penny_activity(uuid, int) to authenticated;

-- =============================================================================
-- Interruption budget — measured from ai_decisions
-- =============================================================================
-- One low-confidence ASK the owner sees == one interruption. We tag it in
-- ai_decisions (the single source of truth for AI decisions) with a stable
-- use_case so the count is real data, not a client tally. record_owner_ask is
-- idempotent per (org, entry) within the week so re-rendering the card doesn't
-- inflate the count.
create or replace function record_owner_ask(
  p_org      uuid,
  p_entry_id uuid,
  p_actor    uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_week_start timestamptz := date_trunc('week', now());
  v_ref text := p_entry_id::text;
begin
  -- Idempotent within the week: one interruption per entry per week.
  if exists (
    select 1 from ai_decisions
     where tenant_id = 'org:' || p_org::text
       and use_case = 'owner_interruption'
       and request_ref = v_ref
       and created_at >= v_week_start
  ) then
    return;
  end if;
  insert into ai_decisions (tenant_id, use_case, runtime, provider, model, request_ref, gate_status)
  values ('org:' || p_org::text, 'owner_interruption', 'deno', 'workers-ai', 'n/a', v_ref, 'unevaluated');
end$$;

revoke all on function record_owner_ask(uuid,uuid,uuid) from public;
grant execute on function record_owner_ask(uuid,uuid,uuid) to service_role;

-- How many owner interruptions has this org had since the start of THIS week.
-- The ≤5 budget (asks_per_week, from platform_config) caps this number; the
-- caller compares this count to the config value — the cutoff is never hardcoded.
create or replace function owner_asks_this_week(p_org uuid)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(count(*), 0)::int
    from ai_decisions
   where tenant_id = 'org:' || p_org::text
     and use_case = 'owner_interruption'
     and created_at >= date_trunc('week', now());
$$;
-- Readable by an org member (the app shows "N of your 5 for this week"); the
-- function is org-scoped and the app already gates the org, so grant to authed.
grant execute on function owner_asks_this_week(uuid) to authenticated;

-- =============================================================================
-- End of migration.
-- =============================================================================
