-- P0 — concurrent double-reversal corrupts account balances. [stress:journal]
--
-- reverse_journal_entry checks `if v_orig.status = 'reversed' then raise
-- already_reversed` AFTER a lock-free `select * into v_orig`. That guard is a
-- TOCTOU: two concurrent reversals of the SAME posted entry (different
-- idempotency keys — two tabs, a network retry, two CPAs, any programmatic
-- caller) both read status='posted' before either commits, so BOTH insert a
-- reversal entry and BOTH run the final status='reversed' update (which has no
-- status precondition). Result: one original reversed N times → its accounts are
-- over-cancelled (e.g. Dr Cash 1500 / Cr Rev 1500 reversed twice nets Cash to
-- −1500 and Rev to +1500 that should both be zero). The org trial balance still
-- ties (every reversal is internally balanced), so the corruption is SILENT to a
-- debits=credits check — only per-account/per-original analysis reveals it.
--
-- Reproduced live on prod: 14 concurrent ledger-reverse calls on one 400-line
-- entry created 10 reversals of it.
--
-- recategorize_entry (20260629…/#122) already learned this lesson and locks the
-- original with `for update` ("concurrent approves now serialize → exactly one
-- wins … Closes the double-reverse/repost P0"). reverse_journal_entry — the
-- shared primitive recategorize itself calls — was never given the same lock.
--
-- FIX: lock the original row at read time. The loser blocks at the SELECT until
-- the winner commits, then re-reads status='reversed' and raises already_reversed.
-- Reversals of one entry serialize → at most one ever exists. (approve gets the
-- same lock for consistency — a benign TOCTOU, but no reason to leave it racy.)
--
-- Belt + suspenders: a partial unique index makes a second reversal of any
-- original structurally impossible even if the function logic ever regresses.
-- NOTE TO INTEGRATOR: that index will fail to create while duplicate reversals
-- still exist. Real pilot orgs are clean (verified 2026-06-30); the only current
-- duplicates are in throw-away stress namespaces ([JETEST]/[CATTEST]). Purge
-- those first, or deploy the function fix alone and add the index after cleanup.

-- ── reverse_journal_entry — lock the original (the fix) ─────────────────────
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

  -- LOCK the original: concurrent reversals of the same entry now serialize so
  -- exactly one wins (the loser blocks here, then re-reads 'reversed' below and
  -- raises already_reversed). Closes the double-reversal over-cancellation P0.
  select * into v_orig from journal_entries where id = p_entry_id and org_id = p_org for update;
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

-- ── approve_journal_entry — same lock, for consistency ──────────────────────
-- Lower severity (a raced double-approve creates no duplicate financial rows —
-- it just re-stamps approved_by/status), but the same lock-free read→mutate
-- shape; lock it so the pattern is uniform across the write-path.
create or replace function approve_journal_entry(p_actor uuid, p_org uuid, p_entry_id uuid)
returns journal_entries language plpgsql security definer set search_path = public as $$
declare v_e journal_entries;
begin
  if not has_membership_as(p_actor, p_org) then
    raise exception 'forbidden: only a business member may approve' using errcode = 'insufficient_privilege';
  end if;
  select * into v_e from journal_entries where id = p_entry_id and org_id = p_org for update;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_e.status <> 'pending_review' then
    raise exception 'not_pending: entry is not awaiting approval' using errcode = 'restrict_violation';
  end if;
  update journal_entries set status = 'posted', approved_by = p_actor where id = p_entry_id
  returning * into v_e;
  return v_e;
end$$;

-- ── defense-in-depth: at most one reversal per original ─────────────────────
-- See INTEGRATOR note in the header: requires no pre-existing duplicate
-- reversals. Comment this statement out to deploy the function fix alone.
create unique index if not exists journal_entries_one_reversal_per_original
  on journal_entries (org_id, reverses_id)
  where reverses_id is not null;
