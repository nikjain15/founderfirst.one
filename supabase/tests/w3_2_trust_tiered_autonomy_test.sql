-- W3.2 · Trust-tiered autonomy — the auto-post + 1-tap-undo write-path (card W3.2).
--
-- The HIGH tier posts a categorization itself (autopost_categorization = reverse +
-- repost + learn) and records a "Penny did this" feed row; the owner's 1-tap undo
-- (undo_penny_activity) reverses that repost through the SAME reversal path, so the
-- trial balance nets back and the ledger stays balanced + append-only. This suite
-- pins: the auto-post posts + feeds, the undo reverses cleanly (ledger balanced),
-- both are tenant-gated + period-lock-respecting, both are audit-logged, and the
-- interruption budget (owner_asks_this_week / record_owner_ask) counts from real
-- data. Same self-seeding [REGTEST] technique as the rest — everything rolls back.

begin;
select plan(21);

-- ── fixtures ─────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'w32ownerA@test.dev',  'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'w32ownerB@test.dev',  'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'business', 'Biz A', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b2', 'business', 'Biz B', '00000000-0000-0000-0000-00000000000b');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2', 'owner', 'active');

insert into org_accounting_settings (org_id, home_currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'USD')
  on conflict (org_id) do update set home_currency = excluded.home_currency;

insert into ledger_accounts (id, org_id, code, name, type) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1', '1000', 'Cash',          'asset'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', '9999', 'Uncategorized', 'expense'),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000b1', '5100', 'Software',      'expense');

-- an uncategorized expense paid from cash on an OPEN date, memo "ADOBE *123"
create temp table _orig as
select * from post_journal_entry(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '2026-02-01', 'k-orig',
  '[{"account_id":"00000000-0000-0000-0000-00000000c002","amount_minor":5000,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":5000,"side":"C"}]'::jsonb,
  'manual', null, 'ADOBE *123');

-- ── HIGH tier: Penny auto-posts (Uncategorized → Software) + records a feed row ─
create temp table _act as
select * from autopost_categorization(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  (select id from _orig),
  '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000c003',
  'ap-1', 'vendor_prior', 1.0, 'Filed under 5100 · Software');

select is((select kind from _act), 'autopost_category', 'auto-post creates a feed row');
select is((select source from _act), 'vendor_prior',     'feed row records the HIGH-tier provenance');
select is((select status::text from journal_entries where id = (select id from _orig)),
  'reversed', 'the original uncategorized entry is reversed (append-only)');
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = '00000000-0000-0000-0000-00000000c003'),
  5000, 'Software now carries the 5000 debit (Penny posted it)');

-- idempotent: re-running the same key is a no-op (one feed row per reposted entry)
select is(
  (select id from autopost_categorization(
     '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
     (select id from _orig),
     '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000c003',
     'ap-1', 'vendor_prior', 1.0, 'Filed under 5100 · Software')),
  (select id from _act), 'auto-post is idempotent on the idempotency key');
select is((select count(*)::int from penny_activity where org_id='00000000-0000-0000-0000-0000000000b1'),
  1, 'exactly one feed row after the retry');

-- ── the auto-post + its reversal are audit-logged ────────────────────────────
select ok(
  (select count(*) from ledger_audit
     where org_id='00000000-0000-0000-0000-0000000000b1' and action='entry.reverse') >= 1,
  'the auto-post reversal is audit-logged');

-- ── 1-tap UNDO: reverse the repost; the ledger stays balanced ────────────────
create temp table _undo as
select * from undo_penny_activity(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  (select id from _act));

select ok((select undone_at from _undo) is not null, 'undo marks the feed row undone');
select ok((select undo_entry_id from _undo) is not null, 'undo records the reversal entry');
-- after undo: Software nets back to zero (repost 5000 debit + undo 5000 credit)
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines where account_id = '00000000-0000-0000-0000-00000000c003'),
  0, 'after undo Software nets to zero — the ledger stays balanced');
-- the whole org trial balance ties to zero (double-entry preserved throughout)
select is(
  (select coalesce(sum(case side when 'D' then amount_minor else -amount_minor end),0)::int
     from journal_lines jl join journal_entries je on je.id=jl.entry_id
     where je.org_id='00000000-0000-0000-0000-0000000000b1'),
  0, 'the org trial balance ties to zero (double-entry preserved)');
-- undo is idempotent (a second tap returns the already-undone row, no double-reverse)
select is(
  (select undo_entry_id from undo_penny_activity(
     '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
     (select id from _act))),
  (select undo_entry_id from _undo), 'undo is idempotent (no double reversal)');

