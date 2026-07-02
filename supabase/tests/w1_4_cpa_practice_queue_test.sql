-- W1.4 · CPA Practice home — cross-client work queue (APP_PRINCIPLES §3).
-- REG scenario id: W1.4-QUEUE.
--
-- cpa_practice_queue / cpa_client_counts return ONE ranked list across every
-- client a firm member can access, from real ledger data only, and NEVER leak a
-- client the member can't read. This test seeds a firm with TWO clients (+ a
-- third firm's client for isolation), a firm_admin (sees all clients) and a
-- regular CPA (sees only assigned clients), then asserts ranking, counts,
-- access, and isolation. All rolls back.

begin;
select plan(15);

-- ── users ────────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'admin@firm.dev',   'authenticated', 'authenticated'),  -- firm_admin
  ('00000000-0000-0000-0000-0000000000f2', 'cpa@firm.dev',     'authenticated', 'authenticated'),  -- assigned CPA
  ('00000000-0000-0000-0000-0000000000f9', 'other@firm9.dev',  'authenticated', 'authenticated');  -- other firm

-- ── orgs: firm F + clients A,B; firm F9 + client C ───────────────────────────
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000F0', 'firm',     'Firm F',     '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-00000000000A', 'business', 'Client A',   '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-00000000000B', 'business', 'Client B',   '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000F9', 'firm',     'Firm 9',     '00000000-0000-0000-0000-0000000000f9'),
  ('00000000-0000-0000-0000-00000000000C', 'business', 'Client C',   '00000000-0000-0000-0000-0000000000f9');

-- ── memberships: admin=firm_admin, cpa=cpa, other=firm_admin of F9 ───────────
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000F0', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000F0', 'cpa',        'active'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000F9', 'firm_admin', 'active');

-- ── engagements: F→A (full), F→B (read_only); F9→C (full) ────────────────────
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000F0', '00000000-0000-0000-0000-00000000000A', 'active', 'full',      '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000F0', '00000000-0000-0000-0000-00000000000B', 'active', 'read_only', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000F9', '00000000-0000-0000-0000-00000000000C', 'active', 'full',      '00000000-0000-0000-0000-0000000000f9');

-- regular CPA is assigned ONLY to client A.
insert into client_assignments (engagement_id, user_id, assigned_by) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1');

-- ── ledger fixtures: an Uncategorized (9999) account per client ───────────────
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000009A9', '00000000-0000-0000-0000-00000000000A', '9999', 'Uncategorized', 'expense'),
  ('00000000-0000-0000-0000-0000000009B9', '00000000-0000-0000-0000-00000000000B', '9999', 'Uncategorized', 'expense'),
  ('00000000-0000-0000-0000-0000000001A1', '00000000-0000-0000-0000-00000000000A', '1000', 'Cash',          'asset');

-- periods (one open + past-due per client → an "upcoming close" item)
insert into accounting_periods (id, org_id, period_start, period_end, status) values
  ('00000000-0000-0000-0000-0000000000A1', '00000000-0000-0000-0000-00000000000A', date '2026-05-01', date '2026-05-31', 'open'),
  ('00000000-0000-0000-0000-0000000000B1', '00000000-0000-0000-0000-00000000000B', date '2026-05-01', date '2026-05-31', 'open');

