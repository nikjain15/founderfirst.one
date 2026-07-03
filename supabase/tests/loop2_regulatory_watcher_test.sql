-- LOOP-2 · regulatory-watcher DB-side contract (REG-1 pack).
--
-- The watcher (scripts/regulatory-watcher) produces a superseding seed row; the
-- loader applies it via supersede_filing_obligation(). This proves the DB half of
-- the acceptance list end-to-end:
--   A. An IN-KEY deadline change (same jurisdiction/entity/tax_year/obligation, a
--      later effective_from) supersedes correctly: the OLD row's window closes and
--      filing_obligations_for() returns OLD law before the change, NEW law after.
--   B. The one-active invariant holds — you can never leave two OPEN rows for a key
--      (the watcher relies on this so a half-applied change is impossible).
--   C. supersede_filing_obligation is service_role only (watcher/loader), never
--      callable by anon/authenticated — a forged actor cannot rewrite law.
-- Everything runs in a transaction and rolls back. Namespaced [LOOP2TEST].

begin;
select plan(8);

-- ── fixture: a state DOR deadline the watcher will later change (in-key) ──────
-- Use a synthetic jurisdiction so we never collide with seeded US-FED rows.
insert into filing_obligations
  (jurisdiction_code, entity_type, tax_year, obligation_key, kind, form_code, label,
   due_month, due_day, due_year_offset, effective_from, citation, source)
values
  ('LOOP2TEST-DOR', 'sole_prop', 2025, 'annual_return', 'annual_return', 'ST-1',
   'State annual return (old deadline 4/15)', 4, 15, 1, '2020-01-01',
   'https://example.gov/old', 'seed');

-- before any change: lookup returns the OLD deadline.
select is(
  (select due_day from filing_obligations_for('LOOP2TEST-DOR','sole_prop',2025,date '2025-06-01')
    where obligation_key = 'annual_return'),
  15, 'before change: filing_obligations_for returns the OLD deadline (4/15)');

-- ── A. apply a watcher-emitted supersession (deadline moves 4/15 → 5/1) ───────
select lives_ok($$
  select supersede_filing_obligation(
    'LOOP2TEST-DOR', 'sole_prop', 2025, 'annual_return',
    date '2026-01-01',
    jsonb_build_object(
      'kind','annual_return','form_code','ST-1',
      'label','State annual return (new deadline 5/1)',
      'due_month',5,'due_day',1,'due_year_offset',1),
    'https://example.gov/new-deadline-rule',
    'regulatory_watcher')
$$, 'watcher supersession applies in one transaction');

-- OLD period (as of a date inside the old window) still computes OLD law.
select is(
  (select due_day from filing_obligations_for('LOOP2TEST-DOR','sole_prop',2025,date '2025-06-01')
    where obligation_key = 'annual_return'),
  15, 'OLD period keeps OLD deadline (4/15) — old law preserved');

-- NEW period (as of a date inside the new window) computes NEW law.
select is(
  (select due_day from filing_obligations_for('LOOP2TEST-DOR','sole_prop',2025,date '2026-06-01')
    where obligation_key = 'annual_return'),
  1, 'NEW period computes NEW deadline (5/1) — superseding row in force');

-- the superseding row is stamped source = regulatory_watcher.
select is(
  (select source from filing_obligations
    where jurisdiction_code = 'LOOP2TEST-DOR' and effective_from = '2026-01-01'
      and obligation_key = 'annual_return'),
  'regulatory_watcher', 'superseding row is stamped source = regulatory_watcher');

-- the OLD row was closed (effective_to set), not overwritten.
select is(
  (select effective_to from filing_obligations
    where jurisdiction_code = 'LOOP2TEST-DOR' and effective_from = '2020-01-01'
      and obligation_key = 'annual_return'),
  date '2025-12-31', 'OLD row window closed the day before the new rule (not deleted)');

-- ── B. one-active invariant: cannot leave two OPEN rows for the key ───────────
select is(
  (select count(*) from filing_obligations
    where jurisdiction_code = 'LOOP2TEST-DOR' and obligation_key = 'annual_return'
      and effective_to is null and is_active),
  1::bigint, 'exactly one OPEN row remains after supersession (effective-dating invariant)');

-- ── C. supersede is service_role only — a forged actor cannot rewrite law ─────
set local role authenticated;
select throws_ok($$
  select supersede_filing_obligation(
    'LOOP2TEST-DOR','sole_prop',2025,'annual_return', date '2027-01-01',
    jsonb_build_object('kind','annual_return','label','forged','due_month',1,'due_day',1),
    'https://evil.example','regulatory_watcher')
$$, '42501', 'authenticated role CANNOT call supersede_filing_obligation (service_role only)');
reset role;

select * from finish();
rollback;
