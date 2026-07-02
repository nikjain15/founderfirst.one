-- [stress:auth] AUTHTEST fixture cleanup — UN-RUN. Integrator runs this AFTER review.
-- Deletes ONLY AUTHTEST fixtures (namespaced @authtest.founderfirst.test / "[AUTHTEST]").
-- Touches nothing owned by other parallel sessions. Idempotent; safe to re-run.
-- Run against prod ref ejqsfzggyfsjzrcevlnq with the service role.

begin;

-- 1) Orgs created by this session (cascades to memberships/ledger via FKs if defined;
--    rows below are belt-and-suspenders for non-cascading FKs).
with my_orgs as (
  select id from organizations where name in ('[AUTHTEST] Org A', '[AUTHTEST] Org B')
)
delete from memberships where org_id in (select id from my_orgs);

delete from organizations where name in ('[AUTHTEST] Org A', '[AUTHTEST] Org B');

-- 2) Auth users minted for this session.
delete from auth.users
where email in (
  'owner-a@authtest.founderfirst.test',
  'owner-b@authtest.founderfirst.test',
  'reuse@authtest.founderfirst.test',
  'bind1@authtest.founderfirst.test',
  'ratelimit@authtest.founderfirst.test',
  'redir@authtest.founderfirst.test'
);

commit;

-- Verify after running (expect 0 / 0):
--   select count(*) from organizations where name like '[AUTHTEST]%';
--   select count(*) from auth.users where email like '%@authtest.founderfirst.test';
