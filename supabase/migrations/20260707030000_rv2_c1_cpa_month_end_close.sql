-- =============================================================================
-- FounderFirst — CPA practice-OS depth: firm-level month-end close (card RV2-C1)
-- =============================================================================
--
-- Takes the CPA lens from "workqueue" (W1.4 practice queue) to a practice
-- OPERATING SYSTEM for month-end close, WITHOUT a new schema spine — it extends
-- the shipped CPA lens (engagements, accounting_periods, close_accounting_period,
-- the practice queue) with three server-authoritative reads/writes and one small
-- communication-rail table:
--
--   cpa_close_readiness(p_firm, p_period_end)  READ  — per-client month-end close
--     checklist: for each accessible client, the OPEN period covering p_period_end
--     (or the latest open) + the four blocker counts (uncategorized / unreconciled
--     / pending-review / open-flags) that a clean close requires be zero. A client
--     with all-zero blockers is "ready" (zero-touch); anything else is an
--     "exception". Ranking + access come ONLY from the RPC — never re-derived
--     client-side.
--
--   cpa_batch_close_periods(p_actor, p_firm, p_client_org_ids[], p_period_end)
--     WRITE — close the covering OPEN period for EACH selected client in ONE
--     round-trip. Per-client authz (can_write_org_as) AND a per-client
--     period-lock TOCTOU guard (SELECT ... FOR UPDATE on the period row before the
--     status flip, mirroring the #131/#139 lineage) so two firm members batch-
--     closing concurrently can never double-close or race a client's own close.
--     Returns a per-client result row (closed / skipped / forbidden / blocked /
--     not_found) — a partial batch never rolls back the clients that DID close,
--     and a blocked client (non-zero blockers) is refused, never silently closed.
--
--   cpa_request_docs(p_actor, p_firm, p_client_org_id, p_template, p_note)
--     WRITE — the client-communication rail: record a doc request / statement
--     chase against a client, audit-logged, so a CPA can drive missing statements
--     to zero from the practice home. Templates are CONFIG (doc_chase_templates),
--     not inline strings.
--
-- CENTRALIZATION (card gate): the close-blocker set + the SLA "overdue" threshold
--   live in platform_config.behavior (close_sla_days) — a magic number nowhere in
--   code. Doc-chase templates live in a live, toggle-able seed table
--   (doc_chase_templates) exactly like the Penny personas — editable with no
--   redeploy. No inline copy or thresholds in the app.
--
-- SECURITY (ISOTEST lineage — LEARNINGS: 22 forged-actor RPCs → service_role):
--   Every WRITE RPC is SECURITY DEFINER, takes p_actor FIRST, is EXECUTE-granted
--   ONLY to service_role (the edge fn passes the JWT-verified actor, never the
--   body), and re-checks authorization PER CLIENT in-function:
--     · close / doc-request require can_write_org_as(actor, client_org) — a
--       read_only engagement fails, so cannot close or chase; a firm member can
--       NEVER touch a client they are not assigned / not firm_admin for; and no
--       client outside THIS firm's engagements is reachable (cpa_firm_clients).
--   The READ (cpa_close_readiness) is SECURITY DEFINER gated by cpa_firm_clients
--   (the same engagement leg the queue uses) and EXECUTE-granted to authenticated
--   — RLS-equivalent, so a CPA sees exactly the clients they could already read.
--
-- CROSS-TENANT: cpa_firm_clients(p_firm) is the ONLY client set any of these
--   touch, and it is scoped to firm members of p_firm. A caller who is not an
--   active member of p_firm gets an empty client set (no rows), so the batch is a
--   no-op and the readiness list is empty — never another firm's clients.
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3) — apply MANUALLY.
-- Timestamp 20260707030000 is unique in the ledger and after the latest
-- (20260707020000). Prefer extending existing tables (rule: no new spine).
-- =============================================================================

