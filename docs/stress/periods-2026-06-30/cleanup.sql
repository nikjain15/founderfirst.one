-- [stress:periods] cleanup — UN-RUN. Removes ONLY this session's prod fixtures
-- (ref ejqsfzggyfsjzrcevlnq), across ALL test phases. Authoritative list verified
-- against the live DB on 2026-06-30 (11 orgs, 14 users).
-- EXCLUDES the parallel session sharing the "[PERIODTEST]" namespace — its orgs
-- "Stress Co" (f10f9823), "CPA Firm" (a79b288c), "Stranger Co" (64554eab) and users
-- owner@/cpa@/stranger@ (9941b9e9 / bfa5cfe3 / c258bd87) — those must be LEFT ALONE.
-- Run inside a transaction; review counts first.
begin;

delete from journal_lines           where org_id in (
  'c7b06332-501a-423d-88c2-cc7713e8417c',
  '5e85ed7f-2324-46df-aca6-7c6382abe278',
  '9a63beca-4c81-4bc8-bfde-ba8ba30458ae',
  'da9a3611-252e-4564-882e-7bf341224879',
  'b26cf189-4dec-418f-bb22-02f5f2a644c0',
  'a103aec6-c4f2-4409-8ca0-2eda2aa639d3',
  'c7a6c468-4070-4d82-a5a3-cb258af5448e',
  '44d5a908-c384-48b2-b8ff-13e6ea90fc71');
delete from journal_entries         where org_id in (
  'c7b06332-501a-423d-88c2-cc7713e8417c',
  '5e85ed7f-2324-46df-aca6-7c6382abe278',
  '9a63beca-4c81-4bc8-bfde-ba8ba30458ae',
  'da9a3611-252e-4564-882e-7bf341224879',
  'b26cf189-4dec-418f-bb22-02f5f2a644c0',
  'a103aec6-c4f2-4409-8ca0-2eda2aa639d3',
  'c7a6c468-4070-4d82-a5a3-cb258af5448e',
  '44d5a908-c384-48b2-b8ff-13e6ea90fc71');
delete from ledger_audit            where org_id in (
  'c7b06332-501a-423d-88c2-cc7713e8417c',
  '5e85ed7f-2324-46df-aca6-7c6382abe278',
  '9a63beca-4c81-4bc8-bfde-ba8ba30458ae',
  'da9a3611-252e-4564-882e-7bf341224879',
  'b26cf189-4dec-418f-bb22-02f5f2a644c0',
  'a103aec6-c4f2-4409-8ca0-2eda2aa639d3',
  'c7a6c468-4070-4d82-a5a3-cb258af5448e',
  '44d5a908-c384-48b2-b8ff-13e6ea90fc71',
  '0b5964e0-e358-47da-ae5f-8834857040c1',
  'f1836d68-5398-4414-8472-3448de813327',
  '1e7930ff-6bd4-4546-8c41-9f7bce7ad5e3');
delete from accounting_periods      where org_id in (
  'c7b06332-501a-423d-88c2-cc7713e8417c',
  '5e85ed7f-2324-46df-aca6-7c6382abe278',
  '9a63beca-4c81-4bc8-bfde-ba8ba30458ae',
  'da9a3611-252e-4564-882e-7bf341224879',
  'b26cf189-4dec-418f-bb22-02f5f2a644c0',
  'a103aec6-c4f2-4409-8ca0-2eda2aa639d3',
  'c7a6c468-4070-4d82-a5a3-cb258af5448e',
  '44d5a908-c384-48b2-b8ff-13e6ea90fc71');
delete from ledger_accounts         where org_id in (
  'c7b06332-501a-423d-88c2-cc7713e8417c',
  '5e85ed7f-2324-46df-aca6-7c6382abe278',
  '9a63beca-4c81-4bc8-bfde-ba8ba30458ae',
  'da9a3611-252e-4564-882e-7bf341224879',
  'b26cf189-4dec-418f-bb22-02f5f2a644c0',
  'a103aec6-c4f2-4409-8ca0-2eda2aa639d3',
  'c7a6c468-4070-4d82-a5a3-cb258af5448e',
  '44d5a908-c384-48b2-b8ff-13e6ea90fc71');
delete from org_accounting_settings where org_id in (
  'c7b06332-501a-423d-88c2-cc7713e8417c',
  '5e85ed7f-2324-46df-aca6-7c6382abe278',
  '9a63beca-4c81-4bc8-bfde-ba8ba30458ae',
  'da9a3611-252e-4564-882e-7bf341224879',
  'b26cf189-4dec-418f-bb22-02f5f2a644c0',
  'a103aec6-c4f2-4409-8ca0-2eda2aa639d3',
  'c7a6c468-4070-4d82-a5a3-cb258af5448e',
  '44d5a908-c384-48b2-b8ff-13e6ea90fc71');
