-- Phase 2 ledger WRITE-PATH gate (ARCHITECTURE.md §6.1, §6.2, §C2).
-- Exercises post_journal_entry / reverse_journal_entry / approve_journal_entry
-- and the period + account write helpers through every invariant:
--   balanced · idempotent · authorized (full vs read_only vs none) · accounts in
--   org · period-open (auto-create / closed-locked) · append-only reversal ·
--   immutable lines · CPA approval workflow.
--
-- Run locally: `supabase test db`.
--
-- Technique: the write functions take an explicit p_actor (the edge function
-- passes the JWT-verified caller; auth.uid() is null under the service role) and
-- are SECURITY DEFINER, so the test calls them directly as the (superuser) test
-- role with each actor passed in — no SET ROLE needed. Returned rows are captured
-- into temp tables; assertions run against them. Everything rolls back.

begin;
select plan(21);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'ownerA@test.dev',        'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'ownerB@test.dev',        'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'cpaAdmin@test.dev',      'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'cpaAssigned@test.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'cpaUnassigned@test.dev', 'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz A',  '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b2', 'business', 'Biz B',  '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-0000000000f1', 'firm',     'Firm F', '00000000-0000-0000-0000-0000000000a1');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner',      'active'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2', 'owner',      'active'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f1', 'cpa',        'active'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000f1', 'cpa',        'active');

-- Firm F engages Biz A (full, cpaAssigned assigned) and Biz B (read_only).
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1', 'active', 'full',      '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2', 'active', 'read_only', '00000000-0000-0000-0000-0000000000a1');

insert into client_assignments (engagement_id, user_id, assigned_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'USD'),
  ('00000000-0000-0000-0000-0000000000b2', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

-- chart of accounts (Biz A: cash, revenue, expense; Biz B: cash — for cross-org test)
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', '1000', 'Cash A',    'asset'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', '4000', 'Revenue A', 'income'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000b1', '5000', 'Expense A', 'expense'),
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000b2', '1000', 'Cash B',    'asset');

-- a pre-closed period in Biz A (Dec 2025) for the closed-period test
insert into accounting_periods (id, org_id, period_start, period_end, status) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000b1', '2025-12-01', '2025-12-31', 'closed');

-- ── 1–3. owner posts a balanced 2-line entry (auto-creates the Jan period) ────
create temp table _e1 as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-00000000000a',
  p_org   => '00000000-0000-0000-0000-0000000000b1',
  p_entry_date => '2026-01-15',
  p_idempotency_key => 'k-e1',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":10000,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-00000000c002","amount_minor":10000,"side":"C"}]'::jsonb
);
select is((select status::text from _e1), 'posted', 'owner posts a balanced entry → posted');
select is((select count(*)::int from journal_lines where entry_id = (select id from _e1)), 2, 'entry has its two lines');
select is((select count(*)::int from journal_entries where org_id = '00000000-0000-0000-0000-0000000000b1'), 1, 'one entry in Biz A');

-- ── 4–5. idempotent replay returns the original, never double-posts ──────────
create temp table _e1b as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-00000000000a',
  p_org   => '00000000-0000-0000-0000-0000000000b1',
  p_entry_date => '2026-01-15',
  p_idempotency_key => 'k-e1',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":10000,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-00000000c002","amount_minor":10000,"side":"C"}]'::jsonb
);
select is((select id from _e1b), (select id from _e1), 'idempotent replay returns the original entry');
select is((select count(*)::int from journal_entries where org_id = '00000000-0000-0000-0000-0000000000b1'), 1, 'replay did not double-post');

-- ── 6. unbalanced entry rejected ─────────────────────────────────────────────
select throws_ok($$
  select post_journal_entry(
    p_actor => '00000000-0000-0000-0000-00000000000a',
    p_org   => '00000000-0000-0000-0000-0000000000b1',
    p_entry_date => '2026-01-16', p_idempotency_key => 'k-unbal',
    p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":10000,"side":"D"},
                 {"account_id":"00000000-0000-0000-0000-00000000c002","amount_minor":9000,"side":"C"}]'::jsonb)
$$, '23514', NULL, 'unbalanced entry rejected (debits <> credits)');

-- ── 7. line referencing another org''s account rejected ──────────────────────
select throws_ok($$
  select post_journal_entry(
    p_actor => '00000000-0000-0000-0000-00000000000a',
    p_org   => '00000000-0000-0000-0000-0000000000b1',
    p_entry_date => '2026-01-16', p_idempotency_key => 'k-cross',
    p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":10000,"side":"D"},
                 {"account_id":"00000000-0000-0000-0000-00000000d001","amount_minor":10000,"side":"C"}]'::jsonb)
$$, '23503', NULL, 'cross-org account rejected');

-- ── 8. unassigned CPA cannot post ────────────────────────────────────────────
select throws_ok($$
  select post_journal_entry(
    p_actor => '00000000-0000-0000-0000-0000000000a3',
    p_org   => '00000000-0000-0000-0000-0000000000b1',
    p_entry_date => '2026-01-16', p_idempotency_key => 'k-unassigned',
    p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":10000,"side":"D"},
                 {"account_id":"00000000-0000-0000-0000-00000000c002","amount_minor":10000,"side":"C"}]'::jsonb)
$$, '42501', NULL, 'unassigned CPA forbidden');

