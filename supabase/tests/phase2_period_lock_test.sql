-- Period-lock HARDENING gate ([stress:periods] audit; ARCHITECTURE.md §6.2).
-- Guards the three fixes in 20260702000000_reconcile_period_journal_locks.sql:
--   F1 ensure_open_period takes a FOR SHARE row lock (close-vs-post race).
--   F2 approve_journal_entry refuses to finalize an entry into a CLOSED period.
--   F3 reverse_journal_entry's default path rolls forward to an OPEN period so a
--      reversal is never impossible after the current month is closed.
--
-- Run locally: `supabase test db`. Dates are current_date-relative so the test is
-- stable regardless of when it runs (the auto-created period is "this month").

begin;
select plan(9);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000d10a', 'plOwner@test.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d1a1', 'plFirm@test.dev',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d1a2', 'plCpa@test.dev',   'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-00000000d1b1', 'business', 'PL Biz',  '00000000-0000-0000-0000-00000000d10a'),
  ('00000000-0000-0000-0000-00000000d1f1', 'firm',     'PL Firm', '00000000-0000-0000-0000-00000000d1a1');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000d10a', '00000000-0000-0000-0000-00000000d1b1', 'owner',      'active'),
  ('00000000-0000-0000-0000-00000000d1a1', '00000000-0000-0000-0000-00000000d1f1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-00000000d1a2', '00000000-0000-0000-0000-00000000d1f1', 'cpa',        'active');

insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-00000000d1e1', '00000000-0000-0000-0000-00000000d1f1', '00000000-0000-0000-0000-00000000d1b1', 'active', 'full', '00000000-0000-0000-0000-00000000d1a1');
insert into client_assignments (engagement_id, user_id, assigned_by) values
  ('00000000-0000-0000-0000-00000000d1e1', '00000000-0000-0000-0000-00000000d1a2', '00000000-0000-0000-0000-00000000d1a1');

-- approval required so the CPA's posts land pending_review
-- (org creation auto-seeds a settings row, so upsert rather than insert)
insert into org_accounting_settings (org_id, home_currency, cpa_posts_require_approval) values
  ('00000000-0000-0000-0000-00000000d1b1', 'USD', true)
  on conflict (org_id) do update set
    home_currency = excluded.home_currency,
    cpa_posts_require_approval = excluded.cpa_posts_require_approval;

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000d1c1', '00000000-0000-0000-0000-00000000d1b1', '1000', 'Cash',    'asset'),
  ('00000000-0000-0000-0000-00000000d1c2', '00000000-0000-0000-0000-00000000d1b1', '4000', 'Revenue', 'income');

-- ── F1: the period read takes a FOR SHARE row lock (close-vs-post race fix) ───
select matches(
  lower(pg_get_functiondef('ensure_open_period(uuid,date)'::regprocedure)),
  'for share',
  'F1: ensure_open_period locks the covering period FOR SHARE');

-- the combined reverse keeps the sibling's FOR UPDATE on the original entry
-- (double-reversal P0) so this migration never regresses 20260630130000.
select matches(
  lower(pg_get_functiondef('reverse_journal_entry(uuid,uuid,uuid,text,date,text)'::regprocedure)),
  'for update',
  'reverse_journal_entry locks the original entry FOR UPDATE (no double-reversal)');

-- CPA posts two pending entries dated THIS month (auto-creates this month, open).
create temp table _p1 as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-00000000d1a2',
  p_org   => '00000000-0000-0000-0000-00000000d1b1',
  p_entry_date => current_date, p_idempotency_key => 'pl-p1',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000d1c1","amount_minor":1000,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-00000000d1c2","amount_minor":1000,"side":"C"}]'::jsonb);
create temp table _p2 as
select * from post_journal_entry(
  p_actor => '00000000-0000-0000-0000-00000000d1a2',
  p_org   => '00000000-0000-0000-0000-00000000d1b1',
  p_entry_date => current_date, p_idempotency_key => 'pl-p2',
  p_lines => '[{"account_id":"00000000-0000-0000-0000-00000000d1c1","amount_minor":2000,"side":"D"},
               {"account_id":"00000000-0000-0000-0000-00000000d1c2","amount_minor":2000,"side":"C"}]'::jsonb);
select is((select status::text from _p1), 'pending_review', 'F1-regression: post auto-creates an open period & lands pending');

-- ── F2: approve into an OPEN period works; into a CLOSED period is refused ────
create temp table _ap1 as
select * from approve_journal_entry(
  p_actor => '00000000-0000-0000-0000-00000000d10a',
  p_org   => '00000000-0000-0000-0000-00000000d1b1',
  p_entry_id => (select id from _p1));
select is((select status::text from _ap1), 'posted', 'F2: approve into an OPEN period → posted');

-- close THIS month's period (the one both entries live in)
select close_accounting_period(
  '00000000-0000-0000-0000-00000000d10a',
  '00000000-0000-0000-0000-00000000d1b1',
  (select period_id from _p2));

select throws_ok($$
  select approve_journal_entry(
    p_actor => '00000000-0000-0000-0000-00000000d10a',
    p_org   => '00000000-0000-0000-0000-00000000d1b1',
    p_entry_id => (select id from _p2))
$$, '23001', NULL, 'F2: approving an entry in a CLOSED period is refused');

-- ── F3: reverse with the default date rolls forward to an open period ─────────
-- _p1 is 'posted' and sits in the now-CLOSED current month. Reversing it with no
-- explicit date must NOT fail — it rolls forward to the next open month.
create temp table _rev as
select * from reverse_journal_entry(
  p_actor => '00000000-0000-0000-0000-00000000d10a',
  p_org   => '00000000-0000-0000-0000-00000000d1b1',
  p_entry_id => (select id from _p1),
  p_idempotency_key => 'pl-rev');
select is((select status::text from _rev), 'posted', 'F3: reverse-after-close succeeds (rolls forward, not 409)');
select is(
  (select ap.status::text from accounting_periods ap where ap.id = (select period_id from _rev)),
  'open', 'F3: the reversal landed in an OPEN period');
select ok(
  (select entry_date from _rev) > (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  'F3: the reversal date rolled past the closed current month');
select is((select status::text from journal_entries where id = (select id from _p1)), 'reversed',
  'F3: the original entry is marked reversed');

select * from finish();
rollback;
