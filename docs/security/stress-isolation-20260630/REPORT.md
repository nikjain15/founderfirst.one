# [stress:isolation] Tenant-isolation stress test — findings + fixes

**Date:** 2026-06-30 · **Target:** prod `ejqsfzggyfsjzrcevlnq` (penny.founderfirst.one) · **Baseline:** `main` (phase-0 backbone + phase-2/3/4/5 write-path)
**Method:** live adversarial probing — minted real auth sessions (magiclink→OTP→JWT), created namespaced `[ISOTEST]` orgs, and attacked cross-tenant read/write through PostgREST, every edge function, and every RPC. *Assume broken until proven.*

## Verdict

One **P0** confirmed and **proven exploitable in production** (forged-actor cross-tenant writes via directly-callable RPCs), plus one Medium defense-in-depth gap, one Medium availability defect, and one Low informational note. **The RLS read path, the edge-function authorization layer, the CPA read_only/full/assignment model, and external-connection token protection all held under every probe** (53 read/write/IDOR/forgery/engagement probes passed).

| # | Severity | Title | Status |
|---|----------|-------|--------|
| **F1** | **P0 — Critical** | Forged-`p_actor` cross-tenant write via directly-callable `SECURITY DEFINER` RPCs | **FIXED** (migration, not deployed) |
| F2 | P2 — Medium (def-in-depth) | Latent client `INSERT/UPDATE/DELETE/TRUNCATE` grants on every tenant table | FIXED (same migration) |
| F3 | P3 — Medium (availability) | `can_access_org` RLS predicate not inlinable → per-row seq-scan, anon-triggerable slow query | Flagged (perf redesign — integrator) |
| F4 | Low — Informational | `invites-accept` is token-only, not email-bound (leaked link redeemable by any authed user) | Flagged (product decision) |

---

## F1 — P0: forged `p_actor` ⇒ cross-tenant write (PROVEN)

### What
Every write-path RPC is `SECURITY DEFINER` and authorizes against a **client-supplied `p_actor` argument** — `can_write_org_as(p_actor, p_org)` — *not* `auth.uid()`. The design assumes these RPCs are reached **only** through the service-role edge functions, which inject the JWT-verified actor (e.g. `supabase/functions/ledger-accounts/index.ts:51-52` passes `p_actor: user.id`). They are correct.

But the RPCs themselves are **`EXECUTE`-granted to `anon` and `authenticated`** (Postgres/Supabase default `EXECUTE → PUBLIC`, never revoked). So a client can skip the edge function entirely and call the RPC **directly** via PostgREST:

```
POST /rest/v1/rpc/upsert_ledger_account
{ "p_actor": "<a victim member's user_id>", "p_org": "<the victim's org_id>", ... }
```

`can_write_org_as(victim_uid, victim_org)` returns `true` for the forged actor and the mutation lands in the victim's tenant.

### Proof (live, against prod)
```
EXPLOIT 1 — Owner A's JWT, forged p_actor=UID_B, p_org=ORG_B → upsert_ledger_account
  → HTTP 200, account "[ISOTEST] PWNED-BY-A-via-rpc" created in Org B's chart of accounts
EXPLOIT 2 — anon key only (NO login), same forged body
  → HTTP 200, account "[ISOTEST] PWNED-BY-ANON-via-rpc" created in Org B
Service-role verify: both rows present in Org B. (Both deleted after proof.)
```

### Blast radius — 22 functions, all `EXECUTE`-able by `anon`+`authenticated`
`post_journal_entry`, `approve_journal_entry`, `reverse_journal_entry`, `upsert_ledger_account`,
`close_accounting_period`, `reopen_accounting_period`, `create_import_batch`, `add_import_rows`,
`commit_import_batch`, `discard_import_batch`, `recategorize_entry`, `learn_categorization_rule`,
`resolve_uncategorized_account`, `resolve_opening_balance_equity`, `accept_invite`, `assign_cpa`,
`unassign_cpa`, `remove_member`, `revoke_engagement`, **`transfer_ownership`**, plus the membership
oracles `can_write_org_as` / `has_membership_as`. The non-ledger primitives mean an attacker who
knows a `(member_uid, org_id)` pair can **post arbitrary journal entries, reverse entries, reopen
closed periods, kick members, reassign CPAs, or transfer org ownership** in any tenant.

