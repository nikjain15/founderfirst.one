-- =============================================================================
-- SEC-4 — signup-confirmation enumeration guard + inert grant cleanup
-- =============================================================================
-- Weekly audit (2026-07-06, PR #301) P2 findings, supabase section:
--
--   1. penny_site_chats / penny_site_leads carry full CRUD grants to BOTH anon
--      and authenticated with zero RLS policies (RLS is enabled — today this is
--      inert, PostgREST denies everything). A latent footgun the moment anyone
--      adds a policy. The only real writer is the site-bubble worker
--      (site-bubble/worker/src/worker.ts `new Supabase(env.SUPABASE_URL,
--      env.SUPABASE_SERVICE_KEY)`), which authenticates as service_role — the
--      anon/authenticated grants are unused. Revoke them; service_role keeps
--      full access (grants are not touched for it).
--
--   2. signup-confirmation (verify_jwt=false, public — called by the signup
--      island) answers differently for an email that IS vs ISN'T on the
--      waitlist (404 not_on_waitlist vs 200 ok) — an attacker can POST
--      arbitrary addresses and learn waitlist membership one email at a time.
--      Audit note: "Bounded by the idempotent already_sent claim; consider
--      rate-limiting." This migration adds the rate limiter (IP-hashed, hourly
--      window, threshold admin-tunable via platform_config — CENTRAL-1
--      pattern, mirrors get_fx_feed_config()); the enumeration-safety fix
--      itself (collapsing the not-on-waitlist response into the same shape as
--      the already-sent response) ships in the edge fn in this same PR.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists pg_cron;

-- ── 1. Revoke inert anon/authenticated grants (defense-in-depth) ───────────
revoke all on table public.penny_site_chats from anon, authenticated;
revoke all on table public.penny_site_leads from anon, authenticated;

-- ── 2. IP-hashed hourly rate limit for signup-confirmation ─────────────────
create table if not exists signup_confirmation_rate_limit (
  ip_hash       text        not null,
  window_start  timestamptz not null,
  request_count int         not null default 0,
  primary key (ip_hash, window_start)
);

alter table signup_confirmation_rate_limit enable row level security;
-- service_role only (bypasses RLS entirely); no anon/authenticated policy —
-- there is no legitimate direct caller other than the edge fn.
revoke all on table signup_confirmation_rate_limit from anon, authenticated;

-- Default threshold lives in platform_config.behavior (CENTRAL-1 pattern) —
-- admin-tunable via set_platform_behavior(), no redeploy. Only seeds the key
-- if absent so re-running this migration never clobbers an admin's edit.
update platform_config
   set behavior = behavior || jsonb_build_object('signup_confirmation_rate_limit_per_hour', 20)
 where id = true
   and not (behavior ? 'signup_confirmation_rate_limit_per_hour');

-- Atomic check-and-bump: one row per (hashed IP, hour). Returns true = allowed.
-- IPs are hashed, not stored raw, matching the retention-minimization stance
-- elsewhere in the codebase (LEARNINGS #8).
create or replace function check_signup_confirmation_rate_limit(p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit  int;
  v_window timestamptz := date_trunc('hour', now());
  v_hash   text := encode(digest(coalesce(nullif(p_ip, ''), 'unknown'), 'sha256'), 'hex');
  v_count  int;
begin
  v_limit := coalesce(
    (select (behavior->>'signup_confirmation_rate_limit_per_hour')::int from platform_config where id = true),
    20
  );

  insert into signup_confirmation_rate_limit (ip_hash, window_start, request_count)
  values (v_hash, v_window, 1)
  on conflict (ip_hash, window_start) do update
    set request_count = signup_confirmation_rate_limit.request_count + 1
  returning request_count into v_count;

  return v_count <= v_limit;
end;
$$;

-- No legitimate caller besides the edge fn's service_role client.
revoke all on function check_signup_confirmation_rate_limit(text) from public;
grant execute on function check_signup_confirmation_rate_limit(text) to service_role;

-- ── 3. Purge old rate-limit rows (mirrors the penny-site-chats-purge cron) ──
create or replace function signup_confirmation_rate_limit_purge()
returns void
language sql
security definer
set search_path = public
as $$
  delete from signup_confirmation_rate_limit where window_start < now() - interval '6 hours';
$$;

revoke all on function signup_confirmation_rate_limit_purge() from public;
grant execute on function signup_confirmation_rate_limit_purge() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'signup-confirmation-rate-limit-purge') then
    perform cron.unschedule('signup-confirmation-rate-limit-purge');
  end if;
  perform cron.schedule(
    'signup-confirmation-rate-limit-purge', '15 * * * *',
    'select public.signup_confirmation_rate_limit_purge();'
  );
end;
$$;

-- =============================================================================
-- End of migration.
-- =============================================================================