-- ── 9. firm_admin cannot post to a read_only client ──────────────────────────
select throws_ok($$
  select post_journal_entry(
    p_actor => '00000000-0000-0000-0000-0000000000a1',
    p_org   => '00000000-0000-0000-0000-0000000000b2',
    p_entry_date => '2026-01-16', p_idempotency_key => 'k-readonly',
    p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000d001","amount_minor":10000,"side":"D"},
                 {"account_id":"00000000-0000-0000-0000-00000000d001","amount_minor":10000,"side":"C"}]'::jsonb)
$$, '42501', NULL, 'firm_admin forbidden on a read_only client');

-- ── 10. assigned full CPA can post ───────────────────────────────────────────
create temp table _e2 as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-0000000000a2',
  p_org   => '00000000-0000-0000-0000-0000000000b1',
  p_entry_date => '2026-01-17', p_idempotency_key => 'k-cpa',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c003","amount_minor":2500,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":2500,"side":"C"}]'::jsonb
);
select is((select status::text from _e2), 'posted', 'assigned full CPA can post');

-- ── 11. posting into a closed period rejected ────────────────────────────────
select throws_ok($$
  select post_journal_entry(
    p_actor => '00000000-0000-0000-0000-00000000000a',
    p_org   => '00000000-0000-0000-0000-0000000000b1',
    p_entry_date => '2025-12-15', p_idempotency_key => 'k-closed',
    p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":10000,"side":"D"},
                 {"account_id":"00000000-0000-0000-0000-00000000c002","amount_minor":10000,"side":"C"}]'::jsonb)
$$, '23001', NULL, 'posting into a closed period rejected');

-- ── 12. posting auto-created an OPEN monthly period for January ───────────────
select is(
  (select count(*)::int from accounting_periods
   where org_id = '00000000-0000-0000-0000-0000000000b1'
     and '2026-01-15' between period_start and period_end and status = 'open'),
  1, 'posting auto-created an open monthly period');

-- ── 13–15. reverse the first entry (append-only correction) ──────────────────
create temp table _rev as
select * from reverse_journal_entry(
  p_actor => '00000000-0000-0000-0000-00000000000a',
  p_org   => '00000000-0000-0000-0000-0000000000b1',
  p_entry_id => (select id from _e1),
  p_idempotency_key => 'k-rev',
  p_entry_date => '2026-02-10'
);
select is((select reverses_id from _rev), (select id from _e1), 'reversal references the original entry');
select is((select status::text from journal_entries where id = (select id from _e1)), 'reversed', 'original entry marked reversed');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end), 0)::int
   from journal_lines
   where account_id = '00000000-0000-0000-0000-00000000c001'
     and entry_id in ((select id from _e1), (select id from _rev))),
  0, 'reversal flips D/C so the account nets to zero');

-- ── 16. an already-reversed entry cannot be reversed again ───────────────────
select throws_ok($$
  select reverse_journal_entry(
    p_actor => '00000000-0000-0000-0000-00000000000a',
    p_org   => '00000000-0000-0000-0000-0000000000b1',
    p_entry_id => (select id from _e1),
    p_idempotency_key => 'k-rev-2')
$$, '23001', NULL, 'double-reversal rejected');

-- ── 17. journal_lines are immutable ──────────────────────────────────────────
select throws_ok($$
  update journal_lines set amount_minor = 1 where entry_id = (select id from _e2)
$$, '23001', NULL, 'journal_lines are immutable (append-only)');

-- ── 18–21. CPA approval workflow (flag default off; turn it on for Biz A) ─────
update org_accounting_settings set cpa_posts_require_approval = true
  where org_id = '00000000-0000-0000-0000-0000000000b1';

create temp table _ap as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-0000000000a2',
  p_org   => '00000000-0000-0000-0000-0000000000b1',
  p_entry_date => '2026-03-05', p_idempotency_key => 'k-appr',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c003","amount_minor":500,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":500,"side":"C"}]'::jsonb
);
select is((select status::text from _ap), 'pending_review', 'CPA post lands pending_review when approval required');

create temp table _ap_member as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-00000000000a',
  p_org   => '00000000-0000-0000-0000-0000000000b1',
  p_entry_date => '2026-03-06', p_idempotency_key => 'k-appr-member',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c003","amount_minor":500,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":500,"side":"C"}]'::jsonb
);
select is((select status::text from _ap_member), 'posted', 'a business member posts directly even when approval required');

create temp table _approved as
select * from approve_journal_entry(
  p_actor => '00000000-0000-0000-0000-00000000000a',
  p_org   => '00000000-0000-0000-0000-0000000000b1',
  p_entry_id => (select id from _ap)
);
select is((select status::text from _approved), 'posted', 'owner approves a pending CPA entry → posted');

create temp table _ap2 as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-0000000000a2',
  p_org   => '00000000-0000-0000-0000-0000000000b1',
  p_entry_date => '2026-03-07', p_idempotency_key => 'k-appr-3',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000c003","amount_minor":500,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":500,"side":"C"}]'::jsonb
);
select throws_ok($$
  select approve_journal_entry(
    p_actor => '00000000-0000-0000-0000-0000000000a2',
    p_org   => '00000000-0000-0000-0000-0000000000b1',
    p_entry_id => (select id from _ap2))
$$, '42501', NULL, 'a CPA cannot self-approve their own pending entry');

select * from finish();
rollback;
