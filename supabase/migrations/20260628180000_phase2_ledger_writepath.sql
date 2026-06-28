-- Phase 2 — ledger WRITE PATH (ARCHITECTURE.md §6.1, §8, §C2). The schema
-- (20260628160000_phase2_ledger_core) laid the tables + structural guards (the
-- belt). This migration adds the ONLY sanctioned way money enters the ledger
-- (the suspenders): SECURITY DEFINER functions the service-role edge functions
-- call. Clients can neither write the tables (RLS denies client writes) nor reach
-- these functions (EXECUTE granted to service_role only) — every money mutation
-- funnels through here, validated: balanced · idempotent · period-open · authorized.
--
--   can_write_org_as / has_membership_as   actor-parameterized auth predicates.
--     The edge function passes the JWT-verified actor; auth.uid() is null under
--     the service role. The original can_write_org()/has_membership() are
--     refactored to delegate → ONE source of truth (LEARNINGS #6).
--   ensure_open_period        find/auto-create the open calendar-month period;
--                             reject a closed period.
--   upsert_ledger_account     create/edit a chart-of-accounts row.
--   close/reopen_accounting_period   lock / unlock a period (CPA close).
--   post_journal_entry        the balanced, idempotent, period-aware post.
--   approve_journal_entry     owner approves a CPA's pending_review entry.
--   reverse_journal_entry     append-only correction (flip D/C of a posted entry).

-- ── actor-parameterized auth predicates (one source of truth) ───────────────
create or replace function has_membership_as(p_actor uuid, target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = p_actor and m.org_id = target_org and m.status = 'active'
  );
$$;

-- WRITE capability for an explicit actor. Business members write; an engaged CPA
-- writes ONLY if their engagement is access='full' (and passes the assignment /
-- firm_admin gate). Mirrors can_write_org() exactly, parameterized by actor.
create or replace function can_write_org_as(p_actor uuid, target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select has_membership_as(p_actor, target_org)
      or exists (
        select 1
        from engagements e
        join memberships m
          on m.org_id = e.firm_org_id and m.user_id = p_actor and m.status = 'active'
        where e.client_org_id = target_org
          and e.status = 'active'
          and e.access = 'full'
          and ( m.role = 'firm_admin'
                or exists (select 1 from client_assignments ca
                           where ca.engagement_id = e.id and ca.user_id = p_actor) )
      );
$$;

-- Refactor the auth.uid()-based helpers to delegate (signatures unchanged, so
-- their existing grants used by the RLS policies are preserved).
create or replace function has_membership(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select has_membership_as(auth.uid(), target_org);
$$;

create or replace function can_write_org(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_write_org_as(auth.uid(), target_org);
$$;

-- ── ensure_open_period ──────────────────────────────────────────────────────
-- Returns the id of the period covering p_date. If one exists but is closed,
-- raises. If none exists, auto-creates an OPEN calendar-month period so books
-- run from day one without forcing period setup (owners never see the concept;
-- CPAs still close periods explicitly to lock them).
create or replace function ensure_open_period(p_org uuid, p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_period_id uuid;
  v_status    period_status;
  v_start     date := date_trunc('month', p_date)::date;
  v_end       date := (date_trunc('month', p_date) + interval '1 month - 1 day')::date;
begin
  select id, status into v_period_id, v_status
  from accounting_periods
  where org_id = p_org and p_date between period_start and period_end
  order by period_start desc
  limit 1;

  if v_period_id is not null then
    if v_status = 'closed' then
      raise exception 'period_closed: % falls in a closed period', p_date
        using errcode = 'restrict_violation';
    end if;
    return v_period_id;
  end if;

  insert into accounting_periods (org_id, period_start, period_end, status)
  values (p_org, v_start, v_end, 'open')
  on conflict (org_id, period_start, period_end)
    do update set status = accounting_periods.status   -- no-op; just returns the row on a concurrent create
  returning id into v_period_id;
  return v_period_id;
end$$;

-- ── upsert_ledger_account ───────────────────────────────────────────────────
create or replace function upsert_ledger_account(
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
declare v_acct ledger_accounts;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;

  if p_id is null then
    insert into ledger_accounts (org_id, code, name, type, parent_id, currency)
    values (p_org, p_code, p_name, p_type, p_parent_id,
            coalesce(p_currency, (select home_currency from org_accounting_settings where org_id = p_org), 'USD'))
    returning * into v_acct;
  else
    update ledger_accounts
       set name        = p_name,
           type        = p_type,
           code        = p_code,
           parent_id   = p_parent_id,
           currency    = coalesce(p_currency, currency),
           is_archived = coalesce(p_archived, is_archived)
     where id = p_id and org_id = p_org
    returning * into v_acct;
    if not found then
      raise exception 'not_found: account % not in org %', p_id, p_org using errcode = 'no_data_found';
    end if;
  end if;
  return v_acct;
end$$;

-- ── period close / reopen ───────────────────────────────────────────────────
create or replace function close_accounting_period(p_actor uuid, p_org uuid, p_period_id uuid)
returns accounting_periods language plpgsql security definer set search_path = public as $$
declare v_p accounting_periods;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update accounting_periods set status = 'closed', closed_by = p_actor, closed_at = now()
   where id = p_period_id and org_id = p_org
  returning * into v_p;
  if not found then raise exception 'not_found: period % not in org %', p_period_id, p_org using errcode = 'no_data_found'; end if;
  return v_p;
end$$;

create or replace function reopen_accounting_period(p_actor uuid, p_org uuid, p_period_id uuid)
returns accounting_periods language plpgsql security definer set search_path = public as $$
declare v_p accounting_periods;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update accounting_periods set status = 'open', closed_by = null, closed_at = null
   where id = p_period_id and org_id = p_org
  returning * into v_p;
  if not found then raise exception 'not_found: period % not in org %', p_period_id, p_org using errcode = 'no_data_found'; end if;
  return v_p;
end$$;

-- ── post_journal_entry — the only sanctioned post ───────────────────────────
-- p_lines: jsonb array of { account_id, amount_minor (positive int, minor units),
--          side ('D'|'C'), currency? (defaults to home), memo? }.
-- Validates: authorization → idempotency replay → line shape → accounts in org →
-- balanced (belt; the deferred trigger is suspenders) → open period (auto-create)
-- → approval gate → atomic insert of entry + lines. Returns the entry row.
create or replace function post_journal_entry(
  p_actor           uuid,
  p_org             uuid,
  p_entry_date      date,
  p_idempotency_key text,
  p_lines           jsonb,
  p_source          text default 'manual',
  p_source_ref      text default null,
  p_memo            text default null
) returns journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_entry     journal_entries;
  v_existing  journal_entries;
  v_period_id uuid;
  v_home_ccy  char(3);
  v_line      jsonb;
  v_debits    bigint := 0;
  v_credits   bigint := 0;
  v_bad       int;
  v_status    entry_status := 'posted';
  v_require   boolean;
begin
  -- 1. authorization (actor from verified JWT; auth.uid() is null under service role)
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;

  -- 2. idempotency — a replay returns the original, never double-posts
  select * into v_existing from journal_entries
   where org_id = p_org and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  -- 3. line shape
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'bad_lines: expected a JSON array of lines' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_lines) < 2 then
    raise exception 'bad_lines: an entry needs at least two lines' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(home_currency, 'USD') into v_home_ccy from org_accounting_settings where org_id = p_org;
  v_home_ccy := coalesce(v_home_ccy, 'USD');

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if (v_line->>'account_id') is null
       or coalesce(v_line->>'side', '') not in ('D', 'C')
       or (v_line->>'amount_minor') is null then
      raise exception 'bad_line: each line needs account_id, side D|C, amount_minor' using errcode = 'invalid_parameter_value';
    end if;
    if (v_line->>'amount_minor')::bigint <= 0 then
      raise exception 'bad_line: amount_minor must be a positive integer in minor units' using errcode = 'invalid_parameter_value';
    end if;
    if (v_line->>'side') = 'D' then v_debits := v_debits + (v_line->>'amount_minor')::bigint;
    else                            v_credits := v_credits + (v_line->>'amount_minor')::bigint;
    end if;
  end loop;

  -- 4. every referenced account belongs to this org and is not archived
  select count(*) into v_bad
  from jsonb_array_elements(p_lines) l
  left join ledger_accounts a
    on a.id = (l->>'account_id')::uuid and a.org_id = p_org and a.is_archived = false
  where a.id is null;
  if v_bad > 0 then
    raise exception 'bad_account: a line references an account not in this org (or archived)' using errcode = 'foreign_key_violation';
  end if;

  -- 5. balanced (belt). Friendly early error for the common single-currency case;
  --    the deferred trigger enforces per-currency balance authoritatively at commit.
  if v_debits <> v_credits then
    raise exception 'unbalanced: debits (%) <> credits (%)', v_debits, v_credits using errcode = 'check_violation';
  end if;

  -- 6. period: auto-create an open monthly period; reject a closed one
  v_period_id := ensure_open_period(p_org, p_entry_date);

  -- 7. approval gate: a CPA acting via engagement (not a business member) lands
  --    pending_review when the org requires it; members post directly.
  select coalesce(cpa_posts_require_approval, false) into v_require
    from org_accounting_settings where org_id = p_org;
  if coalesce(v_require, false) and not has_membership_as(p_actor, p_org) then
    v_status := 'pending_review';
  end if;

  -- 8. atomic insert (one txn; the deferred balance trigger fires at commit)
  insert into journal_entries
    (org_id, entry_date, period_id, memo, status, source, source_ref, reverses_id, idempotency_key, posted_by)
  values
    (p_org, p_entry_date, v_period_id, p_memo, v_status, coalesce(p_source, 'manual'), p_source_ref, null, p_idempotency_key, p_actor)
  returning * into v_entry;

  insert into journal_lines (entry_id, org_id, account_id, amount_minor, currency, side, memo)
  select v_entry.id, p_org, (l->>'account_id')::uuid, (l->>'amount_minor')::bigint,
         coalesce(l->>'currency', v_home_ccy), l->>'side', l->>'memo'
  from jsonb_array_elements(p_lines) l;

  return v_entry;
exception
  when unique_violation then
    -- a concurrent post with the same idempotency_key won the race; return theirs
    select * into v_existing from journal_entries
     where org_id = p_org and idempotency_key = p_idempotency_key;
    return v_existing;
end$$;

-- ── approve_journal_entry — owner approves a CPA's pending_review entry ──────
-- Only a business MEMBER (the owner side) may approve; the posting CPA cannot
-- self-approve. Moves pending_review → posted and records approved_by.
create or replace function approve_journal_entry(p_actor uuid, p_org uuid, p_entry_id uuid)
returns journal_entries language plpgsql security definer set search_path = public as $$
declare v_e journal_entries;
begin
  if not has_membership_as(p_actor, p_org) then
    raise exception 'forbidden: only a business member may approve' using errcode = 'insufficient_privilege';
  end if;
  select * into v_e from journal_entries where id = p_entry_id and org_id = p_org;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_e.status <> 'pending_review' then
    raise exception 'not_pending: entry is not awaiting approval' using errcode = 'restrict_violation';
  end if;
  update journal_entries set status = 'posted', approved_by = p_actor where id = p_entry_id
  returning * into v_e;
  return v_e;
end$$;

-- ── reverse_journal_entry — append-only correction ──────────────────────────
-- Posts a NEW entry that flips every line's side, references the original via
-- reverses_id, and marks the original 'reversed'. The correction lands in an
-- OPEN period (a closed original period stays locked; only the new entry posts).
create or replace function reverse_journal_entry(
  p_actor           uuid,
  p_org             uuid,
  p_entry_id        uuid,
  p_idempotency_key text,
  p_entry_date      date default null,
  p_memo            text default null
) returns journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_orig     journal_entries;
  v_new      journal_entries;
  v_existing journal_entries;
  v_period   uuid;
  v_date     date;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;

  -- idempotency on the reversal's own key
  select * into v_existing from journal_entries where org_id = p_org and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  select * into v_orig from journal_entries where id = p_entry_id and org_id = p_org;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_orig.status = 'reversed' then raise exception 'already_reversed' using errcode = 'restrict_violation'; end if;
  if v_orig.status <> 'posted'  then raise exception 'not_posted: only a posted entry can be reversed' using errcode = 'restrict_violation'; end if;

  v_date   := coalesce(p_entry_date, current_date);
  v_period := ensure_open_period(p_org, v_date);

  insert into journal_entries
    (org_id, entry_date, period_id, memo, status, source, source_ref, reverses_id, idempotency_key, posted_by)
  values
    (p_org, v_date, v_period, coalesce(p_memo, 'Reversal of ' || v_orig.id::text),
     'posted', 'reversal', v_orig.id::text, v_orig.id, p_idempotency_key, p_actor)
  returning * into v_new;

  insert into journal_lines (entry_id, org_id, account_id, amount_minor, currency, side, memo)
  select v_new.id, p_org, account_id, amount_minor, currency,
         case when side = 'D' then 'C' else 'D' end, memo
  from journal_lines where entry_id = v_orig.id;

  update journal_entries set status = 'reversed' where id = v_orig.id;  -- status-only change (guard trigger permits)

  return v_new;
exception
  when unique_violation then
    select * into v_existing from journal_entries where org_id = p_org and idempotency_key = p_idempotency_key;
    return v_existing;
end$$;

-- ── grants — lock the write-path to the service-role API ────────────────────
-- The actor-parameterized predicates + helpers are internal (called by the
-- SECURITY DEFINER functions, which run as owner): revoke from public so a
-- client can't probe another user's permissions. The write functions are the
-- service-role API surface only.
revoke all on function has_membership_as(uuid, uuid)                         from public;
revoke all on function can_write_org_as(uuid, uuid)                          from public;
revoke all on function ensure_open_period(uuid, date)                        from public;
revoke all on function upsert_ledger_account(uuid, uuid, text, account_type, text, uuid, uuid, char, boolean) from public;
revoke all on function close_accounting_period(uuid, uuid, uuid)            from public;
revoke all on function reopen_accounting_period(uuid, uuid, uuid)           from public;
revoke all on function post_journal_entry(uuid, uuid, date, text, jsonb, text, text, text) from public;
revoke all on function approve_journal_entry(uuid, uuid, uuid)              from public;
revoke all on function reverse_journal_entry(uuid, uuid, uuid, text, date, text) from public;

grant execute on function upsert_ledger_account(uuid, uuid, text, account_type, text, uuid, uuid, char, boolean) to service_role;
grant execute on function close_accounting_period(uuid, uuid, uuid)            to service_role;
grant execute on function reopen_accounting_period(uuid, uuid, uuid)           to service_role;
grant execute on function post_journal_entry(uuid, uuid, date, text, jsonb, text, text, text) to service_role;
grant execute on function approve_journal_entry(uuid, uuid, uuid)              to service_role;
grant execute on function reverse_journal_entry(uuid, uuid, uuid, text, date, text) to service_role;
