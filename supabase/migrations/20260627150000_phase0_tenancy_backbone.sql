-- Phase 0 — tenancy & authorization backbone (ARCHITECTURE.md §4, §6b, §C4).
--
-- The single dominant concern of the platform is tenant isolation: one CPA reads
-- many businesses' books, so role lives on the (user, org) RELATIONSHIP, never on
-- the user, and the database itself (RLS) refuses unauthorized reads.
--
-- This migration is ADDITIVE and identity-only — it creates no money/ledger tables
-- and does NOT touch the existing `admins` table (admin auth keeps working). It
-- introduces `platform_staff` as the canonical platform-staff allow-list (§4.2);
-- consolidating `admins` -> `platform_staff` is a deliberate follow-up so this
-- migration carries zero behavior change to today's admin sign-in.
--
-- All backbone writes go through the service-role API; client-side is select-only,
-- which (with security-definer helpers) sidesteps the RLS recursion footgun (§4.5).

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────
create type org_type          as enum ('business', 'firm');
create type member_role       as enum ('owner', 'member', 'firm_admin', 'cpa');
create type member_status     as enum ('active', 'invited', 'suspended');
create type engagement_status as enum ('pending', 'active', 'revoked');
create type access_level      as enum ('read_only', 'full');   -- 'full' = may post to the ledger

-- ─────────────────────────────────────────────────────────────────────────────
-- Backbone tables
-- ─────────────────────────────────────────────────────────────────────────────
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  type        org_type not null,                 -- a business OR a CPA firm
  name        text not null,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

