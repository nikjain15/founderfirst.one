-- [stress:chart-of-accounts] COATEST fixture cleanup — UN-RUN (integrator runs it).
--
-- Removes ONLY the COATEST fixtures. Black-box rule: this session deleted nothing.
-- Run on prod (ref ejqsfzggyfsjzrcevlnq) after the findings are reviewed.
--
-- The two orgs FK-cascade to ledger_accounts / journal_entries / journal_lines /
-- ledger_audit / accounting_periods. memberships + subscriptions are removed
-- explicitly first (in case their FK is not ON DELETE CASCADE), then the orgs,
-- then the two auth users.

begin;

-- org ids
--   A = bfc19d9b-2e09-49bf-b831-7e3120a01aca
--   B = 774fb673-c388-4234-b478-11a69921da02
-- user ids
--   owner-a = 0e73974e-5533-4615-805f-bcbfc2937961
--   owner-b = b37491ee-0cf8-42ed-ad75-d9df48e114f4

delete from subscriptions where billable_org_id in
  ('bfc19d9b-2e09-49bf-b831-7e3120a01aca','774fb673-c388-4234-b478-11a69921da02');
delete from memberships  where org_id in
  ('bfc19d9b-2e09-49bf-b831-7e3120a01aca','774fb673-c388-4234-b478-11a69921da02');

delete from organizations where id in
  ('bfc19d9b-2e09-49bf-b831-7e3120a01aca','774fb673-c388-4234-b478-11a69921da02');

delete from auth.users where id in
  ('0e73974e-5533-4615-805f-bcbfc2937961','b37491ee-0cf8-42ed-ad75-d9df48e114f4');

-- sanity: should all be 0
-- select count(*) from organizations  where name like '[COATEST]%';
-- select count(*) from ledger_accounts where org_id in ('bfc19d9b-2e09-49bf-b831-7e3120a01aca','774fb673-c388-4234-b478-11a69921da02');

commit;
