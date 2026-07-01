-- [stress:categorize] — categorization fixes from an adversarial stress-test
-- against prod (ref ejqsfzggyfsjzrcevlnq). WRITE-ONLY: integrator reviews + sequences.
--
-- SCOPE NOTE (prod moved while testing): the reverse_journal_entry concurrency P0
-- this stress test first surfaced (a double-click double-reversal that silently
-- over-counts an account) is now ALREADY LIVE on prod with a richer variant (a
-- partial unique index) owned by the parallel reverse-fix PR (#139). To avoid
-- shipping a divergent/weaker definition, the reverse fix is intentionally NOT
-- redefined here — it is deduped by the integrator against #139, and the single-
-- session reverse guard is still regression-tested in phase4_categorize_stress_test.
-- This migration keeps the two pieces unique to this PR and not yet in main:
--   FIX A — match_categorization_rule LIKE-escape (rule-poisoning).
--   FIX B — approve_journal_entry lock (defense-in-depth).
--
-- ── FIX A (P1): LIKE-wildcard rule poisoning ──────────────────────────────────
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

-- ── FIX B (defense-in-depth): approve_journal_entry — same unlocked pattern ────
-- approve_journal_entry reads the entry with a plain SELECT and its `UPDATE … SET
-- status='posted'` carries no status precondition — the SAME anti-pattern as F1.
-- Unlike reverse (which INSERTs a reversal row before any lock, so concurrent
-- reverses double), approve's only mutation IS the UPDATE, whose implicit row lock
-- serializes concurrent approves — so in practice the loser re-reads 'posted' and
-- raises not_pending. Verified live: 0 double-wins across 64 concurrent pairs.
-- So this is LATENT, not a reproduced break. But it becomes a real money bug the
-- instant approve gains a side-effect (post deferred lines, fire a webhook, etc.),
-- and the lost-update on approved_by is an audit-integrity wrinkle today. Hardened
-- so the guard is authoritative (loser deterministically gets not_pending), at
-- zero cost. Mirrors the F1 reasoning one function over in the same file.
create or replace function approve_journal_entry(p_actor uuid, p_org uuid, p_entry_id uuid)
returns journal_entries language plpgsql security definer set search_path = public as $$
declare v_e journal_entries;
begin
  if not has_membership_as(p_actor, p_org) then
    raise exception 'forbidden: only a business member may approve' using errcode = 'insufficient_privilege';
  end if;
  -- LOCK the entry so concurrent approves serialize on the snapshot, not just on
  -- the UPDATE's row lock; the loser blocks, re-reads 'posted', raises not_pending.
  select * into v_e from journal_entries where id = p_entry_id and org_id = p_org for update;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_e.status <> 'pending_review' then
    raise exception 'not_pending: entry is not awaiting approval' using errcode = 'restrict_violation';
  end if;
  -- status precondition on the UPDATE itself (belt + suspenders with the lock)
  update journal_entries set status = 'posted', approved_by = p_actor
   where id = p_entry_id and status = 'pending_review'
  returning * into v_e;
  if not found then raise exception 'not_pending: entry is not awaiting approval' using errcode = 'restrict_violation'; end if;
  return v_e;
end$$;

-- grants unchanged (signatures identical); re-assert for safety.
revoke all on function match_categorization_rule(uuid, text)                     from public;
revoke all on function approve_journal_entry(uuid, uuid, uuid)                   from public;
grant execute on function match_categorization_rule(uuid, text)                    to service_role;
grant execute on function approve_journal_entry(uuid, uuid, uuid)                  to service_role;
