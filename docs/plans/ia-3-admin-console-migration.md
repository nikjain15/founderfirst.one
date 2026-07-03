# IA-3 · Internal admin console migration plan (`penny.founderfirst.one/admin`)

Status: DRAFT — awaiting Nik sign-off · 2026-07-03 · Owner: Nik

> **Plan-only.** No migrations, no feature code ship from this card. IA-3 is
> `blocked:plan sign-off` in [BACKLOG.md](BACKLOG.md); it unblocks only when Nik approves
> this document. Companion specs: [apps/app/APP_PRINCIPLES.md](../../apps/app/APP_PRINCIPLES.md)
> §4 & §8, [ARCHITECTURE.md](ARCHITECTURE.md) §4.2, [apps/admin/ADMIN_PRINCIPLES.md](../../apps/admin/ADMIN_PRINCIPLES.md).

---

## 0. The parallel-run principle (read first)

The fold-in is **additive and parallel-run — no big-bang cutover.**

- Build the internal console **inside `apps/app`** at `penny.founderfirst.one/admin`, module by
  module, **alongside** the live `founderfirst.one/admin` ([apps/admin](../../apps/admin)).
- **`founderfirst.one/admin` never breaks and never regresses** during the migration. It stays the
  authoritative surface until, per module, the mirror is proven at parity and Nik green-lights the
  retirement of that module.
