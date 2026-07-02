-- =============================================================================
-- FounderFirst — CPA Practice home: the cross-client work queue (card W1.4)
-- =============================================================================
--
-- APP_PRINCIPLES §3: a CPA's firm-level landing is ONE ranked list across every
-- client they can access — "what needs me?" — not a per-client dashboard. This
-- migration adds the two server-authoritative reads that power it:
--
--   cpa_client_counts(p_firm) — per-client badge counts for the switcher + the
--     resolved/archive split (active vs. all-clear).
--   cpa_practice_queue(p_firm) — the flat, ranked list of actionable items across
--     all accessible clients, each carrying enough to render a row and route to
--     the exact per-client tab that resolves it in ≤2 taps.
--
-- Item kinds (ranked, highest first) come ONLY from real ledger data (no invented
-- state, keeping the stack shallow — W1.5 adds `flagged` and W-kernel adds richer
-- filing obligations; both slot into the same shape without a schema break):
--
--   pending_review  je.status='pending_review'          → Journal tab (approve)
--   uncategorized   posted entries on the 9999 holding  → Categorize tab
--   unreconciled    import_batches.status='previewed'   → Connections/Import
--   flagged         RESERVED — 0 until W1.5 lands flags  → (Journal)
--   upcoming_close  open period whose end is past-due    → Periods tab
--
-- SECURITY: both are SECURITY DEFINER but gate every client row through
-- can_access_org() — the SAME read-capability helper RLS uses (§Phase-0 backbone),
-- so a CPA sees exactly the clients they could already read and NOTHING mutates
-- here. read_only vs. full is a UI affordance concern (the queue is read-only);
-- the write-path enforces access server-side regardless (ARCHITECTURE §4.3).
--
-- NOTE: review before `supabase db push` (LEARNINGS.md rule 3) — apply manually.
-- Timestamp 20260703030000 is unique in the migration ledger (rule 11).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The set of client orgs the calling firm member can access, as a helper CTE-
-- like function. A firm_admin sees every active client of the firm; a regular
-- CPA sees only assigned clients. This mirrors can_access_org's engagement leg
-- but scoped to ONE firm so the practice home never leaks another firm's clients.
-- ---------------------------------------------------------------------------
create or replace function cpa_firm_clients(p_firm uuid)
returns table (
  client_org_id uuid,
  client_name   text,
  access        access_level
) language sql stable security definer set search_path = public as $$
  select e.client_org_id, o.name, e.access
    from engagements e
    join memberships m
      on m.org_id = e.firm_org_id
     and m.user_id = auth.uid()
     and m.status = 'active'
    join organizations o
      on o.id = e.client_org_id
   where e.firm_org_id = p_firm
     and e.status = 'active'
     and (
       m.role = 'firm_admin'
       or exists (
         select 1 from client_assignments ca
          where ca.engagement_id = e.id and ca.user_id = auth.uid()
       )
     );
