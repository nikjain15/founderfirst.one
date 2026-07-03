-- W3.1 — Penny thread in-app. Proves the grounded-Q&A fn's READ gate + that the
-- thread's Penny language is the LIVE 'app' persona (edit → runtime reads it).
--   • can_access_org_as: TRUE for a member and for a read-only engaged CPA, FALSE
--     for a stranger — a thread question is a READ, so read-only CPAs may ask.
--   • can_access_org_as is OFF the client-callable surface (service_role only) —
--     it is a membership oracle if reachable by anon/authenticated (LEARNINGS F1).
--   • persona live-edit: publishing a new 'app' persona version changes what the
--     thread runtime (get_live_app_persona('app')) reads — no redeploy.
-- Everything rolls back.

begin;
select plan(7);

-- ── fixtures: owner, firm_admin CPA (read-only engagement), a stranger ───────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000d101', 'owner@t.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d102', 'cpa@t.dev',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d103', 'stranger@t.dev','authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d104', 'super@t.dev',   'authenticated', 'authenticated');

insert into public.admins (email, role, added_by) values
  ('super@t.dev', 'super', '00000000-0000-0000-0000-00000000d104')
  on conflict (email) do nothing;

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000d10b1', 'business', 'Thread Biz', '00000000-0000-0000-0000-00000000d101'),
  ('00000000-0000-0000-0000-0000000d10f1', 'firm',     'Thread Firm','00000000-0000-0000-0000-00000000d102');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-0000000d10b1', 'owner',      'active'),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-0000000d10f1', 'firm_admin', 'active');

-- Firm engages the biz READ-ONLY (a read-only CPA can still ASK questions).
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-0000000d10e1', '00000000-0000-0000-0000-0000000d10f1',
   '00000000-0000-0000-0000-0000000d10b1', 'active', 'read_only', '00000000-0000-0000-0000-00000000d102');

-- 1) the owner (member) can read → can ask the thread.
select ok(
  can_access_org_as('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-0000000d10b1'),
  'owner (member) can access the org for a thread question'
);

-- 2) the read-only engaged CPA (firm_admin) can read → can ask too.
select ok(
  can_access_org_as('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-0000000d10b1'),
  'read-only engaged CPA can access the org for a thread question'
);

-- 3) a stranger cannot read → the fn returns 403.
select ok(
  not can_access_org_as('00000000-0000-0000-0000-00000000d103', '00000000-0000-0000-0000-0000000d10b1'),
  'a non-member / non-engaged stranger cannot access the org'
);

-- 4) can_access_org_as is NOT executable by authenticated (client-callable) —
--    otherwise it is a cross-tenant membership oracle (LEARNINGS: isolation F1).
select ok(
  not has_function_privilege('authenticated', 'can_access_org_as(uuid, uuid)', 'execute'),
  'can_access_org_as is off the client surface for authenticated'
);

-- 5) … nor by anon.
select ok(
  not has_function_privilege('anon', 'can_access_org_as(uuid, uuid)', 'execute'),
  'can_access_org_as is off the client surface for anon'
);

-- ── persona live-edit: the thread reads the live 'app' persona ───────────────
-- 6) the seeded 'app' persona is live (what the thread runtime reads today).
select ok(
  (select body from get_live_app_persona('app')) like 'You are Penny%',
  'thread reads the seeded live app persona'
);

-- act as super-admin; publish a new version; the runtime read reflects it.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000d104","email":"super@t.dev","role":"authenticated"}';
select set_live_app_persona(create_app_persona_version('app', 'THREAD PERSONA EDIT — warm and grounded.', 'w3.1 test'));
reset "request.jwt.claims";

-- 7) editing the app persona changes what the thread runtime reads — no redeploy.
select is(
  (select body from get_live_app_persona('app')),
  'THREAD PERSONA EDIT — warm and grounded.',
  'editing the app persona changes the thread language live (no redeploy)'
);

select * from finish();
rollback;
