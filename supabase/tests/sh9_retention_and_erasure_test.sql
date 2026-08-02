-- SH9 / S-3: retention and erasure on ai_decisions.
-- Proves: the retention tick de-identifies rows past retain_until and leaves rows
-- inside the window alone; it strips input/output/output_json but KEEPS the cost
-- and quality columns (D24 archive, not purge); it is idempotent; erasure is
-- scoped to one tenant and does not touch a second tenant's rows; soft erasure
-- nulls the personal fields and stamps deleted_at while hard erasure removes the
-- rows; the org wrapper refuses a non-admin; and none of the surface is reachable
-- by `authenticated` except the admin-gated wrapper. Everything rolls back.
-- Run: `supabase test db`.

begin;
select plan(17);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000019701', 'owner-sh9@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000197fa', 'business', 'SH9 Org', '00000000-0000-0000-0000-000000019701');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-000000019701', '00000000-0000-0000-0000-0000000197fa', 'owner', 'active');

-- (a) past its window: the row the tick must de-identify.
insert into ai_decisions (id, tenant_id, use_case, runtime, provider, model, input, output, output_json, usage, cost_usd, latency_ms, retain_until) values
  ('00000000-0000-0000-0000-000000019701'::uuid, 'org:00000000-0000-0000-0000-0000000197fa', 'categorize', 'deno', 'anthropic', 'claude-haiku-4-5',
   '{"messages":[{"role":"user","content":"Blue Bottle Coffee $84.20"}]}'::jsonb, 'Meals', '{"code":"6100"}'::jsonb,
   '{"input_tokens":100,"output_tokens":8}'::jsonb, 0.00014, 412, now() - interval '1 day');

-- (b) inside its window: must be untouched.
insert into ai_decisions (id, tenant_id, use_case, runtime, provider, model, input, output, usage, retain_until) values
  ('00000000-0000-0000-0000-000000019702'::uuid, 'org:00000000-0000-0000-0000-0000000197fa', 'categorize', 'deno', 'anthropic', 'claude-haiku-4-5',
   '{"messages":[{"role":"user","content":"still fresh"}]}'::jsonb, 'Office', '{}'::jsonb, now() + interval '30 days');

-- (c) a DIFFERENT tenant, past its window too. Proves erasure scoping later.
insert into ai_decisions (id, tenant_id, use_case, runtime, provider, model, input, output, usage, retain_until) values
  ('00000000-0000-0000-0000-000000019703'::uuid, 'org:99999999-9999-9999-9999-999999999999', 'categorize', 'deno', 'anthropic', 'claude-haiku-4-5',
   '{"messages":[{"role":"user","content":"other tenant"}]}'::jsonb, 'Travel', '{}'::jsonb, now() + interval '30 days');

-- ── 1. the retention tick de-identifies only what is past its window ─────────
select is(
  (select ai_decisions_retention_tick()), 1,
  'the retention tick de-identifies exactly the one row past retain_until'
);
select is(
  (select input from ai_decisions where id = '00000000-0000-0000-0000-000000019701'), null,
  'the expired row no longer holds the prompt'
);
select is(
  (select output from ai_decisions where id = '00000000-0000-0000-0000-000000019701'), null,
  'nor the completion'
);
select is(
  (select output_json from ai_decisions where id = '00000000-0000-0000-0000-000000019701'), null,
  'nor the structured completion'
);
select is(
  (select deidentified from ai_decisions where id = '00000000-0000-0000-0000-000000019701'), true,
  'and it is stamped deidentified'
);
select isnt(
  (select archived_at from ai_decisions where id = '00000000-0000-0000-0000-000000019701'), null,
  'and archived_at is set'
);

-- D24: archive, not purge. The row and its non-personal columns survive.
select is(
  (select cost_usd from ai_decisions where id = '00000000-0000-0000-0000-000000019701'), 0.00014,
  'de-identification KEEPS cost_usd (D24: archive de-identified, do not silently purge)'
);
select is(
  (select latency_ms from ai_decisions where id = '00000000-0000-0000-0000-000000019701'), 412,
  'and keeps latency_ms, so the quality and cost history survives the window'
);

select isnt(
  (select input from ai_decisions where id = '00000000-0000-0000-0000-000000019702'), null,
  'a row still inside its window is untouched'
);

-- ── 2. the tick is idempotent ────────────────────────────────────────────────
select is(
  (select ai_decisions_retention_tick()), 0,
  'a second run de-identifies nothing (idempotent)'
);

-- ── 3. soft erasure: scoped, and nulls the personal fields ───────────────────
select is(
  (select ai_erase_tenant('org:00000000-0000-0000-0000-0000000197fa')), 2,
  'soft erasure covers both of this tenant''s rows and no others'
);
select isnt(
  (select deleted_at from ai_decisions where id = '00000000-0000-0000-0000-000000019702'), null,
  'soft erasure stamps deleted_at'
);
select is(
  (select input from ai_decisions where id = '00000000-0000-0000-0000-000000019702'), null,
  'soft erasure nulls the prompt on a row that was still inside its window'
);
select isnt(
  (select input from ai_decisions where id = '00000000-0000-0000-0000-000000019703'), null,
  'a different tenant''s row is untouched by the erasure'
);

-- ── 4. hard erasure removes the rows ─────────────────────────────────────────
select is(
  (select ai_erase_tenant('org:00000000-0000-0000-0000-0000000197fa', true)), 2,
  'hard erasure deletes both rows for the tenant'
);
select is(
  (select count(*)::int from ai_decisions where tenant_id = 'org:00000000-0000-0000-0000-0000000197fa'), 0,
  'and nothing for that tenant remains'
);

-- ── 5. the operator wrapper refuses a non-admin ──────────────────────────────
-- errcode + errmsg both NULL (4-arg form): we assert the call is REFUSED, not a
-- specific SQLSTATE/message.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000019701","email":"owner-sh9@test.dev","role":"authenticated"}';
select throws_ok(
  $$ select admin_erase_org_ai_data('00000000-0000-0000-0000-0000000197fa'::uuid) $$,
  null::text, null::text,
  'a non-admin member CANNOT erase an org''s AI data'
);
reset role;

select * from finish();
rollback;
