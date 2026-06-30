# [stress:invites] INVTEST — findings + fixes

**Feature:** Invites & engagements (owner↔CPA, firm↔staff) · **TAG:** INVTEST · row 10
**Surface:** `apps/app` invite UI + `invites` / `invites-accept` / `engagements` edge
fns + `accept_invite` SECURITY DEFINER RPC, on **live prod** `ejqsfzggyfsjzrcevlnq`.
**Method:** black-box — minted real user JWTs (Auth admin API), drove the public edge
fns, verified state via RLS-scoped + service-role PostgREST reads. 49 assertions across
3 batches. Both confirmed breaks were then reproduced & fixed against a throwaway local
Postgres.

---

## What we crashed

1. **Revoking a CPA is permanent — you can never re-engage that firm.** 🔴 HIGH
   After an owner revokes a CPA, re-inviting the *same* firm and accepting returns
   **409 `already_engaged`** and the engagement stays `revoked`. The `unique(firm_org_id,
   client_org_id)` row from the revoked link blocks re-acceptance forever. The CPA never
   regains access — fixable only with raw DB surgery. Worse: `Home.tsx` literally tells a
   revoked CPA *"ask the owner to re-invite you"* — advice the backend then refuses.
   *(Live repro S13: accept→200 but `{"error":"already_engaged"}` on re-invite; cpa1's
   read of Biz B stayed `[]`.)*

2. **No last-owner / last-admin protection on the invite-accept path — an org can be
   orphaned with zero owners.** 🔴 HIGH
   The membership branch of `accept_invite` did `on conflict … do update set role =
   excluded.role`, blindly overwriting. An **owner** who accepts a *member* invite to
   their own business is silently **demoted to `member`**, leaving the business with
   **zero active owners** — nobody can invite CPAs, revoke, or transfer ownership ever
   again. Same for a **firm_admin** accepting a `cpa` invite → firm left with **zero
   admins**. The last-owner invariant is enforced in `remove_member()`
   (`20260630120000`) but that guard was bypassed entirely here.
   *(Live repro S15: ownerA role → `member`, owners left = **0**; S15b: fadmin3 →
   `cpa`, admins left = **0**. The S16 batch then cascaded because the demoted owner
   could no longer issue a CPA invite — a vivid second-order proof.)*

