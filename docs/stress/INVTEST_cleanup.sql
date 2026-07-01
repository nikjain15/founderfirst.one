-- [stress:invites] INVTEST — UN-RUN cleanup. The integrator runs this AFTER review.
-- Removes ONLY this session's namespaced fixtures (@invtest.founderfirst.test users
-- and everything they created, incl. auto-created firm-of-one orgs). Touches no
-- other tenant. Run as SQL (Supabase Management API / SQL editor) — it deletes from
-- auth.users, which PostgREST cannot. Idempotent: re-running is a no-op.
--
-- Live fixture footprint at session end: 14 users · 11 orgs (6 named [INVTEST] +
-- 5 firm-of-ones) · 7 engagements · 16 invites · matching memberships/subscriptions.

begin;

create temp table _u on commit drop as
  select id from auth.users where lower(email) like '%@invtest.founderfirst.test';
create temp table _o on commit drop as
  select id from organizations where created_by in (select id from _u);

-- engagements have no ON DELETE cascade from organizations → clear them (and their
-- assignments) before the orgs.
delete from client_assignments
 where engagement_id in (
   select id from engagements
    where firm_org_id in (select id from _o) or client_org_id in (select id from _o));
delete from engagements
 where firm_org_id in (select id from _o) or client_org_id in (select id from _o);

-- invites: those targeting my orgs, issued by my users, or bound to my namespace
-- (covers the service-role-inserted expired fixture 'INVTEST-expired-r3').
delete from invites
 where target_org_id in (select id from _o)
    or invited_by    in (select id from _u)
    or lower(email) like '%@invtest.founderfirst.test';

-- subscriptions & memberships cascade on org delete, but be explicit.
delete from subscriptions where billable_org_id in (select id from _o);
delete from memberships    where org_id in (select id from _o) or user_id in (select id from _u);
delete from organizations  where id in (select id from _o);
delete from auth.users     where id in (select id from _u);

commit;
