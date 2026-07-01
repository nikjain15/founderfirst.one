-- [reconcile:cattest] Captured from LIVE prod — repo/prod parity, NOT re-applied here.
-- Idempotent CREATE OR REPLACE reflecting the exact deployed state after the
-- categorization + import stress-test fixes. Control tower backfills schema_migrations.

CREATE OR REPLACE FUNCTION public.recategorize_entry(p_actor uuid, p_org uuid, p_entry_id uuid, p_from_account_id uuid, p_to_account_id uuid, p_idempotency_key text, p_learn boolean DEFAULT false, p_learn_value text DEFAULT NULL::text, p_learn_type cat_match_type DEFAULT 'description_contains'::cat_match_type)
 RETURNS journal_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end$function$;
revoke all on function recategorize_entry(uuid,uuid,uuid,uuid,uuid,text,boolean,text,cat_match_type) from public;
grant execute on function recategorize_entry(uuid,uuid,uuid,uuid,uuid,text,boolean,text,cat_match_type) to service_role;