-- Client A: 1 pending_review + 1 uncategorized(posted on 9999) + 1 unreconciled import + 1 past close
insert into journal_entries (id, org_id, entry_date, period_id, status, source, idempotency_key, posted_by, created_at) values
  ('00000000-0000-0000-0000-00000000A001', '00000000-0000-0000-0000-00000000000A', date '2026-05-10', '00000000-0000-0000-0000-0000000000A1', 'pending_review', 'manual', 'a-pr-1', '00000000-0000-0000-0000-0000000000f1', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000A002', '00000000-0000-0000-0000-00000000000A', date '2026-05-11', '00000000-0000-0000-0000-0000000000A1', 'posted',         'csv',    'a-uc-1', '00000000-0000-0000-0000-0000000000f1', now() - interval '1 day');
insert into journal_lines (entry_id, org_id, account_id, amount_minor, side) values
  ('00000000-0000-0000-0000-00000000A001', '00000000-0000-0000-0000-00000000000A', '00000000-0000-0000-0000-0000000001A1', 5000, 'D'),
  ('00000000-0000-0000-0000-00000000A002', '00000000-0000-0000-0000-00000000000A', '00000000-0000-0000-0000-0000000009A9', 5000, 'D');
insert into import_batches (id, org_id, source, status, created_by) values
  ('00000000-0000-0000-0000-00000000A0B1', '00000000-0000-0000-0000-00000000000A', 'csv', 'previewed', '00000000-0000-0000-0000-0000000000f1');

-- Client B: 1 uncategorized(posted on 9999) + 1 past close (no pending_review)
insert into journal_entries (id, org_id, entry_date, period_id, status, source, idempotency_key, posted_by, created_at) values
  ('00000000-0000-0000-0000-00000000B001', '00000000-0000-0000-0000-00000000000B', date '2026-05-12', '00000000-0000-0000-0000-0000000000B1', 'posted', 'csv', 'b-uc-1', '00000000-0000-0000-0000-0000000000f1', now());
insert into journal_lines (entry_id, org_id, account_id, amount_minor, side) values
  ('00000000-0000-0000-0000-00000000B001', '00000000-0000-0000-0000-00000000000B', '00000000-0000-0000-0000-0000000009B9', 3000, 'D');

-- ════════════════════════════════════════════════════════════════════════════
-- firm_admin: sees BOTH clients, ranked across them
-- ════════════════════════════════════════════════════════════════════════════
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f1","email":"admin@firm.dev","role":"authenticated"}';

select is(
  (select count(distinct client_org_id)::int from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')),
  2, 'firm_admin sees both firm clients in the counts');

-- Client A has pending_review(1)+uncategorized(1)+unreconciled(1)+close(1) = 4
select is(
  (select total::int from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')
     where client_org_id = '00000000-0000-0000-0000-00000000000A'),
  4, 'Client A total counts all four item kinds');

select is(
  (select pending_review::int from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')
     where client_org_id = '00000000-0000-0000-0000-00000000000A'),
  1, 'Client A has one pending_review');
select is(
  (select uncategorized::int from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')
     where client_org_id = '00000000-0000-0000-0000-00000000000B'),
  1, 'Client B has one uncategorized');
select is(
  (select unreconciled::int from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')
     where client_org_id = '00000000-0000-0000-0000-00000000000A'),
  1, 'Client A has one unreconciled (previewed import)');
select is(
  (select upcoming_close::int from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')
     where client_org_id = '00000000-0000-0000-0000-00000000000B'),
  1, 'Client B has one past-due open period (upcoming close)');
select is(
  (select flagged::int from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')
     where client_org_id = '00000000-0000-0000-0000-00000000000A'),
  0, 'flagged is 0 (reserved for W1.5)');

-- Queue ranks across clients: pending_review (rank 1) must come before any close.
select is(
  (select kind from cpa_practice_queue('00000000-0000-0000-0000-0000000000F0') order by rank, occurred_at limit 1),
  'pending_review', 'top of the cross-client queue is the pending_review item');

select ok(
  (select min(rank) from cpa_practice_queue('00000000-0000-0000-0000-0000000000F0') where kind = 'pending_review')
   < (select min(rank) from cpa_practice_queue('00000000-0000-0000-0000-0000000000F0') where kind = 'upcoming_close'),
  'pending_review outranks upcoming_close in the ranked queue');

-- Queue spans BOTH clients (not one client's list).
select is(
  (select count(distinct client_org_id)::int from cpa_practice_queue('00000000-0000-0000-0000-0000000000F0')),
  2, 'the queue spans both clients');

-- Every unreconciled row routes to the Import surface (≤2-tap resolution target).
select is(
  (select surface from cpa_practice_queue('00000000-0000-0000-0000-0000000000F0') where kind = 'unreconciled' limit 1),
  'import', 'unreconciled routes to the Import surface');
select is(
  (select surface from cpa_practice_queue('00000000-0000-0000-0000-0000000000F0') where kind = 'uncategorized' limit 1),
  'review', 'uncategorized routes to the Categorize (review) surface');

-- access is carried through so read_only clients render no mutate CTA.
select is(
  (select access::text from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')
     where client_org_id = '00000000-0000-0000-0000-00000000000B'),
  'read_only', 'Client B engagement access is read_only (drives the UI CTA gate)');

-- ════════════════════════════════════════════════════════════════════════════
-- regular CPA (assigned to A only): sees ONLY client A — never B
-- ════════════════════════════════════════════════════════════════════════════
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f2","email":"cpa@firm.dev","role":"authenticated"}';
select is(
  (select array_agg(client_org_id order by client_name)::text from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')),
  '{00000000-0000-0000-0000-00000000000a}',
  'a regular CPA assigned only to A sees exactly A (never B)');

-- ════════════════════════════════════════════════════════════════════════════
-- isolation: another firm sees NONE of firm F's clients
-- ════════════════════════════════════════════════════════════════════════════
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000f9","email":"other@firm9.dev","role":"authenticated"}';
select is(
  (select count(*)::int from cpa_client_counts('00000000-0000-0000-0000-0000000000F0')),
  0, 'a member of another firm gets nothing for firm F (no cross-firm leak)');

select * from finish();
rollback;
