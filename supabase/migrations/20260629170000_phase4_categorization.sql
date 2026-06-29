-- Phase 4 — Penny categorization loop (ARCHITECTURE.md §6, §11). Transactions
-- arrive uncategorized (imported against a holding/"Uncategorized" account, or
-- later from the bank feed). Penny proposes the real account; a human one-tap
-- approves; the entry is corrected (reverse + repost, append-only) and the fix
-- is LEARNED as a rule so the same correction isn't needed twice.
--
-- This brick is the deterministic spine: the rule store, a matcher (the
-- "propose" used both by Penny and as a fallback), and the recategorize
-- write-path (the "approve → post → learn"). The AI proposal (inference layer)
-- plugs into the same matcher + recategorize path in the next brick.

create type cat_match_type as enum ('description_exact', 'description_contains', 'source_ref_exact');

-- ── learned rules ───────────────────────────────────────────────────────────
create table categorization_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  match_type    cat_match_type not null,
  match_value   text not null,                         -- stored normalized (lower/trim)
  account_id    uuid not null references ledger_accounts(id),
  source        text not null default 'human',         -- 'human' | 'penny'
  times_applied int not null default 0,
  is_active     boolean not null default true,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, match_type, match_value)
);
create index categorization_rules_org_idx on categorization_rules (org_id);

alter table categorization_rules enable row level security;
create policy cr_select  on categorization_rules for select using ( can_access_org(org_id) );
create policy cr_nowrite on categorization_rules for all using (false) with check (false);
grant select on categorization_rules to authenticated;
grant select, insert, update, delete on categorization_rules to service_role;

-- ── matcher — the deterministic "propose" (exact beats contains; busiest wins) ─
create or replace function match_categorization_rule(p_org uuid, p_description text)
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from categorization_rules
   where org_id = p_org and is_active and p_description is not null
     and ( (match_type = 'description_exact'    and lower(trim(p_description)) = match_value)
        or (match_type = 'description_contains' and lower(p_description) like '%' || match_value || '%') )
   order by (match_type = 'description_exact') desc, times_applied desc, created_at asc
   limit 1;
$$;

-- ── learn / upsert a rule ───────────────────────────────────────────────────
create or replace function learn_categorization_rule(
  p_actor uuid, p_org uuid, p_match_type cat_match_type, p_match_value text,
  p_account_id uuid, p_source text default 'human'
) returns categorization_rules
language plpgsql security definer set search_path = public as $$
declare v_rule categorization_rules; v_val text := lower(trim(p_match_value));
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if v_val is null or v_val = '' then
    raise exception 'bad_match: match_value required' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from ledger_accounts where id = p_account_id and org_id = p_org) then
    raise exception 'bad_account: account not in org' using errcode = 'foreign_key_violation';
  end if;
  insert into categorization_rules (org_id, match_type, match_value, account_id, source, created_by)
  values (p_org, p_match_type, v_val, p_account_id, coalesce(p_source, 'human'), p_actor)
  on conflict (org_id, match_type, match_value)
    do update set account_id = excluded.account_id, is_active = true,
                  source = excluded.source, updated_at = now()
  returning * into v_rule;
  return v_rule;
end$$;

-- ── recategorize — approve a category: reverse the original, repost corrected ─
-- Swaps every line on p_from_account_id to p_to_account_id (the bank/other side
-- is untouched), appends-only via reverse + repost, and optionally learns a rule.
-- Idempotent on p_idempotency_key (the reversal + repost derive sub-keys).
create or replace function recategorize_entry(
  p_actor uuid, p_org uuid, p_entry_id uuid,
  p_from_account_id uuid, p_to_account_id uuid, p_idempotency_key text,
  p_learn boolean default false, p_learn_value text default null,
  p_learn_type cat_match_type default 'description_contains'
) returns journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_orig    journal_entries;
  v_new     journal_entries;
  v_lines   jsonb;
  v_swapped int;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from ledger_accounts where id = p_to_account_id and org_id = p_org and is_archived = false) then
    raise exception 'bad_account: target account not in org (or archived)' using errcode = 'foreign_key_violation';
  end if;
  select * into v_orig from journal_entries where id = p_entry_id and org_id = p_org;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_orig.status <> 'posted' then raise exception 'not_posted: only a posted entry can be recategorized' using errcode = 'restrict_violation'; end if;

  -- build corrected lines: swap the from-account → to-account; keep sides/amounts
  select jsonb_agg(jsonb_build_object(
           'account_id', case when account_id = p_from_account_id then p_to_account_id else account_id end,
           'amount_minor', amount_minor, 'side', side, 'currency', currency, 'memo', memo)),
         count(*) filter (where account_id = p_from_account_id)
    into v_lines, v_swapped
    from journal_lines where entry_id = v_orig.id;
  if coalesce(v_swapped, 0) = 0 then
    raise exception 'no_match: entry has no line on the from-account' using errcode = 'invalid_parameter_value';
  end if;

  -- append-only correction: reverse the original, then post the corrected entry
  perform reverse_journal_entry(p_actor, p_org, v_orig.id, p_idempotency_key || ':rev', v_orig.entry_date,
                                'Recategorized: ' || coalesce(v_orig.memo, v_orig.id::text));
  v_new := post_journal_entry(p_actor, p_org, v_orig.entry_date, p_idempotency_key || ':new',
                              v_lines, 'recategorize', v_orig.id::text, v_orig.memo);

  if p_learn then
    perform learn_categorization_rule(p_actor, p_org, p_learn_type,
              coalesce(p_learn_value, v_orig.memo, ''), p_to_account_id, 'human');
    update categorization_rules set times_applied = times_applied + 1, updated_at = now()
     where org_id = p_org and account_id = p_to_account_id
       and match_value = lower(trim(coalesce(p_learn_value, v_orig.memo, '')));
  end if;

  return v_new;
end$$;

-- ── grants: write-path locked to service_role ──────────────────────────────
revoke all on function match_categorization_rule(uuid, text)                              from public;
revoke all on function learn_categorization_rule(uuid, uuid, cat_match_type, text, uuid, text) from public;
revoke all on function recategorize_entry(uuid, uuid, uuid, uuid, uuid, text, boolean, text, cat_match_type) from public;
grant execute on function learn_categorization_rule(uuid, uuid, cat_match_type, text, uuid, text) to service_role;
grant execute on function recategorize_entry(uuid, uuid, uuid, uuid, uuid, text, boolean, text, cat_match_type) to service_role;
grant execute on function match_categorization_rule(uuid, text) to service_role;
