# FounderFirst Platform — System Architecture

> Status: **Draft for review** · 27 Jun 2026 · Owner: Nik
> Scope: the unified, multi-tenant platform behind the Business Owner, CPA, and Admin views
> (`app.founderfirst.one`). This document is the foundation we align on **before** writing
> Phase 0 code.

---

## 0. Locked decisions (from discovery)

| Decision | Choice |
|---|---|
| Product stage | **Real multi-tenant SaaS** — real accounts, real persisted financial data |
| Ledger model | **Hybrid** — own a lightweight double-entry ledger; ingest bank feeds; AI layer on top; QBO/Xero interop |
| Tenancy | **Peer / many-to-many** — a business has owner(s) + one-or-more CPAs; a CPA serves many businesses |
| Onboarding | **Both self-serve + invite** — either an owner or a CPA can originate; each can invite the other |
| Day-1 integrations | **Bank feeds (Plaid) + QuickBooks/Xero sync + manual entry** all supported |
| Near-term goal | **Real pilot users on a scalable foundation** — invest in correct schema/auth/infra now |
| Monetization | **Billing built but free during pilot.** Hypothesis: *businesses* pay; schema supports *either* a business or a firm as the billing entity (polymorphic subscription) |
| Market / residency | **Global-capable, US first.** Plaid + QBO/Xero are US-native; design a region/integration abstraction so EU/India slot in later |
| CPA permissions | **Per-engagement scope** — owner grants a CPA `read_only` or `full` posting rights at accept time; enforced now, not deferred |
| Historical data | **Full history import at launch** — via API (QBO/Xero pull) **and** manual upload (CSV / bank-statement / trial-balance). Opening balances are the fallback, not the only option. Users run their books on it from day one |
| Launch bar | **A complete, lovable v1 from day one — no MVP compromise.** Not a proof-of-concept, not a "pilot" of a partial product. A business owner *and* their CPA can run real books end-to-end and prefer it to what they use today. Phases below are the build *order*, not a staircase of half-products. |

### The single dominant consequence

We now hold people's financial data, and access crosses organizational boundaries (one CPA
reads many businesses' books). That makes **tenant isolation and row-level authorization the #1
architectural concern.** Every other choice in this document serves it. The static,
fixture-driven, client-token demo era ends for the *app* surface.

---

## 1. Core mental model — one platform, three lenses

There is **one application, one data model, one API, one permission engine.** "Business Owner,"
"CPA," and "Admin" are not three apps — they are **role-scoped projections of the same platform.**

```
                    ┌───────────────────────────────────────┐
                    │   ONE PLATFORM  (app.founderfirst.one)  │
   Business Owner ──┤   same auth · same API · same Postgres  │
   CPA            ──┤   same Penny · role decides what is     │
   Admin (staff)  ──┤   visible and writable                  │
                    └───────────────────────────────────────┘
```

Roles never get a separate database, a separate copy of the ledger, or a forked codebase.
They get a **membership row with a role**, and the permission layer filters reality.

