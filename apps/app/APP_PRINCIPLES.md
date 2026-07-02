# Penny app — navigation & IA principles (owner / CPA / staff)

The source of truth for **how the unified app (`apps/app`, served at `penny.founderfirst.one`) is
navigated**. Read this before touching lenses, tabs, sub-tabs, the org switcher, or the staff/admin
console. It complements [docs/plans/ARCHITECTURE.md](../../docs/plans/ARCHITECTURE.md) (the data /
tenancy / permission design) — that doc says *who can see what*; this doc says *how it's laid out*.

> One app, one data model, one API. "Owner", "CPA", and "Staff/Admin" are **role-scoped
> projections of the same platform**, not separate apps (ARCHITECTURE §1). This doc pins the
> navigation each projection presents.

---

## 0. Baseline discipline (read first — real drift bit us here)

- **`main` == production.** The Penny app deploys from `main`. As of 1 Jul 2026, `main` carries the
  grouped nav (`MAIN_TABS` = Overview · Categorize · Books · Reports, with `BOOKS_SUBS` = Journal ·
  Accounts · Import · Periods in [ledger/Ledger.tsx](src/ledger/Ledger.tsx)) — this is what is live.
- **`deploy-finish` is stale** for the app IA: it still has the older flat 7-tab `ALL_TABS`. **Do
  not build the IA work on `deploy-finish`** — branch from `main` (a fresh worktree) so your
  baseline equals prod. Editing the stale branch is how a redesign silently regresses live nav.
- Local `git` history commands hang in this repo (known env quirk). Verify branch/prod state via
  `gh api "repos/nikjain15/founderfirst.one/contents/<path>?ref=main"` instead.

## 1. The governing principle — navigate by the user's model, not ours

**Each lens is organized around how *that* user thinks, and new features nest under an existing job
instead of adding a top-level tab.** That is what keeps the nav from sprawling as we ship invoicing,
payroll, tax, forecasting.

- **Owner** navigates by *"what do I need?"* — plain-language jobs, zero accounting vocabulary up top.
- **CPA** navigates by *accounting workflow* — record → categorize → reconcile → close → report.
- **Staff/Admin** is the internal console — not a customer surface.

Consequence: lenses get **their own tab sets** (owner vocabulary vs. accountant vocabulary), rather
than one shared tab list that is merely filtered. The code already branches on
[lenses/OwnerLens.tsx](src/lenses/OwnerLens.tsx) and [lenses/CpaLens.tsx](src/lenses/CpaLens.tsx);
give each its real nav.

---

## 2. Owner lens

**Primary nav (4 tabs) + a de-emphasized Advanced area.**

| Tab | Job it answers | Notes |
|---|---|---|
| **Home** | "Am I okay?" | The pulse: cash, profit, needs-attention count, latest activity. Incomplete onboarding shows as setup cards that fade once done. |
| **Review** | "What needs a decision from me?" | The single action queue. Today: confirm Penny's categorizations. Later: approve a bill, an unmatched deposit. Everything that needs the owner funnels here (badge with count). |
| **Reports** | "Show me the money" | P&L, Balance sheet, plain-language. Sub-segment: P&L · Trial balance · Balance sheet. Later: cash flow, tax summary. |
| **Connections** | "Bring in / share my data" | Permanent tab. Bank + accounting connectors, history import, **Invite accountant**. (This absorbs the old `Import` tab and the `InviteCpa` sidebar.) |
| **Advanced** *(secondary)* | The raw ledger for hands-on owners | Visually de-emphasized. Exposes **Journal · Chart of accounts · Periods** — the accountant-grade views. Present but never in the owner's face. |

