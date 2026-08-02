-- SH9 / S-3 / S-5: make the written retention window run, and give erasure a path.
--
-- THE DEFECT
--   20260628120000_ai_decisions.sql:94 created
--     retain_until timestamptz not null default (now() + interval '90 days')
--   with an index at :104 built specifically for the job that would read it, and
--   a column comment at :123 describing exactly what that job would do. No such
--   job was ever written. `grep -rn retain_until` across the repository returned
--   twelve hits: one column definition, one index, one comment, and nine
--   documents describing the behaviour as though it happened.
--
--   Meanwhile ai_decisions.input held every prompt verbatim, because
--   packages/inference/src/core.ts defaulted storeInput to on. For the
--   categorize and penny-thread paths that is merchant names, transaction
--   descriptions and amounts, per tenant, accumulating without limit.
--
--   Separately, penny_site_chats_purge() (20260620153619_remote_commit.sql:1025)
--   is a correct 90-day purge that has never been scheduled. It has been dead
--   code since the day it was written.
--
-- WHAT THIS MIGRATION DOES
--   1. ai_decisions_retention_tick()  de-identifies rows past retain_until.
--   2. schedules it daily, and schedules the orphaned penny_site_chats_purge().
--   3. ai_erase_tenant()              erasure by tenant, soft then hard.
--   4. admin_erase_org_ai_data()      the is_admin()-gated operator entry point.
--
-- DE-IDENTIFY, NOT DELETE (D24)
--   GUARDRAILS.md:196 says the end of the window is "archive, de-identified, not
--   silent purge": strip the personal detail, keep the row so cost, latency and
--   quality history survive and can train cheaper models later. So the tick nulls
--   input, output and output_json and stamps deidentified/archived_at. It does
--   NOT delete. Erasure deletes; retention de-identifies. Those are different
--   obligations and this migration keeps them separate on purpose.
--
-- THE 90 IN HERE AND THE 90 IN THE CODE
--   The window itself stays on the column default, so this function reads
--   retain_until rather than re-deriving a number. packages/inference/src/core.ts
--   exports RETENTION.ai_decisions_raw.days = 90 and names
--   'ai-decisions-retention-daily' as its enforcer;
--   scripts/check-retention-doc.ts fails if that job name is not scheduled in
--   this directory. That is the loop that stops the doc and the database drifting
--   apart again.
--
-- WHAT ERASURE HERE CANNOT REACH
--   Recorded honestly in docs/DATA_RETENTION.md §"What deletion does not reach".
--   In short: Cloudflare AI Gateway request/response bodies, Supabase edge
--   function stdout, the Cloudflare Worker and Fly.io logs, and PostHog events.
--   None of those are in this database and none of them are erasable from SQL.
--   The mitigation on the gateway side is the cf-aig-collect-log: false header
--   that core.ts now sets whenever the prompt is not stored verbatim.
--
-- Unique timestamp (rule 11). NOTE: review before `supabase db push`
-- (LEARNINGS.md rule 3). Apply manually.
-- =============================================================================

create extension if not exists pg_cron;

-- ── 1. Retention: de-identify ai_decisions past retain_until ─────────────────

create or replace function public.ai_decisions_retention_tick()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- tenant-ok: system retention job that spans every tenant by design, which is the
  -- whole point of a retention window. It reads no data out, it only strips
  -- personal detail in place. Driven by the ai_decisions_retain_idx index.
  update ai_decisions
     set input        = null,
         output       = null,
         output_json  = null,
         deidentified = true,
         archived_at  = now()
   where retain_until < now()
     and deidentified = false;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.ai_decisions_retention_tick() is
  'D19/D24 retention: de-identifies ai_decisions rows past retain_until by nulling '
  'input/output/output_json and stamping deidentified + archived_at. Returns the row '
  'count. Scheduled as ai-decisions-retention-daily. Does not delete: erasure is '
  'ai_erase_tenant().';

revoke all on function public.ai_decisions_retention_tick() from public, anon, authenticated;
grant execute on function public.ai_decisions_retention_tick() to service_role;

