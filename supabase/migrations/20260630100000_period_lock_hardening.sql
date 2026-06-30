-- Period-lock HARDENING — fixes from the [stress:periods] adversarial audit
-- (ARCHITECTURE.md §6.1, §6.2). Three confirmed period-integrity breaks, all in
-- the SECURITY DEFINER write-path. This migration only `create or replace`s
-- ensure_open_period / approve_journal_entry / reverse_journal_entry — it does NOT
-- touch close/reopen_accounting_period or ledger_audit (those belong to the
-- separately-landing audit-trail migration 20260630080000_ledger_audit.sql, which
-- is live on prod but not yet on main — see the PR for that drift flag).
--
--   F1 (P0) close-vs-post race: post_journal_entry runs on ONE read-committed
--       snapshot and ensure_open_period read the covering period status WITHOUT a
--       row lock, then inserted without re-checking. A close() committing during a
--       concurrent post was invisible to the post, so the entry landed in a
--       now-CLOSED period. Fix: lock the period row FOR SHARE on the read — a
--       concurrent close (which UPDATEs the row) is now mutually exclusive, and
--       the FOR SHARE re-reads the latest committed row so a close that won the
--       race is seen as 'closed' and the post is rejected.
--   F2 (P1) approval back-door: approve_journal_entry had no period check, so an
--       owner could close a period that still held a pending_review entry and then
--       approve it — mutating closed books (pending_review → posted). Fix: refuse
--       to approve an entry whose period is closed.
--   F3 (P1) reverse-after-close bricked: reverse defaulted the correction date to
--       current_date and the UI never passes a date, so once the CURRENT month was
--       closed EVERY reversal failed (the default fell in the closed period),
--       contradicting the documented "the correction lands in an open period"
--       invariant. Fix: on the default path, roll the reversal forward to the
--       first open month so a reversal is never impossible. An explicit caller
--       date is still honored as-is.

-- ── F1: ensure_open_period — lock the period row against a concurrent close ──
create or replace function ensure_open_period(p_org uuid, p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_period_id uuid;
  v_status    period_status;
  v_start     date := date_trunc('month', p_date)::date;
  v_end       date := (date_trunc('month', p_date) + interval '1 month - 1 day')::date;
begin
  -- FOR SHARE: take a shared row lock on the covering period. close_accounting_period
  -- UPDATEs status (a FOR NO KEY UPDATE lock) which conflicts with FOR SHARE, so a
  -- close and an in-flight post are mutually exclusive on this row. If the close
  -- commits first, FOR SHARE follows the row to its latest version (EvalPlanQual)
  -- and we read status='closed' → reject. Concurrent posts into the SAME open
  -- period still proceed in parallel (shared locks don't conflict with each other).
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
    do update set status = accounting_periods.status   -- no-op; just returns the row on a concurrent create
  returning id into v_period_id;
  return v_period_id;
end$$;

-- ── F2: approve_journal_entry — never finalize into a closed period ──────────
create or replace function approve_journal_entry(p_actor uuid, p_org uuid, p_entry_id uuid)
returns journal_entries language plpgsql security definer set search_path = public as $$
declare v_e journal_entries; v_pstatus period_status;
begin
  if not has_membership_as(p_actor, p_org) then
    raise exception 'forbidden: only a business member may approve' using errcode = 'insufficient_privilege';
  end if;
  select * into v_e from journal_entries where id = p_entry_id and org_id = p_org;
  if not found then raise exception 'not_found: entry % not in org %', p_entry_id, p_org using errcode = 'no_data_found'; end if;
  if v_e.status <> 'pending_review' then
    raise exception 'not_pending: entry is not awaiting approval' using errcode = 'restrict_violation';
  end if;
  -- Approving flips pending_review → posted, which changes the trial balance of the
  -- entry's period. If that period is closed, the approval would mutate locked
  -- books — refuse. Lock the period row FOR SHARE to stay consistent with a
  -- concurrent close. The 'period_closed' message keeps the edge fn's 409 mapping.
  select status into v_pstatus from accounting_periods where id = v_e.period_id for share;
  if v_pstatus = 'closed' then
    raise exception 'period_closed: entry % is in a closed period and cannot be approved', p_entry_id
      using errcode = 'restrict_violation';
  end if;
  update journal_entries set status = 'posted', approved_by = p_actor where id = p_entry_id
  returning * into v_e;
  return v_e;
end$$;

-- ── F3: reverse_journal_entry — default reversal always lands in an open period ─
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
  v_probe    date;
  v_pstatus  period_status;
  v_pid      uuid;
  v_guard    int := 0;
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

  if p_entry_date is not null then
    -- Caller chose the correction date; honor it (ensure_open_period rejects a
    -- closed one).
    v_date := p_entry_date;
  else
    -- Default path: a reversal must never be impossible. Start at today and roll
    -- forward by whole months until we reach a month whose period is OPEN or does
    -- not exist yet (it will be auto-created open). This keeps the documented
    -- invariant "the correction lands in an open period" true even when the CPA
    -- has just closed the current month.
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

  update journal_entries set status = 'reversed' where id = v_orig.id;  -- status-only change (guard trigger permits)

  return v_new;
exception
  when unique_violation then
    select * into v_existing from journal_entries where org_id = p_org and idempotency_key = p_idempotency_key;
    return v_existing;
end$$;

-- grants unchanged (signatures identical); the create-or-replace preserves the
-- service_role EXECUTE grants from 20260629125000_phase2_ledger_writepath.sql.
