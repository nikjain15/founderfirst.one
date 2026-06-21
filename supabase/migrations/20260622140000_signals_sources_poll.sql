-- =============================================================================
-- FounderFirst — Signals: automated collection scheduling (API Direct poller)
-- =============================================================================
--
-- Phase 2. The VM worker polls API Direct for each enabled api_direct source on
-- its cadence and ingests results into the same pipeline. This adds the
-- scheduling primitives (a last_polled_at column + due/mark RPCs) and seeds a
-- few Reddit sources to start. Worker/service_role only — same model as the
-- other worker RPCs in 20260622100000_signals.sql.
--
-- Safe to re-run.
-- =============================================================================

alter table sig_sources add column if not exists last_polled_at timestamptz;

-- Sources whose cadence has elapsed (or never polled). Oldest first.
create or replace function sig_due_sources()
returns setof sig_sources
language sql
security definer
set search_path = public
as $$
  select * from sig_sources
  where enabled = true
    and captured_via = 'api_direct'
    and (last_polled_at is null
         or last_polled_at < now() - make_interval(mins => coalesce(cadence_minutes, 360)))
  order by last_polled_at asc nulls first;
$$;

create or replace function sig_mark_source_polled(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update sig_sources set last_polled_at = now(), updated_at = now() where id = p_id;
$$;

revoke execute on function sig_due_sources()           from public;
revoke execute on function sig_mark_source_polled(uuid) from public;
grant  execute on function sig_due_sources()           to service_role;
grant  execute on function sig_mark_source_polled(uuid) to service_role;

-- Seed a few Reddit sources (idempotent — no unique constraint, so guard).
insert into sig_sources (platform, query, captured_via, enabled, cadence_minutes)
select v.platform, v.query, 'api_direct', true, 360
from (values
  ('reddit', 'catch up bookkeeping behind on books'),
  ('reddit', 'need a bookkeeper small business'),
  ('reddit', 'hate quickbooks too complicated expensive')
) as v(platform, query)
where not exists (
  select 1 from sig_sources s
  where s.platform = v.platform and s.query = v.query and s.captured_via = 'api_direct'
);
