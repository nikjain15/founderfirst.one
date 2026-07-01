-- [stress:invites] accept_invite gate — INVTEST findings F1 (re-engage after revoke)
-- and F2 (no owner/admin demotion), plus the core invite invariants the live
-- black-box run confirmed (email-binding, expiry, single-use, firm-of-one, scope).
--
-- Run locally: `supabase test db`. accept_invite is SECURITY DEFINER, so calling it
-- as the (superuser) test role is faithful to how the edge fn calls it via the
-- service role; the recipient identity is the p_actor uuid, never the connection.

begin;
select plan(14);

-- ── fixtures ──────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000a0001', 'owner1@invtest.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a0002', 'cpa1@invtest.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a0003', 'cpa2@invtest.dev',   'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a0004', 'fadmin@invtest.dev', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a0005', 'wrong@invtest.dev',  'authenticated', 'authenticated');

insert into organizations (id, type, name, created_by) values
  ('00000000-0000-0000-0000-0000000b0001', 'business', 'Biz One',  '00000000-0000-0000-0000-0000000a0001'),
  ('00000000-0000-0000-0000-0000000b0002', 'firm',     'Firm One', '00000000-0000-0000-0000-0000000a0004');

insert into memberships (user_id, org_id, role, status) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000b0001', 'owner',      'active'),
  ('00000000-0000-0000-0000-0000000a0004', '00000000-0000-0000-0000-0000000b0002', 'firm_admin', 'active');

-- ════════ F2: owner accepts a *member* invite to their OWN business ════════
-- Must NOT be demoted to 'member' (would orphan the org with zero owners).
insert into invites (token, target_org_id, intended_role, email, invited_by, expires_at) values
  ('tok-demote-owner', '00000000-0000-0000-0000-0000000b0001', 'member',
   'owner1@invtest.dev', '00000000-0000-0000-0000-0000000a0001', now() + interval '7 days');
select lives_ok(
  $$ select accept_invite('00000000-0000-0000-0000-0000000a0001','tok-demote-owner') $$,
  'F2: owner self-accepting a member invite does not error');
select is(
  (select role::text from memberships
     where user_id='00000000-0000-0000-0000-0000000a0001' and org_id='00000000-0000-0000-0000-0000000b0001'),
  'owner', 'F2: owner is NOT demoted to member by member-invite accept');
select is(
  (select count(*)::int from memberships
     where org_id='00000000-0000-0000-0000-0000000b0001' and role='owner' and status='active'),
  1, 'F2: business still has exactly one active owner');

-- ════════ F2 (firm): firm_admin accepts a member (cpa) invite to own firm ════════
insert into invites (token, target_org_id, intended_role, email, invited_by, expires_at) values
  ('tok-demote-admin', '00000000-0000-0000-0000-0000000b0002', 'cpa',
   'fadmin@invtest.dev', '00000000-0000-0000-0000-0000000a0004', now() + interval '7 days');
select lives_ok(
  $$ select accept_invite('00000000-0000-0000-0000-0000000a0004','tok-demote-admin') $$,
  'F2: firm_admin self-accepting a cpa invite does not error');
select is(
  (select role::text from memberships
     where user_id='00000000-0000-0000-0000-0000000a0004' and org_id='00000000-0000-0000-0000-0000000b0002'),
  'firm_admin', 'F2: firm_admin is NOT demoted to cpa');

-- ════════ Positive: fresh CPA accepts engagement invite → firm-of-one ════════
insert into invites (token, target_org_id, intended_access, email, invited_by, expires_at) values
  ('tok-cpa-full', '00000000-0000-0000-0000-0000000b0001', 'full',
   'cpa1@invtest.dev', '00000000-0000-0000-0000-0000000a0001', now() + interval '7 days');
select lives_ok(
  $$ select accept_invite('00000000-0000-0000-0000-0000000a0002','tok-cpa-full') $$,
  'CPA accepts full engagement invite');
select is(
  (select count(*)::int from engagements e join organizations f on f.id=e.firm_org_id
     where e.client_org_id='00000000-0000-0000-0000-0000000b0001'
       and e.status='active' and e.access='full' and f.created_by='00000000-0000-0000-0000-0000000a0002'),
  1, 'engagement active+full via the CPA''s firm-of-one');

-- ════════ already_engaged: a 2nd invite while ACTIVE → refused, no dup ════════
insert into invites (token, target_org_id, intended_access, email, invited_by, expires_at) values
  ('tok-cpa-again', '00000000-0000-0000-0000-0000000b0001', 'full',
   'cpa1@invtest.dev', '00000000-0000-0000-0000-0000000a0001', now() + interval '7 days');
select throws_ok(
  $$ select accept_invite('00000000-0000-0000-0000-0000000a0002','tok-cpa-again') $$,
  'already_engaged', 'active engagement → already_engaged (no duplicate)');

-- ════════ F1: revoke, then re-invite → engagement RE-ACTIVATES ════════
update engagements set status='revoked', revoked_at=now()
  where client_org_id='00000000-0000-0000-0000-0000000b0001'
    and firm_org_id in (select id from organizations where created_by='00000000-0000-0000-0000-0000000a0002');
insert into invites (token, target_org_id, intended_access, email, invited_by, expires_at) values
  ('tok-reengage', '00000000-0000-0000-0000-0000000b0001', 'read_only',
   'cpa1@invtest.dev', '00000000-0000-0000-0000-0000000a0001', now() + interval '7 days');
select lives_ok(
  $$ select accept_invite('00000000-0000-0000-0000-0000000a0002','tok-reengage') $$,
  'F1: re-invite after revoke succeeds (was 409 already_engaged)');
select is(
  (select status::text || ':' || access::text from engagements
     where client_org_id='00000000-0000-0000-0000-0000000b0001'
       and firm_org_id in (select id from organizations where created_by='00000000-0000-0000-0000-0000000a0002')),
  'active:read_only', 'F1: engagement re-activated with newly-granted access; revoked_at cleared');
select is(
  (select count(*)::int from engagements
     where client_org_id='00000000-0000-0000-0000-0000000b0001'
       and firm_org_id in (select id from organizations where created_by='00000000-0000-0000-0000-0000000a0002')),
  1, 'F1: re-activation reuses the row — no duplicate engagement');

-- ════════ Invariants: wrong recipient · expired · single-use ════════
insert into invites (token, target_org_id, intended_access, email, invited_by, expires_at) values
  ('tok-wrongrec', '00000000-0000-0000-0000-0000000b0001', 'full',
   'cpa2@invtest.dev', '00000000-0000-0000-0000-0000000a0001', now() + interval '7 days');
select throws_ok(
  $$ select accept_invite('00000000-0000-0000-0000-0000000a0005','tok-wrongrec') $$,
  'wrong_recipient', 'email-bound: forwarded link to a different user is refused');

insert into invites (token, target_org_id, intended_access, email, invited_by, expires_at) values
  ('tok-expired', '00000000-0000-0000-0000-0000000b0001', 'full',
   'cpa2@invtest.dev', '00000000-0000-0000-0000-0000000a0001', now() - interval '1 day');
select throws_ok(
  $$ select accept_invite('00000000-0000-0000-0000-0000000a0003','tok-expired') $$,
  'expired', 'expired invite is refused');

select throws_ok(
  $$ select accept_invite('00000000-0000-0000-0000-0000000a0002','tok-cpa-full') $$,
  'already_accepted', 'single-use: a consumed token cannot be re-accepted');

select * from finish();
rollback;
