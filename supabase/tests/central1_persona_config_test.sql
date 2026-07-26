-- CENTRAL-1 — Penny's in-app persona + behavior config are LIVE DATA (Roadmap
-- principle #3). Proves:
--   • get_live_app_persona returns the seeded 'app' body, and publishing a new
--     version changes what the runtime reads — no redeploy (persona live-edit).
--   • get_effective_behavior_config merges an org override over the platform
--     default: changing a config row changes behavior.
--   • the admin-only RPCs refuse a non-admin.
-- Everything rolls back.

begin;
select plan(12);

-- ── fixtures: one admin, one non-admin, one org ─────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000ce001', 'super@test.dev',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ce002', 'nobody@test.dev', 'authenticated', 'authenticated');

insert into public.admins (email, role, added_by) values
  ('super@test.dev', 'super', '00000000-0000-0000-0000-0000000ce001')
  on conflict (email) do nothing;

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000ce0b1', 'business', 'Cfg Biz', '00000000-0000-0000-0000-0000000ce001');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ce0b1', 'owner', 'active');

-- ═══════════════════════════════════════════════════════════════════════════
-- App persona: seeded live version + live edit
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) the migration seeded a live 'app' persona.
select ok(
  (select body from get_live_app_persona('app')) like 'You are Penny%',
  'app persona seeded live from the categorize SYSTEM prompt'
);

-- act as the super-admin for the write RPCs.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ce001","email":"super@test.dev","role":"authenticated"}';

-- 2) admin can save a new version …
select lives_ok(
  $$ select create_app_persona_version('app', 'NEW LIVE PERSONA BODY for the app surface.', 'test edit') $$,
  'admin can create a new app persona version'
);

-- 3) … and publish it live.
select lives_ok(
  $$ select set_live_app_persona(
       (select id from list_app_persona('app') where version = 2)
     ) $$,
  'admin can publish the new version live'
);

-- 4) the runtime now reads the edited body — proving live-edit, no redeploy.
select is(
  (select body from get_live_app_persona('app')),
  'NEW LIVE PERSONA BODY for the app surface.',
  'editing the app persona changes what the runtime reads, live'
);

-- 5) only ONE live version per surface (the old one was demoted).
select is(
  (select count(*)::int from penny_app_persona where surface = 'app' and is_live),
  1,
  'exactly one live app persona after publishing'
);

-- 6) a non-admin cannot save a version.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ce002","email":"nobody@test.dev","role":"authenticated"}';
select throws_ok(
  $$ select create_app_persona_version('app', 'sneaky', null) $$,
  'P0001',
  NULL,
  'a non-admin cannot edit the app persona'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Behavior config: platform default + per-org override. DEFINER-GUARD-2:
-- get_effective_behavior_config is `security definer` and reads a caller-
-- supplied p_org — the org-override branch must be caller-role-aware (a
-- member, or the 3 service-role edge-fn backends) so a non-member can't read
-- another org's tuned thresholds; p_org=null and the platform default are
-- unaffected.
-- ═══════════════════════════════════════════════════════════════════════════
reset "request.jwt.claims";

-- 7) the platform default carries the seeded confidence_high cutoff (anon, p_org=null — unchanged).
select is(
  (get_effective_behavior_config(null) ->> 'confidence_high')::numeric,
  0.75::numeric,
  'platform default confidence_high is the seeded 0.75'
);

-- add a per-org override that raises the cutoff for this org only.
insert into org_behavior_overrides (org_id, behavior)
values ('00000000-0000-0000-0000-0000000ce0b1', jsonb_build_object('confidence_high', 0.95));

-- 8) a member (the org owner) reads the override — folded over the platform default.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ce001","email":"super@test.dev","role":"authenticated"}';
select is(
  (get_effective_behavior_config('00000000-0000-0000-0000-0000000ce0b1') ->> 'confidence_high')::numeric,
  0.95::numeric,
  'org override folds over the platform default for a member — changing a row changes behavior'
);

-- 9) unrelated keys still come from the platform default (sparse override), still as the member.
select is(
  (get_effective_behavior_config('00000000-0000-0000-0000-0000000ce0b1') ->> 'auto_propose_limit')::int,
  8,
  'keys not overridden fall through to the platform default'
);

-- 10) DEFINER-GUARD-2: a non-member authenticated caller cannot read another
-- org's tuned override — refused, not an error; falls through to the platform default.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000ce002","email":"nobody@test.dev","role":"authenticated"}';
select is(
  (get_effective_behavior_config('00000000-0000-0000-0000-0000000ce0b1') ->> 'confidence_high')::numeric,
  0.75::numeric,
  'DEFINER-GUARD-2: a non-member cannot read another org''s tuned override — falls through to platform default'
);

-- 11) DEFINER-GUARD-2: an anonymous (no JWT) caller behaves the same way — refused, not an error.
reset "request.jwt.claims";
select is(
  (get_effective_behavior_config('00000000-0000-0000-0000-0000000ce0b1') ->> 'confidence_high')::numeric,
  0.75::numeric,
  'DEFINER-GUARD-2: an anonymous caller cannot read the org override — falls through to platform default'
);

-- 12) DEFINER-GUARD-2: a service-role caller (the receipts/categorize/invoicing
-- edge fns' backend read, no per-user JWT) still resolves the org override —
-- the regression this caller-role-aware fix exists to avoid.
set local "request.jwt.claims" = '{"role":"service_role"}';
select is(
  (get_effective_behavior_config('00000000-0000-0000-0000-0000000ce0b1') ->> 'confidence_high')::numeric,
  0.95::numeric,
  'DEFINER-GUARD-2: a service-role caller still resolves the org override (edge-fn backend reads unaffected)'
);
reset "request.jwt.claims";

select * from finish();
rollback;
