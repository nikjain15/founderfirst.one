-- RV2-C1 · CPA practice-OS depth — firm-level month-end close.
-- REG scenario id: RV2-C1-CLOSE. AUDIT ledger row: cpa-practice-os.
--
-- Stress: a firm batch-closes a month across N clients. Asserts
--   1. per-client close readiness (blocker counts + ready/exception),
--   2. batch close closes ONLY the ready + full-access clients,
--   3. a blocked client (unresolved blockers) is refused, never closed,
--   4. a read_only engagement can NEVER close (result='forbidden'),
--   5. NO cross-tenant bleed — one firm can't close another firm's client,
--   6. per-client period locks hold (each client's period flips independently),
--   7. roll-forward integrity — a closed period stays closed; a client's later
--      open period is untouched by the batch that closed its earlier one,
--   8. the doc-chase rail records a request + is idempotent per (client,template).
-- All rolls back.

begin;
select plan(21);

-- ── users ────────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin@firmc.dev',  'authenticated', 'authenticated'),  -- firm_admin of F
  ('00000000-0000-0000-0000-0000000000c9', 'other@firmc9.dev', 'authenticated', 'authenticated');  -- firm_admin of F9

-- ── orgs: firm F + clients A,B,D; firm F9 + client E ─────────────────────────
--   A = clean (ready),  B = has blockers (exception),
--   D = read_only engagement,  E = a different firm's client (isolation).
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000C0', 'firm',     'Firm C',   '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000CA', 'business', 'Client A', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000CB', 'business', 'Client B', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000CD', 'business', 'Client D', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000C9', 'firm',     'Firm 9',   '00000000-0000-0000-0000-0000000000c9'),
  ('00000000-0000-0000-0000-0000000000CE', 'business', 'Client E', '00000000-0000-0000-0000-0000000000c9');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000C0', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000C9', 'firm_admin', 'active');

-- engagements: F→A full, F→B full, F→D read_only; F9→E full
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000C0', '00000000-0000-0000-0000-0000000000CA', 'active', 'full',      '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000C0', '00000000-0000-0000-0000-0000000000CB', 'active', 'full',      '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000C0', '00000000-0000-0000-0000-0000000000CD', 'active', 'read_only', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000C9', '00000000-0000-0000-0000-0000000000CE', 'active', 'full',      '00000000-0000-0000-0000-0000000000c9');

-- Uncategorized (9999) + Cash per client that needs postings
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000C9B9', '00000000-0000-0000-0000-0000000000CB', '9999', 'Uncategorized', 'expense'),
  ('00000000-0000-0000-0000-00000000CB01', '00000000-0000-0000-0000-0000000000CB', '1000', 'Cash',          'asset');

-- periods: the month being closed (May) — OPEN + past-due for every client.
insert into accounting_periods (id, org_id, period_start, period_end, status) values
  ('00000000-0000-0000-0000-0000000CA100', '00000000-0000-0000-0000-0000000000CA', date '2026-05-01', date '2026-05-31', 'open'),  -- A: clean
  ('00000000-0000-0000-0000-0000000CB100', '00000000-0000-0000-0000-0000000000CB', date '2026-05-01', date '2026-05-31', 'open'),  -- B: blocked
  ('00000000-0000-0000-0000-0000000CD100', '00000000-0000-0000-0000-0000000000CD', date '2026-05-01', date '2026-05-31', 'open'),  -- D: read_only
  ('00000000-0000-0000-0000-0000000CE100', '00000000-0000-0000-0000-0000000000CE', date '2026-05-01', date '2026-05-31', 'open'),  -- E: other firm
  -- A has a LATER open period (June) — must survive closing May (roll-forward).
  ('00000000-0000-0000-0000-0000000CA200', '00000000-0000-0000-0000-0000000000CA', date '2026-06-01', date '2026-06-30', 'open');