**Why:** an owner is not an accountant. Journal / Chart of Accounts / period-close are accountant
tools — kept reachable (owner's decision was "show under Advanced") but out of the default path so
the owner's mental model stays a handful of plain words.

## 3. CPA lens

**A firm-level home + per-client workflow tabs.**

- **Practice home** (firm level) is the CPA's landing: which clients need review, what's
  uncategorized/unreconciled, upcoming period closes/deadlines — ranked across all clients.
- The **org switcher is the CPA's client list**; picking a client opens that client's books.
  **"+ Add client"** lives in the switcher (see §5).
- **Per-client tabs, in accounting-workflow order:**
  **Journal · Categorize · Chart of accounts · Reports (with Trial balance) · Periods (close & lock).**
- Read-only vs. full comes from the engagement (`access`); write affordances hide on read-only and
  the server refuses anyway (ARCHITECTURE §4.3). No cross-client leakage.

**Why:** a CPA lives in the ledger across many clients and wants efficiency. The switcher is their
primary nav; the workflow order matches how they actually close a set of books.

## 4. Staff / internal admin console

Two things live here, and they are **internal only** (gated by the `admins` allow-list;
`is_platform_staff()` / `is_platform_super()`), never shown to customers.

1. **`penny.founderfirst.one/admin` — the internal console (PLANNED, build after sign-off).**
   It **mirrors and will absorb `founderfirst.one/admin`** ([apps/admin](../admin)) over time:
   Support · Audience · Analytics · Penny (primary) + Settings (Emails · Quality · Admins · Audit ·
   How-it-works). Migration is **additive and parallel-run** — never break the existing `/admin`,
   migrate feature-by-feature off the same Supabase tables (one source of truth), no big-bang
   cutover. Follows [apps/admin/ADMIN_PRINCIPLES.md](../admin/ADMIN_PRINCIPLES.md) (jobs-not-tools,
   4–5 fixed tabs, max-3-depth).
2. **Break-glass books access** — today's [`/staff`](src/staff/StaffHome.tsx) console, folded in as
   a module. Cross-tenant, **time-boxed, read-only, and fully audited** (`open_break_glass` →
   `break_glass_grants` → `admin_audit`). This is the *only* way staff see a customer's books, and
   it is never silent (ARCHITECTURE §4.2).

**How staff reach it:** the account menu shows "Staff console" **because the email is on the
`admins` allow-list** — the same list that gates `founderfirst.one/admin`. There is no public link.

---

## 5. Cross-cutting rules

- **"+ New organization" / "+ Add client" belongs in the org switcher**, not stapled to the bottom
  of every page. It is a rare, high-commitment action; the switcher is where a user goes to change
  which books they're in. Remove it from the page body ([routes/Home.tsx](src/routes/Home.tsx)).
- **Lens is derived from relationship, not a URL** ([org/ActiveOrgProvider.tsx](src/org/ActiveOrgProvider.tsx)):
  owner/member → OwnerLens; cpa/firm_admin (own firm) or cpa-via-engagement → CpaLens. To *see* the
  CPA view for testing: from an owner account, **Invite accountant** with a second email you control,
  accept the link in another browser/incognito, sign in — that session renders the CPA lens.
- **Same app, two vocabularies.** Never fork the codebase per persona; branch the nav in the lens.
- Inherit the design system: `.eyebrow` + `.page-title`, tokens only, responsive width ladder
  ([apps/admin/RESPONSIVE.md](../admin/RESPONSIVE.md)). No inline hex / magic px.

## 6. How to reach each surface (for testing / support)

| View | URL | Login | Gate |
|---|---|---|---|
| Owner product | `penny.founderfirst.one/` | email magic link | membership (owner/member) |
| CPA | `penny.founderfirst.one/` (same app) | email magic link | engagement or firm membership |
| Break-glass staff | `penny.founderfirst.one/staff` | email magic link | `is_platform_staff()` (admins list) |
| Internal ops admin (existing) | `founderfirst.one/admin/` | email magic link → `/admin/support` | `admins` table (viewer/editor/super) — no public link |
| Internal admin (planned) | `penny.founderfirst.one/admin` | — | same `admins` allow-list |

---

## 7. Decisions log (1 Jul 2026)

Locked with Nik; do not silently reverse:

1. **Owner sees the accountant ledger under "Advanced"** — not top-level, not hidden entirely.
2. **"Connections" is a permanent owner tab** (not just setup cards) — bank/connectors/import/invite.
3. **CPAs get a firm-level "Practice home"** across all clients, above per-client books.
4. **`penny.../admin` will mirror `founderfirst.one/admin`** and absorb it over time —
   **planned now, built only after the plan is approved**; parallel-run, additive.

## 8. Build order

- **Phase 0 — Reconcile baseline.** Work from a worktree off `main` (== prod); leave `deploy-finish`.
- **Phase 1 — Owner lens.** Home · Review · Reports · Connections + Advanced; New-org → switcher.
  Touches [OwnerLens.tsx](src/lenses/OwnerLens.tsx), [Ledger.tsx](src/ledger/Ledger.tsx) (per-lens
  nav split), a new `Connections` view, [Topbar.tsx](src/components/Topbar.tsx), [Home.tsx](src/routes/Home.tsx).
- **Phase 2 — CPA lens.** Practice home + per-client workflow tabs; switcher as client list + Add
  client. Touches [CpaLens.tsx](src/lenses/CpaLens.tsx), a new `PracticeHome`,
  [ActiveOrgProvider.tsx](src/org/ActiveOrgProvider.tsx), the switcher.
- **Phase 3 — Internal admin console.** Detailed migration plan first (sign-off), then build the
  `penny.../admin` mirror of `founderfirst.one/admin`, folding in break-glass; parallel-run.