`org_id` and a member `user_id` are not hard to obtain: an engaged **read_only** CPA can read
`organizations.created_by` and `journal_entries.posted_by` for their client (both readable under the
`can_access_org` SELECT policy) — yielding a valid actor and letting them **escalate read_only → full
write**.

### Root cause
`supabase/migrations/20260629125000_phase2_ledger_writepath.sql` (and the phase-3/4 write-path
migrations) define the actor-parameterized RPCs but never `REVOKE EXECUTE … FROM public`. The
security model is documented as "actor from JWT, never the body" — true at the edge-function layer,
but the RPC layer was left directly reachable.

### Fix — `supabase/migrations/20260701000000_isolation_revoke_rpc_execute.sql`
`REVOKE EXECUTE` on every `p_actor`-first `SECURITY DEFINER` function from `public`/`anon`/`authenticated`;
`GRANT EXECUTE … TO service_role` (the role the edge functions use). Functions are otherwise unchanged.
The only supported call path becomes edge function → service role → RPC, where the actor is the verified JWT.
- Matcher `pg_get_function_arguments(p.oid) ~ '^p_actor uuid'` selects exactly the 22 functions.
- Deliberately **excludes** `admin_list_audit` (its `p_actor` is a *text* email filter, self-guarded by `is_admin()`).
- Leaves RLS helpers (`can_access_org` / `can_write_org` / `has_engagement_access`) and the
  self-guarded `list_*` / `staff_*` readers executable — they use `auth.uid()`, never a passed actor.

### Validation (zero-persistence rollback txn against prod)
After applying the migration inside `BEGIN … ROLLBACK`:
`has_function_privilege('authenticated','upsert_ledger_account…')` → **false**,
`('anon','post_journal_entry…')` → **false**, `('authenticated','transfer_ownership…')` → **false**,
`('service_role','upsert_ledger_account…')` → **true**. RLS helpers + readers stayed **true**.
Prod left unchanged (re-checked post-rollback). Regression-guarded by `supabase/tests/isolation_rpc_execute_test.sql`.

---

## F2 — P2: latent client DML/TRUNCATE grants on every tenant table

`anon` and `authenticated` hold the full default `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER`
grant set on **all 17 tenant tables** (only `external_connections` had been locked to column-level SELECT).
The phase-0 migration documents "client-side is select-only" and even relies on it in a comment — but the
broad grants were never revoked; the `*_nowrite` RLS policies are what actually block client DML today.

Not directly exploitable right now: RLS (`for all using(false) with check(false)`) blocks DML, and
`TRUNCATE` (which RLS does **not** filter) isn't reachable through PostgREST. But it is real drift from
the intended model and a single `DISABLE ROW LEVEL SECURITY` — or one table that ships without a
`nowrite` policy — away from full client write/TRUNCATE access.

**Fix (same migration):** revoke `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` from `anon`/`authenticated`
on all tenant tables, keeping `SELECT` (RLS-filtered reads remain the supported client path). Validated: after
the migration the four sampled tables expose `SELECT` only.

---

## F3 — P3: `can_access_org` RLS predicate is a per-row, non-inlinable seq-scan (availability)

The SELECT policies (`using ( can_access_org(org_id) )`) call a `SECURITY DEFINER` `STABLE` function.
Postgres **cannot inline `SECURITY DEFINER` functions**, so it is invoked once per row in a sequential scan:

```
EXPLAIN on journal_lines (authenticated):
  Seq Scan on journal_lines  Filter: can_access_org(org_id)
  Rows Removed by Filter: 7025   Buffers: shared hit=28999   Execution Time: 4260 ms
```

