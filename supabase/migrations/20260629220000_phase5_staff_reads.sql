-- Phase 5b — staff lens read layer (ARCHITECTURE.md §4.2, §11).
--
-- A platform-staff member is NOT a tenant member, so RLS (membership/engagement)
-- returns them nothing from organizations/ledger_*. The staff lens reads through
-- these security-definer RPCs instead, each self-gated:
--   • staff_list_orgs        → is_platform_staff()      (directory; no tenant rows)
--   • staff_list_accounts    → staff_can_access_org()   (needs an OPEN break-glass)
--   • staff_list_entries     → staff_can_access_org()   (needs an OPEN break-glass)
--   • staff_list_break_glass → is_platform_staff()      (the caller's own windows)
-- Non-staff / no-window callers get empty results, never an error and never data.

-- platform-wide org directory (staff only). entry_count gives a "has books" hint.
create or replace function staff_list_orgs()
returns table (id uuid, name text, type text, created_at timestamptz, entry_count bigint)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.type::text, o.created_at,
         (select count(*) from journal_entries je where je.org_id = o.id)
    from organizations o
   where is_platform_staff()
   order by o.name;
$$;

-- the caller's break-glass windows (active first), for the console.
create or replace function staff_list_break_glass()
returns table (id uuid, org_id uuid, org_name text, reason text,
               opened_at timestamptz, expires_at timestamptz, closed_at timestamptz, active boolean)
language sql stable security definer set search_path = public as $$
  select g.id, g.org_id, o.name, g.reason, g.opened_at, g.expires_at, g.closed_at,
         (g.closed_at is null and g.expires_at > now()) as active
    from break_glass_grants g
    join auth.users u on u.id = g.staff_user_id
    join organizations o on o.id = g.org_id
   where is_platform_staff()
     and lower(u.email) = lower(coalesce(auth.email(), ''))
   order by (g.closed_at is null and g.expires_at > now()) desc, g.opened_at desc;
$$;

-- a tenant's chart of accounts — only while a break-glass window is open.
create or replace function staff_list_accounts(p_org uuid)
returns setof ledger_accounts language sql stable security definer set search_path = public as $$
  select * from ledger_accounts where org_id = p_org and staff_can_access_org(p_org);
$$;

-- a tenant's journal entries (+lines+account), shaped exactly like the owner/CPA
-- read so the existing report calcs render it. Empty unless a window is open.
create or replace function staff_list_entries(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when staff_can_access_org(p_org) then coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', je.id, 'entry_date', je.entry_date, 'memo', je.memo, 'status', je.status,
             'source', je.source, 'source_ref', je.source_ref, 'reverses_id', je.reverses_id,
             'created_at', je.created_at,
             'lines', (select jsonb_agg(jsonb_build_object(
                         'id', jl.id, 'account_id', jl.account_id, 'amount_minor', jl.amount_minor,
                         'currency', jl.currency, 'side', jl.side, 'memo', jl.memo,
                         'account', (select jsonb_build_object('code', la.code, 'name', la.name, 'type', la.type)
                                       from ledger_accounts la where la.id = jl.account_id)))
                       from journal_lines jl where jl.entry_id = je.id))
             order by je.entry_date desc, je.created_at desc)
      from journal_entries je where je.org_id = p_org), '[]'::jsonb)
    else '[]'::jsonb end;
$$;

-- ── grants (all self-gate) ──────────────────────────────────────────────────
revoke all on function staff_list_orgs()          from public;
revoke all on function staff_list_break_glass()    from public;
revoke all on function staff_list_accounts(uuid)   from public;
revoke all on function staff_list_entries(uuid)    from public;
grant execute on function staff_list_orgs()        to authenticated, service_role;
grant execute on function staff_list_break_glass()  to authenticated, service_role;
grant execute on function staff_list_accounts(uuid) to authenticated, service_role;
grant execute on function staff_list_entries(uuid)  to authenticated, service_role;
