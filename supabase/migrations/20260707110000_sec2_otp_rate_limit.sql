-- =============================================================================
-- FounderFirst — SEC-2: OTP-request rate limiting (bot/abuse protection)
-- =============================================================================
--
-- Card SEC-2 (docs/plans/BACKLOG.md). The login + admin-login forms call
-- Supabase's signInWithOtp directly — nothing today stops rapid-fire OTP
-- requests (credential-stuffing / email-bombing a target inbox). This adds a
-- server-side, config-driven rate limit the client checks BEFORE dispatching
-- the OTP, independent of (and in addition to) Cloudflare Turnstile bot
-- verification on the same forms (app-side change, no migration needed there).
--
-- Design (mirrors platform_config's singleton + SECURITY DEFINER RPC pattern
-- from CENTRAL-1 — see 20260702050100_platform_config_behavior.sql):
--   auth_otp_attempts            — one row per OTP request, keyed by normalized
--                                  email. No direct grants; only the RPC below
--                                  touches it (same "no direct access" policy
--                                  shape as platform_config).
--   check_and_record_otp_attempt — anon-callable (called pre-auth, before sign-
--                                  in exists). Prunes expired attempts, counts
--                                  the email's attempts in the current window,
--                                  and either records a new attempt (allowed) or
--                                  refuses with a retry-after estimate. Threshold
--                                  + window come from platform_config.behavior
--                                  (otp_rate_limit_max / _window_minutes) — admin
--                                  can retune with no redeploy, same as every
--                                  other behavior knob.
-- =============================================================================

-- ── config: extend the existing platform_config singleton (merge, don't clobber) ──
insert into platform_config (id, behavior)
values (true, jsonb_build_object(
  'otp_rate_limit_max',             5,
  'otp_rate_limit_window_minutes',  15
))
on conflict (id) do update
  set behavior = platform_config.behavior || excluded.behavior;

-- ── auth_otp_attempts: one row per OTP request ──────────────────────────────
create table if not exists auth_otp_attempts (
  id         bigserial   primary key,
  email      text        not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_otp_attempts_email_created_idx
  on auth_otp_attempts (email, created_at);

alter table auth_otp_attempts enable row level security;

-- No direct access whatsoever — same shape as platform_config's no-direct-access
-- policy. The SECURITY DEFINER function below is the only writer/reader.
drop policy if exists auth_otp_attempts_no_direct on auth_otp_attempts;
create policy auth_otp_attempts_no_direct on auth_otp_attempts
  for all using (false) with check (false);

revoke all on auth_otp_attempts from anon, authenticated;

-- ── check_and_record_otp_attempt: the one function the login forms call ────
-- Called BEFORE signInWithOtp, with the anon key (no session exists yet).
-- Returns {"allowed": true} and records the attempt, or
-- {"allowed": false, "retry_after_seconds": N} without recording another one
-- (so retrying immediately doesn't extend the caller's own window).
create or replace function check_and_record_otp_attempt(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email           text := lower(trim(coalesce(p_email, '')));
  v_max             int;
  v_window_minutes  int;
  v_count           int;
  v_oldest          timestamptz;
  v_retry_after     int;
begin
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'check_and_record_otp_attempt: invalid email';
  end if;

  select
    coalesce((behavior->>'otp_rate_limit_max')::int, 5),
    coalesce((behavior->>'otp_rate_limit_window_minutes')::int, 15)
  into v_max, v_window_minutes
  from platform_config where id = true;
  v_max            := coalesce(v_max, 5);
  v_window_minutes := coalesce(v_window_minutes, 15);

  -- Prune this email's attempts outside the current window (keeps the table
  -- small; also means a raised config limit takes effect immediately).
  delete from auth_otp_attempts
   where email = v_email
     and created_at <= now() - (v_window_minutes || ' minutes')::interval;

  select count(*), min(created_at) into v_count, v_oldest
    from auth_otp_attempts where email = v_email;

  if v_count >= v_max then
    v_retry_after := greatest(1, ceil(extract(epoch from (
      v_oldest + (v_window_minutes || ' minutes')::interval - now()
    )))::int);
    return jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry_after);
  end if;

  insert into auth_otp_attempts (email) values (v_email);
  return jsonb_build_object('allowed', true);
end;
$$;

-- Called pre-auth (no session yet) — must be reachable by the anon key.
grant execute on function check_and_record_otp_attempt(text) to anon, authenticated;

-- =============================================================================
-- End of migration.
-- =============================================================================
