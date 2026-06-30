# [stress:cpa-scope] CPA lens & access scope — findings + fixes

**TAG:** `CPATEST` · **Feature row 11** · prod ref `ejqsfzggyfsjzrcevlnq` · black-box,
server-probed (every result below is a real HTTP call against live prod with a
JWT-minted session — the UI gate was never trusted).

## What we crashed

Nothing in the security model — and that's the headline. The CPA access scope is
enforced **server-side at two layers** (RLS for reads, `can_write_org_as` inside
every `SECURITY DEFINER` write RPC), and it held under direct probing: a read-only
CPA's every mutation was refused with a real `42501` from Postgres, not a hidden
button. **But we crashed the one CPA control that exists only on paper:** the
owner's "hold my accountant's entries for approval" gate (`cpa_posts_require_approval`)
is wired end-to-end in the ledger — except **no edge function and no UI can ever turn
it on**. The write-path honours it, `approve_journal_entry` clears it, reports
exclude it, `CpaLens.tsx` documents it — and an owner has no way to reach it. Same
class of "built but unreachable" gap as the engagement-revoke hole that
`20260630110000_engagement_lifecycle.sql` was created to close. **Fixed** (write-path
+ owner UI), flagged un-deployed.

---

## Findings (ranked)

| # | Sev | Title | Verdict | Fix |
|---|-----|-------|---------|-----|
| F1 | **P2** | CPA approval gate is unreachable — no path sets `cpa_posts_require_approval` | **FAIL** (functional gap; safe default-off, no data risk) | **Fixed** — new RPC + `org-settings` edge fn + owner toggle |
| F2 | P3 | `engagements` RLS is firm-wide; a staff CPA can enumerate engagement rows (opaque client UUIDs + access level) for clients they're **not** assigned to | FAIL (low impact; metadata only) | **Documented, not patched** — touches a phase-0 RLS policy that `ISOTEST` (row 1) owns; proposed patch below |
| F3 | P3 | Owner approval action is not written to `ledger_audit` (only `approved_by` on the entry; the trigger is `after insert` so the status-change isn't logged) | Observation | Documented — proposed audit row below |
| — | PASS | read-only CPA — every mutation refused **server-side** | **PASS** | — |
| — | PASS | full CPA — mutations work; attribution correct | **PASS** | — |
| — | PASS | staff CPA sees only **assigned** clients; firm_admin sees all | **PASS** | — |
| — | PASS | assign / unassign gated to firm_admin; self-assign refused | **PASS** | — |
| — | PASS | revoke mid-session → next action 403 (no token-cache staleness) | **PASS** | — |
| — | PASS | same CPA full on Client A + read-only on Client B, one JWT | **PASS** | — |
| — | PASS | approval gate logic (once flag flipped): CPA→pending_review, owner→posted, CPA self-approve→403, reports exclude pending | **PASS** | — |
| — | PASS | org-switch re-scopes (all React-Query keys carry `orgId`); server enforces per-org regardless | **PASS** | — |

---

## Repro (live prod, server-probed)

Fixtures (TAG-namespaced): owner / firmadmin / staff `@cpatest.founderfirst.test`;
orgs **Client A** (`758f591d…`, engagement `full`), **Client B** (`dfa49f00…`,
engagement `read_only`), firm **Firmadmin's practice** (`635e552d…`).

### PASS — read-only CPA: every mutation refused server-side (firmadmin on Client B)
All seven returned **HTTP 403 / `42501`**, raised by the RPC *before* any row work:

| Mutation | edge fn | result |
|---|---|---|
| post entry | `ledger-entries` | 403 `forbidden: actor may not write org …` |
| account create/edit | `ledger-accounts` | 403 |
| period close | `ledger-periods` | 403 |
| period reopen | `ledger-periods` | 403 |
| reverse | `ledger-reverse` | 403 |
| categorize approve | `categorize` | 403 |
| import create | `imports` | 403 |

Confirmed defense-in-depth: even bypassing the edge fn, each `SECURITY DEFINER` RPC
(`post_journal_entry`, `upsert_ledger_account`, `close/reopen_accounting_period`,
`reverse_journal_entry`, `recategorize_entry`, `create_import_batch`,
`add_import_rows`, `commit_import_batch`) re-checks `can_write_org_as` first.

### PASS — full CPA mutations work + attribution (firmadmin on Client A)
post → `201 posted` (`posted_by` = firmadmin); reverse → `201`; account create →
`201`. `ledger_audit` recorded both with `actor` = firmadmin and the correct
`entry.post` / `entry.reverse` actions.

### PASS — staff need-to-know (staff = cpa member of firm, unassigned)
- staff sees **only** the firm in the org list; Client A/B reads = **0 rows** (RLS).
- firm_admin sees **all** firm clients (A, B, firm).
- staff write to Client A (engagement is `full`, but staff not assigned) → **403**.
- staff self-assign via `engagements` → **403** (`only the firm admin may assign`).
- firm_admin assigns staff → `200`; staff now reads Client A (2 rows) and posts
  (`201`, `posted_by` = staff); staff **still** can't read Client B (0 rows).

### PASS — revoke mid-session
Client A owner revokes engagement `6aae275b…` → `revoked`. With the **same live
JWT**, firmadmin's next post → **403**; assigned staff's next post → **403**;
firmadmin's reads drop to **0 rows** and Client A disappears from the org list. No
staleness — RLS + `can_write_org_as` re-evaluate per request. Non-owner/non-admin
revoke attempt → **403**.

### PASS — approval gate logic (flag flipped on a fixture org to exercise it)
With `cpa_posts_require_approval = true` on Client A:
- full CPA post → `pending_review` (not `posted`).
- owner (member) post → `posted` directly (gate only catches CPAs via engagement).
- CPA self-approve → **403** (`only a business member may approve`).
- reports view (`inBooks`, excludes `pending_review`): Revenue net **305** excluding
  the pending entry vs **1082** including it — pending correctly **excluded** from
  the books until approval.
- owner approves → `posted`, `approved_by` = owner.

### Ledger integrity
Client A trial balance ties to the cent after all mutations: **Σdebit = Σcredit =
11082**. 5 entries → 5 `ledger_audit` rows (1:1, no double-log). Client B (read-only)
never received a single row — exactly as intended.

---

## F1 fix (this PR) — make the approval gate reachable

- **Migration** `supabase/migrations/20260630120000_org_settings_writepath.sql`
  (⚠️ **write-but-don't-deploy** — flagged for integrator): adds
  `set_org_accounting_settings(p_actor, p_org, p_cpa_posts_require_approval,
  p_home_currency, p_fiscal_year_start_month)` — `SECURITY DEFINER`, **owner-only**
  (a CPA or non-owner member can't disable their own oversight), upserts the row,
  `service_role`-only EXECUTE. Mirrors the write-path pattern exactly.
- **Edge fn** `supabase/functions/org-settings/index.ts`
  (⚠️ **write-but-don't-deploy**): `POST { op:'set', org_id, cpa_posts_require_approval?,
  … }`; actor from the verified JWT (never the body); maps `42501→403`.
- **UI** (deploys with the app build): `apps/app/src/org/ApprovalSetting.tsx`, a
  read+toggle rendered in `OwnerLens` beside `InviteCpa`; reads via the RLS-readable
  `org_accounting_settings`, writes via `setOrgSettings` (new in `ledger/api.ts`).
- **Shared file touched:** `apps/app/src/styles.css` (added a scoped
  `.approval-setting` / `.approval-toggle` block using existing tokens — no edits to
  existing rules).

`tsc --noEmit` clean; `vite build` succeeds.

## F2 (proposed, NOT applied — `ISOTEST`/row-1 territory)

`engagements_select` uses `has_membership(firm_org_id) or has_membership(client_org_id)`
— firm-wide, so a staff CPA can read engagement rows (client UUID + access level)
for clients they're not assigned to. They **cannot** read those clients' books or
names (`organizations`/ledger RLS is `can_access_org`-scoped, assignment-gated), so
impact is low — opaque-UUID metadata only — but it deviates from the stated
"CPA sees only assigned clients" model. Proposed tightening (mirror
`has_engagement_access`), left for the RLS-owning session to land coherently:

```sql
create policy engagements_select on engagements
  for select using (
    has_membership(client_org_id)
    or (has_membership(firm_org_id) and has_engagement_access(client_org_id))
  );
```

## F3 (observation) — approval not in the audit timeline

`approve_journal_entry` records `approved_by` on the entry but writes no
`ledger_audit` row (the trigger is `after insert`; approval is an `update`). For a
complete CPA-trust trail, add an explicit insert in `approve_journal_entry`
(`action = 'entry.approve'`, actor = approver). Not applied — touches the shared
write-path migration owned by `JETEST`/row 2.
