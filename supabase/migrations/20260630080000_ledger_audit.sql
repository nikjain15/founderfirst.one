-- #14 — a queryable audit trail for ledger money mutations (CPA trust / disputes).
--
-- journal_entries.posted_by/approved_by + the period closed_by give only a partial
-- trail, and reopen_accounting_period NULLs closed_by/closed_at — erasing the only
-- evidence a close→reopen ever happened. This adds a tenant-scoped ledger_audit
-- (distinct from admin_audit, which is platform-staff scoped) that records every
-- posted entry (via trigger) and every period close/reopen (in the functions,
-- which hold the actor). Read-only to org members via RLS; written only server-side.

create table if not exists public.ledger_audit (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  actor       uuid references auth.users(id),
  action      text not null,         -- entry.post | entry.reverse | entry.recategorize | period.close | period.reopen
  target_type text,                  -- 'entry' | 'period'
  target_id   uuid,
  detail      jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);
create index if not exists ledger_audit_org_at on public.ledger_audit (org_id, at desc);

alter table public.ledger_audit enable row level security;
drop policy if exists ledger_audit_select on public.ledger_audit;
create policy ledger_audit_select  on public.ledger_audit for select using (can_access_org(org_id));
drop policy if exists ledger_audit_nowrite on public.ledger_audit;
create policy ledger_audit_nowrite on public.ledger_audit for all using (false) with check (false);
grant select on public.ledger_audit to authenticated;
grant select, insert on public.ledger_audit to service_role;

-- Every posted journal entry is logged automatically (actor = posted_by). Covers
-- manual posts, reversals, and recategorize repost — all of which insert a row.
create or replace function public.ledger_audit_on_entry() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
  values (
    new.org_id, new.posted_by,
    case new.source
      when 'reversal'     then 'entry.reverse'
      when 'recategorize' then 'entry.recategorize'
      else 'entry.post'
    end,
    'entry', new.id,
    jsonb_build_object('status', new.status, 'source', new.source,
                       'reverses_id', new.reverses_id, 'idempotency_key', new.idempotency_key)
  );
  return new;
end $$;
drop trigger if exists journal_entries_audit on public.journal_entries;
create trigger journal_entries_audit
  after insert on public.journal_entries
  for each row execute function public.ledger_audit_on_entry();

-- Period close/reopen carry the actor; log both. Reopen captures who/when it was
-- closed BEFORE the update erases that, so the trail survives.
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
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'period.close', 'period', p_period_id,
            jsonb_build_object('period_start', v_p.period_start, 'period_end', v_p.period_end));
  return v_p;
end$$;

create or replace function reopen_accounting_period(p_actor uuid, p_org uuid, p_period_id uuid)
returns accounting_periods language plpgsql security definer set search_path = public as $$
declare v_p accounting_periods; v_prev_by uuid; v_prev_at timestamptz;
begin
  if not can_write_org_as(p_actor, p_org) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  select closed_by, closed_at into v_prev_by, v_prev_at
    from accounting_periods where id = p_period_id and org_id = p_org;
  update accounting_periods set status = 'open', closed_by = null, closed_at = null
   where id = p_period_id and org_id = p_org
  returning * into v_p;
  if not found then raise exception 'not_found: period % not in org %', p_period_id, p_org using errcode = 'no_data_found'; end if;
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_org, p_actor, 'period.reopen', 'period', p_period_id,
            jsonb_build_object('was_closed_by', v_prev_by, 'was_closed_at', v_prev_at));
  return v_p;
end$$;

revoke all on function close_accounting_period(uuid, uuid, uuid)  from public;
revoke all on function reopen_accounting_period(uuid, uuid, uuid) from public;
grant execute on function close_accounting_period(uuid, uuid, uuid)  to service_role;
grant execute on function reopen_accounting_period(uuid, uuid, uuid) to service_role;
