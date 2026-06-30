-- [stress:categorize] — two confirmed breaks in the categorize / reverse loop.
-- Authored from an adversarial stress-test against prod (ref ejqsfzggyfsjzrcevlnq).
-- WRITE-ONLY: do NOT deploy from this branch. Integrator reviews + sequences.
--
-- ── FIX 1 (P0, LIVE on prod): reverse_journal_entry concurrent double-reversal ──
-- reverse_journal_entry reads the original with a plain SELECT (no row lock) and
-- its `update ... set status='reversed'` carries no status precondition. Two
-- concurrent reverses of the SAME entry (each with its own idempotency key —
-- trivially reachable through the public `ledger-reverse` edge function, e.g. a
-- double-click or two devices) both see status='posted' in their snapshot, both
-- insert a reversal, and both flip the status. Result: an entry reversed 2–3×,
-- so the account it touched is over-cancelled (verified live: one $9.00 entry
-- reversed 3× → the account nets −$18.00). Global debits==credits still tie
-- (each reversal entry is internally balanced), so the corruption is SILENT.
--
-- This same unlocked path is what made recategorize_entry double-POST before prod
-- was hardened with its own FOR UPDATE (that hardening is deployed on prod but NOT
-- yet in this repo — see the flagged drift in the PR). Locking the original here
-- closes BOTH: the standalone reverse race AND any recategorize that reaches the
-- ledger through reverse_journal_entry (recategorize calls this first; the lock is
-- held for the whole outer transaction, so a racing recategorize blocks then sees
-- 'reversed' and aborts cleanly).
--
-- Fix: SELECT ... FOR UPDATE serializes concurrent reverses on one entry. The
-- loser blocks until the winner commits, re-reads the now-'reversed' row, and
-- raises 'already_reversed'. Single-entry locking — unrelated reverses don't block.
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

  -- idempotency on the reversal's own key (a true replay returns the prior reversal)
  select * into v_existing from journal_entries where org_id = p_org and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  -- LOCK the original so concurrent reverses serialize → exactly one wins. The
  -- loser blocks here, then re-reads the committed 'reversed' status below and
  -- raises 'already_reversed'. Closes the double-reversal P0.
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

-- ── FIX 2 (P1, LIVE on prod): LIKE-wildcard rule poisoning ─────────────────────
-- categorization_rules.match_value is learned from the transaction memo and matched
-- with `lower(p_description) like '%' || match_value || '%'`. The stored value is
-- interpolated UN-ESCAPED, so a memo containing a LIKE metacharacter (%, _, \)
-- becomes a wildcard pattern. Verified live: approving a memo "a%z" learns the rule
-- `a%z`, which then matches the unrelated "alcatraz tickets" and re-categorizes it
-- to the wrong account at 100% ("learned rule") confidence — a silent, confident
-- mis-categorization of every txn the pattern happens to span. (Org-scoped, so not
-- cross-tenant, but it corrupts the books a CPA is trusting Penny to keep.)
--
-- Fix: escape %, _, and \ in the stored value at match time and use an explicit
-- ESCAPE, so a learned value always matches LITERALLY. Neutralizes already-poisoned
-- rules too (no data backfill needed). Exact-match path is unaffected (uses '=').
create or replace function match_categorization_rule(p_org uuid, p_description text)
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from categorization_rules
   where org_id = p_org and is_active and p_description is not null
     and ( (match_type = 'description_exact'
              and lower(trim(p_description)) = match_value)
        or (match_type = 'description_contains'
              and lower(p_description) like
                  '%' || replace(replace(replace(match_value, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                  escape '\') )
   order by (match_type = 'description_exact') desc, times_applied desc, created_at asc
   limit 1;
$$;

-- grants unchanged (signatures identical); re-assert for safety.
revoke all on function reverse_journal_entry(uuid, uuid, uuid, text, date, text) from public;
revoke all on function match_categorization_rule(uuid, text)                     from public;
grant execute on function reverse_journal_entry(uuid, uuid, uuid, text, date, text) to service_role;
grant execute on function match_categorization_rule(uuid, text)                    to service_role;