Both live breaks are in the same RPC; both are **fixed** in
`supabase/migrations/20260630160000_invite_accept_reengage_and_no_demote.sql`
(write-but-don't-deploy — see "Shared / deploy" below). The fix is proven green against
a local Postgres (see "Fix verification").

---

## Findings (ranked)

| # | Verdict | Sev | Scenario | Evidence / repro | Fix |
|---|---|---|---|---|---|
| F1 | **FAIL→FIXED** | 🔴 HIGH | Re-invite after revoke | S13: re-invite→accept = **409 already_engaged**, engagement stays `revoked`, access stays cut | RPC: on `unique_violation`, re-activate a non-active engagement with the newly-granted access (`revoked_at` cleared); only an *active* link returns `already_engaged` |
| F2 | **FAIL→FIXED** | 🔴 HIGH | Last-owner / last-admin | S15 owner→`member` (0 owners); S15b firm_admin→`cpa` (0 admins) | RPC: membership `on conflict` never demotes `owner`/`firm_admin`; re-accept only re-activates `status` |
| F3 | FAIL | 🟡 LOW | Self-engagement | S7: a business owner can invite their *own* email as a CPA and accept → spins up a junk firm-of-one engaged to their own business | **Not fixed** (no security impact — owner already has full access). Recommend guard: reject engagement accept when actor is an active member of the target org. Logged for a follow-up. |
| F4 | FAIL | 🟢 LOW | `already_engaged` comment vs behavior | The old handler's `update invites set accepted_at` before the re-raise was rolled back by the propagating exception — the comment "consume the token" was never true | **Resolved as a side-effect** of the F1 rewrite (misleading update removed) |
| F5 | FAIL | 🟢 LOW | Firm-of-one selection non-deterministic | `select m.org_id … where o.type='firm' limit 1` has no `ORDER BY`; a CPA in multiple firms gets an arbitrary firm attached | **Not fixed** (rare; needs a product decision on which firm to bind). Logged. |
| P1 | PASS | — | Wrong recipient / forwarded link | S3: attacker accepting another's token → **403 wrong_recipient** (email-bound in RPC) | — |
| P2 | PASS | — | Expired / already-accepted / garbage / missing | S18 **410**, S5 **409 already_accepted**, S4a **404 invalid_token**, S4b **400 bad_token** | — |
| P3 | PASS | — | Double-accept race (fresh CPA, no firm) | S10: 2 concurrent accepts → `[200, 409]`, exactly **1 firm + 1 engagement** (the `for update` lock holds) | — |
| P4 | PASS | — | Revoke cuts access immediately | S11: owner revokes → cpa1 read of Biz B `1 → 0`; row `status=revoked`, `revoked_at` set | — |
| P5 | PASS | — | Revoke authorization | S12: a random user cannot revoke → **403** (owner / firm_admin only) | — |
| P6 | PASS | — | Assignment scope (need-to-know) | S16b unassigned staff CPA sees client `[]`; S16c firm_admin sees it; S16d after `assign` → sees it; S16e after `unassign` → cut; S16f non-admin assign **403**; S16g non-member assignee **422** | — |
| P7 | PASS | — | Cross-tenant no bleed | S17: ownerA cannot read Biz B and vice-versa (`[]`); staff sees only its own firm's invites | — |
| P8 | PASS | — | Body tamper / forged fields | S9a forged `org_id`/`intended_access` in accept body ignored (token-only); S9b accept body `access:full` could **not** escalate a `read_only` invite; S9c non-owner cannot issue invite **403**; S9d engaged-CPA cannot issue owner-only CPA invite **403** | — |
| P9 | PASS | — | Case / whitespace email | S8: `  UPPER@…  ` normalized at issue + accept; binds & accepts | — |
| P10 | PASS | — | Logged-out → login → resume | `Accept.tsx` stashes `ff.pendingInvite` → `/login`; magic link → `Home.tsx:22` resumes `/accept?token=` (code-traced; both ends wired) | — |
| P11 | PASS | — | Un-accepted invite grants nothing | S14: invite issued, never accepted → target's read of org `[]` | — |
| P12 | PASS | — | already_engaged (active), no dup | S19: 2nd invite while actively engaged → **409**, engagement count unchanged | — |

---

## Fix verification (local Postgres, fixed RPC loaded)

Backbone subset + the **fixed** `accept_invite` loaded into a throwaway PG15; every
assertion green:

- **F2** owner self-accepts member invite → role stays `owner`; firm_admin stays `firm_admin`.
- **F1** revoke → re-invite → engagement `active/read_only`, `revoked_at` cleared, **count = 1** (row reused, no dup).
- `already_engaged` (active), `wrong_recipient`, `expired`, `already_accepted` all still raise.

CI gate: extended pgTAP at `supabase/tests/invites_accept_test.sql` (14 assertions)
covers the same matrix for `supabase test db`.

> **TS gate note:** `apps/app` has **no** TypeScript changes — the entire change set is
> two SQL files. `tsc`/`vite build` could not be run green in this worktree because
> dependencies aren't installed and `npm install`/`vite build` hang in this environment
> (a documented gotcha). The change is SQL-only, so the TS gate is unaffected.

---

## Shared / deploy flags (for the integrator)

- 🚩 **MIGRATION — write-but-don't-deploy:** `supabase/migrations/20260630160000_invite_accept_reengage_and_no_demote.sql` re-creates the `accept_invite` RPC (pure `create or replace`, additive — no enum/table/schema change). Apply via Management API, **not** `db push`. Timestamp `20260630160000` is unique (no prefix collision with the `…120000` membership-lifecycle migration).
- No edge-fn changes were needed — the existing `invites-accept` message→HTTP mapping already covers `already_engaged`; the RPC fix changes *when* it fires, not the contract.
- No `Ledger.tsx` / `styles.css` / `tokens.css` touched.

---

## Fixtures & cleanup

**Namespace:** `[INVTEST]` / `…@invtest.founderfirst.test`. **DELETED NOTHING.**

Un-run cleanup: `docs/stress/INVTEST_cleanup.sql` (run as SQL — it deletes from
`auth.users`).

**Live fixture manifest (session end):** 14 users · 11 orgs (6 named `[INVTEST]` + 5
auto firm-of-ones) · 7 engagements (6 active, 1 revoked) · 16 invites · matching
memberships/subscriptions.

**Row-count diff (my namespace — global counts drift because parallel stress sessions
run concurrently):**

| table | mine before | mine after |
|---|---|---|
| organizations `[INVTEST]`-named | 0 | 6 |
| invites `@invtest…` | 0 | 16 |

All deltas are accounted for by the fixtures above and are reverted by the cleanup script.