- **One Supabase source of truth.** Both surfaces read/write the *same* tables, RPCs and edge
  functions (LEARNINGS #6 — one concept, one store, or it drifts). The mirror is a **new front-end
  over the existing back-end**, not a new back-end.
- Keep **both live for the whole parallel-run window (proposed 6–8 weeks)**; retire the old surface
  only after the whole console reaches parity and soaks.

This mirrors the Phase-5 `/staff` fold-in that already shipped (memory: *Admin fold-in must be
parallel-run*; *Phase 5 platform-staff lens*).

---

## 1. Goal & non-goals

### Goal
Give platform staff a single internal console **inside the product they operate** — same login, same
design system, same org-switcher shell — that mirrors every operational surface of
`founderfirst.one/admin` and folds in the existing `/staff` break-glass module, so we run *one* app
instead of two deploy targets.

### Non-goals (explicit)
- **Not** a rewrite of any back-end. RPCs, edge functions, Supabase tables, crons — untouched.
- **Not** a redesign of admin IA. Preserve [ADMIN_PRINCIPLES.md](../../apps/admin/ADMIN_PRINCIPLES.md)
  (jobs-not-tools · 4–5 fixed tabs · max-3-depth · one-home). Move, don't reinvent.
- **Not** a customer surface. The console is internal-only, gated identically to today.
- **Not** a data migration — there is no data to move; both surfaces hit the same DB.
- **Not** a cutover in this card. Retirement of `founderfirst.one/admin` is a *later, separate*
  Nik-gated decision (§4 criteria), after soak.

---

## 2. Inventory — every `/admin` surface → target home in `penny/admin`

Source of truth: [apps/admin/src/App.tsx](../../apps/admin/src/App.tsx) routes (verified against
`origin/main`). Target = the mirrored console tab in `apps/app`. The console keeps the **same 4
primary tabs + ⚙️ Settings** IA as today.

### Primary tabs

| # | `/admin` route | Component | Target in `penny/admin` | Move? |
|---|---|---|---|---|
| 1 | `/support`, `/support/:ticketId` | Inbox, TicketDetail | **Support** | ✅ mirror |
| 2 | `/audience` (`#web`/`#discord`/`#signals`) | AudienceHome (Users, DiscordLinks, Signals) | **Audience** | ✅ mirror |
| 3 | `/analytics` (`#waitlist`/`#product`/`#marketing`/`#support`/`#signals`/`#visibility`) | AnalyticsHome (+ AnalyticsInsights, AnalyticsPostHog) | **Analytics** | ✅ mirror |
| 4 | `/content`, `/site-content`, `/blog-posts`, `/content-pipeline` | ContentHome (Prompt, Voice, Discord, Outreach), SiteContent, BlogPosts, ContentPipeline | **Penny** | ✅ mirror |

### ⚙️ Settings menu

| `/admin` route | Component | Target | Move? |
|---|---|---|---|
| `/emails` | EmailHub (Templates · Scheduled · Activity) | Settings → **Emails** | ✅ mirror |
| `/quality` | Quality (`audit_runs` dashboard) | Settings → **Quality** | ✅ mirror |
| `/ai-quality` | AIQuality (+ AICatalog/AIModels/AIEvals/AIRamp/AIReview) | Settings → **AI quality** | ✅ mirror |
| `/build` | Build (loop status dashboard) | Settings → **Build** | ✅ mirror |
| `/experiments` | Experiments | Settings → **Experiments** | ✅ mirror |
| `/admins` | Admins (allow-list invite/remove, `is_super`) | Settings → **Admins** | ✅ mirror |
| `/audit` | Audit (audit-event browser) | Settings → **Audit log** | ✅ mirror |
| `/how-it-works` | HowItWorks + WhatsNew | Settings → **How it works** | ✅ mirror |

### Already in `apps/app` (fold in, don't re-mirror)

| Surface | Component | Target |
|---|---|---|
| `/staff` break-glass console | [apps/app/src/staff/StaffHome.tsx](../../apps/app/src/staff/StaffHome.tsx) | A **module inside** the console (Support-adjacent, e.g. "Break-glass" under Settings or a top-level "Books access"). Cross-tenant, time-boxed, read-only, audited. |

### Flag: do NOT move / handle specially
- **`Login.tsx` / the auth shell** — the console reuses `apps/app`'s existing Supabase session; there
  is **no second login**. Staff already sign into `penny.founderfirst.one`.
- **`devAuth` / `CONTENT_MOCK` bypasses** — dev-only in apps/admin; do **not** port the mock-content
  bypass into the product bundle. The console renders from real RPCs or shows empty states.
- **Mac-host-dependent features** — "Draft with AI" (email-compose) historically routed to a Mac
  Ollama tunnel; per LEARNINGS #13 it moved to Workers AI. **Verify the current path before mirroring**
  so we don't reintroduce a laptop dependency (Decision D5).
- **Back-compat redirects** (`/users`→`/audience#web`, etc.) — recreate as convenience redirects on
  the *new* surface only if staff have muscle-memory URLs; low priority.

---

## 3. Phased migration sequence

Each phase is **independently shippable, independently reversible, and behind a feature flag** (a
console nav that only lists modules that are live). `founderfirst.one/admin` stays fully functional
throughout every phase.

### Phase 0 — Console shell + gating (no feature parity yet)
- New route tree in `apps/app` at `/admin` (staff-only). Reuse the authed header/nav pattern
  (`packages/design-system`), the org-switcher shell, and the **existing** `is_platform_staff()`
  gate. Account menu shows "Internal admin" only when the email is on the `admins` allow-list.
- Fold the existing `/staff` break-glass console in as the first live module (it already exists —
  this is a re-home, not new code).
- **Shippable** on its own: staff get the shell + break-glass at `penny/admin`; `/staff` stays as a
  redirect. **Reversible**: remove the nav entry; no back-end change.

### Phases 1–4 — Mirror one primary tab per phase (additive)
Order by **read-mostly-first** (lowest blast radius) → write-heavy last:

- **Phase 1 — Analytics** (read-only dashboards; safest to mirror first).
- **Phase 2 — Support** (ticket read + reply; verify reply write-path parity carefully).
- **Phase 3 — Audience** (waitlist/Discord/Signals; Signals has write actions → scrutinize).
- **Phase 4 — Penny** (Prompt/Voice/Discord/Outreach/Site-copy/Blog — these edit **live runtime
  language**; highest risk, mirror last with the most verification).

Each: mirror the tab against the same RPCs, verify parity (§5), ship it live on `penny/admin`. The
old tab keeps working. **Reversible** per tab: drop the nav entry.

### Phase 5 — Mirror ⚙️ Settings modules
Emails · Quality · AI quality · Build · Experiments · Admins · Audit log · How-it-works. **Emails and
Admins are write-heavy** (they send mail / grant access) — mirror those with an editor-gate check
and end-to-end send/grant verification.

### Phase 6 — Parallel-run soak (proposed 6–8 weeks total window)
Both surfaces live. Staff use `penny/admin` day-to-day; `founderfirst.one/admin` is the fallback.
Collect: any parity gap, any error, any "I had to go back to the old one".

### Phase 7 — Retirement of `founderfirst.one/admin` (SEPARATE Nik gate)
Only after every module is at parity and the soak is clean. Cutover = the old surface becomes a
banner + redirect to `penny/admin`, then (later still) the `apps/admin` app is retired from the
build. **This card does not authorize retirement** — it defines the criteria (below).

**Retirement criteria (all must hold):**
1. 100% of `/admin` routes mirrored and each verified at parity (§5).
2. Full soak window elapsed with no staff-reported parity gap.
3. Audit-ledger row `IA-3` has had its stress pass (leaves ⬜, §6).
4. No feature still exclusively reachable via `founderfirst.one/admin`.
5. Nik explicit sign-off on retirement (a second, separate approval).

---

## 4. Data / auth model — reuse, don't reinvent

**Everything already exists.** The console is a new UI over the current controls.

- **Gate (who sees the console):** `is_platform_staff()` — the same `admins` allow-list that gates
  `founderfirst.one/admin` today (APP_PRINCIPLES §4; ARCHITECTURE §4.2). One list, both surfaces
  (LEARNINGS #6). The UI gate is a courtesy; **the database is the control**.
- **Editor vs. viewer:** mutating admin RPCs are already re-gated to `is_admin_editor()` (editor or
  super) — see `20260630065000_admin_rpc_editor_gate.sql`. The mirror calls the **same** RPCs, so
  the viewer/editor/super tiers carry over for free. Do not add a parallel gate.
- **Break-glass (staff → tenant books):** unchanged pipeline —
  `open_break_glass` (requires `is_admin_editor()`, `20260701130000`) → `break_glass_grants`
  (time-boxed 5–480 min, read-only) → `staff_list_*` self-gating security-definer RPCs → `admin_audit`.
  Closing stays on `is_platform_staff()` (de-escalation). Never silent.
- **Audit logging:** every mutation already routes through `log_admin_action()` / `logAudit()`. The
  mirror reuses those, so the Audit-log tab shows the same events regardless of which surface acted.
  Add an `actor_surface` note (e.g. `penny_admin` vs `ff_admin`) in the audit metadata so we can tell
  which console performed an action during the parallel-run (helps prove parity; Decision D3).
- **RLS:** admin RPCs are `security definer` and revoked from `public`, granted to
  `authenticated`/`service_role`; access is enforced inside the function body (`is_admin*` checks),
  not by RLS on the caller. The mirror inherits this unchanged.

No new tables. No new grants beyond (optionally) the `actor_surface` metadata field.

---

## 5. Risks, mitigations & verification

| Risk | Mitigation |
|---|---|
| **Breaking `founderfirst.one/admin`** (the cardinal rule) | It is a *separate app/deploy*; the mirror is purely additive in `apps/app`. No shared front-end code is edited. CI keeps `apps/admin` building. Nothing in this plan touches `apps/admin/src`. |
| **Back-end drift between surfaces** | Both call the *same* RPCs/functions. Forbid duplicating any query logic — if a helper is needed, extract to a shared package, don't fork. (LEARNINGS #6.) |
| **Silent parity gaps** (a mirrored tab looks right but a write no-ops) | Per-tab verification below. Verify the *deployed artifact*, not source (LEARNINGS #9, #14). |
| **Reintroducing a Mac/laptop dependency** (Draft-with-AI) | Confirm the live compose path is Workers AI before mirroring (LEARNINGS #13, Decision D5). |
| **Privilege leak** (a viewer gaining an editor action in the mirror) | Mirror calls the same `is_admin_editor()`-gated RPCs; add a pgTAP assertion that each mirrored write RPC still refuses a viewer. |
| **Two consoles confuse staff mid-window** | Console nav lists only *live* modules; old surface shows a "now available in penny/admin" hint per migrated tab (non-breaking). |
| **CSS/build silent failure** | Keep `pnpm check:css` green (LEARNINGS #14); verify live bundle per phase. |

**Verification strategy per phase:**
1. **Auth gate:** non-admin session → console 404/denied; viewer sees read-only; editor/super see
   writes. (pgTAP already covers the RPC gates; add a UI e2e walk.)
2. **Parity:** for each mirrored tab, perform the same read + the same write on both surfaces and
   diff the DB result (same row written, same audit event). Break-glass: open→read→close, confirm the
   `admin_audit` trail.
3. **Deployed-artifact check:** fetch the live `penny/admin` bundle, confirm the module renders and
   the RPC round-trips (LEARNINGS #5, #9, #14). `apps/app` deploys from `main` == prod — verify from
   the system.
4. **Regression:** run existing admin/app e2e; add a `penny/admin` smoke that walks every live tab
   on the responsive width ladder ([RESPONSIVE.md](../../apps/admin/RESPONSIVE.md)).

**Audit-ledger coverage delta (§6).**

---

## 6. Audit-ledger coverage delta

Per [AUDIT.md](../AUDIT.md) § The loop: a new surface = a new ledger row, starting ⬜ untested, that
leaves ⬜ only via a formal adversarial stress pass.

- **New row `IA-3` — Internal admin console (`penny/admin`) mirror + break-glass fold-in.**
  Tests: `apps/app` e2e console walk (auth gate + per-tab parity) + pgTAP asserting mirrored write
  RPCs refuse a viewer + break-glass open/close audit trail. **Status: ⬜ untested (red-team per PR;
  stress pass scheduled).**
- Cross-reference existing rows for surfaces the console touches so their failure modes are design
  constraints: `IA-1` (owner nav), the break-glass rows, and any Support/Signals/Emails rows.
- Retirement (Phase 7) is gated on this row having had its stress pass.

---

## 7. Decisions Nik must make to unblock

| # | Decision | Recommendation |
|---|---|---|
| **D1** | **Approve the plan** (unblocks IA-3 from `blocked:plan sign-off`). | — |
| **D2** | **Parallel-run window length.** Proposed **6–8 weeks** across all phases before any retirement decision. | Accept 6–8 wks |
| **D3** | Add an `actor_surface` marker (`penny_admin` vs `ff_admin`) to admin-audit metadata during parallel-run to prove parity? | Yes — cheap, aids parity proof |
| **D4** | **Phase order** — read-mostly first (Analytics → Support → Audience → Penny → Settings). Agree, or prioritize a specific tab? | Accept as proposed |
| **D5** | **Draft-with-AI path** — confirm it now runs on Workers AI (not the Mac Ollama tunnel) before mirroring Emails; if still Mac-bound, is fixing that in-scope for IA-3 or a separate card? | Confirm first; likely separate card |
| **D6** | **Where break-glass lives in the console IA** — top-level "Books access" tab, or a Settings module? (It's the only cross-tenant capability.) | Recommend a distinct, visible top-level module (it's high-consequence) |
| **D7** | **Retirement authority** — confirm Phase 7 (retiring `founderfirst.one/admin`) is a *separate* future sign-off, not implied by approving this plan. | Yes — separate gate |
| **D8** | Recreate the old `/users`,`/signals`,`/discord` convenience redirects on the new surface, or drop them? | Low priority; drop unless staff rely on them |

---

## 8. Summary

**7 phases** (0 shell+break-glass → 1–5 mirror tabs/settings → 6 soak → 7 retire), **fully additive
and reversible**, **6–8-week parallel-run window**, **zero back-end change** (one Supabase source of
truth), `founderfirst.one/admin` **never broken**, retirement gated on parity + soak + the `IA-3`
stress pass + a **separate** Nik sign-off.
