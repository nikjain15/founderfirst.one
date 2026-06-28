-- Phase 2 ledger invariants gate (ARCHITECTURE.md §6.1, §C6). Proves the money
-- guarantees at the DB level: balanced double-entry, idempotency, append-only.
-- Run locally: `supabase test db`.

begin;
select plan(8);

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('50000000-0000-0000-0000-000000000001', 'ledger@test.dev', 'authenticated', 'authenticated');
insert into organizations (id, type, name, created_by) values
  ('50000000-0000-0000-0000-0000000000a0', 'business', 'Ledger Co', '50000000-0000-0000-0000-000000000001');
insert into accounting_periods (id, org_id, period_start, period_end, status) values
  ('50000000-0000-0000-0000-0000000000b0', '50000000-0000-0000-0000-0000000000a0', '2026-01-01', '2026-12-31', 'open');
insert into ledger_accounts (id, org_id, name, type) values
  ('50000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000a0', 'Cash', 'asset'),
  ('50000000-0000-0000-0000-0000000000c2', '50000000-0000-0000-0000-0000000000a0', 'Sales', 'income');

-- helper: insert a posted entry header
create or replace function _mk_entry(p_id uuid, p_key text) returns void language sql as $$
  insert into journal_entries (id, org_id, entry_date, period_id, source, idempotency_key, posted_by)
  values (p_id, '50000000-0000-0000-0000-0000000000a0', '2026-03-01',
          '50000000-0000-0000-0000-0000000000b0', 'manual', p_key,
          '50000000-0000-0000-0000-000000000001');
$$;

-- ── 1. a balanced entry commits ──────────────────────────────────────────────
select lives_ok($$
  select _mk_entry('50000000-0000-0000-0000-0000000000d1', 'k1');
  insert into journal_lines (entry_id, org_id, account_id, amount_minor, side) values
    ('50000000-0000-0000-0000-0000000000d1','50000000-0000-0000-0000-0000000000a0','50000000-0000-0000-0000-0000000000c1', 10000, 'D'),
    ('50000000-0000-0000-0000-0000000000d1','50000000-0000-0000-0000-0000000000a0','50000000-0000-0000-0000-0000000000c2', 10000, 'C');
  set constraints journal_lines_balanced immediate;
$$, 'balanced entry (debits = credits) is accepted');
set constraints all deferred;

-- ── 2. an unbalanced entry is rejected ───────────────────────────────────────
select throws_ok($$
  select _mk_entry('50000000-0000-0000-0000-0000000000d2', 'k2');
  insert into journal_lines (entry_id, org_id, account_id, amount_minor, side) values
    ('50000000-0000-0000-0000-0000000000d2','50000000-0000-0000-0000-0000000000a0','50000000-0000-0000-0000-0000000000c1', 10000, 'D'),
    ('50000000-0000-0000-0000-0000000000d2','50000000-0000-0000-0000-0000000000a0','50000000-0000-0000-0000-0000000000c2',  9999, 'C');
  set constraints journal_lines_balanced immediate;
$$, '23514', NULL, 'unbalanced entry (debits <> credits) is rejected');
set constraints all deferred;

-- ── 3. idempotency: duplicate (org_id, idempotency_key) rejected ──────────────
select throws_ok($$
  select _mk_entry('50000000-0000-0000-0000-0000000000d3', 'k1');
$$, '23505', NULL, 'duplicate idempotency_key per org is rejected');

-- ── 4. journal_lines are immutable (no UPDATE) ───────────────────────────────
select throws_ok($$
  update journal_lines set memo = 'tamper' where entry_id = '50000000-0000-0000-0000-0000000000d1';
$$, NULL, 'journal_lines cannot be updated (append-only)');

-- ── 5. journal_lines are immutable (no DELETE) ───────────────────────────────
select throws_ok($$
  delete from journal_lines where entry_id = '50000000-0000-0000-0000-0000000000d1';
$$, NULL, 'journal_lines cannot be deleted (append-only)');

-- ── 6. journal_entries cannot be deleted ─────────────────────────────────────
select throws_ok($$
  delete from journal_entries where id = '50000000-0000-0000-0000-0000000000d1';
$$, NULL, 'journal_entries cannot be deleted (append-only)');

-- ── 7. journal_entries financial fields are immutable ────────────────────────
select throws_ok($$
  update journal_entries set entry_date = '2026-04-01' where id = '50000000-0000-0000-0000-0000000000d1';
$$, NULL, 'journal_entries financial fields are immutable');

-- ── 8. journal_entries status/approval workflow may change ───────────────────
select lives_ok($$
  update journal_entries set status = 'reversed' where id = '50000000-0000-0000-0000-0000000000d1';
$$, 'journal_entries status may transition (approval/reversal workflow)');

select * from finish();
rollback;
