-- SEC-2 · OTP-request rate limiting — proves:
--   · the first N attempts (N = platform_config default 5) for one email are
--     allowed and recorded; the (N+1)th is refused with a retry-after estimate.
--   · a different email has its own independent budget (no cross-email bleed).
--   · raising the config threshold takes effect immediately, no redeploy
--     (Roadmap principle #3 — config-driven, not a magic number).
--   · attempts outside the window are pruned and don't count against a later
--     request (the window actually expires, not just accumulates forever).
--   · invalid email input is rejected outright.
--   · isolation: anon/authenticated can call the RPC (pre-auth path), but
--     neither can read/write the underlying table directly.
-- All rolls back.

begin;
select plan(17);

-- ════════════════════════════════════════════════════════════════════════════
-- basic budget: first 5 allowed, 6th refused (default platform_config: max=5)
-- ════════════════════════════════════════════════════════════════════════════
select is(
  (check_and_record_otp_attempt('sec2-a@example.com')->>'allowed')::boolean,
  true, 'SEC2-BUDGET: attempt 1/5 allowed');
select is(
  (check_and_record_otp_attempt('SEC2-A@Example.com  ')->>'allowed')::boolean,
  true, 'SEC2-BUDGET: attempt 2/5 allowed (case/whitespace normalized to same email)');
select is(
  (check_and_record_otp_attempt('sec2-a@example.com')->>'allowed')::boolean,
  true, 'SEC2-BUDGET: attempt 3/5 allowed');
select is(
  (check_and_record_otp_attempt('sec2-a@example.com')->>'allowed')::boolean,
  true, 'SEC2-BUDGET: attempt 4/5 allowed');
select is(
  (check_and_record_otp_attempt('sec2-a@example.com')->>'allowed')::boolean,
  true, 'SEC2-BUDGET: attempt 5/5 allowed');
select is(
  (check_and_record_otp_attempt('sec2-a@example.com')->>'allowed')::boolean,
  false, 'SEC2-BUDGET: attempt 6 within the window is refused');
select ok(
  (check_and_record_otp_attempt('sec2-a@example.com')->>'retry_after_seconds')::int > 0,
  'SEC2-BUDGET: a refused attempt carries a positive retry_after_seconds');
select is(
  (select count(*)::int from auth_otp_attempts where email = 'sec2-a@example.com'),
  5, 'SEC2-BUDGET: a refused attempt is NOT recorded (retrying immediately does not extend the window)');

-- ════════════════════════════════════════════════════════════════════════════
-- independent budgets per email
-- ════════════════════════════════════════════════════════════════════════════
select is(
  (check_and_record_otp_attempt('sec2-b@example.com')->>'allowed')::boolean,
  true, 'SEC2-ISO-EMAIL: a different email has its own independent budget');

-- ════════════════════════════════════════════════════════════════════════════
-- config-driven threshold — raising the limit takes effect immediately
-- ════════════════════════════════════════════════════════════════════════════
update platform_config
  set behavior = behavior || jsonb_build_object('otp_rate_limit_max', 10)
  where id = true;
select is(
  (check_and_record_otp_attempt('sec2-a@example.com')->>'allowed')::boolean,
  true, 'SEC2-CONFIG: raising otp_rate_limit_max to 10 immediately unblocks the same email (5 recorded < 10)');
update platform_config
  set behavior = behavior || jsonb_build_object('otp_rate_limit_max', 5)
  where id = true;

-- ════════════════════════════════════════════════════════════════════════════
-- window expiry — attempts older than the window are pruned, not counted
-- ════════════════════════════════════════════════════════════════════════════
insert into auth_otp_attempts (email, created_at)
  select 'sec2-c@example.com', now() - interval '1 hour' from generate_series(1, 5);
select is(
  (select count(*)::int from auth_otp_attempts where email = 'sec2-c@example.com'),
  5, 'SEC2-WINDOW: 5 stale (1h-old) attempts seeded directly');
select is(
  (check_and_record_otp_attempt('sec2-c@example.com')->>'allowed')::boolean,
  true, 'SEC2-WINDOW: a request after the 15-min window is allowed (stale attempts do not count)');
select is(
  (select count(*)::int from auth_otp_attempts where email = 'sec2-c@example.com'),
  1, 'SEC2-WINDOW: the stale attempts were pruned — only the new one remains');

-- ════════════════════════════════════════════════════════════════════════════
-- input validation
-- ════════════════════════════════════════════════════════════════════════════
select throws_ok($$
  select check_and_record_otp_attempt('not-an-email')
$$, 'P0001', null, 'SEC2-VALIDATE: a malformed email is rejected');

-- ════════════════════════════════════════════════════════════════════════════
-- isolation: RPC reachable pre-auth; the raw table is not
-- ════════════════════════════════════════════════════════════════════════════
select is(
  has_function_privilege('anon', 'public.check_and_record_otp_attempt(text)', 'execute'),
  true, 'SEC2-ISO: anon (pre-auth) can call the rate-limit check');
select is(
  has_table_privilege('anon', 'public.auth_otp_attempts', 'select'),
  false, 'SEC2-ISO: anon has no direct read on auth_otp_attempts');
select is(
  has_table_privilege('authenticated', 'public.auth_otp_attempts', 'insert'),
  false, 'SEC2-ISO: authenticated has no direct write on auth_otp_attempts either — only the RPC');

select * from finish();
rollback;
