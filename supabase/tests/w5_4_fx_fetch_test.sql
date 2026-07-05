-- W5.4-FX — the manual-override entry path (D3), the resolver's exact-date
-- override precedence + gap-bridging fallback, and the cron trigger's
-- fail-silent no-secret guard. The ECB fetch itself (network) is proven by
-- the Deno unit tests on the pure parser (_shared/ecbFx.test.ts) — pgTAP has
-- no network access. Everything here rolls back. Run: `supabase test db`.

begin;
select plan(15);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000fec01', 'fx-admin@test.dev',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000fec02', 'fx-stranger@test.dev', 'authenticated', 'authenticated');

insert into public.admins (email, role, added_by) values
  ('fx-admin@test.dev', 'super', 'test');

-- ── 1. non-admin cannot set a manual override ───────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000fec02","email":"fx-stranger@test.dev","role":"authenticated"}';
select throws_ok(
  $$select set_manual_fx_rate('CHF', '2026-07-04'::date, 0.95)$$,
  '42501', null, 'a non-admin cannot set a manual fx-rate override'
);
reset role;

-- ── 2. an admin can, and it lands tagged source=manual ──────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000fec01","email":"fx-admin@test.dev","role":"authenticated"}';
select lives_ok(
  $$select set_manual_fx_rate('CHF', '2026-07-04'::date, 0.95)$$,
  'an admin can set a manual fx-rate override'
);
reset role;

select is(
  (select source from fx_rates where quote_currency = 'CHF' and as_of = '2026-07-04'::date),
  'manual', 'the manual override row is tagged source=manual'
);

-- ── 3. idempotent upsert — a second call updates in place, no duplicate ─────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000fec01","email":"fx-admin@test.dev","role":"authenticated"}';
select lives_ok(
  $$select set_manual_fx_rate('CHF', '2026-07-04'::date, 0.97)$$,
  're-setting the same (currency, date) override updates it in place'
);
reset role;

select is(
  (select count(*)::int from fx_rates where quote_currency = 'CHF' and as_of = '2026-07-04'::date and source = 'manual'),
  1, 'exactly one manual row exists for that (currency, date) — no duplicate'
);
select is(
  (select rate from fx_rates where quote_currency = 'CHF' and as_of = '2026-07-04'::date and source = 'manual'),
  0.97, 'the override reflects the latest call, not the first'
);

-- ── 4. bad input rejected ────────────────────────────────────────────────────
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000fec01","email":"fx-admin@test.dev","role":"authenticated"}';
select throws_ok(
  $$select set_manual_fx_rate('CHF', '2026-07-05'::date, 0)$$,
  '22023', null, 'a zero/negative rate is rejected'
);
select throws_ok(
  $$select set_manual_fx_rate('XX', '2026-07-05'::date, 1.0)$$,
  '22023', null, 'a non-ISO (not 3-letter) currency code is rejected'
);
reset role;

-- ── 5. resolver precedence + gap-bridging ───────────────────────────────────
-- ECB snapshot: 07-01 and 07-03. Manual override already sits at 07-04 (0.97)
-- from step 2/3 above. No rows exist at all for JPY.
insert into fx_rates (base_currency, quote_currency, rate, as_of, source) values
  ('EUR', 'CHF', 0.93, '2026-07-01', 'ECB'),
  ('EUR', 'CHF', 0.94, '2026-07-03', 'ECB');

select is(
  round(resolve_fx_rate('CHF', 'EUR', '2026-07-03'::date), 6),
  round(1 / 0.94, 6),
  'with only ECB rows for that date, resolve_fx_rate uses the ECB snapshot'
);

select is(
  round(resolve_fx_rate('CHF', 'EUR', '2026-07-04'::date), 6),
  round(1 / 0.97, 6),
  'an exact-date manual override wins over the older ECB snapshot for that date'
);

select is(
  round(resolve_fx_rate('CHF', 'EUR', '2026-07-10'::date), 6),
  round(1 / 0.97, 6),
  'a manual row also serves as the general fallback for a later date with no newer rows (bridges a real gap)'
);

select ok(
  resolve_fx_rate('JPY', 'EUR', '2026-07-10'::date) is null,
  'a currency pair with no snapshot and no override still fails loud (NULL), never silently 1'
);

-- ── 6. the daily cron trigger never errors when the Vault secret is unset ───
-- (the CI test DB has no fx_rates_fetch_secret in vault.decrypted_secrets —
-- this is the exact "must never error the scheduler" path.)
select lives_ok(
  $$select fx_rates_trigger_fetch('daily')$$,
  'fx_rates_trigger_fetch() is a silent no-op (never raises) when the shared secret is unset'
);

-- ── 7. the feed's tunables are real config (CENTRAL-1), not inlined ─────────
select is(
  (get_fx_feed_config()->>'fx_feed_staleness_days_warn')::int,
  3, 'get_fx_feed_config() reads the seeded staleness threshold from platform_config'
);

update platform_config set behavior = behavior || '{"fx_feed_staleness_days_warn": 7}'::jsonb where id = true;
select is(
  (get_fx_feed_config()->>'fx_feed_staleness_days_warn')::int,
  7, 'raising the threshold in platform_config takes effect immediately, no redeploy'
);

select * from finish();
rollback;
