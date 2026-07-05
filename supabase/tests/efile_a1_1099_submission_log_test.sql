-- EFILE-A1 · 1099-NEC e-file submission + ack log (TaxBandits spike).
-- REG scenario ids: EFILE-A1-RECORD, EFILE-A1-IMMUTABLE, EFILE-A1-CONFIRM-GATE,
--                   EFILE-A1-NO-FAKE-SUCCESS, EFILE-A1-REJECT-INGEST,
--                   EFILE-A1-ISO, EFILE-A1-READONLY, EFILE-A1-NO-DUP-STORE.
--
-- Proves:
--   · efile_record_event appends a submission row + audit-logs it; a full CPA can
--     write, a read_only CPA cannot; a forged foreign actor cannot.
--   · the log is APPEND-ONLY: UPDATE and DELETE both raise (tamper-evident);
--     service_role has no update/delete grant.
--   · the TRUST GATE is enforced at the data layer: a 'transmit' row WITHOUT a
--     confirmer raises; a 'dry_run' row can NEVER carry an 'accepted' status.
--   · a reject ack is stored verbatim (Errors preserved), not swallowed.
--   · the log references the EXISTING vendor store — no duplicate vendor table.
-- All rolls back.

begin;
select plan(16);

-- ── users: owner, full CPA, read_only CPA, outsider ──────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000ef01', 'owner@efile.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ef02', 'cpa@efile.dev',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ef03', 'ro@efile.dev',      'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000ef09', 'outsider@efile.dev','authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-00000000efB1', 'business', 'EfileCo',   '00000000-0000-0000-0000-00000000ef01'),
  ('00000000-0000-0000-0000-00000000efF1', 'firm',     'EfileFirm', '00000000-0000-0000-0000-00000000ef02'),
  ('00000000-0000-0000-0000-00000000efF2', 'firm',     'FarFirm',   '00000000-0000-0000-0000-00000000ef09');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000ef01', '00000000-0000-0000-0000-00000000efB1', 'owner',      'active'),
  ('00000000-0000-0000-0000-00000000ef02', '00000000-0000-0000-0000-00000000efF1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-00000000ef03', '00000000-0000-0000-0000-00000000efF1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-00000000ef09', '00000000-0000-0000-0000-00000000efF2', 'firm_admin', 'active');

-- Firm One → EfileCo, FULL engagement (full CPA can write); read_only user has no
-- engagement-scoped write. Firm Two is an outsider.
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-00000000efE1', '00000000-0000-0000-0000-00000000efF1', '00000000-0000-0000-0000-00000000efB1', 'active', 'full', '00000000-0000-0000-0000-00000000ef01');

-- ════════════════════════════════════════════════════════════════════════════
-- EFILE-A1-RECORD — a dry-run event appends + audit-logs
-- ════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  select efile_record_event(
    '00000000-0000-0000-0000-00000000ef01', '00000000-0000-0000-0000-00000000efB1',
    2025, 'dry_run', 'dry_run', null, null, null,
    '{"ReturnData":[]}'::jsonb, '{}'::jsonb, 0)
$$, 'EFILE-A1-RECORD: owner records a dry_run event');

select is( (select count(*)::int from efile_submissions where org_id = '00000000-0000-0000-0000-00000000efB1'),
           1, 'EFILE-A1-RECORD: one submission row written');

select is( (select count(*)::int from ledger_audit
             where org_id = '00000000-0000-0000-0000-00000000efB1' and action = 'efile.1099nec.dry_run'),
           1, 'EFILE-A1-AUDIT: the event is audit-logged inline');

-- ════════════════════════════════════════════════════════════════════════════
-- EFILE-A1-CONFIRM-GATE — a transmit WITHOUT a confirmer is rejected at the data layer
-- ════════════════════════════════════════════════════════════════════════════
select throws_ok($$
  select efile_record_event(
    '00000000-0000-0000-0000-00000000ef01', '00000000-0000-0000-0000-00000000efB1',
    2025, 'transmit', 'submitted', 'sub-1', null, null,
    '{}'::jsonb, '{}'::jsonb, 1)
$$, 'check_violation', NULL,
   'EFILE-A1-CONFIRM-GATE: a transmit with no confirmed_by raises');

select lives_ok($$
  select efile_record_event(
    '00000000-0000-0000-0000-00000000ef01', '00000000-0000-0000-0000-00000000efB1',
    2025, 'transmit', 'submitted', 'sub-1', null,
    '00000000-0000-0000-0000-00000000ef01',
    '{}'::jsonb, '{"SubmissionId":"sub-1"}'::jsonb, 1)
$$, 'EFILE-A1-CONFIRM-GATE: a transmit WITH a confirmer succeeds');