-- ROLE LIVES HERE — on the (user, org) relationship.
create table memberships (
  user_id    uuid not null references auth.users(id),
  org_id     uuid not null references organizations(id) on delete cascade,
  role       member_role not null,
  status     member_status not null default 'active',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index memberships_org_idx  on memberships (org_id);
create index memberships_user_idx on memberships (user_id);

-- Cross-org link letting a firm see a client's books. Binds firm -> a SPECIFIC
-- business (client_org_id), never to a person.
create table engagements (
  id            uuid primary key default gen_random_uuid(),
  firm_org_id   uuid not null references organizations(id),   -- type='firm'
  client_org_id uuid not null references organizations(id),   -- type='business'
  status        engagement_status not null default 'pending',
  access        access_level not null default 'read_only',    -- owner grants read_only|full at accept
  initiated_by  uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (firm_org_id, client_org_id)   -- one link per (firm, business)
);
create index engagements_firm_idx   on engagements (firm_org_id);
create index engagements_client_idx on engagements (client_org_id);

-- Which firm members may see which client (per-client, need-to-know). A regular
-- CPA sees ONLY assigned clients; firm_admin is exempt (handled in the predicate).
create table client_assignments (
  engagement_id uuid not null references engagements(id) on delete cascade,
  user_id       uuid not null references auth.users(id),   -- a firm member (cpa / firm_admin)
  assigned_by   uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  primary key (engagement_id, user_id)
);
create index client_assignments_user_idx on client_assignments (user_id);

-- Platform staff allow-list — entirely separate from tenant memberships (§4.2).
-- Access to tenant data is break-glass and audited, never silent.
create table platform_staff (
  user_id  uuid primary key references auth.users(id),
  is_super boolean not null default false,
  added_by uuid references auth.users(id),
  added_at timestamptz not null default now()
);

-- One invite primitive backs all flows (owner<->CPA, staff). Accepting an invite
-- is the ONLY way to gain a membership or activate an engagement (§5).
create table invites (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,
  target_org_id   uuid not null references organizations(id) on delete cascade,
  intended_role   member_role,            -- for membership invites (staff)
  intended_access access_level,           -- for engagement invites (CPA)
  email           text not null,
  invited_by      uuid not null references auth.users(id),
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index invites_target_idx on invites (target_org_id);

-- Polymorphic subscription — business OR firm is the billable entity (§6b).
-- Free during pilot; entitlement check exists day one, payment wired later.
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  billable_org_id uuid not null references organizations(id) on delete cascade,
  plan            text not null default 'pilot_free',
  status          text not null default 'active',   -- active | past_due | canceled
  provider        text,                              -- 'stripe' later; null during free pilot
  provider_ref    text,
  trial_ends_at   timestamptz,
  created_at      timestamptz not null default now()
);
create index subscriptions_org_idx on subscriptions (billable_org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Authorization predicate — security-definer helpers reused by every policy (§4.3).
-- security definer => they bypass RLS internally, so policies that CALL them never
-- recurse into the backbone tables' own policies (§4.5).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function has_membership(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.org_id = target_org and m.status = 'active'
  );
$$;

-- firm engagement + per-client assignment (firm_admin bypasses the assignment gate).
create or replace function has_engagement_access(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from engagements e
    join memberships m
      on m.org_id = e.firm_org_id
     and m.user_id = auth.uid()
     and m.status = 'active'
    where e.client_org_id = target_org
      and e.status = 'active'
      and (
        m.role = 'firm_admin'                                   -- admins see every firm client
        or exists (                                             -- regular CPA: must be assigned
          select 1 from client_assignments ca
          where ca.engagement_id = e.id and ca.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function can_access_org(target_org uuid)   -- READ capability
returns boolean language sql stable security definer set search_path = public as $$
  select has_membership(target_org) or has_engagement_access(target_org);
$$;

-- WRITE capability. Members of the business write; an engaged CPA writes ONLY if
-- their engagement is access='full' (and passes the assignment/firm_admin gate).
create or replace function can_write_org(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select has_membership(target_org)
      or exists (
        select 1
        from engagements e
        join memberships m
          on m.org_id = e.firm_org_id and m.user_id = auth.uid() and m.status = 'active'
        where e.client_org_id = target_org
          and e.status = 'active'
          and e.access = 'full'
          and ( m.role = 'firm_admin'
                or exists (select 1 from client_assignments ca
                           where ca.engagement_id = e.id and ca.user_id = auth.uid()) )
      );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — default-deny; reads via security-definer helpers, writes via service role.
-- ─────────────────────────────────────────────────────────────────────────────
alter table organizations      enable row level security;
alter table memberships        enable row level security;
alter table engagements        enable row level security;
alter table client_assignments enable row level security;
alter table platform_staff     enable row level security;
alter table invites            enable row level security;
alter table subscriptions      enable row level security;

-- RLS filters ON TOP OF grants — without SELECT grant, the authenticated role is
-- denied outright and the policies never get a chance to filter. Reads only; all
-- writes funnel through the service role (which bypasses RLS), backed by the
-- no_client_write policies below as defense-in-depth.
grant select on
  organizations, memberships, engagements, client_assignments,
  platform_staff, invites, subscriptions
to authenticated;

-- organizations: visible to anyone who can access the org.
create policy organizations_select on organizations
  for select using ( can_access_org(id) );
create policy organizations_no_client_write on organizations
  for all using (false) with check (false);

-- memberships: a user sees their OWN rows, or rows of an org they're a member of
-- (via the security-definer helper — NO self-referential subquery).
create policy memberships_select on memberships
  for select using ( user_id = auth.uid() or has_membership(org_id) );
create policy memberships_no_client_write on memberships
  for all using (false) with check (false);

-- engagements: visible to either side via security-definer helpers (no self-join).
create policy engagements_select on engagements
  for select using ( has_membership(firm_org_id) or has_membership(client_org_id) );
create policy engagements_no_client_write on engagements
  for all using (false) with check (false);

-- client_assignments: readable by firm members; scalar subselect touches one row by PK.
create policy client_assignments_select on client_assignments
  for select using ( has_membership((select firm_org_id from engagements e where e.id = engagement_id)) );
create policy client_assignments_no_client_write on client_assignments
  for all using (false) with check (false);

-- platform_staff: a staff member sees their own row; the full list is service-role only.
create policy platform_staff_select on platform_staff
  for select using ( user_id = auth.uid() );
create policy platform_staff_no_client_write on platform_staff
  for all using (false) with check (false);

-- invites: the issuing side (org admins) can read; acceptance is by token via the API.
create policy invites_select on invites
  for select using ( has_membership(target_org_id) );
create policy invites_no_client_write on invites
  for all using (false) with check (false);

-- subscriptions: visible to anyone who can access the billable org.
create policy subscriptions_select on subscriptions
  for select using ( can_access_org(billable_org_id) );
create policy subscriptions_no_client_write on subscriptions
  for all using (false) with check (false);
