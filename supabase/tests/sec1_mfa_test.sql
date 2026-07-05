-- SEC-1 · MFA for owner + CPA login — recovery-code path + per-org policy flag.
-- Proves:
--   · generate_mfa_recovery_codes mints N distinct one-time codes; only the hash
--     persists (never the plaintext).
--   · consume_mfa_recovery_code accepts a live code exactly once, rejects a wrong
--     code, and rejects re-use of an already-consumed code (no lockout bypass:
--     the reject is a plain false, not an exception, so callers can retry).
--   · regenerating codes invalidates any previously issued, unused codes.
--   · every MFA event (generate / consume / logged enrol-disable) writes a
--     security_audit row; a user can only ever read their OWN rows (RLS).
--   · set_org_accounting_settings can now flip mfa_required — owner-only, same
--     gate as every other field on that RPC.
--   · every write RPC here is service_role-only (revoked from authenticated) —
--     the actor is always JWT-verified in the mfa edge fn, never client-trusted.
-- All rolls back.

begin;
select plan(32);

-- ── fixtures: owner + a non-owner (CPA via engagement) + an outsider ─────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000005c1', 'owner@sec1.dev',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005c2', 'cpa@sec1.dev',      'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000005c9', 'outsider@sec1.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000005b1', 'business', 'Sec1Co',   '00000000-0000-0000-0000-0000000005c1'),
  ('00000000-0000-0000-0000-0000000005f1', 'firm',     'Sec1Firm', '00000000-0000-0000-0000-0000000005c2');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005b1', 'owner',      'active'),
  ('00000000-0000-0000-0000-0000000005c2', '00000000-0000-0000-0000-0000000005f1', 'firm_admin', 'active');

insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000005f1',
   '00000000-0000-0000-0000-0000000005b1', 'active', 'full', '00000000-0000-0000-0000-0000000005c1');

-- ════════════════════════════════════════════════════════════════════════════
-- per-org MFA policy flag — owner-only, via the extended write RPC
-- ════════════════════════════════════════════════════════════════════════════
select is(
  (select mfa_required from set_org_accounting_settings(
    p_actor => '00000000-0000-0000-0000-0000000005c1',
    p_org   => '00000000-0000-0000-0000-0000000005b1',
    p_mfa_required => true)),
  true, 'SEC1-POLICY: the owner can flip mfa_required on');

select throws_ok($$
  select set_org_accounting_settings(
    p_actor => '00000000-0000-0000-0000-0000000005c2',
    p_org   => '00000000-0000-0000-0000-0000000005b1',
    p_mfa_required => false)
$$, '42501', null, 'SEC1-POLICY: a CPA (non-owner) cannot change mfa_required');

select is(
  (select mfa_required from org_accounting_settings where org_id='00000000-0000-0000-0000-0000000005b1'),
  true, 'SEC1-POLICY: the flag persisted (the CPA write above did not go through)');

-- ════════════════════════════════════════════════════════════════════════════
-- recovery codes — generate, remaining count, consume, reuse, wrong code
-- ════════════════════════════════════════════════════════════════════════════
create temporary table _codes as
  select unnest(generate_mfa_recovery_codes('00000000-0000-0000-0000-0000000005c1', 10)) as code;

select is((select count(*)::int from _codes), 10, 'SEC1-GEN: 10 codes minted');
select is((select count(distinct code)::int from _codes), 10, 'SEC1-GEN: all 10 codes are distinct');
select is((select count(*)::int from mfa_recovery_codes
             where user_id='00000000-0000-0000-0000-0000000005c1' and used_at is null),
  10, 'SEC1-GEN: 10 unused rows persisted (hashed, not the plaintext)');
select is(
  (select min(length(code_hash))::int from mfa_recovery_codes
     where user_id='00000000-0000-0000-0000-0000000005c1'),
  64, 'SEC1-GEN: stored value is a 64-char sha256 hex digest, not the plaintext code');

