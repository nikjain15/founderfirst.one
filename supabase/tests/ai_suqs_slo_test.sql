-- SUQS SLOs — proves the numeric quality envelope is instrumented: seeded SLO
-- targets exist, admin_ai_suqs computes measured p95 latency / cost-per-answer /
-- gate-block rate over the window, flags a breach, and is is_admin-gated.
-- Everything rolls back.

begin;
select plan(8);

-- fixtures: one admin, one non-admin.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000005c0001', 'suqsadmin@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000005c0002', 'suqsnobody@test.dev', 'authenticated', 'authenticated');
insert into public.admins (email, role, added_by) values
  ('suqsadmin@test.dev', 'super', '00000000-0000-0000-0000-0000005c0001')
  on conflict (email) do nothing;

-- 1) SLO targets are seeded for the routed use cases.
select is(
  (select count(*)::int from ai_suqs_slo where use_case in ('penny_chat','insights','email_compose','content_draft')),
  4,
  'SUQS SLO targets seeded for the four routed use cases'
);

-- 2) the SLO config table is deny-all to direct clients (RLS; read via RPC only).
select is(
  (select count(*)::int from pg_policies where tablename = 'ai_suqs_slo' and policyname = 'ai_suqs_slo_no_direct'),
  1,
  'ai_suqs_slo has a deny-all direct policy'
);

-- ── measured metrics: seed decisions for penny_chat that BREACH the block-rate SLO
-- 4 answers: latencies 100/200/300/5000, one blocked → block rate 25% > 2% SLO,
-- p95 ~ 5000ms > 3000ms SLO.
insert into ai_decisions (tenant_id, use_case, runtime, provider, model, request_ref, gate_status, latency_ms, cost_usd) values
  ('org:t','penny_chat','workers','anthropic','claude-haiku-4-5-20251001','s1','passed', 100, 0.001),
  ('org:t','penny_chat','workers','anthropic','claude-haiku-4-5-20251001','s2','passed', 200, 0.001),
  ('org:t','penny_chat','workers','anthropic','claude-haiku-4-5-20251001','s3','passed', 300, 0.001),
  ('org:t','penny_chat','workers','anthropic','claude-haiku-4-5-20251001','s4','blocked', 5000, 0.001);

-- act as the admin.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000005c0001","email":"suqsadmin@test.dev","role":"authenticated"}';

-- 3) it returns a row per SLO'd use case (4).
select is(
  (select count(*)::int from admin_ai_suqs(30)),
  4,
  'admin_ai_suqs returns one row per SLO use case'
);

-- 4) it counts the seeded answers for penny_chat.
select is(
  (select answers from admin_ai_suqs(30) where use_case = 'penny_chat'),
  4::bigint,
  'admin_ai_suqs counts the seeded penny_chat answers'
);

-- 5) block rate is computed from evaluated (non-'unevaluated') rows: 1/4 = 25%.
select is(
  (select block_rate_pct from admin_ai_suqs(30) where use_case = 'penny_chat'),
  25.00::numeric,
  'admin_ai_suqs computes gate-block rate (1 of 4 = 25%)'
);

-- 6) p95 latency reflects the tail (the 5000ms outlier), exceeding the 3s SLO.
select ok(
  (select p95_latency_ms from admin_ai_suqs(30) where use_case = 'penny_chat') > 3000,
  'admin_ai_suqs p95 latency reflects the tail and exceeds the SLO'
);

-- 7) the breach flag fires when any dimension is over target.
select is(
  (select breached from admin_ai_suqs(30) where use_case = 'penny_chat'),
  true,
  'admin_ai_suqs flags a breach when a dimension exceeds its SLO'
);

-- 8) a non-admin is refused.
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000005c0002","email":"suqsnobody@test.dev","role":"authenticated"}';
select throws_ok(
  $$ select * from admin_ai_suqs(30) $$,
  null, null,
  'admin_ai_suqs refuses a non-admin'
);

select finish();
rollback;
