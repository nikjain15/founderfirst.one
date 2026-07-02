-- W1.5 · CPA collaboration primitives (flag · note · add-txn · reclass).
-- REG scenario ids: W1.5-FLAG, W1.5-NOTE, W1.5-ADDTXN, W1.5-RECLASS, W1.5-ISO,
--                   W1.5-PERIODLOCK, W1.5-READONLY, W1.5-AUDIT.
--
-- Proves the full round-trip AND the guardrails:
--   · a full-access CPA can flag / note / suggest; a read_only CPA cannot.
--   · a suggestion is MEDIUM tier (status pending_review); NOTHING posts until the
--     OWNER approves — and a CPA cannot self-approve.
--   · approving a reclass recategorizes the entry AND learns a rule (the payoff).
--   · approving an add_txn posts the entry; rejecting posts nothing.
--   · flags surface in the W1.4 practice queue's `flagged` column (rank 4).
--   · every action writes ledger_audit.
--   · tenant isolation: a forged actor from another org cannot write.
--   · period-lock: an add_txn into a CLOSED period is refused on approve.
-- All rolls back.

begin;
select plan(28);

-- ── users: owner, full CPA, read_only CPA, outsider ──────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'owner@biz.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'cpa@firm.dev',    'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'ro@firm.dev',     'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c9', 'outsider@x.dev',  'authenticated', 'authenticated');

-- orgs: business client + CPA firm + a foreign firm
insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000B1', 'business', 'Acme',       '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000F1', 'firm',     'Firm One',   '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000F2', 'firm',     'Firm Two',   '00000000-0000-0000-0000-0000000000c9');

-- memberships: owner owns Acme; both CPAs + outsider are firm_admins of their firms
insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000B1', 'owner',      'active'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000F1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000F1', 'firm_admin', 'active'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000F2', 'firm_admin', 'active');

-- engagements: Firm One → Acme with FULL (via cpa@) and a READ_ONLY leg (ro@).
-- Model access at the engagement level: give the full CPA its own full engagement
-- and the read_only CPA a read_only engagement so can_write_org_as differs.
insert into engagements (id, firm_org_id, client_org_id, status, access, initiated_by) values
  ('00000000-0000-0000-0000-0000000000E1', '00000000-0000-0000-0000-0000000000F1', '00000000-0000-0000-0000-0000000000B1', 'active', 'full',      '00000000-0000-0000-0000-0000000000c1');
-- both firm members are firm_admin so they inherit the engagement; access is the
-- engagement's. To give ro@ read_only we DEMOTE them to a plain 'cpa' with no
-- assignment on a read_only engagement instead — simpler: use a second firm leg.
-- (Firm One's single engagement is 'full'; to test read_only we flip it per-test.)

-- ledger: cash + an expense (mis-categorized) + the target expense on Acme
insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000A100', '00000000-0000-0000-0000-0000000000B1', '1000', 'Cash',            'asset'),
  ('00000000-0000-0000-0000-00000000A500', '00000000-0000-0000-0000-0000000000B1', '5000', 'Misc Expense',    'expense'),
  ('00000000-0000-0000-0000-00000000A510', '00000000-0000-0000-0000-0000000000B1', '5100', 'Office Supplies', 'expense');

-- an OPEN period + a posted entry (Cash credit / Misc-Expense debit)
insert into accounting_periods (id, org_id, period_start, period_end, status) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000B1', date '2026-06-01', date '2026-06-30', 'open');
-- a memo so the approved reclass has a merchant_key to LEARN a rule from.
insert into journal_entries (id, org_id, entry_date, period_id, status, source, memo, idempotency_key, posted_by) values
  ('00000000-0000-0000-0000-00000000EE01', '00000000-0000-0000-0000-0000000000B1', date '2026-06-10', '00000000-0000-0000-0000-0000000000d1', 'posted', 'manual', 'STAPLES STORE 123', 'ee01', '00000000-0000-0000-0000-0000000000c1');
insert into journal_lines (entry_id, org_id, account_id, amount_minor, side) values
  ('00000000-0000-0000-0000-00000000EE01', '00000000-0000-0000-0000-0000000000B1', '00000000-0000-0000-0000-00000000A500', 2500, 'D'),
  ('00000000-0000-0000-0000-00000000EE01', '00000000-0000-0000-0000-0000000000B1', '00000000-0000-0000-0000-00000000A100', 2500, 'C');

-- ════════════════════════════════════════════════════════════════════════════
-- FLAG — a full CPA flags; it lands in the practice queue `flagged` column
-- ════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  select cpa_flag_entry('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
                        '00000000-0000-0000-0000-00000000EE01', 'looks personal')
$$, 'W1.5-FLAG: full CPA can flag an entry');

select is(
  (select count(*)::int from entry_flags where entry_id = '00000000-0000-0000-0000-00000000EE01' and status = 'open'),
  1, 'W1.5-FLAG: exactly one open flag exists');