select is(mfa_recovery_codes_remaining('00000000-0000-0000-0000-0000000005c1'), 10,
  'SEC1-REMAIN: 10 codes remaining right after generation');

select is(
  consume_mfa_recovery_code('00000000-0000-0000-0000-0000000005c1', (select code from _codes limit 1)),
  true, 'SEC1-CONSUME: a live code is accepted');
select is(mfa_recovery_codes_remaining('00000000-0000-0000-0000-0000000005c1'), 9,
  'SEC1-REMAIN: remaining drops to 9 after one consumed');
select is(
  consume_mfa_recovery_code('00000000-0000-0000-0000-0000000005c1', (select code from _codes limit 1)),
  false, 'SEC1-CONSUME: the SAME code cannot be reused (one-time)');
select is(
  consume_mfa_recovery_code('00000000-0000-0000-0000-0000000005c1', 'fffff-fffff'),
  false, 'SEC1-CONSUME: a wrong/unknown code is rejected (plain false, not an exception)');
-- case/whitespace-insensitive (the UI should not force exact paste fidelity)
select is(
  consume_mfa_recovery_code('00000000-0000-0000-0000-0000000005c1',
    '  ' || lower((select code from _codes offset 1 limit 1)) || ' '),
  true, 'SEC1-CONSUME: a code is accepted case/whitespace-insensitively');

-- a code minted for one user cannot be consumed as another user
select is(
  consume_mfa_recovery_code('00000000-0000-0000-0000-0000000005c9', (select code from _codes offset 2 limit 1)),
  false, 'SEC1-ISO: a code cannot be redeemed under a different user_id');

-- regenerating invalidates the still-unused codes from the first batch
create temporary table _codes2 as
  select unnest(generate_mfa_recovery_codes('00000000-0000-0000-0000-0000000005c1', 5)) as code;
select is(mfa_recovery_codes_remaining('00000000-0000-0000-0000-0000000005c1'), 5,
  'SEC1-GEN: regenerating replaces the old batch (5 fresh, old unused ones gone)');
select is(
  consume_mfa_recovery_code('00000000-0000-0000-0000-0000000005c1', (select code from _codes offset 2 limit 1)),
  false, 'SEC1-GEN: an old (pre-regeneration) unused code no longer works');

-- ════════════════════════════════════════════════════════════════════════════
-- security_audit — every event logged; RLS = read-your-own-rows only
-- ════════════════════════════════════════════════════════════════════════════
select ok(
  (select count(*)::int from security_audit
     where user_id='00000000-0000-0000-0000-0000000005c1' and action='mfa.recovery_codes_generated') >= 2,
  'SEC1-AUDIT: each generate call logged mfa.recovery_codes_generated');
select is(
  (select count(*)::int from security_audit
     where user_id='00000000-0000-0000-0000-0000000005c1' and action='mfa.recovery_used'),
  2, 'SEC1-AUDIT: each successful consume logged mfa.recovery_used');

