-- SEC-4 — signup-confirmation enumeration guard + inert grant cleanup
-- (weekly audit PR #301 P2, supabase section). Runs in a transaction, rolls back.

begin;
select plan(15);

-- ── 1. penny_site_chats / penny_site_leads: anon + authenticated grants revoked ──
-- (RLS was already enable-with-zero-policies, so this was inert — pure
-- defense-in-depth: the only real writer, site-bubble's worker, authenticates
-- as service_role.)
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_name = 'penny_site_chats' and grantee = 'anon'),
  0, 'penny_site_chats: anon has zero grants'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_name = 'penny_site_chats' and grantee = 'authenticated'),
  0, 'penny_site_chats: authenticated has zero grants'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_name = 'penny_site_leads' and grantee = 'anon'),
  0, 'penny_site_leads: anon has zero grants'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_name = 'penny_site_leads' and grantee = 'authenticated'),
  0, 'penny_site_leads: authenticated has zero grants'
);

-- ── 2. rate-limit RPCs: service_role only, never anon/authenticated ────────
select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'check_signup_confirmation_rate_limit' and grantee in ('anon','authenticated')),
  0, 'check_signup_confirmation_rate_limit is NOT execute-granted to anon/authenticated'
);
select ok(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'check_signup_confirmation_rate_limit' and grantee = 'service_role') >= 1,
  'check_signup_confirmation_rate_limit IS execute-granted to service_role'
);
select is(
  (select count(*)::int from information_schema.role_routine_grants
    where routine_name = 'signup_confirmation_rate_limit_purge' and grantee in ('anon','authenticated')),
  0, 'signup_confirmation_rate_limit_purge is NOT execute-granted to anon/authenticated'
);

-- ── 3. rate-limit logic: threshold from platform_config, per-IP, per-hour ──
-- Superuser bypasses grants in this pgTAP session (as production's service_role
-- client would too) — the grant checks above already prove the access surface;
-- this section proves the DECISION logic.
update platform_config set behavior = behavior || jsonb_build_object('signup_confirmation_rate_limit_per_hour', 2)
 where id = true;

select is(check_signup_confirmation_rate_limit('203.0.113.9'), true,  'request 1/2 for an IP: allowed');
select is(check_signup_confirmation_rate_limit('203.0.113.9'), true,  'request 2/2 for an IP: allowed');
select is(check_signup_confirmation_rate_limit('203.0.113.9'), false, 'request 3/2 for an IP: rate-limited');

select is(
  (select request_count from signup_confirmation_rate_limit
    where ip_hash = encode(digest('203.0.113.9', 'sha256'), 'hex') and window_start = date_trunc('hour', now())),
  3, 'the counter row reflects all 3 attempts, not just the 2 allowed ones'
);

select is(
  check_signup_confirmation_rate_limit('203.0.113.42'), true,
  'a DIFFERENT IP has its own independent counter — unaffected by .9''s exhausted budget'
);

-- IPs are hashed, never stored raw.
select is(
  (select count(*)::int from signup_confirmation_rate_limit where ip_hash = '203.0.113.9'),
  0, 'the raw IP is never stored — only its sha256 hash'
);

-- ── 4. purge clears stale rows, leaves fresh ones ───────────────────────────
insert into signup_confirmation_rate_limit (ip_hash, window_start, request_count)
values ('deadbeef_stale', now() - interval '7 hours', 5);

select signup_confirmation_rate_limit_purge();

select is(
  (select count(*)::int from signup_confirmation_rate_limit where ip_hash = 'deadbeef_stale'),
  0, 'purge removes a rate-limit row older than 6 hours'
);
select ok(
  (select count(*)::int from signup_confirmation_rate_limit
    where ip_hash = encode(digest('203.0.113.9', 'sha256'), 'hex')) >= 1,
  'purge leaves the current-hour row untouched'
);

select finish();
rollback;
