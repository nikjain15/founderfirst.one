-- REG-1 regression pack v1 — consolidated finding-id-mapped scenarios.
--
-- One scenario per confirmed P0/P1 across the 15 stress features, labelled with the
-- finding id so docs/stress/SCENARIOS.md maps finding → scenario 1:1 and the suite can
-- only ever GROW (nothing that broke once can silently re-break). Several findings also
-- have coverage inside their phase-* test; this file is the single auditable index and
-- adds the assertions that had no home.
--
-- Covered here (see SCENARIOS.md for the full map incl. phase-test-covered rows):
--   ISO-F1    forged-actor RPC write blocked — p_actor with no membership (P0)
--   JE-F1     reverse_journal_entry double-reversal rejected (P0, FOR UPDATE)
--   PERIOD-F1 posting into a closed period rejected (close-vs-post lock)
--   CAT-F4    LIKE-wildcard rule poisoning neutralised (P1, ESCAPE)
--
-- Run locally: `supabase test db`. Everything rolls back.

begin;
select plan(6);

-- ── fixtures (namespaced [REGTEST]) ──────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000d0001', 'owner@regtest.dev',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d0002', 'stranger@regtest.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000e0001', 'business', 'REG Biz', '00000000-0000-0000-0000-0000000d0001');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000e0001', 'owner', 'active');
-- NB: stranger d0002 has NO membership anywhere → used for the forged-actor test.

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000e0001', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-000000f00001', '00000000-0000-0000-0000-0000000e0001', '1000', 'Cash',    'asset'),
  ('00000000-0000-0000-0000-000000f00002', '00000000-0000-0000-0000-0000000e0001', '4000', 'Revenue', 'income');

-- a pre-closed period (for PERIOD-F1)
insert into accounting_periods (id, org_id, period_start, period_end, status) values
  ('00000000-0000-0000-0000-000000ac0001', '00000000-0000-0000-0000-0000000e0001', '2025-12-01', '2025-12-31', 'closed');

-- a posted entry to reverse (for JE-F1)
create temp table _base as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-0000000d0001',
  p_org   => '00000000-0000-0000-0000-0000000e0001',
  p_entry_date => '2026-01-10', p_idempotency_key => 'reg-base',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-000000f00001","amount_minor":900,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-000000f00002","amount_minor":900,"side":"C"}]'::jsonb);

-- ── ISO-F1: a forged p_actor (no membership) cannot write (P0) ───────────────
-- The headline isolation finding: SECURITY DEFINER RPCs took p_actor first and were
-- EXECUTE-granted to anon/authenticated, so a caller could forge any actor and write
-- any tenant. Post-fix the write-path authorises p_actor against membership.
select throws_ok($$
  select post_journal_entry(
    p_actor => '00000000-0000-0000-0000-0000000d0002',
    p_org   => '00000000-0000-0000-0000-0000000e0001',
    p_entry_date => '2026-01-11', p_idempotency_key => 'reg-forge',
    p_lines => '[{"account_id":"00000000-0000-0000-0000-000000f00001","amount_minor":100,"side":"D"},
                 {"account_id":"00000000-0000-0000-0000-000000f00002","amount_minor":100,"side":"C"}]'::jsonb)
$$, '42501', NULL, 'ISO-F1: forged actor (no membership) cannot post to a tenant');

-- ── JE-F1: an already-reversed entry cannot be reversed again (P0) ───────────
-- Reverse once (succeeds), then a second reverse of the same entry must be rejected —
-- the invariant the FOR UPDATE lock protects against concurrent double-reversal.
create temp table _rev as
select * from reverse_journal_entry(
  p_actor => '00000000-0000-0000-0000-0000000d0001',
  p_org   => '00000000-0000-0000-0000-0000000e0001',
  p_entry_id => (select id from _base), p_idempotency_key => 'reg-rev-1');
select is((select status::text from journal_entries where id = (select id from _base)),
  'reversed', 'JE-F1: first reversal marks the original reversed');
select throws_ok($$
  select reverse_journal_entry(
    p_actor => '00000000-0000-0000-0000-0000000d0001',
    p_org   => '00000000-0000-0000-0000-0000000e0001',
    p_entry_id => (select id from _base), p_idempotency_key => 'reg-rev-2')
$$, '23001', NULL, 'JE-F1: an already-reversed entry cannot be reversed again (double-reversal blocked)');

-- ── PERIOD-F1: posting into a closed period is rejected ──────────────────────
select throws_ok($$
  select post_journal_entry(
    p_actor => '00000000-0000-0000-0000-0000000d0001',
    p_org   => '00000000-0000-0000-0000-0000000e0001',
    p_entry_date => '2025-12-15', p_idempotency_key => 'reg-closed',
    p_lines => '[{"account_id":"00000000-0000-0000-0000-000000f00001","amount_minor":100,"side":"D"},
                 {"account_id":"00000000-0000-0000-0000-000000f00002","amount_minor":100,"side":"C"}]'::jsonb)
$$, '23001', NULL, 'PERIOD-F1: posting into a closed period rejected (close-vs-post lock)');

-- ── CAT-F4: a learned rule value with a LIKE metacharacter matches LITERALLY ─
-- A memo of '100%' once stored a rule matching ANYTHING (the % is a wildcard). After
-- the ESCAPE fix, the rule only matches descriptions that literally contain '100%'.
-- match_value is stored normalised (lower/trim); the metachar is the payload.
insert into categorization_rules (org_id, match_type, match_value, account_id, source, created_by)
values ('00000000-0000-0000-0000-0000000e0001', 'description_contains', '100%',
        '00000000-0000-0000-0000-000000f00002', 'human', '00000000-0000-0000-0000-0000000d0001')
on conflict do nothing;
-- A discriminating description: 'invoice 1000 paid' contains "100" but NOT the literal
-- "100%". Pre-fix the pattern was '%100%%' (the value's % a wildcard) so the trailing
-- "0 paid" was swallowed and this MATCHED (poison); post-fix the % is escaped to '\%'
-- so only a literal "100%" matches → this must be NULL. This is the fail-before case:
-- with the ESCAPE reverted, this assertion goes RED.
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000e0001', 'invoice 1000 paid'),
  NULL, 'CAT-F4: a "100%" rule does not wildcard-match "invoice 1000 paid" (% is escaped, not a wildcard)');
-- the literal string still matches
select is(
  match_categorization_rule('00000000-0000-0000-0000-0000000e0001', 'refund 100% of order'),
  '00000000-0000-0000-0000-000000f00002'::uuid,
  'CAT-F4: the "100%" rule still matches a description literally containing it');

select * from finish();
rollback;