delete from client_assignments      where engagement_id in (
  select id from engagements where firm_org_id in (
  '0b5964e0-e358-47da-ae5f-8834857040c1',
  'f1836d68-5398-4414-8472-3448de813327',
  '1e7930ff-6bd4-4546-8c41-9f7bce7ad5e3'));
delete from engagements             where firm_org_id in (
  '0b5964e0-e358-47da-ae5f-8834857040c1',
  'f1836d68-5398-4414-8472-3448de813327',
  '1e7930ff-6bd4-4546-8c41-9f7bce7ad5e3');
delete from subscriptions           where billable_org_id in (
  'c7b06332-501a-423d-88c2-cc7713e8417c',
  '5e85ed7f-2324-46df-aca6-7c6382abe278',
  '9a63beca-4c81-4bc8-bfde-ba8ba30458ae',
  'da9a3611-252e-4564-882e-7bf341224879',
  'b26cf189-4dec-418f-bb22-02f5f2a644c0',
  'a103aec6-c4f2-4409-8ca0-2eda2aa639d3',
  'c7a6c468-4070-4d82-a5a3-cb258af5448e',
  '44d5a908-c384-48b2-b8ff-13e6ea90fc71',
  '0b5964e0-e358-47da-ae5f-8834857040c1',
  'f1836d68-5398-4414-8472-3448de813327',
  '1e7930ff-6bd4-4546-8c41-9f7bce7ad5e3');
delete from memberships             where org_id in (
  'c7b06332-501a-423d-88c2-cc7713e8417c',
  '5e85ed7f-2324-46df-aca6-7c6382abe278',
  '9a63beca-4c81-4bc8-bfde-ba8ba30458ae',
  'da9a3611-252e-4564-882e-7bf341224879',
  'b26cf189-4dec-418f-bb22-02f5f2a644c0',
  'a103aec6-c4f2-4409-8ca0-2eda2aa639d3',
  'c7a6c468-4070-4d82-a5a3-cb258af5448e',
  '44d5a908-c384-48b2-b8ff-13e6ea90fc71',
  '0b5964e0-e358-47da-ae5f-8834857040c1',
  'f1836d68-5398-4414-8472-3448de813327',
  '1e7930ff-6bd4-4546-8c41-9f7bce7ad5e3');
delete from organizations           where id in (
  'c7b06332-501a-423d-88c2-cc7713e8417c',
  '5e85ed7f-2324-46df-aca6-7c6382abe278',
  '9a63beca-4c81-4bc8-bfde-ba8ba30458ae',
  'da9a3611-252e-4564-882e-7bf341224879',
  'b26cf189-4dec-418f-bb22-02f5f2a644c0',
  'a103aec6-c4f2-4409-8ca0-2eda2aa639d3',
  'c7a6c468-4070-4d82-a5a3-cb258af5448e',
  '44d5a908-c384-48b2-b8ff-13e6ea90fc71',
  '0b5964e0-e358-47da-ae5f-8834857040c1',
  'f1836d68-5398-4414-8472-3448de813327',
  '1e7930ff-6bd4-4546-8c41-9f7bce7ad5e3');
delete from auth.users              where id in (
  '97b48a04-bc60-4c2f-8ba5-d1ad67e35cb4',
  '5e32be75-019a-41b4-b2be-9a07535f9292',
  '7acc5951-37cb-48ef-ba6b-b1cb17926d34',
  '49d30221-ab98-4b72-849e-f4a05c128153',
  'bcfb36e4-0c26-432a-9cce-0d9e3be2bd56',
  'f5271a40-1cbc-4ba5-a5c8-75ea5b3d0d02',
  '8254f0de-1eba-40dd-ba90-3196e61ec221',
  'a6b66a57-e042-44e8-a2f9-1f4c4d863f40',
  '8ecf7208-0981-465e-a9b5-7990d5f45d2d',
  'cf4a412b-9564-4839-bc2b-5ca326e69317',
  '24f33ddb-51ac-4472-a632-7cb6d568e762',
  'eeb755df-a629-4fd9-a41b-ed594fc4d1c6',
  'ad957215-5a0b-4e51-8fe5-9a09d6bf7906',
  'df8f6996-fafe-4890-b352-f6e008614902');

commit;