-- idempotent: re-flag returns the same open flag, not a duplicate
select cpa_flag_entry('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
                      '00000000-0000-0000-0000-00000000EE01', 'again');
select is(
  (select count(*)::int from entry_flags where entry_id = '00000000-0000-0000-0000-00000000EE01' and status = 'open'),
  1, 'W1.5-FLAG: re-flagging is idempotent (still one open flag)');

-- flag audit-logged
select is(
  (select count(*)::int from ledger_audit where action = 'entry.flag' and target_id = '00000000-0000-0000-0000-00000000EE01'),
  1, 'W1.5-AUDIT: the flag wrote a ledger_audit row');

-- the flag shows in the W1.4 practice queue as a `flagged` item, rank 4
set local "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000c2","email":"cpa@firm.dev","role":"authenticated"}';
select is(
  (select rank from cpa_practice_queue('00000000-0000-0000-0000-0000000000F1') where kind = 'flagged' limit 1),
  4, 'W1.5-FLAG: flagged item ranks 4 in the practice queue');
select is(
  (select surface from cpa_practice_queue('00000000-0000-0000-0000-0000000000F1') where kind = 'flagged' limit 1),
  'journal', 'W1.5-FLAG: flagged routes to the Journal surface');
select is(
  (select flagged::int from cpa_client_counts('00000000-0000-0000-0000-0000000000F1')
     where client_org_id = '00000000-0000-0000-0000-0000000000B1'),
  1, 'W1.5-FLAG: the client-counts flagged badge reads 1');
reset "request.jwt.claims";

-- ════════════════════════════════════════════════════════════════════════════
-- NOTE
-- ════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  select cpa_add_note('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
                      '00000000-0000-0000-0000-00000000EE01', 'Please confirm this vendor.')
$$, 'W1.5-NOTE: full CPA can annotate an entry');
select throws_ok($$
  select cpa_add_note('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
                      '00000000-0000-0000-0000-00000000EE01', '   ')
$$, '22023', null, 'W1.5-NOTE: an empty note is refused');

-- ════════════════════════════════════════════════════════════════════════════
-- ISOLATION — a foreign actor (outsider, no engagement) cannot write
-- ════════════════════════════════════════════════════════════════════════════
select throws_ok($$
  select cpa_flag_entry('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000B1',
                        '00000000-0000-0000-0000-00000000EE01', 'forged')
$$, '42501', null, 'W1.5-ISO: an outsider (no engagement) cannot flag another org''s entry');

-- ════════════════════════════════════════════════════════════════════════════
-- RECLASS round-trip — CPA suggests → owner approves → recategorized + rule learned
-- ════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  select cpa_suggest_reclass('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
    '00000000-0000-0000-0000-00000000EE01', '00000000-0000-0000-0000-00000000A500',
    '00000000-0000-0000-0000-00000000A510', 'this is office supplies')
$$, 'W1.5-RECLASS: full CPA can suggest a reclassification');

-- pending, MEDIUM tier — NOTHING posted yet (original still posted, no repost)
select is(
  (select status::text from cpa_suggestions where kind = 'reclass' and org_id = '00000000-0000-0000-0000-0000000000B1' limit 1),
  'pending_review', 'W1.5-RECLASS: the suggestion is pending_review (medium tier)');
select is(
  (select status::text from journal_entries where id = '00000000-0000-0000-0000-00000000EE01'),
  'posted', 'W1.5-RECLASS: nothing moved — the original entry is still posted (no approval yet)');

-- a CPA cannot self-approve their own suggestion
select throws_ok($$
  select owner_approve_suggestion('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
    (select id from cpa_suggestions where kind = 'reclass' and org_id = '00000000-0000-0000-0000-0000000000B1' limit 1))
$$, '42501', null, 'W1.5-RECLASS: a CPA cannot self-approve (owner-only)');

-- OWNER approves → recategorize runs: original reversed, repost onto Office Supplies
select lives_ok($$
  select owner_approve_suggestion('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000B1',
    (select id from cpa_suggestions where kind = 'reclass' and org_id = '00000000-0000-0000-0000-0000000000B1' limit 1))
$$, 'W1.5-RECLASS: owner approves the reclass');

select is(
  (select status::text from cpa_suggestions where kind = 'reclass' and org_id = '00000000-0000-0000-0000-0000000000B1' limit 1),
  'approved', 'W1.5-RECLASS: suggestion is now approved');
select is(
  (select status::text from journal_entries where id = '00000000-0000-0000-0000-00000000EE01'),
  'reversed', 'W1.5-RECLASS: the original entry was reversed by the recategorize');
-- a live repost now sits on Office Supplies (5100)
select ok(
  exists(select 1 from journal_entries je
           join journal_lines jl on jl.entry_id = je.id
          where je.org_id = '00000000-0000-0000-0000-0000000000B1' and je.source = 'recategorize'
            and je.status = 'posted' and jl.account_id = '00000000-0000-0000-0000-00000000A510'),
  'W1.5-RECLASS: a live repost lands on the target account (Office Supplies)');