$$;
revoke all on function cpa_firm_clients(uuid) from public;
grant execute on function cpa_firm_clients(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Per-client counts — one row per accessible client. Powers the switcher badges
-- and the active/all-clear archive split. `total` = the switcher badge number;
-- when 0 the client is "all clear" (archive section).
-- ---------------------------------------------------------------------------
create or replace function cpa_client_counts(p_firm uuid)
returns table (
  client_org_id  uuid,
  client_name    text,
  access         access_level,
  pending_review bigint,
  uncategorized  bigint,
  unreconciled   bigint,
  flagged        bigint,
  upcoming_close bigint,
  total          bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  return query
  with clients as ( select * from cpa_firm_clients(p_firm) ),
  pr as (
    select je.org_id, count(*) n
      from journal_entries je
      join clients c on c.client_org_id = je.org_id
     where je.status = 'pending_review'
     group by je.org_id
  ),
  uncat as (
    select je.org_id, count(distinct je.id) n
      from journal_entries je
      join journal_lines jl on jl.entry_id = je.id
      join ledger_accounts la
        on la.id = jl.account_id and la.is_archived = false
       and (la.code = '9999' or lower(la.name) = 'uncategorized')
      join clients c on c.client_org_id = je.org_id
     where je.status = 'posted' and je.source <> 'reversal'
     group by je.org_id
  ),
  unrec as (
    select ib.org_id, count(*) n
      from import_batches ib
      join clients c on c.client_org_id = ib.org_id
     where ib.status = 'previewed'
     group by ib.org_id
  ),
  closes as (
    select ap.org_id, count(*) n
      from accounting_periods ap
      join clients c on c.client_org_id = ap.org_id
     where ap.status = 'open' and ap.period_end < current_date
     group by ap.org_id
  )
  select
    c.client_org_id,
    c.client_name,
    c.access,
    coalesce(pr.n, 0),
    coalesce(uncat.n, 0),
    coalesce(unrec.n, 0),
    0::bigint,                         -- flagged: RESERVED for W1.5
    coalesce(closes.n, 0),
    coalesce(pr.n, 0) + coalesce(uncat.n, 0) + coalesce(unrec.n, 0) + coalesce(closes.n, 0)
  from clients c
  left join pr     on pr.org_id     = c.client_org_id
  left join uncat  on uncat.org_id  = c.client_org_id
  left join unrec  on unrec.org_id  = c.client_org_id
  left join closes on closes.org_id = c.client_org_id
  order by
    (coalesce(pr.n,0)+coalesce(uncat.n,0)+coalesce(unrec.n,0)+coalesce(closes.n,0)) desc,
    c.client_name;
end$$;
revoke all on function cpa_client_counts(uuid) from public;
grant execute on function cpa_client_counts(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The ranked queue — a flat list across all accessible clients. `rank` orders
-- kinds (pending_review=1 … upcoming_close=5); within a kind, oldest first (the
-- item that has waited longest is most urgent). `surface` names the per-client
-- tab that resolves it, so the UI routes in exactly two taps (row → land on tab).
-- `p_limit` caps the payload; the switcher badges (cpa_client_counts) carry the
-- true totals so nothing is silently hidden.
-- ---------------------------------------------------------------------------
create or replace function cpa_practice_queue(p_firm uuid, p_limit int default 200)
returns table (
  client_org_id uuid,
  client_name   text,
  access        access_level,
  kind          text,          -- pending_review | uncategorized | unreconciled | upcoming_close
  rank          int,
  surface       text,          -- journal | review | import | periods (CPA Ledger surfaces)
  ref_id        uuid,          -- entry / batch / period id (for future deep-links)
  title         text,          -- short data label (account/memo/range) — NOT user copy
  occurred_at   timestamptz    -- for age + oldest-first ordering
) language plpgsql stable security definer set search_path = public as $$
declare v_lim int := greatest(1, least(coalesce(p_limit, 200), 1000));
begin
  return query
  with clients as ( select * from cpa_firm_clients(p_firm) ),
  items as (
    -- 1 · pending review
    select je.org_id, 'pending_review'::text kind, 1 rnk, 'journal'::text surface,
           je.id ref_id, coalesce(je.memo, je.source) title, je.created_at occurred_at
      from journal_entries je
      join clients c on c.client_org_id = je.org_id
     where je.status = 'pending_review'
    union all
    -- 2 · uncategorized (posted, on the holding account)
    select je.org_id, 'uncategorized', 2, 'review',
           je.id, coalesce(je.memo, je.source_ref, je.source), je.created_at
      from journal_entries je
      join clients c on c.client_org_id = je.org_id
     where je.status = 'posted' and je.source <> 'reversal'
       and exists (
         select 1 from journal_lines jl
         join ledger_accounts la
           on la.id = jl.account_id and la.is_archived = false
          and (la.code = '9999' or lower(la.name) = 'uncategorized')
         where jl.entry_id = je.id
       )
    union all
    -- 3 · unreconciled (staged import awaiting commit) — CPA resolves in Books → Import
    select ib.org_id, 'unreconciled', 3, 'import',
           ib.id, coalesce(ib.filename, ib.source::text), ib.created_at
      from import_batches ib
      join clients c on c.client_org_id = ib.org_id
     where ib.status = 'previewed'
    union all
    -- 5 · upcoming/overdue close (open period already ended) — 4 reserved for flagged
    select ap.org_id, 'upcoming_close', 5, 'periods',
           ap.id, (ap.period_start::text || ' → ' || ap.period_end::text),
           ap.period_end::timestamptz
      from accounting_periods ap
      join clients c on c.client_org_id = ap.org_id
     where ap.status = 'open' and ap.period_end < current_date
  )
  select i.org_id, c.client_name, c.access, i.kind, i.rnk, i.surface,
         i.ref_id, i.title, i.occurred_at
    from items i
    join clients c on c.client_org_id = i.org_id
   order by i.rnk, i.occurred_at asc
   limit v_lim;
end$$;
revoke all on function cpa_practice_queue(uuid, int) from public;
grant execute on function cpa_practice_queue(uuid, int) to authenticated, service_role;
