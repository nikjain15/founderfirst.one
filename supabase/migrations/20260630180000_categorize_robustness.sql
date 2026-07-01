-- FIX 1 — categorization-loop robustness (adversarial-test findings).
-- Idempotent CREATE OR REPLACE; no schema/table changes. Safe to re-apply.
--
--   P0  concurrent approve double-/triple-reversed a txn  → row-lock the original (FOR UPDATE)
--   P2  approve replay returned 400 not_posted            → short-circuit to the prior repost
--   P1  closed-period entry could never be categorized    → correct into the current open period
--   P1  CPA-approval split (reverse live / repost pending)→ post the correction atomically
--   P2  no audit trail for categorization                 → write a ledger_audit row
--   P1  learned rule never generalized (keyed on full memo)→ learn on a normalized merchant key

-- ── merchant_key — a conservative payee key for rule learning ────────────────
-- Bank memos carry per-txn noise (store#, city, auth/ref codes). We learn on the
-- leading brand tokens up to the first token that contains a digit or '*'
-- ("AMZN MKTP US*A1B2C SEATTLE WA" → "amzn mktp us"). If the resulting key is too
-- short to be safe (< 4 chars), we fall back to the FULL memo so we never
-- over-match distinct merchants — weak-but-correct beats broad-but-wrong.
create or replace function merchant_key(p_memo text)
returns text language sql immutable set search_path = public as $$
  with norm as (select lower(trim(coalesce(p_memo, ''))) as m),
       toks as (
         select string_agg(t, ' ') filter (where ok) as key
         from (
           select t,
                  bool_and(t !~ '[0-9*]') over (order by ord) and t <> '' as ok
           from norm, regexp_split_to_table(norm.m, '\s+') with ordinality as x(t, ord)
         ) s
       )
  select case
           when key is null or length(key) < 4 then nullif((select m from norm), '')
           else key
         end
  from toks;
$$;
revoke all on function merchant_key(text) from public;
grant execute on function merchant_key(text) to service_role;

-- ── recategorize_entry — the approve write-path, hardened ────────────────────
create or replace function recategorize_entry(
  p_actor uuid, p_org uuid, p_entry_id uuid,
  p_from_account_id uuid, p_to_account_id uuid, p_idempotency_key text,
  p_learn boolean default false, p_learn_value text default null,
  p_learn_type cat_match_type default 'description_contains'
) returns journal_entries
language plpgsql security definer set search_path = public as $$
declare
  v_orig        journal_entries;
  v_new         journal_entries;
  v_existing    journal_entries;
  v_lines       jsonb;
  v_swapped     int;
  v_orig_closed boolean;
  v_corr_date   date;
  v_key         text;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from ledger_accounts where id = p_to_account_id and org_id = p_org and is_archived = false) then
    raise exception 'bad_account: target account not in org (or archived)' using errcode = 'foreign_key_violation';
  end if;

  -- IDEMPOTENT REPLAY: a re-fired approve returns the prior repost instead of 400.
  select * into v_existing from journal_entries
   where org_id = p_org and idempotency_key = p_idempotency_key || ':new';
  if found then return v_existing; end if;

  -- LOCK the original: concurrent approves now serialize → exactly one wins
  -- (the loser sees 'reversed' below). Closes the double-reverse/repost P0.
  select * into v_orig from journal_entries where id = p_entry_id and org_id = p_org for update;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_orig.status <> 'posted' then raise exception 'not_posted: only a posted entry can be recategorized' using errcode = 'restrict_violation'; end if;

  select jsonb_agg(jsonb_build_object(
           'account_id', case when account_id = p_from_account_id then p_to_account_id else account_id end,
           'amount_minor', amount_minor, 'side', side, 'currency', currency, 'memo', memo)),
         count(*) filter (where account_id = p_from_account_id)
    into v_lines, v_swapped
    from journal_lines where entry_id = v_orig.id;
  if coalesce(v_swapped, 0) = 0 then
    raise exception 'no_match: entry has no line on the from-account' using errcode = 'invalid_parameter_value';
  end if;

  -- CORRECTION DATE: keep the original date if its period is open; if the period is
  -- CLOSED, post the correction into today's (open) period so a categorization is
  -- never permanently blocked by a CPA close. The closed period itself is untouched
  -- except for the original flipping to 'reversed' (a status-only, guard-permitted change).
  select (status = 'closed') into v_orig_closed from accounting_periods where id = v_orig.period_id;
  v_corr_date := case when coalesce(v_orig_closed, false) then current_date else v_orig.entry_date end;

  perform reverse_journal_entry(p_actor, p_org, v_orig.id, p_idempotency_key || ':rev', v_corr_date,
                                'Recategorized: ' || coalesce(v_orig.memo, v_orig.id::text));
  v_new := post_journal_entry(p_actor, p_org, v_corr_date, p_idempotency_key || ':new',
                              v_lines, 'recategorize', v_orig.id::text, v_orig.memo);

  -- A recategorization CORRECTS already-accepted money (it doesn't introduce new
  -- spend), so post both legs live even when cpa_posts_require_approval is on —
  -- otherwise the reverse posts while the repost is held pending and the txn
  -- vanishes from both the books and the queue. The approval gate still governs
  -- brand-new CPA postings via post_journal_entry.
  if v_new.status = 'pending_review' then
    update journal_entries set status = 'posted' where id = v_new.id returning * into v_new;
  end if;

  if p_learn then
    v_key := merchant_key(coalesce(p_learn_value, v_orig.memo, ''));
    if v_key is not null and length(v_key) > 0 then
      perform learn_categorization_rule(p_actor, p_org, p_learn_type, v_key, p_to_account_id, 'human');
      update categorization_rules set times_applied = times_applied + 1, updated_at = now()
       where org_id = p_org and account_id = p_to_account_id and match_value = lower(trim(v_key));
    end if;
  end if;

  insert into ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'entry.recategorize', 'journal_entry', v_orig.id,
            jsonb_build_object('from_account_id', p_from_account_id, 'to_account_id', p_to_account_id,
                               'repost_id', v_new.id, 'correction_date', v_corr_date,
                               'into_open_period', coalesce(v_orig_closed, false)));
  return v_new;
end$$;

revoke all on function recategorize_entry(uuid, uuid, uuid, uuid, uuid, text, boolean, text, cat_match_type) from public;
grant execute on function recategorize_entry(uuid, uuid, uuid, uuid, uuid, text, boolean, text, cat_match_type) to service_role;
-- FIX 3 — categorization matcher: most-specific match wins + LIKE-wildcard safety.
-- (a) Multi-product vendors (Google Workspace vs Google Ads) collided: the shorter
--     brand rule "google" hijacked "google ads". Order by length(match_value) desc so
--     the MOST SPECIFIC learned rule wins.
-- (b) Restore the ESCAPE clause (the live function had lost it): a memo of "%"/"_"
--     must not act as a LIKE wildcard matching every future transaction.
create or replace function match_categorization_rule(p_org uuid, p_description text)
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from categorization_rules
   where org_id = p_org and is_active and p_description is not null
     and ( (match_type = 'description_exact'    and lower(trim(p_description)) = match_value)
        or (match_type = 'description_contains' and lower(p_description) like
              '%' || replace(replace(replace(match_value, '\', '\\'), '%', '\%'), '_', '\_') || '%'
              escape '\') )
   order by (match_type = 'description_exact') desc, length(match_value) desc, times_applied desc, created_at asc
   limit 1;
$$;
revoke all on function match_categorization_rule(uuid, text) from public;
grant execute on function match_categorization_rule(uuid, text) to service_role;

