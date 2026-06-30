# [stress:staff] Platform-staff / break-glass / admin tiers — findings + fixes

**TAG:** `STAFFTEST` · **Wave 3** · prod ref `ejqsfzggyfsjzrcevlnq`
**Surface:** `apps/app/src/staff/{StaffHome,api}.tsx`, `apps/app/src/App.tsx`,
migrations `20260629215000_phase5_platform_staff`, `20260629225000_phase5_staff_reads`,
`20260630060000_admin_roles_tiers`, `20260630065000_admin_rpc_editor_gate`.

## What we crashed

**One real break: a read-only VIEWER admin could open break-glass and read any
tenant's full books.** Break-glass — the single cross-tenant capability the staff
lens adds — gated `open_break_glass` on `is_platform_staff()` ("your email is in
`admins`"), which is **true for every admin tier, including viewer**. The
pre-onboarding admin-tiers work established "a viewer is read-only and makes NO
changes" and its companion re-gated 39 mutating admin RPCs to `is_admin_editor()`,
but that sweep **missed break-glass** because break-glass keys off
`is_platform_staff()`, not `is_admin()` — so the regex-driven re-gate never touched
it. Opening a window is a state-changing, audited WRITE that grants tenant book
access; it belongs behind the editor gate like every other admin mutation. Proven
live: a viewer-tier identity sailed past the staff check (`is_admin_editor() =
false`, yet `open_break_glass` admitted it). The 6 current prod viewers all had
this. **Fix:** `open_break_glass` now requires `is_admin_editor()`.

Everything else we threw at it **held** — see the PASS table. The transient-error
case the brief worried about is already correct: a failed staff check renders
"Couldn't verify access", never a false "Staff only" wall (`App.tsx:33`).

## Findings

| # | Sev | Status | What | Repro | Fix |
|---|-----|--------|------|-------|-----|
| F1 | **P2 / High** | **FIXED** | VIEWER (read-only) admin can OPEN break-glass — a privilege-expanding, audited write granting cross-tenant book reads | As any viewer-tier admin: `rpc open_break_glass(org, reason)` → succeeds (gate `is_platform_staff()` admits viewers). Proven via rolled-back prod sim: viewer `is_admin_editor()=false` but passes the staff gate. | `20260630130000_break_glass_editor_gate.sql`: gate `open_break_glass` on `is_admin_editor()` (editor/super). Body otherwise verbatim. |
| F2 | P4 / Low | NOTED (by design) | A VIEWER admin can call `log_admin_action` directly to inject audit rows (actor_email is auto-stamped to self, so no impersonation) | `rpc log_admin_action({...})` as a viewer → succeeds | Intentional: `log_admin_action` stays `is_admin()` so non-editor staff can still close+audit break-glass. Documented in `20260630065000`. Left as-is. |
| F3 | P5 / Info | NOTED | Repeated `open_break_glass` into the same org creates multiple concurrent grants (no dedup); each is audited + time-boxed | Open twice → two active grants | Behavioral, not a security break. Optional future: reuse/extend an open window. Not fixed. |
| F4 | P4 / Low | **FIXED (test)** | `phase5_platform_staff_test.sql` test 17 counted `break_glass.close` audit rows globally (not scoped to the fixture) → false-fails against any non-empty DB | Run the test against prod data → `have: 3, want: 1` | Scoped the count by `payload->>'grant_id'`. Also corrected the test's staff fixture to `editor` (was defaulting to `viewer`, which encoded the F1 bug as expected) and added 3 viewer-denial assertions. |

## What held (PASS) — proven on live prod

Runtime probes ran with a real non-staff tenant JWT (minted via Auth admin API);
tier/lifecycle probes ran inside transactions that `RAISE` at the end to force a
`ROLLBACK` (nothing persisted, no privilege granted).

- **Non-staff hitting /staff is refused, gracefully.** `is_platform_staff()=false`;
  `staff_list_orgs/break_glass` → `[]` (empty, never an error); UI shows "Staff only".
- **Transient RPC error ≠ "not staff".** `StaffRoute` renders "Couldn't verify
  access" on `isError` (`App.tsx:33`), only "Staff only" on a confirmed `false`.
- **Break-glass requires a reason** → `reason_required` (22023). Blank/whitespace rejected.
- **Break-glass gives READ-ONLY books** — there is no staff write RPC at all; tenant
  RLS (membership/engagement) is never widened by break-glass, so a staff write
  attempt is refused by the tenant write-path. Books readable only while open
  (55 accounts visible during the window).
- **Audited in admin_audit** — `break_glass.open`/`.close` each write exactly one row.
- **Auto-expires** — `staff_can_access_org` requires `expires_at > now()`; past-expiry
  → access `false`, `staff_list_accounts` → `[]`. Clamp 5min‥8h.
- **Break-glass into a non-existent org** → `org_not_found` (no_data_found).
- **VIEWER read-only everywhere** — every mutating admin RPC blocked: `set_live_prompt`,
  `reply_to_ticket`, `create_prompt_version` → "admin access required"
  (`is_admin_editor()` gate). All 39 mutating admin RPCs verified `is_admin_editor()`;
  the only `is_admin()` survivors are two trigger guard fns + the documented
  `log_admin_action` exemption.
- **EDITOR can edit but cannot manage the admin list** — `editor` passes
  `is_admin_editor()` (mutations reach their body) but `insert into admins` →
  "violates row-level security policy"; promoting another admin → 0 rows updated.
- **Only SUPER changes roles / promotes-to-super** — `admins` UPDATE policy =
  `is_super()`; viewer/editor self-escalate → 0 rows; super promote → 1 row.
- **Non-admin tenant cannot read the `admins` roster** — `GET /admins` → `[]`
  (roster leak fixed: select policy = `is_admin()`). Confirmed live + in-sim (0 rows).

## Method / isolation

- Black-box: no schema/migration/edge-fn/grant/config change deployed during testing.
  Deployed function bodies, RLS policies, and admin-tier distribution were read via
  the Management API and matched the migrations exactly.
- All fixtures namespaced `@stafftest.founderfirst.test`. Tier + break-glass-lifecycle
  scenarios ran in rolled-back transactions (terminal `RAISE`) so prod state was
  never mutated. `DELETE NOTHING` honored.
- The fix migration was syntax-validated against prod **inside `begin; … rollback;`**
  and the updated pgTAP suite (17/17) was run the same way — both rolled back; the
  live `open_break_glass` gate remains `is_platform_staff()` (NOT deployed).

## Deliverables / flags for the integrator

- **Migration (write-but-DON'T-deploy):** `supabase/migrations/20260630130000_break_glass_editor_gate.sql`.
  Re-defines `open_break_glass` only (gate swap). `close_break_glass` deliberately
  left on `is_platform_staff()` — closing only *reduces* exposure (de-escalation /
  safety valve any staff should trigger). Deploy via the normal wave.
- **Tests:** `supabase/tests/phase5_platform_staff_test.sql` extended to 17 (viewer
  cannot open break-glass; editor can; hermetic close-audit assertion).
- **No app/TS changes.** The staff UI is unaffected; the DB is the control. Optional
  follow-up (not required): the staff console could pre-disable the "Open break-glass"
  form for non-editor admins instead of surfacing the server error.
- **Fixture manifest:** `STAFFTEST_manifest.md`. **Un-run cleanup:** `STAFFTEST_cleanup.sql`.