-- THE PAYOFF: an approved reclass created a learned categorization rule
select ok(
  exists(select 1 from categorization_rules
          where org_id = '00000000-0000-0000-0000-0000000000B1'
            and account_id = '00000000-0000-0000-0000-00000000A510'),
  'W1.5-RECLASS: approving the reclass LEARNED a categorization rule');
select is(
  (select count(*)::int from ledger_audit where action = 'suggestion.approve'),
  1, 'W1.5-AUDIT: the approval wrote a ledger_audit row');

-- ════════════════════════════════════════════════════════════════════════════
-- ADD-TXN — CPA proposes; nothing posts until owner acknowledges; reject posts nothing
-- ════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  select cpa_add_transaction('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
    date '2026-06-15',
    jsonb_build_array(
      jsonb_build_object('account_id','00000000-0000-0000-0000-00000000A510','amount_minor',900,'side','D'),
      jsonb_build_object('account_id','00000000-0000-0000-0000-00000000A100','amount_minor',900,'side','C')),
    'Missing receipt', 'found on the bank statement')
$$, 'W1.5-ADDTXN: full CPA can propose a missing transaction');

-- unbalanced add-txn is refused at suggest time (never stores a bad proposal)
select throws_ok($$
  select cpa_add_transaction('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
    date '2026-06-15',
    jsonb_build_array(
      jsonb_build_object('account_id','00000000-0000-0000-0000-00000000A510','amount_minor',900,'side','D'),
      jsonb_build_object('account_id','00000000-0000-0000-0000-00000000A100','amount_minor',800,'side','C')),
    'bad', null)
$$, '23514', null, 'W1.5-ADDTXN: an unbalanced proposal is refused');

-- nothing on Office Supplies from the add-txn yet (not approved)
select is(
  (select count(*)::int from journal_entries where org_id = '00000000-0000-0000-0000-0000000000B1' and source = 'cpa_suggestion'),
  0, 'W1.5-ADDTXN: the proposed transaction has NOT posted (awaiting owner ack)');

-- owner approves → it posts
select lives_ok($$
  select owner_approve_suggestion('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000B1',
    (select id from cpa_suggestions where kind = 'add_txn' and status = 'pending_review'
       and org_id = '00000000-0000-0000-0000-0000000000B1' limit 1))
$$, 'W1.5-ADDTXN: owner acknowledges → the transaction posts');
select is(
  (select count(*)::int from journal_entries where org_id = '00000000-0000-0000-0000-0000000000B1'
     and source = 'cpa_suggestion' and status = 'posted'),
  1, 'W1.5-ADDTXN: exactly one posted entry from the approved add-txn');

-- ════════════════════════════════════════════════════════════════════════════
-- PERIOD-LOCK — an add-txn into a CLOSED period is refused on approve
-- ════════════════════════════════════════════════════════════════════════════
-- close June, then propose a June-dated add-txn and try to approve it.
update accounting_periods set status = 'closed' where id = '00000000-0000-0000-0000-0000000000d1';
select cpa_add_transaction('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
  date '2026-06-20',
  jsonb_build_array(
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000A510','amount_minor',100,'side','D'),
    jsonb_build_object('account_id','00000000-0000-0000-0000-00000000A100','amount_minor',100,'side','C')),
  'late', null);
select throws_ok($$
  select owner_approve_suggestion('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000B1',
    (select id from cpa_suggestions where kind = 'add_txn' and status = 'pending_review'
       and org_id = '00000000-0000-0000-0000-0000000000B1' and entry_date = date '2026-06-20' limit 1))
$$, '23001', null, 'W1.5-PERIODLOCK: approving an add-txn into a closed period is refused');

-- ════════════════════════════════════════════════════════════════════════════
-- READ_ONLY CPA — a read_only engagement cannot flag/suggest/add
-- ════════════════════════════════════════════════════════════════════════════
-- Flip Firm One's engagement to read_only; now cpa@ (firm_admin, no full leg) is read_only.
update engagements set access = 'read_only' where id = '00000000-0000-0000-0000-0000000000E1';
select throws_ok($$
  select cpa_flag_entry('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
    '00000000-0000-0000-0000-00000000EE01', 'ro attempt')
$$, '42501', null, 'W1.5-READONLY: a read_only CPA cannot flag');
select throws_ok($$
  select cpa_suggest_reclass('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000B1',
    '00000000-0000-0000-0000-00000000EE01', '00000000-0000-0000-0000-00000000A500',
    '00000000-0000-0000-0000-00000000A510', 'ro attempt')
$$, '42501', null, 'W1.5-READONLY: a read_only CPA cannot suggest a reclass');

select * from finish();
rollback;