**Non-negotiable invariants**
1. One concept = one source of truth (the repo's existing guardrail, applied to data and auth).
2. Role and tenant come from the **verified session**, never from the client.
3. Money tables are **append-only**; corrections are reversing entries, never edits.
4. Cross-tenant access is **explicit, scoped, and revocable** (the engagement record).
5. The database itself (RLS) refuses unauthorized reads — app code is the second line, not the first.

---

## 1b. The launch bar — a complete, lovable v1 (no MVP compromise)

This is not a phased pilot of a partial product. **v1 is a product a business owner and their CPA
both run real books on, end-to-end, and prefer to their current tool.** Two people have to love
it — and a CPA is a hard, opinionated user. "Done" means all of the following are true on day one:

**The business owner loves it because:**
- They connect a bank in minutes; transactions flow in and arrive **already categorized** (Penny
  proposes, they tap to confirm) — not a blank ledger to fill.
- Snapping a receipt photo from their phone files it against the right transaction.
- "How's my business?" is answered in plain language — cash position, P&L, what needs attention —
  without them knowing what a debit is.
- Their existing books (QBO/Xero/CSV) come in cleanly so there's no cold-start.

**The CPA loves it because:**
- A real **double-entry ledger** they can trust — balanced, immutable, auditable — not a toy.
- A **client workqueue** across all their businesses: what needs review, what's uncategorized,
  what's unreconciled, ranked.
- **Bank reconciliation** that actually ties to statements, and **period close/lock**.
- **Penny learns their corrections** (categorization rules) so the same fix isn't needed twice.
- Clean **exports / round-trip to QBO/Xero** so they're never trapped.
- Per-client access they control (read-only vs full), nothing leaks across clients.

**Both feel it's trustworthy:** correct to the cent, fast, isolated, recoverable. Trust is the
product in bookkeeping — a single wrong balance loses a CPA forever.

These translate into concrete launch-scope features (§11). Nothing here is "phase 2 polish" — the
delight items above are part of the definition of done, not a backlog.

---

## 2. Backbone recommendation (the "advise me")

**Recommendation: Supabase as the backbone, fronted by a thin typed API layer for
money-mutating operations.** Concretely:

- **Supabase (Postgres + Auth + RLS + Storage)** owns identity, the relational data model,
  row-level tenant isolation, and document storage (receipts/invoices). It is already in the
  repo, and Postgres RLS is *purpose-built* for exactly this multi-tenant financial isolation
  problem. Rolling our own auth/isolation would be the single highest-risk thing we could do.
- **A thin typed server layer** (Supabase **Edge Functions** to start; graduate hot paths to a
  dedicated Hono/TS service on Cloudflare if needed) owns the operations that must **not** live
  in the browser or in a raw SQL policy:
  - posting to the double-entry ledger (balanced-entry invariant, idempotency),
  - Plaid + QBO/Xero webhooks and sync,
  - Penny AI calls (server-authoritative context),
  - anything touching secrets or third-party tokens.

**Why this split rather than "pure Supabase" or "full custom backend":**

| Option | Verdict |
|---|---|
| Pure Supabase, client talks straight to DB | Fine for CRUD, **unsafe for a ledger** — balanced-entry and idempotency invariants can't live in client code, and integration secrets can't either. |
| **Supabase + thin API for writes** ✅ | RLS gives defense-in-depth isolation for *reads*; the API enforces money invariants and holds secrets for *writes*. Pragmatic for a small team, no premature infra. |
| Full custom backend, Supabase as dumb DB | Throws away RLS and Auth — more code, more risk, slower. Revisit only at real scale. |

Net: **keep Supabase, add a typed write-path.** Marketing stays static (GitHub Pages). The app
SPA can still be statically hosted because all auth and data live behind the API.

---

## 3. System topology

```
  founderfirst.one         Marketing (Astro, static, public)         — keep as-is
  app.founderfirst.one     THE PLATFORM (authed SPA)
     ├── owner lens        their one business
     ├── cpa lens          client workqueue across engagements
     └── /admin            platform staff (today's apps/admin, folded in)
  penny / bubble           public lead-gen widget                    — keep

  ── behind the app ──────────────────────────────────────────────
  Edge Functions / typed API   ledger posting · Plaid · QBO/Xero · Penny gateway
  Supabase Postgres            identity · RLS · ledger · documents-metadata
  Supabase Storage / R2        receipt & invoice files
  Plaid · QBO · Xero           external integrations
  Anthropic (Claude)           Penny model calls (server-side only)
```

The current `apps/demo/businessowner` and `apps/demo/cpa` screens are the **UI starting point**
for the owner and CPA lenses — we keep the designed screens and swap fixtures for the authed API.
`apps/admin` becomes the admin lens. The three Claude proxies (`penny-api`, bubble worker,
compose-server) converge over time onto **one authenticated AI gateway**.

---

## 4. Identity, tenancy & RBAC — the heart

Because a person can be an *owner* in one business and a *CPA* in another, **role cannot live on
the user.** Role lives on the **relationship**.

This same M:N relationship gives us **one account → many businesses for free**: a single login can
hold an `owner` membership in any number of business orgs (a founder with three companies, a
CPA who also runs their own side business, etc.). The account is the *person*; each business is a
separate `organization`. There is no "personal account that is also a business" — a user always
*owns businesses*, never *is* one. The app surfaces this through an **org-switcher** (active-org
context, §5.3); all data, RLS, and the ledger are scoped per `org_id`, so the books of one
business are fully isolated from another even under the same owner.

### 4.1 Backbone tables

```sql
-- one row per human; managed by Supabase Auth
-- auth.users  (id, email, ...)

create type org_type as enum ('business', 'firm');
create type member_role as enum ('owner', 'member', 'firm_admin', 'cpa');
create type member_status as enum ('active', 'invited', 'suspended');

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  type        org_type not null,           -- a business OR a CPA firm
  name        text not null,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

-- ROLE LIVES HERE — on the (user, org) relationship
create table memberships (
  user_id   uuid not null references auth.users(id),
  org_id    uuid not null references organizations(id) on delete cascade,
  role      member_role not null,
  status    member_status not null default 'active',
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- the cross-org link that lets a firm see a client's books.
-- KEY: engagement binds firm → a SPECIFIC business (client_org_id), never to an owner/person.
create type engagement_status as enum ('pending', 'active', 'revoked');
create type access_level   as enum ('read_only', 'full');  -- 'full' = may post to the ledger

create table engagements (
  id             uuid primary key default gen_random_uuid(),
  firm_org_id    uuid not null references organizations(id),   -- type='firm'
  client_org_id  uuid not null references organizations(id),   -- type='business'
  status         engagement_status not null default 'pending',
  access         access_level not null default 'read_only',   -- owner grants read_only or full at accept time
  initiated_by   uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  unique (firm_org_id, client_org_id)   -- one link per (firm, business); DIFFERENT firms may both engage the same business
);

-- which firm members may see which client (per-client assignment, need-to-know).
-- A regular CPA sees ONLY clients assigned to them; firm_admin sees all (handled in predicate).
create table client_assignments (
  engagement_id uuid not null references engagements(id) on delete cascade,
  user_id       uuid not null references auth.users(id),   -- a firm member (cpa / firm_admin)
  assigned_by   uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  primary key (engagement_id, user_id)
);
```

**What this M:N gives us, concretely:**
- *One owner, many businesses* → many `owner` memberships (one per business org).
- *Many owners, one business* → many `owner` membership rows on the same `org_id`.
- *Different CPAs per business* → independent engagements per `client_org_id`.
- *Multiple CPA firms on one business* → multiple engagement rows (distinct `firm_org_id`).
- *Solo / independent CPA* → modeled as a **firm-of-one**: a `firm` org with a single
  `firm_admin` member. One uniform rule everywhere ("a firm engages a business"); the solo CPA
  needn't ever see the word "firm" in the UI (label it "Your practice").

### 4.2 Platform staff are NOT a tenant role

Internal staff (you) must never be confused with a tenant member. Keep the existing `admins`
table, rename intent to **platform staff**:

```sql
-- platform staff allow-list — entirely separate from tenant memberships
create table platform_staff (
  user_id   uuid primary key references auth.users(id),
  is_super  boolean not null default false,
  added_by  uuid references auth.users(id),
  added_at  timestamptz not null default now()
);
```

Platform-admin access to tenant data is **break-glass and audited**, never silent.

### 4.3 The authorization predicate (used everywhere)

A user may access rows belonging to `org_id` if **either**:
- they have an `active` membership in `org_id` (it's their own business/firm), **or**
- their firm has an `active` engagement to `org_id` **and** they are assigned to that client
  (a regular CPA needs the assignment; a `firm_admin` is exempt and sees all firm clients).

Expressed once as SQL helpers, reused by every RLS policy:

```sql
create or replace function has_membership(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.org_id = target_org and m.status = 'active'
  );
$$;

-- firm engagement + per-client assignment (firm_admin bypasses the assignment requirement)
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
returns boolean language sql stable as $$
  select has_membership(target_org) or has_engagement_access(target_org);
$$;

-- WRITE capability (post to ledger). Members of the business can write; an engaged
-- CPA can write ONLY if their engagement is access='full' (and they pass the same
-- assignment/firm_admin gate). Owners are never read_only.
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
```

The write-path API calls `can_write_org(org_id)` before posting any journal entry; a
`read_only` CPA can open the books but every mutation is refused. (We may also add a
narrow business-`member` role cap later — for the pilot, business members write, CPAs are
gated by engagement `access`.)

### 4.4 RLS pattern for every tenant table

Every tenant-scoped table carries `org_id` and gets:

```sql
alter table journal_entries enable row level security;

create policy je_select on journal_entries
  for select using ( can_access_org(org_id) );

-- writes go through the API (service role); direct client writes are denied by default
create policy je_no_client_write on journal_entries
  for all using ( false ) with check ( false );
```

Reads are isolated by the database itself; writes funnel through the typed API which enforces
the ledger invariants. **A bug in the SPA cannot leak another tenant's books.**

### 4.5 RLS on the backbone tables themselves (the recursion footgun)

The helper functions read `memberships`/`engagements`/`client_assignments`. Those tables ALSO
need RLS, and a naive `using (org_id in (select org_id from memberships where user_id = auth.uid()))`
policy **recurses infinitely** (a well-known Supabase trap). Rules we lock now:

- Helper functions are `security definer` (they bypass RLS internally), so policies that *call*
  them don't recurse.
- **`memberships`**: a user may `select` rows where `user_id = auth.uid()` (their own
  memberships) OR rows of an org they can administer. No self-referential subquery in the policy.
- **`engagements`**: visible to members of either the firm side or the client side (via the
  `security definer` helpers, never a direct self-join in the policy).
- **`client_assignments`**: readable by firm members; writable only by `firm_admin` of that firm.
- **All backbone-table writes go through the API** (service role), same as the ledger — the SPA
  never inserts a membership/engagement directly. This sidesteps most policy-recursion risk
  entirely, since client-side we only ever `select`.
- Phase 0 ships a **pgTAP / SQL test suite** that asserts isolation: user A cannot read user B's
  org under any of the four relationship combinations. Isolation is *tested*, not assumed.

---

## 5. Onboarding & invite flows (both self-serve)

Either party can originate; each can invite the other. Four flows, one invite primitive.

```
A. Owner-originated
   sign up → create business org (owner) → invite CPA by email
   → CPA accepts → engagement(firm→client) becomes active

B. CPA-originated
   sign up → create firm org (firm_admin) → add client business
   → invite owner by email → owner accepts → engagement active

C. Owner invites staff        → membership(role=member) in the business
D. Firm invites CPA staff     → membership(role=cpa) in the firm

E. Owner adds another business → create business org (owner) under the SAME account
   → repeat any time; no new login, just a new org + owner membership
```

One `invites` table backs flows A–D (token, target org, intended role/engagement, expiry,
accepted_at). Accepting an invite is the **only** way to gain a membership or activate an
engagement — no implicit access. Revocation flips `status` and RLS instantly cuts access
(important for trust and for GDPR erasure obligations already flagged in project memory).

### 5.3 Multiple businesses per account + active-org context

- **"Create a business" is always available** from the account menu — first business at signup,
  additional ones any time (flow E). Each call is just `POST /orgs {type:'business'}` +
  an `owner` membership for the caller.
- The app holds an **active-org** in session (`?org=` / stored selection). An **org-switcher** in
  the header lets an owner flip between their businesses; the CPA lens lists client orgs the same
  way. The active org scopes every query and every `org_id` write.
- Books never bleed across an owner's businesses — separate `org_id`, separate RLS scope, separate
  ledger. Cross-business roll-ups (e.g. "all my companies") are an explicit future aggregate view,
  not the default.

### 5.4 Membership lifecycle guards

- **Last-owner protection:** a business org must always have ≥1 `active` owner. The API refuses
  to remove/suspend the final owner; ownership must be *transferred* first. Same for `firm_admin`
  on a firm.
- **Ownership transfer:** an explicit flow (current owner promotes another member to owner, or
  invites a new owner who accepts) — never an implicit side effect of leaving.
- **Leaving / removal** flips membership `status`; RLS cuts access immediately. History the user
  authored stays attributed (append-only ledger), but they lose access.

---

## 6. Data architecture — hybrid ledger + integrations

```
┌── Ingest (raw, provenance-preserving) ──┐   ┌── Own ledger (canonical books) ──────┐
│ Plaid     → bank_accounts, bank_txns     │   │ ledger_accounts  (chart of accounts) │
│ QBO/Xero  ⇄ external_sync (adapter)      │──▶│ journal_entries  (immutable header)  │
│ Manual    → uploaded receipts/invoices   │   │ journal_lines    (debit/credit rows) │
└──────────────────────────────────────────┘   │ documents        (files in Storage)  │
                                               │ categorization_rules (Penny-learned) │
                                               └───────────────────────────────────────┘
```

### 6.1 Ledger invariants

- **Money is stored as integer minor units** (e.g. cents) in `bigint`, plus a `currency` code —
  **never floating point.** All arithmetic is integer; presentation formats at the edge.
- `journal_entries` + `journal_lines` are **append-only and immutable.** A correction is a new
  reversing entry that references the original. Never UPDATE/DELETE a posted entry.
- Each entry must be **balanced** (Σ debits = Σ credits, per currency) — enforced in the API
  posting function AND double-checked by a deferred DB constraint/trigger.
- **Raw bank transactions ≠ ledger entries.** Ingest raw, then *post* via a categorization step
  (Penny suggests → human approves). Keep `source` + `source_ref` provenance on every entry
  (`manual` | `plaid:<txn_id>` | `import:<batch_id>` | `qbo:<id>`).
- **Idempotency:** every money mutation carries a client-supplied `idempotency_key`
  (unique per org); replays return the original result instead of double-posting. Plaid/webhook
  ingest dedupes on the provider transaction id.
- Every financial table carries `org_id` and is RLS-protected (`can_access_org` read /
  `can_write_org` write).

### 6.2 Accounting periods & close

- `accounting_periods (org_id, period_start, period_end, status)` with `status ∈ {open, closed}`.
- The posting function **refuses to post into a `closed` period.** Closing a month/year is how
  CPAs lock the books; corrections to a closed period go to the next open period as adjustments.
- A `fiscal_year_start` lives on the org's accounting settings (defaults to Jan; configurable).

### 6.3 Bank reconciliation (first-class)

- `reconciliations (org_id, bank_account_id, statement_date, statement_balance, status)` plus a
  link table matching ledger entries to bank statement lines.
- Reconciling = matching raw `bank_txns` ↔ posted ledger entries until the cleared balance equals
  the statement balance. This is core CPA work and a primary trust signal — not an afterthought.

### 6.4 Historical data import (launch feature, not deferred)

Pilots run real books from day one, so import is in scope at launch via **three paths**, all
landing in the same canonical ledger with provenance:

- **API pull** — QBO/Xero connector imports chart of accounts + historical transactions.
- **Manual upload** — CSV / bank-statement / trial-balance files, mapped to accounts in a
  guided importer (Penny assists with column mapping + categorization).
- **Opening balances** — for businesses without exportable history: a dated trial-balance entry
  per account at a chosen **cutover date**, so the balance sheet is correct from go-live.

Imports run as a **batch** (`import_batches`) that is previewable and reversible *before* commit;
once committed, entries are immutable like any other (corrections via reversing entries).

### 6.5 Reporting

P&L, balance sheet, and cash-flow are **derived from the ledger** (not stored as truth).
Computed on-the-fly for the pilot; promote hot reports to materialized views only if needed.

### 6.6 Integration stance

- **Own ledger is canonical.** Plaid and QBO/Xero are *adapters behind an interface*, never woven
  into the core. Day-1 supports all three input modes (bank feed, external sync, manual) because
  pilots will be mixed; the ledger doesn't care where a transaction originated.
- QBO/Xero sync is bidirectional-capable but starts as **import + export**, with conflict policy
  decided per field (canonical wins on categorization; external wins on raw bank reality).
- All integration tokens live server-side (Edge Function secrets / Supabase Vault), never client.

---

## 6b. Billing (built now, free during pilot)

Hypothesis is *businesses pay*, but the schema stays **polymorphic** so a firm could be the
billing entity later without a migration:

```sql
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  billable_org_id uuid not null references organizations(id),  -- business OR firm
  plan            text not null default 'pilot_free',
  status          text not null default 'active',              -- active | past_due | canceled
  provider        text,            -- 'stripe' (later); null during free pilot
  provider_ref    text,
  trial_ends_at   timestamptz,
  created_at      timestamptz not null default now()
);
```

- During the pilot, every org gets a `pilot_free` subscription — **no payment integration wired**,
  but the entitlement check (`is org X entitled?`) exists from day one so flipping to paid is a
  config change, not a refactor.
- Stripe (or similar) slots in behind `provider`/`provider_ref` when we charge. Per-seat vs
  per-business vs per-client pricing are all expressible without schema change.

---

## 7. Penny (AI layer) — unified & server-authoritative

Keep the existing `context.viewer_role` seam, but make it **server-authoritative**:

- Caller identity, active org, and role come from the **verified JWT**, not the browser.
- **Penny reads context using the caller's own scoped token (RLS-enforced), never the service
  role.** The AI can only ever see what that user is already permitted to see — the model is not
  a privilege-escalation path.
- Penny pulls only **RLS-permitted** data into context.
- Prompt overlay (founder tone vs. CPA tone) is selected from Supabase, as the bubble already does.
- Penny writes back **proposals** (categorizations, draft emails, suggested entries) that a human
  approves — it never silently mutates the ledger.

Over time the three Claude proxies (`penny-api`, bubble worker, compose-server) converge onto one
authenticated AI gateway. The public marketing bubble stays anonymous and separate.

---

## 8. API surface (first cut)

Typed endpoints on the write-path (Edge Functions):

```
POST  /orgs                      create business or firm
POST  /invites                   issue an invite (membership or engagement)
POST  /invites/:token/accept     accept → membership / activate engagement
POST  /engagements/:id/revoke    owner or firm revokes access
POST  /engagements/:id/assign    firm_admin assigns a CPA staff member to this client
DELETE /engagements/:id/assign/:userId   unassign a CPA from this client

GET   /ledger/accounts           chart of accounts (RLS-scoped)
POST  /ledger/entries            post a balanced, idempotent journal entry
POST  /ledger/entries/:id/reverse  reversing correction

POST  /integrations/plaid/link   Plaid Link token
POST  /integrations/plaid/webhook
POST  /integrations/qbo/connect  OAuth handshake
POST  /sync/qbo                  pull/push

POST  /penny/message             authed AI turn (server builds context)
```

Reads can go directly to Supabase under RLS where convenient; **all money mutations go through the
API.**

---

## 9. Security & compliance (financial data)

- **RLS on every tenant table** — default-deny, helper-predicate policies (§4).
- **Money mutations only via service-role API** — never client-side writes to ledger tables.
- **Append-only ledger** — immutability is an auditability and trust property, not just hygiene.
- **Secrets server-side** — Plaid/QBO/Xero/Anthropic tokens in Edge Function secrets / Vault.
- **Audit log** — extend the existing audit infra to cover engagement grant/revoke, ledger posts,
  break-glass platform-admin access.
- **Data export & erasure** — engagement revocation + per-org export/delete path (GDPR; already a
  tracked obligation for Penny/Discord data).
- **Roadmap to SOC2** — controls designed in from Phase 0, formalized in Phase 5.
- **Data residency** — start in a **US** region (fits Plaid/QBO/Xero). Keep an org-level region
  concept so EU/India data can later live in-region; don't hardcode a single global bucket.
- **Sensitive secrets** (Plaid/QBO tokens, bank identifiers) — stored encrypted (Supabase Vault),
  never in app tables in plaintext, never client-side.

---

## 9b. Environments & operations

- **Three Supabase projects: dev / staging / prod.** Today there is only prod — that is a
  LEARNINGS.md-class risk. Migrations and destructive changes are rehearsed on staging (seeded
  with synthetic tenants) before prod. **No schema change touches prod un-rehearsed.**
- **Point-in-time recovery (PITR)** enabled on prod — financial data must be restorable.
- **Migrations** stay the single source of truth in `supabase/migrations/`; `supabase db push`
  deploys ALL pending — check `migration list` first (repo guardrail).
- **Audit log is append-only** and covers: engagement grant/revoke, access-level changes,
  assignment changes, period close, every ledger post, and break-glass platform-admin access.

---

## 10. Repo & migration topology

- Migrations live in `supabase/migrations/` — **the only schema source of truth** (repo guardrail).
  Phase 0 is one reviewed migration: orgs / memberships / engagements / platform_staff / invites + RLS.
- New app lives under `apps/app` (the unified authed SPA), seeded from the existing
  `apps/demo/businessowner` and `apps/demo/cpa` screens.
- `apps/admin` folds in as the admin lens (or stays a route group within the app).
- Marketing (`apps/web` / `apps/marketing`) and the Penny bubble are untouched.
- All work in a **dedicated worktree per task**, committed small and atomically (repo guardrail).

---

## 11. Phased roadmap

**There is one launch, and it ships the complete v1 (§1b).** The phases below are the *build
order* — the sequence in which we construct the one product — not a series of public half-releases.
We dogfood and put it in front of design partners continuously, but the **public launch gate is
the full Definition of Done**, not the end of any single phase.

| Phase | Build deliverable | Internal exit criteria |
|---|---|---|
| **0 — Foundations** | orgs/memberships/engagements/assignments/invites + RLS + `can_write_org` + platform-staff separation + pgTAP isolation tests + staging env | Tenant isolation provably enforced & tested; invite/accept/revoke/assign work; rehearsed on staging |
| **1 — Auth shell** | unified app: login, org-switcher (owner businesses + CPA clients), role/scope-routed shell; subscription entitlement stub | Owner + CPA log in, see correctly scoped workspaces; read_only vs full enforced |
| **2 — Ledger core** | chart of accounts, periods, balanced immutable journal entries, documents, manual entry + reversing corrections | Books balance; closed periods locked; money in integer minor units |
| **3 — History import** | QBO/Xero API pull + CSV/statement/trial-balance manual upload + opening balances; previewable reversible batches | A real business imports existing books and the balance sheet is correct at cutover |
| **4 — Bank feed + Penny + reconciliation** | Plaid link, raw txns, Penny categorize (propose→approve) + learned rules, bank reconciliation, receipt capture, plain-language "how's my business" | Live txns arrive pre-categorized; an account reconciles to a statement; rules stop repeat fixes |
| **5 — CPA workqueue + ongoing sync + hardening** | client workqueue (review/uncategorized/unreconciled ranked), QBO/Xero round-trip sync, exports, audit coverage, export/erasure, PITR, SOC2-track controls | Both personas' Definition of Done (§1b) met; payment-flippable |

> **⟶ LAUNCH GATE (after Phase 5):** every §1b "loves it" item is true for *both* a real owner and
> a real CPA on real data. Then — and only then — public launch. Billing flips from free
> `pilot_free` to paid with a config change (Stripe behind `provider`), no schema work.

**Why still sequenced this way if it all ships together?** Each phase de-risks the next and is
independently dogfoodable, so we find ledger/isolation bugs early on synthetic data before real
money rides on them — without ever shipping a knowingly-partial product to a paying user.

---

## 12. Open risks / decisions still to settle

1. **Edge Functions vs. dedicated TS service** for the write-path — start with Edge Functions,
   set a tripwire (latency/complexity) for graduating to Hono on Cloudflare.
2. **QBO vs. Xero first** — both planned; sequence by which the first design-partner CPAs use.
3. **Plaid coverage / cost** in the US pilot — validate before Phase 4 commitment; the integration
   abstraction lets a different aggregator slot in for EU/India later.
4. **Multi-currency** — store `currency` from day one; assume one currency per org for the pilot,
   design accounts to allow multi later (FX gain/loss accounts come with it).
5. **App hosting** — static SPA on Pages vs. a platform with edge auth; decide at Phase 1.
6. **Mobile receipt capture** — the businessowner demo is mobile-first; default is a PWA (camera
   upload to Storage) unless a native app is required. Confirm at Phase 2/4.
7. **CPA write approval** — for `full` engagements, do owners still want a review queue on
   CPA-posted entries, or is `full` truly unsupervised? (Currently: full = unsupervised.)
8. **Penny model cost controls** — per-org rate limits + model pinning before opening the AI
   propose loop to real volume (Phase 4).

---

*Next deliverable after sign-off on this doc: the Phase 0 Supabase migration (schema + RLS +
invite flow), built in an isolated worktree and reviewed before any deploy.*