-- ── actor-parameterized firm-client set (service_role write-path) ────────────
-- cpa_firm_clients(p_firm) resolves via auth.uid(), which is NULL under the
-- service role — so the batch-close / doc-request RPCs (called by service_role
-- with a JWT-verified p_actor) CANNOT use it, or every client would resolve to
-- forbidden in production. This _as variant takes the actor explicitly and is the
-- single source of truth; the auth.uid() version delegates to it (LEARNINGS #6).
create or replace function cpa_firm_clients_as(p_actor uuid, p_firm uuid)
returns table (
  client_org_id uuid,
  client_name   text,
  access        access_level
) language sql stable security definer set search_path = public as $$
  select e.client_org_id, o.name, e.access
    from engagements e
    join memberships m
      on m.org_id = e.firm_org_id
     and m.user_id = p_actor
     and m.status = 'active'
    join organizations o
      on o.id = e.client_org_id
   where e.firm_org_id = p_firm
     and e.status = 'active'
     and (
       m.role = 'firm_admin'
       or exists (
         select 1 from client_assignments ca
          where ca.engagement_id = e.id and ca.user_id = p_actor
       )
     );
$$;
revoke all on function cpa_firm_clients_as(uuid, uuid) from public;
grant execute on function cpa_firm_clients_as(uuid, uuid) to service_role;

-- Refactor the auth.uid() version to delegate — ONE source of truth. Signature
-- unchanged, so the existing authenticated grant + callers are preserved.
create or replace function cpa_firm_clients(p_firm uuid)
returns table (
  client_org_id uuid,
  client_name   text,
  access        access_level
) language sql stable security definer set search_path = public as $$
  select * from cpa_firm_clients_as(auth.uid(), p_firm);
$$;
revoke all on function cpa_firm_clients(uuid) from public;
grant execute on function cpa_firm_clients(uuid) to authenticated, service_role;

-- ── config: the close SLA threshold (a magic number, centralized) ────────────
-- close_sla_days = how many days after a period's end an unclosed period reads as
-- "overdue" for that firm's SLA / responsiveness tracking (Signal #3). Folded into
-- the singleton platform_config.behavior so it is admin-tunable with no redeploy;
-- the app's baked fallback (config.ts CONFIG_DEFAULTS.close_sla_days) MUST match.
update platform_config
   set behavior = behavior || jsonb_build_object('close_sla_days', 10)
 where id = true
   and not (behavior ? 'close_sla_days');

-- ── doc_chase_templates: the client-communication rail's copy, as live config ─
-- Like the Penny personas: a live, toggle-able row per template so a CPA's
-- doc-request wording is editable with no redeploy. `is_active` gates which
-- templates the practice home offers; `slug` is the stable id the app references.
create table if not exists public.doc_chase_templates (
  slug        text primary key,
  label       text not null,             -- the button/menu label
  body        text not null,             -- the request wording (the "ask")
  is_active   boolean not null default true,
  sort        int not null default 100,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
alter table public.doc_chase_templates enable row level security;
-- Readable by any authed user (it's non-sensitive firm-side copy, needed to
-- render the rail); writes go through admin tooling / seed only.
drop policy if exists doc_chase_templates_read on public.doc_chase_templates;
create policy doc_chase_templates_read on public.doc_chase_templates
  for select using (auth.role() = 'authenticated');
drop policy if exists doc_chase_templates_no_write on public.doc_chase_templates;
create policy doc_chase_templates_no_write on public.doc_chase_templates
  for all using (false) with check (false);

insert into public.doc_chase_templates (slug, label, body, sort) values
  ('bank_statement',  'Bank statement',
   'We are closing your books for the month and are missing a bank statement. Could you upload the latest one when you have a moment?', 10),
  ('missing_receipts', 'Missing receipts',
   'A few transactions still need a receipt before we can finish the month. Could you send those over?', 20),
  ('cc_statement',    'Credit-card statement',
   'To close the month we still need your credit-card statement. Could you share it when convenient?', 30),
  ('clarify_txn',     'Clarify a transaction',
   'We have a transaction we could not place. Could you let us know what it was for so we can categorize it correctly?', 40)
on conflict (slug) do nothing;

-- ── doc_requests: a recorded ask against a client (the rail's log) ────────────
-- Nothing here moves money; it is a communication/tracking record so a CPA can
-- drive missing statements to zero and see what has been chased. One OPEN request
-- per (client, template) so re-chasing is idempotent, not a duplicate.
create table if not exists public.doc_requests (
  id            uuid primary key default gen_random_uuid(),
  firm_org_id   uuid not null references organizations(id) on delete cascade,
  client_org_id uuid not null references organizations(id) on delete cascade,
  template_slug text not null references public.doc_chase_templates(slug),
  note          text,
  status        text not null default 'open',   -- open | resolved
  requested_by  uuid not null references auth.users(id),
  resolved_by   uuid references auth.users(id),
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists doc_requests_open_uidx
  on public.doc_requests (client_org_id, template_slug) where status = 'open';
create index if not exists doc_requests_firm_open_idx
  on public.doc_requests (firm_org_id) where status = 'open';
alter table public.doc_requests enable row level security;
-- Readable by anyone who can access the client org (owner sees what was asked,
-- CPA sees what they chased); all writes go through the RPCs below.
drop policy if exists doc_requests_read on public.doc_requests;
create policy doc_requests_read on public.doc_requests
  for select using (can_access_org(client_org_id));
drop policy if exists doc_requests_no_write on public.doc_requests;
create policy doc_requests_no_write on public.doc_requests
  for all using (false) with check (false);

-- ---------------------------------------------------------------------------
-- cpa_close_readiness — the per-client month-end close checklist.
--
-- For each accessible client of the firm, resolve the period to close for
-- p_period_end: the OPEN period whose range covers p_period_end, else the latest
-- OPEN period that has already ended (the natural next close). Then the four
-- blocker counts a clean close requires be zero. `ready` = all blockers zero AND
-- a closable period exists. `overdue` = the period ended more than close_sla_days
-- ago (SLA / Signal #3). No period to close → not in the list (nothing to do).
-- ---------------------------------------------------------------------------
create or replace function cpa_close_readiness(p_firm uuid, p_period_end date default current_date)
returns table (
  client_org_id  uuid,
  client_name    text,
  access         access_level,
  period_id      uuid,
  period_start   date,
  period_end     date,
  uncategorized  bigint,
  unreconciled   bigint,
  pending_review bigint,
  open_flags     bigint,
  blockers       bigint,
  ready          boolean,
  overdue        boolean,
  open_doc_requests bigint
) language plpgsql stable security definer set search_path = public as $$
declare v_sla int;
begin
  select coalesce((behavior->>'close_sla_days')::int, 10) into v_sla from platform_config where id = true;
  v_sla := coalesce(v_sla, 10);

  return query
  with clients as ( select * from cpa_firm_clients(p_firm) ),
  -- The one period each client should close for p_period_end (covering period,
  -- else latest already-ended open period). DISTINCT ON keeps exactly one.
  period as (
    select distinct on (ap.org_id)
           ap.org_id, ap.id, ap.period_start, ap.period_end
      from accounting_periods ap
      join clients c on c.client_org_id = ap.org_id
     where ap.status = 'open'
       and ap.period_start <= p_period_end
     order by ap.org_id,
              -- prefer the period that actually covers p_period_end, then the
              -- latest-ending one (the natural next close).
              (ap.period_end >= p_period_end) desc,
              ap.period_end desc
  ),
  uncat as (
    select je.org_id, count(distinct je.id) n
      from journal_entries je
      join period p on p.org_id = je.org_id
      join journal_lines jl on jl.entry_id = je.id
      join ledger_accounts la
        on la.id = jl.account_id and la.is_archived = false
       and (la.code = '9999' or lower(la.name) = 'uncategorized')
     where je.status = 'posted' and je.source <> 'reversal'
       and je.entry_date between p.period_start and p.period_end
     group by je.org_id
  ),
  unrec as (
    select ib.org_id, count(*) n
      from import_batches ib
      join period p on p.org_id = ib.org_id
     where ib.status = 'previewed'
     group by ib.org_id
  ),
  pend as (
    select je.org_id, count(*) n
      from journal_entries je
      join period p on p.org_id = je.org_id
     where je.status = 'pending_review'
       and je.entry_date between p.period_start and p.period_end
     group by je.org_id
  ),
  flags as (
    select ef.org_id, count(*) n
      from entry_flags ef
      join period p on p.org_id = ef.org_id
     where ef.status = 'open'
     group by ef.org_id
  ),
  docs as (
    select dr.client_org_id org_id, count(*) n
      from doc_requests dr
     where dr.firm_org_id = p_firm and dr.status = 'open'
     group by dr.client_org_id
  )
  select
    c.client_org_id, c.client_name, c.access,
    p.id, p.period_start, p.period_end,
    coalesce(uncat.n,0), coalesce(unrec.n,0), coalesce(pend.n,0), coalesce(flags.n,0),
    (coalesce(uncat.n,0)+coalesce(unrec.n,0)+coalesce(pend.n,0)+coalesce(flags.n,0)) as blockers,
    (coalesce(uncat.n,0)+coalesce(unrec.n,0)+coalesce(pend.n,0)+coalesce(flags.n,0)) = 0 as ready,
    (p.period_end < current_date - v_sla) as overdue,
    coalesce(docs.n,0)
  from clients c
  join period p on p.org_id = c.client_org_id     -- only clients WITH a period to close
  left join uncat on uncat.org_id = c.client_org_id
  left join unrec on unrec.org_id = c.client_org_id
  left join pend  on pend.org_id  = c.client_org_id
  left join flags on flags.org_id = c.client_org_id
  left join docs  on docs.org_id  = c.client_org_id
  order by
    -- exceptions first (most blockers), then overdue, then name
    (coalesce(uncat.n,0)+coalesce(unrec.n,0)+coalesce(pend.n,0)+coalesce(flags.n,0)) desc,
    (p.period_end < current_date - v_sla) desc,
    c.client_name;
end$$;
revoke all on function cpa_close_readiness(uuid, date) from public;
grant execute on function cpa_close_readiness(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cpa_batch_close_periods — close the covering open period for each selected
-- client, in ONE round-trip, with per-client authz + a per-client period-lock
-- TOCTOU guard. Returns one result row per requested client so the UI can show
-- exactly what closed and what was skipped/refused. NEVER rolls the whole batch
-- back for one bad client (a set-based month-end must be resilient); a client is
-- only closed when it is BOTH authorized AND has zero blockers.
--
-- p_force = close even with blockers (a firm_admin override for e.g. an
-- intentionally-empty client); default false = refuse a blocked client. Even
-- forced, a read_only / unauthorized client is NEVER closed.
-- ---------------------------------------------------------------------------
create or replace function cpa_batch_close_periods(
  p_actor uuid, p_firm uuid, p_client_org_ids uuid[], p_period_end date default current_date,
  p_force boolean default false
)
returns table (client_org_id uuid, period_id uuid, result text) language plpgsql
security definer set search_path = public as $$
declare
  v_client uuid;
  v_allowed uuid[];
  v_pid uuid; v_pstart date; v_pend date; v_status period_status;
  v_blockers bigint;
begin
  -- The caller must be an active member of THIS firm (else empty client set →
  -- every requested client resolves to 'forbidden'). cpa_firm_clients is the
  -- authoritative, engagement-scoped set; anything outside it is not touchable.
  select array_agg(cf.client_org_id) into v_allowed
    from cpa_firm_clients_as(p_actor, p_firm) cf
   where cf.access = 'full';   -- read_only engagements can never close

  foreach v_client in array coalesce(p_client_org_ids, '{}'::uuid[]) loop
    -- Per-client authz: must be in the firm's FULL-access client set AND pass the
    -- actor write check (defence in depth — the second catches an actor whose
    -- membership changed mid-request).
    if v_allowed is null or not (v_client = any(v_allowed))
       or not can_write_org_as(p_actor, v_client) then
      client_org_id := v_client; period_id := null; result := 'forbidden'; return next; continue;
    end if;

    -- Resolve the covering / next open period, LOCKING the row so a concurrent
    -- batch-close or the client's own close_accounting_period cannot race us
    -- (period-lock TOCTOU, #131/#139 lineage). If none, nothing to close.
    select ap.id, ap.period_start, ap.period_end, ap.status
      into v_pid, v_pstart, v_pend, v_status
      from accounting_periods ap
     where ap.org_id = v_client
       and ap.status = 'open'
       and ap.period_start <= p_period_end
     order by (ap.period_end >= p_period_end) desc, ap.period_end desc
     limit 1
     for update;

    if v_pid is null then
      client_org_id := v_client; period_id := null; result := 'not_found'; return next; continue;
    end if;
    -- Re-read under the lock: a racing close may have flipped it already.
    if v_status <> 'open' then
      client_org_id := v_client; period_id := v_pid; result := 'skipped'; return next; continue;
    end if;

    -- Blocker gate (unless forced): count the same four blockers as readiness,
    -- scoped to this period. Our FOR UPDATE on the period row is incompatible with
    -- the FOR SHARE that post_journal_entry / ensure_open_period take on it
    -- (20260702000000, #131 lineage), so a concurrent post into this period
    -- serialises against this close — it cannot slip a blocker in behind the count.
    if not p_force then
      select
        (select count(distinct je.id) from journal_entries je
           join journal_lines jl on jl.entry_id = je.id
           join ledger_accounts la on la.id = jl.account_id and la.is_archived = false
            and (la.code = '9999' or lower(la.name) = 'uncategorized')
          where je.org_id = v_client and je.status = 'posted' and je.source <> 'reversal'
            and je.entry_date between v_pstart and v_pend)
      + (select count(*) from import_batches ib where ib.org_id = v_client and ib.status = 'previewed')
      + (select count(*) from journal_entries je where je.org_id = v_client
            and je.status = 'pending_review' and je.entry_date between v_pstart and v_pend)
      + (select count(*) from entry_flags ef where ef.org_id = v_client and ef.status = 'open')
      into v_blockers;
      if coalesce(v_blockers,0) > 0 then
        client_org_id := v_client; period_id := v_pid; result := 'blocked'; return next; continue;
      end if;
    end if;

    -- Close it (same effect as close_accounting_period) + audit under the actor.
    update accounting_periods set status = 'closed', closed_by = p_actor, closed_at = now()
     where id = v_pid and org_id = v_client;
    insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
      values (v_client, p_actor, 'period.close', 'period', v_pid,
              jsonb_build_object('period_start', v_pstart, 'period_end', v_pend,
                                 'via', 'batch_close', 'firm', p_firm, 'forced', p_force));
    client_org_id := v_client; period_id := v_pid; result := 'closed'; return next;
  end loop;
  return;
end$$;
revoke all on function cpa_batch_close_periods(uuid, uuid, uuid[], date, boolean) from public;
grant execute on function cpa_batch_close_periods(uuid, uuid, uuid[], date, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- cpa_request_docs — the client-communication rail. Record a doc request /
-- statement chase against a client. Idempotent per (client, template) while open.
-- ---------------------------------------------------------------------------
create or replace function cpa_request_docs(
  p_actor uuid, p_firm uuid, p_client_org_id uuid, p_template text, p_note text default null
)
returns doc_requests language plpgsql security definer set search_path = public as $$
declare v_row doc_requests; v_ok boolean;
begin
  -- The client must be in this firm's client set AND the actor must have write
  -- capability (a read_only CPA may view books but not drive requests).
  if not exists (select 1 from cpa_firm_clients_as(p_actor, p_firm) cf where cf.client_org_id = p_client_org_id)
     or not can_write_org_as(p_actor, p_client_org_id) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from doc_chase_templates t where t.slug = p_template and t.is_active) then
    raise exception 'bad_template: %', p_template using errcode = 'check_violation';
  end if;

  insert into public.doc_requests (firm_org_id, client_org_id, template_slug, note, requested_by)
  values (p_firm, p_client_org_id, p_template, p_note, p_actor)
  on conflict (client_org_id, template_slug) where (status = 'open')
    do update set note = coalesce(excluded.note, doc_requests.note)
  returning * into v_row;

  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (p_client_org_id, p_actor, 'docs.request', 'doc_request', v_row.id,
            jsonb_build_object('template', p_template, 'firm', p_firm));
  return v_row;
end$$;
revoke all on function cpa_request_docs(uuid, uuid, uuid, text, text) from public;
grant execute on function cpa_request_docs(uuid, uuid, uuid, text, text) to service_role;

-- Resolve a doc request (either side that can write the client can mark it done).
create or replace function cpa_resolve_doc_request(p_actor uuid, p_request_id uuid)
returns doc_requests language plpgsql security definer set search_path = public as $$
declare v_row doc_requests;
begin
  select * into v_row from doc_requests where id = p_request_id for update;
  if not found then raise exception 'not_found' using errcode = 'no_data_found'; end if;
  if not can_write_org_as(p_actor, v_row.client_org_id) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update doc_requests set status = 'resolved', resolved_by = p_actor, resolved_at = now()
   where id = p_request_id and status = 'open'
  returning * into v_row;
  if not found then  -- already resolved; return current
    select * into v_row from doc_requests where id = p_request_id;
    return v_row;
  end if;
  insert into public.ledger_audit (org_id, actor, action, target_type, target_id, detail)
    values (v_row.client_org_id, p_actor, 'docs.resolve', 'doc_request', v_row.id, '{}'::jsonb);
  return v_row;
end$$;
revoke all on function cpa_resolve_doc_request(uuid, uuid) from public;
grant execute on function cpa_resolve_doc_request(uuid, uuid) to service_role;
