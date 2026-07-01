-- Reconcile: capture the prod-deployed period/journal lock hardening onto main,
-- and restore the approve-into-closed-period guard that a combined deploy dropped.
--
-- Context (integrator, 2 Jul 2026 — closes PR #131 + PR #139):
--   Two parallel stress sessions fixed overlapping functions and deployed to prod
--   in a combined wave; main never got the migrations (timestamp collisions), and
--   the last deploy of approve_journal_entry (the #132/#139 FOR UPDATE lineage)
--   clobbered #131's period-closed check. State before this migration:
--
--   fn                      main                          prod (live)
--   ensure_open_period      no lock                       FOR SHARE  (F1 P0 fix)
--   reverse_journal_entry   no lock, current_date only    FOR UPDATE + roll-forward (P0 + F3)
--   approve_journal_entry   FOR UPDATE, no period check   FOR UPDATE, no period check  ← F2 REGRESSED
--
--   ensure_open_period and reverse_journal_entry below are byte-faithful captures
--   of the live prod bodies (pg_get_functiondef, 2 Jul 2026) — applying them to
--   prod is a no-op. approve_journal_entry is the MERGE of both lineages
--   (entry FOR UPDATE + period-closed refusal) and must be deployed to prod;
--   it fixes the live F2 regression (approval as a back-door into closed books).
--
--   Lock order is entry → period everywhere (approve, reverse, post), so the
--   added period FOR SHARE introduces no deadlock cycle.
--
--   Companion index migration: 20260702000100_reverse_unique_index.sql.

-- ── F1 (P0, #131): close-vs-post TOCTOU — lock the covering period row.
-- A concurrent close() UPDATE conflicts with FOR SHARE, so close and an
-- in-flight post serialize; parallel posts into an open period still run
-- concurrently (shared locks don't conflict).
CREATE OR REPLACE FUNCTION public.ensure_open_period(p_org uuid, p_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  limit 1
  for share;

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
    do update set status = accounting_periods.status
  returning id into v_period_id;
  return v_period_id;
end$function$;

-- ── P0 (#139) + F3 (#131), combined as deployed: reversals serialize on the
-- original (FOR UPDATE — the loser re-reads 'reversed' and raises), and the
-- default reversal date rolls forward to the first open month so closing the
-- current month never bricks reversals. Explicit caller dates are honored as-is.
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_actor uuid, p_org uuid, p_entry_id uuid, p_idempotency_key text, p_entry_date date DEFAULT NULL::date, p_memo text DEFAULT NULL::text)
 RETURNS journal_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_orig     journal_entries;
  v_new      journal_entries;
  v_existing journal_entries;
  v_period   uuid;
  v_date     date;
  v_probe    date;
  v_pstatus  period_status;
  v_pid      uuid;
  v_guard    int := 0;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden: actor may not write org %', p_org using errcode = 'insufficient_privilege';
  end if;

  select * into v_existing from journal_entries where org_id = p_org and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  -- LOCK the original (sibling fix): concurrent reversals of the same entry
  -- serialize so exactly one wins; the loser re-reads 'reversed' and raises.
  select * into v_orig from journal_entries where id = p_entry_id and org_id = p_org for update;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_orig.status = 'reversed' then raise exception 'already_reversed' using errcode = 'restrict_violation'; end if;
  if v_orig.status <> 'posted'  then raise exception 'not_posted: only a posted entry can be reversed' using errcode = 'restrict_violation'; end if;

  if p_entry_date is not null then
    v_date := p_entry_date;                       -- caller chose the date; honored as-is
  else
    -- F3: roll forward from today to the first OPEN (or not-yet-existing) month so
    -- a reversal is never impossible after the current month is closed.
    v_probe := current_date;
    loop
      select id, status into v_pid, v_pstatus
      from accounting_periods
      where org_id = p_org and v_probe between period_start and period_end
      order by period_start desc
      limit 1;
      exit when v_pid is null or v_pstatus = 'open';
      v_probe := (date_trunc('month', v_probe) + interval '1 month')::date;
      v_guard := v_guard + 1;
      if v_guard > 120 then
        raise exception 'no_open_period: no open period within 10 years to post the reversal'
          using errcode = 'restrict_violation';
      end if;
    end loop;
    v_date := v_probe;
  end if;

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

  update journal_entries set status = 'reversed' where id = v_orig.id;

  return v_new;
exception
  when unique_violation then
    select * into v_existing from journal_entries where org_id = p_org and idempotency_key = p_idempotency_key;
    return v_existing;
end$function$;

-- ── MERGED approve: FOR UPDATE on the entry (#132/#139 concurrency lock) +
-- period-closed refusal (#131 F2). Approving flips pending_review → posted,
-- changing the period's trial balance — refuse if the period is closed, else
-- approval is a back-door into locked books. 'period_closed' keeps the edge
-- fn's existing 409 mapping.
CREATE OR REPLACE FUNCTION public.approve_journal_entry(p_actor uuid, p_org uuid, p_entry_id uuid)
 RETURNS journal_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_e journal_entries; v_pstatus period_status;
begin
  if not has_membership_as(p_actor, p_org) then
    raise exception 'forbidden: only a business member may approve' using errcode = 'insufficient_privilege';
  end if;
  select * into v_e from journal_entries where id = p_entry_id and org_id = p_org for update;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_e.status <> 'pending_review' then
    raise exception 'not_pending: entry is not awaiting approval' using errcode = 'restrict_violation';
  end if;
  select status into v_pstatus from accounting_periods where id = v_e.period_id for share;
  if v_pstatus = 'closed' then
    raise exception 'period_closed: entry % is in a closed period and cannot be approved', p_entry_id
      using errcode = 'restrict_violation';
  end if;
  update journal_entries set status = 'posted', approved_by = p_actor
   where id = p_entry_id and status = 'pending_review'
  returning * into v_e;
  if not found then raise exception 'not_pending: entry is not awaiting approval' using errcode = 'restrict_violation'; end if;
  return v_e;
end$function$;
