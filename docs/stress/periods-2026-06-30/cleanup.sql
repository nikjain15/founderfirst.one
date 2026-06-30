-- [stress:periods] cleanup — UN-RUN. For the integrator to remove ONLY this
-- session's prod fixtures (ref ejqsfzggyfsjzrcevlnq). Scoped to EXACT ids, NOT the
-- shared "[PERIODTEST]" namespace — a parallel session is using the same prefix
-- (its orgs "[PERIODTEST] Stress Co/Stranger Co/CPA Firm" + users owner@/cpa@/
-- stranger@periodtest.founderfirst.test must be left ALONE).
--
-- This session's fixtures (random-suffixed), incl. the post-deploy verification run:
--   businesses  c7b06332… "Co fee90"   ·  5e85ed7f… "PostDeploy cec72"
--   firms       0b5964e0… "Firm f7ee3" ·  f1836d68… "PD Firm 47082"
--   users       24f33ddb owner-eed268 · 5e32be75 cpa-ceebb4 · ad957215 stranger-616d8a
--               · eeb755df owner-pv · 7acc5951 cpa-pv
--
-- Run inside a transaction; review counts against manifest.md first.
begin;

-- child → parent FK order, scoped to this session's four orgs / five users
delete from journal_lines           where org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','5e85ed7f-2324-46df-aca6-7c6382abe278');
delete from journal_entries         where org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','5e85ed7f-2324-46df-aca6-7c6382abe278');
delete from ledger_audit            where org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','0b5964e0-e358-47da-ae5f-8834857040c1','5e85ed7f-2324-46df-aca6-7c6382abe278','f1836d68-5398-4414-8472-3448de813327');
delete from accounting_periods      where org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','5e85ed7f-2324-46df-aca6-7c6382abe278');
delete from ledger_accounts         where org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','5e85ed7f-2324-46df-aca6-7c6382abe278');
delete from org_accounting_settings where org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','5e85ed7f-2324-46df-aca6-7c6382abe278');
delete from client_assignments      where engagement_id in (
  select id from engagements where firm_org_id in ('0b5964e0-e358-47da-ae5f-8834857040c1','f1836d68-5398-4414-8472-3448de813327'));
delete from engagements             where firm_org_id in ('0b5964e0-e358-47da-ae5f-8834857040c1','f1836d68-5398-4414-8472-3448de813327');
delete from subscriptions           where billable_org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','0b5964e0-e358-47da-ae5f-8834857040c1','5e85ed7f-2324-46df-aca6-7c6382abe278','f1836d68-5398-4414-8472-3448de813327');
delete from memberships             where org_id in ('c7b06332-501a-423d-88c2-cc7713e8417c','0b5964e0-e358-47da-ae5f-8834857040c1','5e85ed7f-2324-46df-aca6-7c6382abe278','f1836d68-5398-4414-8472-3448de813327');
delete from organizations           where id in ('c7b06332-501a-423d-88c2-cc7713e8417c','0b5964e0-e358-47da-ae5f-8834857040c1','5e85ed7f-2324-46df-aca6-7c6382abe278','f1836d68-5398-4414-8472-3448de813327');
delete from auth.users              where id in (
  '24f33ddb-51ac-4472-a632-7cb6d568e762',   -- owner-eed268
  '5e32be75-019a-41b4-b2be-9a07535f9292',   -- cpa-ceebb4
  'ad957215-5a0b-4e51-8fe5-9a09d6bf7906',   -- stranger-616d8a
  'eeb755df-a629-4fd9-a41b-ed594fc4d1c6',   -- owner-pv
  '7acc5951-37cb-48ef-ba6b-b1cb17926d34');  -- cpa-pv

commit;
