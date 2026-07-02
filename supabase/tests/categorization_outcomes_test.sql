-- Categorization multi-model — Phase A foundation regression test.
-- Proves: the CPA label outweighs the owner label and SUPERSEDES it (truth flips),
-- primary_correct is recomputed against the authoritative label, and the scorecard
-- ranks models by accuracy on that truth. Everything rolls back.

begin;
select plan(8);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'ownerG@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'cpaG@test.dev',   'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000e3', 'business', 'Biz G', '00000000-0000-0000-0000-0000000000e1');
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'owner', 'active');
-- org_accounting_settings auto-seeds via the organizations trigger (do not insert).
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000000e3', '1000', 'Cash',     'asset'),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000000e3', '5100', 'Software', 'expense'),
  ('00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000000e3', '5200', 'Meals',    'expense');

-- a real posted entry to reference
create temp table _e as
select * from post_journal_entry(
  '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3',
  '2026-05-20', 'k-outcome',
  '[{"account_id":"00000000-0000-0000-0000-0000000e0002","amount_minor":500,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-0000000e0001","amount_minor":500,"side":"C"}]'::jsonb,
  'manual', null, 'ADOBE');

-- ── label-weight helper (gold/silver) ───────────────────────────────────────
select is(categorization_label_weight('cpa'),    1.0::numeric, 'CPA label weight is 1.0 (gold)');
select is(categorization_label_weight('owner'),  0.6::numeric, 'owner label weight is 0.6 (silver)');
select is(categorization_label_weight('robot'),  0.0::numeric, 'unknown role weight is 0 (not a fresh label)');

-- ── owner labels the txn to Software (Haiku was right, panel gpt was wrong) ───
select record_categorization_outcome(
  '00000000-0000-0000-0000-0000000000e3', (select id from _e),
  '{"anthropic/haiku":"00000000-0000-0000-0000-0000000e0002","openai/gpt-mini":"00000000-0000-0000-0000-0000000e0003"}'::jsonb,
  'anthropic/haiku', '00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000e0002',
  '00000000-0000-0000-0000-0000000000e1', 'owner');
select is(
  (select primary_correct from categorization_outcomes where entry_id = (select id from _e)),
  true, 'owner accepted the primary pick → primary_correct = true');

-- ── CPA later corrects to Meals → supersedes; truth flips; primary now wrong ──
select record_categorization_outcome(
  '00000000-0000-0000-0000-0000000000e3', (select id from _e),
  '{"anthropic/haiku":"00000000-0000-0000-0000-0000000e0002","openai/gpt-mini":"00000000-0000-0000-0000-0000000e0003"}'::jsonb,
  'anthropic/haiku', '00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000e0003',
  '00000000-0000-0000-0000-0000000000e2', 'cpa');
select is(
  (select approved_account_id from categorization_outcomes where entry_id = (select id from _e)),
  '00000000-0000-0000-0000-0000000e0003'::uuid, 'CPA correction supersedes → truth is now Meals');
select is(
  (select label_weight from categorization_outcomes where entry_id = (select id from _e)),
  1.0::numeric, 'label weight upgraded to CPA (gold)');
select is(
  (select primary_correct from categorization_outcomes where entry_id = (select id from _e)),
  false, 'primary (Haiku) is now wrong against the authoritative CPA label');

-- ── scorecard ranks the panel model above Haiku on this truth ────────────────
select is(
  (select round(accuracy_weighted, 2) from categorization_model_scorecard where model_id = 'openai/gpt-mini'),
  1.00::numeric, 'the panel model that matched the CPA truth scores 100%');

select * from finish();
rollback;