-- Client B gets a blocker: a posted entry on 9999 (uncategorized) inside May.
insert into journal_entries (id, org_id, entry_date, period_id, status, source, idempotency_key, posted_by) values
  ('00000000-0000-0000-0000-0000000CB001', '00000000-0000-0000-0000-0000000000CB', date '2026-05-12', '00000000-0000-0000-0000-0000000CB100', 'posted', 'csv', 'b-uc-1', '00000000-0000-0000-0000-0000000000c1');
insert into journal_lines (entry_id, org_id, account_id, amount_minor, side) values
  ('00000000-0000-0000-0000-0000000CB001', '00000000-0000-0000-0000-0000000000CB', '00000000-0000-0000-0000-00000000C9B9', 3000, 'D');

-- ════════════════════════════════════════════════════════════════════════════
-- READINESS — as the firm_admin
-- ════════════════════════════════════════════════════════════════════════════
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"admin@firmc.dev","role":"authenticated"}';

-- A,B,D each have an open May period → 3 rows (E belongs to another firm).
select is(
  (select count(*)::int from cpa_close_readiness('00000000-0000-0000-0000-0000000000C0', date '2026-05-31')),
  3, 'readiness lists the firm''s three clients with an open period (never firm 9''s)');

select ok(
  (select ready from cpa_close_readiness('00000000-0000-0000-0000-0000000000C0', date '2026-05-31')
     where client_org_id = '00000000-0000-0000-0000-0000000000CA'),
  'Client A (clean) is ready to close');

select is(
  (select uncategorized::int from cpa_close_readiness('00000000-0000-0000-0000-0000000000C0', date '2026-05-31')
     where client_org_id = '00000000-0000-0000-0000-0000000000CB'),
  1, 'Client B has one uncategorized blocker');

select ok(
  not (select ready from cpa_close_readiness('00000000-0000-0000-0000-0000000000C0', date '2026-05-31')
        where client_org_id = '00000000-0000-0000-0000-0000000000CB'),
  'Client B (blocker) is NOT ready');

-- Readiness resolves the MAY period for A, not the June one (covering-period pick).
select is(
  (select period_end from cpa_close_readiness('00000000-0000-0000-0000-0000000000C0', date '2026-05-31')
     where client_org_id = '00000000-0000-0000-0000-0000000000CA'),
  date '2026-05-31', 'readiness targets the covering May period for A');

-- ════════════════════════════════════════════════════════════════════════════
-- BATCH CLOSE — firm_admin closes A, B, D, and (attempts) E in one call
-- ════════════════════════════════════════════════════════════════════════════
-- The RPC is p_actor-first + service_role; call directly (test = superuser),
-- passing the firm_admin as the actor exactly as the edge fn would.
create temp table batch_res as
  select * from cpa_batch_close_periods(
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-0000000000C0',
    array['00000000-0000-0000-0000-0000000000CA',   -- A ready → closed
          '00000000-0000-0000-0000-0000000000CB',   -- B blocked → blocked
          '00000000-0000-0000-0000-0000000000CD',   -- D read_only → forbidden
          '00000000-0000-0000-0000-0000000000CE']::uuid[],  -- E other firm → forbidden
    date '2026-05-31', false);

select is((select result from batch_res where client_org_id = '00000000-0000-0000-0000-0000000000CA'),
  'closed', 'A (clean, full) → closed');
select is((select result from batch_res where client_org_id = '00000000-0000-0000-0000-0000000000CB'),
  'blocked', 'B (blocker) → blocked, NOT closed');
select is((select result from batch_res where client_org_id = '00000000-0000-0000-0000-0000000000CD'),
  'forbidden', 'D (read_only engagement) → forbidden');
select is((select result from batch_res where client_org_id = '00000000-0000-0000-0000-0000000000CE'),
  'forbidden', 'E (another firm''s client) → forbidden — NO cross-tenant close');

-- Effect on the actual period rows: only A's May period is closed.
select is(
  (select status from accounting_periods where id = '00000000-0000-0000-0000-0000000CA100'),
  'closed'::period_status, 'A''s May period is now closed');
select is(
  (select status from accounting_periods where id = '00000000-0000-0000-0000-0000000CB100'),
  'open'::period_status, 'B''s May period is STILL open (blocked never closed)');