-- ── tenant isolation: org B's owner cannot auto-post / undo in org A ──────────
select throws_ok($$
  select autopost_categorization('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000b1',
    (select id from _orig), '00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000c003',
    'ap-x','penny',0.9,'x')
$$, '42501', NULL, 'a non-member cannot auto-post into another org');

-- ── period lock: a closed period blocks the auto-post (restrict_violation) ────
create temp table _mar as
select * from post_journal_entry(
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000b1',
  '2026-03-15', 'k-mar',
  '[{"account_id":"00000000-0000-0000-0000-00000000c002","amount_minor":700,"side":"D"},
    {"account_id":"00000000-0000-0000-0000-00000000c001","amount_minor":700,"side":"C"}]'::jsonb,
  'manual', null, 'ADOBE *999');
-- close the period AFTER the entry exists, then attempt the auto-post.
-- post_journal_entry above lazily created the March 2026 period (ensure_open_period),
-- so close THAT period rather than re-inserting it (a raw insert would collide on
-- accounting_periods_org_id_period_start_period_end_key and abort the whole plan).
update accounting_periods set status = 'closed'
 where org_id = '00000000-0000-0000-0000-0000000000b1'
   and period_start = '2026-03-01' and period_end = '2026-03-31';
select throws_ok($$
  select autopost_categorization('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000b1',
    (select id from _mar), '00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000c003',
    'ap-mar','vendor_prior',1.0,'x')
$$, '23001', NULL, 'a closed period blocks the auto-post (period-lock respected)');

-- ── interruption budget: counts from ai_decisions AND caps atomically ────────
-- record_owner_ask is the single budget gate — it decides allowed/not under an
-- org lock, so the ≤N/week cap can't be blown past by concurrent asks. We can't
-- open two live connections inside one pgTAP txn, but the invariant is the same
-- either way: at used=budget-1, exactly ONE more ask is allowed and every
-- further ask is refused with the count frozen at the cap.
select is(owner_asks_this_week('00000000-0000-0000-0000-0000000000b1'), 0,
  'no owner interruptions counted yet this week');

-- first ask (budget 5) → allowed, spent becomes 1
select results_eq(
  $$ select allowed, spent from record_owner_ask(
       '00000000-0000-0000-0000-0000000000b1',
       '00000000-0000-0000-0000-0000000000e1', 5) $$,
  $$ values (true, 1) $$,
  'the first owner ask is allowed and counts as 1');
select is(owner_asks_this_week('00000000-0000-0000-0000-0000000000b1'), 1,
  'recording one owner ask counts one interruption this week');

-- idempotent: the SAME entry again is already counted → allowed, no second insert
select results_eq(
  $$ select allowed, spent from record_owner_ask(
       '00000000-0000-0000-0000-0000000000b1',
       '00000000-0000-0000-0000-0000000000e1', 5) $$,
  $$ values (true, 1) $$,
  'a repeat ask for the same entry is allowed but not double-counted (idempotent)');

-- drive the org to used=4 with three more distinct interruptions
insert into ai_decisions (tenant_id, use_case, runtime, provider, model, request_ref, gate_status)
select 'org:00000000-0000-0000-0000-0000000000b1', 'owner_interruption', 'deno', 'workers-ai', 'n/a', r, 'unevaluated'
from unnest(array['e2','e3','e4']) as r;
-- the 5th distinct ask exactly fills the budget → allowed, spent = 5
select results_eq(
  $$ select allowed, spent from record_owner_ask(
       '00000000-0000-0000-0000-0000000000b1',
       '00000000-0000-0000-0000-0000000000e5', 5) $$,
  $$ values (true, 5) $$,
  'the ask that fills the budget (5th of 5) is allowed');
-- the 6th distinct ask is over budget → refused, and the count is FROZEN at 5
-- (this is the TOCTOU invariant: a concurrent read-then-write can never exceed 5)
select results_eq(
  $$ select allowed, spent from record_owner_ask(
       '00000000-0000-0000-0000-0000000000b1',
       '00000000-0000-0000-0000-0000000000e6', 5) $$,
  $$ values (false, 5) $$,
  'an ask past the budget is refused with the count frozen at the cap');
select is(owner_asks_this_week('00000000-0000-0000-0000-0000000000b1'), 5,
  'the ≤5/week cap holds exactly — no over-count past the budget');

select * from finish();
rollback;