Live: `anon` `GET /journal_lines?limit=1` **times out (HTTP 500, 3.1 s)** every time; an authenticated
own-org read takes ~4.3 s — at only ~7 k rows. The filter is **correct** (returns only the caller's rows,
no leak), but this is an availability/DoS risk that worsens linearly and is triggerable by an unauthenticated
caller. **Not fixed in this PR** (it's an RLS-shape redesign, not a one-line change). Recommended direction:
make accessible-org membership an indexable, once-evaluated set, e.g. policies of the form
`org_id IN (SELECT org_id FROM my_accessible_orgs())` so the planner runs the auth logic once as an InitPlan
and hash-semi-joins, instead of per row. Integrator decision — flagged, not auto-applied.

---

## F4 — Low/Informational: `invites-accept` is token-only, not email-bound

`supabase/functions/invites-accept/index.ts:50-57` looks the invite up by **token only** and never checks
that the accepting user's email matches `invites.email`. Acceptance is a pure bearer-token operation: anyone
who obtains a valid (unexpired, unconsumed) invite link can redeem it as themselves and gain the intended
membership/engagement. The token is a 96-char random string (unguessable), so this is not directly an IDOR —
but a forwarded/leaked link is redeemable by an unintended identity. Common invite-link design; noting for a
product call on whether to bind acceptance to the invited email.

---

## PASS matrix — everything that correctly held (53 probes)

| Area | Probes | Result |
|------|--------|--------|
| A reads B — every tenant table (direct PostgREST, by org_id and by row id) | 19 | **0 rows every time** |
| CPA with no engagement reads A/B | 2 | 0 rows |
| Anon reads every tenant table | 17 | 0 rows (`journal_lines` → see F3) |
| `external_connections` tokens — A reads own + B's `access_token`/`refresh_token` | 3 | **HTTP 403** (column grant excludes tokens; even own org) |
| A writes B via PostgREST (DELETE/UPDATE/INSERT entry, account, membership; self-insert as owner) | 5 | blocked (403 / 0 rows affected) |
| Edge-fn IDOR — A's JWT, honest `org_id=B` (ledger post/approve/reverse, accounts, periods, imports commit/add, categorize, qbo/xero import, connect, invites) | 12 | **403 / 404** |
| Forgery — lie about `org_id`/`actor` to reach B's objects (claim B's account is in A; post in A with B's accounts; inject `actor=UID_B`; commit B's batch as org=A) | 4 | rejected (account-ownership / org-scope / actor-from-JWT) |
| CPA engagement combos — read_only reads-not-writes, full writes-only-assigned-client, unassigned firm member sees nothing | 9 | all enforced |
| Proper invite authz + bogus-token accept | 2 | 403 / 404 |

B's data verified pristine after the write/IDOR/forgery battery (name, status, membership unchanged).

---

## Deliverables in this folder
- `REPORT.md` — this report.
- `manifest.json` — fixture inventory (org/user ids; live JWTs stripped).
- `cleanup.sql` — **un-run**, scoped teardown (4 org ids + 4 user ids; guards the shared FIRM; never the email wildcard).
- Fix: `supabase/migrations/20260701000000_isolation_revoke_rpc_execute.sql` (**not deployed** — integrator sequences + deploys).
- Test: `supabase/tests/isolation_rpc_execute_test.sql` (31 assertions; runs in the db-tests CI gate — needs docker, unavailable in this session).

## Notes for the integrator
- **Deploy F1 ASAP** — it is exploitable on prod right now by any anonymous caller. Migration is additive, idempotent, no data change; validated in a prod rollback transaction. Edge functions use `service_role` and are unaffected.
- This change is **SQL-only** (one migration + one pgTAP test); no TypeScript touched, so `tsc`/site builds are unchanged from `main` (deps weren't installed in this worktree; pgTAP needs docker → runs in CI).
- Migration timestamp `20260701000000` sits after the prod ledger head (`20260630140000`); no prefix collision.
- F3/F4 are intentionally **not** auto-fixed (perf redesign / product decision).
- Fixtures left in place per the manifest; `cleanup.sql` is un-run. The shared `cpa@isotest` identity is `firm_admin` of FIRM and a parallel session engaged its business to FIRM — run cleanup only after parallel isolation sessions finish.