select lives_ok($$
  select log_security_event('00000000-0000-0000-0000-0000000005c1', 'mfa.enrolled', '{"factor":"totp"}'::jsonb)
$$, 'SEC1-AUDIT: log_security_event accepts an allow-listed action');
select throws_ok($$
  select log_security_event('00000000-0000-0000-0000-0000000005c1', 'mfa.whatever', '{}'::jsonb)
$$, '23514', null, 'SEC1-AUDIT: an unlisted action is rejected (check constraint)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000005c9","email":"outsider@sec1.dev","role":"authenticated"}';
select is(
  (select count(*)::int from security_audit where user_id='00000000-0000-0000-0000-0000000005c1'),
  0, 'SEC1-AUDIT-RLS: another user cannot read this user''s security_audit rows');
reset "request.jwt.claims";
reset role;

-- ════════════════════════════════════════════════════════════════════════════
-- isolation: the write RPCs + raw table are NOT reachable by authenticated
-- ════════════════════════════════════════════════════════════════════════════
select is(
  has_function_privilege('authenticated', 'public.generate_mfa_recovery_codes(uuid,int)', 'execute'),
  false, 'SEC1-ISO: generate_mfa_recovery_codes is service_role only');
select is(
  has_function_privilege('authenticated', 'public.consume_mfa_recovery_code(uuid,text)', 'execute'),
  false, 'SEC1-ISO: consume_mfa_recovery_code is service_role only');
select is(
  has_table_privilege('authenticated', 'public.mfa_recovery_codes', 'select'),
  false, 'SEC1-ISO: mfa_recovery_codes has no direct authenticated grant at all');

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 2 — server-side aal2 gate on the org WRITE path (can_write_org_as).
-- org ...05b1 has mfa_required = true (set above). A second org opts out.
-- can_write_org_as reads the request JWT's aal claim via session_is_aal2().
-- ════════════════════════════════════════════════════════════════════════════
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000005b2', 'business', 'Sec1CoNoMfa', '00000000-0000-0000-0000-0000000005c1');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005b2', 'owner', 'active');

-- aal1 session against an MFA-required org → write gate raises.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000005c1","role":"authenticated","aal":"aal1"}';
select throws_ok($$
  select can_write_org_as('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005b1')
$$, '42501', null, 'FIX2: aal1 session is rejected on an MFA-required org write');

-- aal1 session against a NON-required org → unaffected (opt-in preserved).
select is(
  can_write_org_as('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005b2'),
  true, 'FIX2: aal1 session still writes to an org that did NOT enable MFA (opt-in preserved)');

-- aal2 session against the MFA-required org → allowed.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000005c1","role":"authenticated","aal":"aal2"}';
select is(
  can_write_org_as('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005b1'),
  true, 'FIX2: aal2 (MFA-verified) session writes to an MFA-required org');
reset "request.jwt.claims";

-- service_role / no request JWT (trusted backend) → not gated even when required.
select is(session_is_aal2(), true,
  'FIX2: a trusted backend call (no request JWT) is not aal-gated');
select is(
  can_write_org_as('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005b1'),
  true, 'FIX2: the service_role write path is unaffected by the aal gate');

-- ════════════════════════════════════════════════════════════════════════════
-- SEC-1-CPACLOSE — the cpa-close batch-close gate is keyed on the CPA firm user's
-- OWN firm org policy. The edge fn (which holds the caller's JWT) calls
-- mfaSatisfied(svc, jwt, firm_org) → org_requires_mfa(firm_org) + the aal claim.
-- The aal branch is exercised in the deno test (index.test.ts); here we prove the
-- DB-side input the gate reads: org_requires_mfa reflects the FIRM org's own flag,
-- independent of any client org, so a firm that enables MFA gates its own close.
-- ════════════════════════════════════════════════════════════════════════════
-- Firm ...05f1 opts in; a second firm stays opted out.
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000005f2', 'firm', 'Sec1FirmNoMfa', '00000000-0000-0000-0000-0000000005c2');

select is(org_requires_mfa('00000000-0000-0000-0000-0000000005f1'), false,
  'CPACLOSE: firm org defaults to NOT requiring MFA (opt-in preserved)');

update org_accounting_settings set mfa_required = true
  where org_id = '00000000-0000-0000-0000-0000000005f1';
-- no settings row yet for f1? ensure the flag is set via the owner RPC path shape.
insert into org_accounting_settings (org_id, mfa_required)
  values ('00000000-0000-0000-0000-0000000005f1', true)
  on conflict (org_id) do update set mfa_required = true;

select is(org_requires_mfa('00000000-0000-0000-0000-0000000005f1'), true,
  'CPACLOSE: a firm that enabled mfa_required → org_requires_mfa true (its own close is gated)');
select is(org_requires_mfa('00000000-0000-0000-0000-0000000005f2'), false,
  'CPACLOSE: a firm that did NOT enable MFA is unaffected (its batch-close is never gated)');

select * from finish();
rollback;