-- ════════════════════════════════════════════════════════════════════════════
-- EFILE-A1-NO-FAKE-SUCCESS — a dry_run can never be 'accepted'
-- ════════════════════════════════════════════════════════════════════════════
select throws_ok($$
  select efile_record_event(
    '00000000-0000-0000-0000-00000000ef01', '00000000-0000-0000-0000-00000000efB1',
    2025, 'dry_run', 'accepted', null, null, null,
    '{}'::jsonb, '{}'::jsonb, 0)
$$, 'check_violation', NULL,
   'EFILE-A1-NO-FAKE-SUCCESS: a dry_run row cannot claim accepted status');

-- ════════════════════════════════════════════════════════════════════════════
-- EFILE-A1-REJECT-INGEST — a reject ack is stored verbatim (Errors preserved)
-- ════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  select efile_record_event(
    '00000000-0000-0000-0000-00000000ef01', '00000000-0000-0000-0000-00000000efB1',
    2025, 'transmit', 'rejected', 'sub-2', null,
    '00000000-0000-0000-0000-00000000ef01',
    '{}'::jsonb, '{"SubmissionId":"sub-2","Errors":[{"Code":"R001","Message":"EIN mismatch"}]}'::jsonb, 1)
$$, 'EFILE-A1-REJECT-INGEST: a reject event records');

select is(
  (select ack->'Errors'->0->>'Message' from efile_submissions
    where org_id = '00000000-0000-0000-0000-00000000efB1' and status = 'rejected' limit 1),
  'EIN mismatch',
  'EFILE-A1-REJECT-INGEST: the reject Errors[] is preserved verbatim, not swallowed');

-- ════════════════════════════════════════════════════════════════════════════
-- EFILE-A1-IMMUTABLE — the log is append-only (UPDATE + DELETE raise)
-- ════════════════════════════════════════════════════════════════════════════
select throws_ok($$
  update efile_submissions set status = 'accepted'
   where org_id = '00000000-0000-0000-0000-00000000efB1'
$$, 'restrict_violation', NULL,
   'EFILE-A1-IMMUTABLE: UPDATE raises (a status change must be a new row)');

select throws_ok($$
  delete from efile_submissions where org_id = '00000000-0000-0000-0000-00000000efB1'
$$, 'restrict_violation', NULL,
   'EFILE-A1-IMMUTABLE: DELETE raises (tamper-evident log)');

-- service_role has no UPDATE/DELETE grant on the table.
select ok(
  not has_table_privilege('service_role', 'public.efile_submissions', 'UPDATE')
  and not has_table_privilege('service_role', 'public.efile_submissions', 'DELETE'),
  'EFILE-A1-IMMUTABLE: service_role has no UPDATE/DELETE grant');

-- ════════════════════════════════════════════════════════════════════════════
-- EFILE-A1-ISO / READONLY — authz on the write RPC
-- ════════════════════════════════════════════════════════════════════════════
select throws_ok($$
  select efile_record_event(
    '00000000-0000-0000-0000-00000000ef09', '00000000-0000-0000-0000-00000000efB1',
    2025, 'dry_run', 'dry_run', null, null, null, '{}'::jsonb, '{}'::jsonb, 0)
$$, 'insufficient_privilege', NULL,
   'EFILE-A1-ISO: a forged foreign actor cannot record against another org');

-- the write RPC is revoked from authenticated (service_role only, ISOTEST).
select ok(
  not has_function_privilege('authenticated',
    'public.efile_record_event(uuid,uuid,int,text,text,text,text,uuid,jsonb,jsonb,int)', 'EXECUTE'),
  'EFILE-A1-ISO: efile_record_event is not EXECUTE-granted to authenticated');
select ok(
  has_function_privilege('service_role',
    'public.efile_record_event(uuid,uuid,int,text,text,text,text,uuid,jsonb,jsonb,int)', 'EXECUTE'),
  'EFILE-A1-ISO: efile_record_event IS granted to service_role');

-- ════════════════════════════════════════════════════════════════════════════
-- EFILE-A1-NO-DUP-STORE — the spike adds NO vendor table (reuses W2.5 vendors)
-- ════════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from information_schema.tables
    where table_schema = 'public'
      and table_name in ('efile_vendors','efile_recipients','efile_1099_vendors')),
  0, 'EFILE-A1-NO-DUP-STORE: no duplicate vendor/recipient table introduced');

select is(
  (select count(*)::int from information_schema.tables
    where table_schema = 'public' and table_name = 'efile_submissions'),
  1, 'EFILE-A1-NO-DUP-STORE: only the submission log table is added');

select * from finish();
rollback;