-- ── 2. Erasure by tenant ─────────────────────────────────────────────────────
--
-- p_hard = false  soft erasure: the row survives with every personal field
--                 nulled and deleted_at stamped. Cost and quality history stay.
-- p_hard = true   the rows go. Used when the obligation is deletion, not
--                 minimisation.
--
-- Tenant ids are namespaced ('org:<uuid>' | 'anon:<sessionId>' | 'org:founderfirst'),
-- so this covers both an organisation and a single anonymous marketing session,
-- which is the only identity an anon: row has.

create or replace function public.ai_erase_tenant(p_tenant text, p_hard boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_tenant is null or btrim(p_tenant) = '' then
    raise exception 'ai_erase_tenant: tenant required';
  end if;

  if p_hard then
    -- tenant-ok: p_tenant IS the tenant predicate; this statement is scoped to
    -- exactly one tenant_id and erasure is its entire purpose.
    delete from ai_decisions where tenant_id = p_tenant;
    get diagnostics n = row_count;
  else
    -- tenant-ok: scoped to the single tenant_id passed in.
    update ai_decisions
       set input        = null,
           output       = null,
           output_json  = null,
           human_edit   = null,
           evals        = '{}'::jsonb,
           deidentified = true,
           deleted_at   = now()
     where tenant_id = p_tenant
       and deleted_at is null;
    get diagnostics n = row_count;
  end if;

  return n;
end;
$$;

comment on function public.ai_erase_tenant(text, boolean) is
  'D19 right-to-erasure for ai_decisions, scoped to one namespaced tenant_id. '
  'Soft (default) nulls every field that can carry personal detail and stamps '
  'deleted_at; hard deletes the rows. Reaches this table only, see '
  'docs/DATA_RETENTION.md for the stores it cannot reach.';

revoke all on function public.ai_erase_tenant(text, boolean) from public, anon, authenticated;
grant execute on function public.ai_erase_tenant(text, boolean) to service_role;

-- The operator entry point. Takes an organisation id and does the namespacing
-- itself, so no caller has to remember the 'org:' prefix and get it wrong.
create or replace function public.admin_erase_org_ai_data(p_org uuid, p_hard boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admin_erase_org_ai_data: admin access required';
  end if;
  if p_org is null then
    raise exception 'admin_erase_org_ai_data: org required';
  end if;
  return ai_erase_tenant('org:' || p_org::text, p_hard);
end;
$$;

comment on function public.admin_erase_org_ai_data(uuid, boolean) is
  'is_admin()-gated wrapper over ai_erase_tenant for an organisation. Mirrors '
  'admin_discord_erase (20260624100000_discord_erase_complete.sql:50).';

revoke all on function public.admin_erase_org_ai_data(uuid, boolean) from public, anon;
grant execute on function public.admin_erase_org_ai_data(uuid, boolean) to authenticated, service_role;

-- ── 3. Schedules ─────────────────────────────────────────────────────────────
--
-- Wrapped so a stack without pg_cron still applies the functions above. The
-- existing ai-reconcile-daily block (20260628130000:177) uses the same shape.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ai-decisions-retention-daily') then
    perform cron.unschedule('ai-decisions-retention-daily');
  end if;
  -- 03:00 UTC, an hour after ai-reconcile-daily so the two do not contend.
  perform cron.schedule(
    'ai-decisions-retention-daily', '0 3 * * *',
    'select public.ai_decisions_retention_tick();'
  );

  -- penny_site_chats_purge() has existed and been unscheduled since
  -- 20260620153619_remote_commit.sql:1025. Scheduling it is the entire fix.
  if exists (select 1 from cron.job where jobname = 'penny-site-chats-purge-daily') then
    perform cron.unschedule('penny-site-chats-purge-daily');
  end if;
  perform cron.schedule(
    'penny-site-chats-purge-daily', '30 3 * * *',
    'select public.penny_site_chats_purge();'
  );
exception
  when others then
    raise notice 'pg_cron schedule skipped: %', sqlerrm;
end;
$$;

notify pgrst, 'reload schema';

-- =============================================================================
-- End of migration.
-- =============================================================================