select is(
  (select status from accounting_periods where id = '00000000-0000-0000-0000-0000000CD100'),
  'open'::period_status, 'D''s May period is STILL open (read_only refused)');
select is(
  (select status from accounting_periods where id = '00000000-0000-0000-0000-0000000CE100'),
  'open'::period_status, 'E''s period is untouched — cross-tenant isolation holds');

-- ROLL-FORWARD: A's JUNE period must be untouched by closing May.
select is(
  (select status from accounting_periods where id = '00000000-0000-0000-0000-0000000CA200'),
  'open'::period_status, 'A''s June period stays open — closing May rolls forward, not over');

-- close_by / audit: A's close was attributed to the actor and audit-logged.
select is(
  (select closed_by from accounting_periods where id = '00000000-0000-0000-0000-0000000CA100'),
  '00000000-0000-0000-0000-0000000000c1'::uuid, 'A''s close is attributed to the firm_admin actor');
select ok(
  exists (select 1 from ledger_audit where target_id = '00000000-0000-0000-0000-0000000CA100'
            and action = 'period.close' and detail->>'via' = 'batch_close'),
  'batch close writes a period.close audit row tagged via=batch_close');

-- Idempotency / re-run: closing A again is a safe no-op. A's May period is closed
-- so no OPEN covering period remains → 'not_found' (nothing to close), never a
-- double-close or an error.
select is(
  (select result from cpa_batch_close_periods(
     '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000C0',
     array['00000000-0000-0000-0000-0000000000CA']::uuid[], date '2026-05-31', false)),
  'not_found', 're-closing an already-closed client is a safe no-op (no open period → not_found, no double-close)');

-- ── service_role reality: the write RPC must NOT depend on auth.uid() ─────────
-- In prod the edge fn calls as service_role, where auth.uid() is NULL. cpa_batch_
-- close_periods must gate on p_actor (via cpa_firm_clients_as), never auth.uid(),
-- or every client would resolve to 'forbidden'. Reset D's period, drop the JWT
-- claim, and confirm the actor-parameterized path still authorizes + closes D.
reset "request.jwt.claims";
-- Make D full-access so a legitimate actor CAN close it, and prove it does even
-- with no auth.uid() in context (pure service_role invocation).
update engagements set access = 'full' where id = '00000000-0000-0000-0000-0000000000d3';
select is(
  (select result from cpa_batch_close_periods(
     '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000C0',
     array['00000000-0000-0000-0000-0000000000CD']::uuid[], date '2026-05-31', false)),
  'closed', 'batch close authorizes on p_actor (not auth.uid()) — works under service_role');
-- Restore D to read_only so the doc-chase forbidden assertion below is honest.
update engagements set access = 'read_only' where id = '00000000-0000-0000-0000-0000000000d3';
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000c1","email":"admin@firmc.dev","role":"authenticated"}';

-- ════════════════════════════════════════════════════════════════════════════
-- DOC-CHASE RAIL — record + idempotency
-- ════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  select cpa_request_docs('00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-0000000000C0', '00000000-0000-0000-0000-0000000000CB',
    'bank_statement', 'need May statement')
$$, 'firm_admin can chase docs on a full-access client');

-- A read_only client (D) cannot be chased.
select throws_ok($$
  select cpa_request_docs('00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-0000000000C0', '00000000-0000-0000-0000-0000000000CD',
    'bank_statement', null)
$$, '42501', 'forbidden', 'read_only client cannot be doc-chased (forbidden)');

-- Re-chasing the SAME template while open is idempotent → one open row.
select cpa_request_docs('00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-0000000000C0', '00000000-0000-0000-0000-0000000000CB',
  'bank_statement', 'ping again');
select is(
  (select count(*)::int from doc_requests
     where client_org_id = '00000000-0000-0000-0000-0000000000CB' and status = 'open'),
  1, 'one OPEN doc request per (client,template) — re-chase is idempotent');

select * from finish();
rollback;
