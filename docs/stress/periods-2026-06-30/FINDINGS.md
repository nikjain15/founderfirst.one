# [stress:periods] — accounting-period locking & audit-trail stress-test

**Date:** 2026-06-30 · **Target:** prod `penny.founderfirst.one` (ref `ejqsfzggyfsjzrcevlnq`) · **Baseline:** `main` @ `50861aa`
**Scope:** period close/reopen, the posting/approval/reversal write-path, the audit trail, and their boundaries.

All scenarios were run live against prod with isolated `[PERIODTEST]` fixtures (see `manifest.md`).
Every fix in this PR is reproduced **before/after** on a local Postgres 15 loaded with the **exact prod
function bodies** (`scratchpad/` harness; commands in §Repro). Books stayed balanced throughout
(Σdebits = Σcredits, 0 unbalanced entries) — the breaks are *period-integrity*, not arithmetic.

## Findings (ranked)

| # | Sev | Title | Status |
|---|-----|-------|--------|
| F1 | **P0** | `close` races a concurrent `post` → entry lands in a **closed** period | ✅ **Fixed + DEPLOYED to prod + verified live** |
| F2 | **P1** | Approval workflow **bypasses the period lock** — approve finalizes an entry into closed books | ✅ **Fixed + DEPLOYED + verified live** |
| F3 | **P1** | `reverse` is **bricked** once the current month is closed (contradicts the documented invariant) | ✅ **Fixed + DEPLOYED + verified live** |
| F4 | **P1** | **Prod ↔ `main` drift**: the entire `ledger_audit` trail exists on prod but not in `main` | **Flag for integrator** (land PR #122) |
| F5 | **P3** | Closed-period → HTTP 409 mapping depends on a **message regex**, not the SQLSTATE | Documented (latent) |
| F6 | **P3** | Period auto-creation is **unbounded** — a typo'd date (`2099`, `1900`) silently mints a period | Documented |
| F7 | **P3** | `ledger-periods` returns **HTTP 400 instead of 404** for a not-found / cross-org period (matched the condition *name*, not SQLSTATE `P0002`) | ✅ **Fixed** (edge fn) |

> **Deployed 2026-06-30** to prod `ejqsfzggyfsjzrcevlnq` via the Management API (atomic `create or replace` of the
> three functions). The deployed `reverse_journal_entry` is the **combined** version: it carries both this PR's
> F3 roll-forward **and** the sibling [stress:journal] PR's `FOR UPDATE` on the original entry (migration
> `20260630130000`, the double-reversal P0) — so deploying mine cannot regress theirs in either order. The repo
> migration is timestamped `…160000` (after `…130000`) so a full replay ends on the combined version. Rollback
> script captured in `scratchpad/rollback.sql` (the exact pre-deploy defs). **Live re-test after deploy:**
> approve-into-closed → **409** (was 200) · reverse-after-close → **201**, lands in the open period (was 409) ·
> double-reversal → **409 already_reversed**.

Confirmed **safe** (verified, not re-flagged): close→post-into-closed → 409 ✓ · reopen records who/when **and
captures the prior closer before nulling** `closed_by/closed_at` ✓ · close→reopen→close audit chain intact, no
lost history ✓ · auto-create of an open monthly period on first post ✓ · read_only CPA **and** non-member →
403 on close/reopen ✓ · UTC/month-boundary handling (the period functions key off a `date`, no TZ conversion) ✓.

---

### F1 — `close` races a concurrent `post` (P0)

**What.** `post_journal_entry` runs as **one** `READ COMMITTED` statement, so its whole body sees a single
snapshot. `ensure_open_period` read the covering period's `status` **without a row lock** and the function then
inserted the entry **without re-checking**. A `close_accounting_period` that commits during a concurrent post is
invisible to that post → the entry is written into a now-**closed** period. There is no FK or trigger that checks
period status on `journal_entries` insert, so nothing else catches it.

**Where.**
- [`supabase/migrations/20260629125000_phase2_ledger_writepath.sql:75`](../../../supabase/migrations/20260629125000_phase2_ledger_writepath.sql#L75) — `ensure_open_period` SELECT had no `FOR SHARE`/`FOR UPDATE`.
- [`…writepath.sql:248`](../../../supabase/migrations/20260629125000_phase2_ledger_writepath.sql#L248) — `post_journal_entry` calls `ensure_open_period` then inserts, no re-validate.

**Repro (deterministic, local — `scratchpad/race_demo.sh`).** Session A holds a post's period read open for 3 s;
session B times a `close` on the same period:
```
ORIGINAL (no FOR SHARE): close() waited   59 ms   ← close sailed past the in-flight post (RACE)
FIXED   (FOR SHARE):     close() waited 2052 ms   ← close correctly blocked behind the post
```
A live 40-post / 14-close burst against prod also produced 3 posts time-correlated to a closed-period window
(`scratchpad/scenarios2.py`, `S8`) — corroborating, though the lock demo is the airtight proof.

**Fix.** `ensure_open_period` now takes `... FOR SHARE` on the covering-period read. `close`'s `UPDATE` (a
`FOR NO KEY UPDATE` lock) conflicts with `FOR SHARE`, so close and an in-flight post are **mutually exclusive** on
that row; if the close wins, `FOR SHARE` follows the row to its latest version and reads `status='closed'` →
reject. Concurrent posts into the *same open* period still run in parallel (shared locks don't conflict).
→ [`20260630160000_period_lock_hardening.sql`](../../../supabase/migrations/20260630160000_period_lock_hardening.sql) (F1 block).

---

### F2 — approval workflow bypasses the period lock (P1)

**What.** `approve_journal_entry` had **no period check**, and `close_accounting_period` doesn't guard against
`pending_review` entries. So an owner can: close a period that still holds a `pending_review` entry, then
**approve** it → the entry flips `pending_review → posted` **inside the closed period**, after close. A CPA's
trial balance for locked books changes post-close. Confirmed live: `close → 200`, `approve → 200`, final state
`entry.status=posted, period.status=closed` (`scenarios2.py`, `F4`).

**Where.** [`…writepath.sql:282`](../../../supabase/migrations/20260629125000_phase2_ledger_writepath.sql#L282) — `approve_journal_entry`, no period gate.

**Repro (local before/after — `scratchpad/functest.sql`).**
```
BASELINE: [F2-neg] FAIL: approve into CLOSED period SUCCEEDED (bug!)
FIXED:    [F2-neg] PASS: approve into CLOSED rejected -> SQLSTATE 23001 / period_closed: … cannot be approved
```

**Fix.** `approve_journal_entry` now reads the entry's period `FOR SHARE` and refuses when it is `closed`
(message contains `period_closed`, so the edge fn's existing regex maps it to **409** — no edge change needed).
→ migration F2 block. *(Optional future hardening: also warn/block `close` when the period has `pending_review`
entries — not done here to keep the change minimal; the authoritative gate is on the approve side.)*

---

### F3 — `reverse` is bricked once the current month is closed (P1)

**What.** `reverse_journal_entry` defaults the correction date to `current_date`, and the UI
([`apps/app/src/ledger/Ledger.tsx:375`](../../../apps/app/src/ledger/Ledger.tsx#L375)) **never passes a date**. So
the moment the **current month's** period is closed, *every* reversal is dated "today" → falls in the closed
period → `period_closed` 409, with no recourse in the product. This contradicts the function's own documented
invariant: *"The correction lands in an OPEN period."*

**Where.** [`…writepath.sql:332`](../../../supabase/migrations/20260629125000_phase2_ledger_writepath.sql#L332) — `v_date := coalesce(p_entry_date, current_date)` with no open-period fallback · `Ledger.tsx:375` — caller omits `entry_date`.

**Repro.** Live `S7` (`scenarios.py`): reverse of an entry in the just-closed June period → `409 period_closed`.
Local before/after (`functest.sql`):
```
BASELINE: [F3] FAIL: reverse-after-close raised 23001 / period_closed: 2026-06-30 falls in a closed period
FIXED:    [F3] reverse-after-close: status=posted period=open date=2026-07-01 … PASS: rolled forward into an open period
```

**Fix.** On the **default** path, `reverse_journal_entry` rolls the correction forward by whole months until it
reaches an open (or not-yet-existing → auto-created open) period, bounded to 10 years. An explicit caller
`p_entry_date` is still honored as-is (and still rejected by `ensure_open_period` if the caller chose a closed
month). → migration F3 block. No UI change required — reverse "just works" again.

---

### F4 — prod ↔ `main` schema drift on the audit trail (P1, flag for integrator)

**What.** The whole `ledger_audit` trail — `20260630080000_ledger_audit.sql`, plus the audit-capturing
`close`/`reopen` (reopen records `was_closed_by`/`was_closed_at` **before** nulling `closed_by/closed_at`) — is
**live on prod** but is **not in `main`**. It exists only on the unmerged branch at commit `2ad3ad7` (PR #122,
"#1–#15 pre-onboarding fixes"). A fresh deploy / `db reset` from `main` would silently **lose the entire ledger
audit trail** and revert `reopen` to the closed_by-nulling version. CI also can't gate it (`db-tests.yml` lives
on the same unmerged branch).

**Evidence.** `to_regclass('public.ledger_audit')` is non-null on prod and the prod `reopen` body captures the
prior closer (verified live); `git merge-base --is-ancestor 2ad3ad7 HEAD` → **not an ancestor**; the file is
absent from `supabase/migrations/` on `main`.

**Action (not auto-fixed here — avoids duplicating/colliding with #122).** Land PR #122 to `main`. This PR's
migration (`…100000`) is deliberately **independent**: it only `create or replace`s `ensure_open_period` /
`approve_journal_entry` / `reverse_journal_entry` (none touched by #122) and does **not** reference `ledger_audit`,
so it applies cleanly with or without #122, in any order.

---

### F5 — closed-period 409 depends on a message regex (P3, latent)

`ensure_open_period` raises `restrict_violation` (SQLSTATE `23001`), which is **not** in the edge functions'
status map; the 409 is produced only by `/period_closed/.test(message)`
([`ledger-entries/index.ts:40`](../../../supabase/functions/ledger-entries/index.ts#L40),
[`ledger-reverse/index.ts:28`](../../../supabase/functions/ledger-reverse/index.ts#L28)). Renaming the exception
message would silently downgrade the closed-period response to 400/500. Works today (all my new messages keep the
`period_closed` token); flagged as fragile. Left as-is to avoid behavioral risk in this PR.

### F6 — unbounded period auto-creation (P3)

Posting an entry dated `2099-12-31` or `1900-01-15` returns `201` and silently mints a far-future/past monthly
period (`scenarios.py`, `S9`). A fat-fingered year creates junk periods that then appear in the Periods UI. Low
impact (still balanced, still tenant-scoped); a sane `entry_date` bound (e.g. within fiscal config ± N years)
would be a reasonable follow-up. Not fixed here.

---

## Repro / harness

Local (no Docker; Postgres 15 via Homebrew), exact prod function bodies:
```
scratchpad/bootstrap.sql        minimal ledger schema + deferred balance trigger
scratchpad/writepath_funcs.sql  the ORIGINAL write-path funcs (extracted from 20260629125000)
scratchpad/functest.sql         F2/F3 correctness (run with vs without the hardening migration)
scratchpad/race_demo.sh         F1 close-vs-post lock proof (59 ms vs 2052 ms)
```
Live prod scenarios: `scratchpad/harness.py` (fixtures) · `scenarios.py` (S1–S9, stranger-403) ·
`scenarios2.py` (read_only-CPA 403, F4 approve-bypass, S8 burst).

## Tests / build
- New pgTAP gate: [`supabase/tests/phase2_period_lock_test.sql`](../../../supabase/tests/phase2_period_lock_test.sql)
  (9 assertions: `FOR SHARE` present, reverse `FOR UPDATE` present, approve-into-open ✓, approve-into-closed
  rejected, reverse rolls forward into an open period past the closed month, original marked reversed).
  Run with `supabase test db`.
- Change set is **SQL-only** (one migration + one test). No TypeScript / edge-fn / UI files changed, so
  `tsc --noEmit` / `vite build` are unaffected (`apps/app` tsc was run separately → exit 0). Validated on a real
  Postgres 15 with the exact prod function bodies — before/after + the live post-deploy re-test above.

## Deploy status / integrator note
- ✅ **DEPLOYED to prod 2026-06-30** (Management API, atomic `create or replace`) and **verified live**. Rollback
  = `scratchpad/rollback.sql` (exact pre-deploy defs of the 3 functions).
- The repo migration is `20260630160000_period_lock_hardening.sql` and is **independent of PR #122** (it never
  references `ledger_audit`) and **safe vs the sibling reverse-lock PR** `20260630130000` (it sorts after it and
  carries the combined reverse). On a fresh replay the end state is the combined, correct version regardless of
  order. Grants preserved (identical signatures).
- ⚠️ Still open: **F4** — land PR #122 so `main`'s `ledger_audit` matches prod.
- When done with the test orgs, run `cleanup.sql` (un-run) — **scoped to exact ids, NOT the `[PERIODTEST]`
  namespace** (a parallel session shares it; its `Stress Co`/`Stranger Co`/`CPA Firm` + `owner@`/`cpa@`/`stranger@`
  users must be left alone).

---

## Round 2 — post-deploy expanded testing (the "fully ready" pass)

After deploying, I ran a deep edge/negative battery against prod on fresh `[PERIODTEST]` fixtures and a definitive
concurrency proof. **Edge battery 15/17 · negatives 7/7** (the two non-passes are F7 below — wrong status code on
an already-denied op, not a security hole).

### Definitive F1 proof (commit-timestamp before/after, `scratchpad/toctou_demo.sh`)
The prod burst's start-timestamp correlation can't distinguish a legal "post-then-close" from an illegal
"post-into-closed" (both use transaction-*start* times). Re-proved deterministically on a local PG with
`track_commit_timestamp=on`: hold the period read for 2 s, close during the window, compare **true commit order**:
```
UNFIXED: close_commit=…35.420  entry_commit=…36.414  → entry committed INTO a closed period   (BUG)
FIXED:   entry_commit=…38.746  close_commit=…38.748  → entry committed BEFORE close            (OK)
```
The `FOR SHARE` lock makes the close wait (2 ms) for the in-flight post; the post lands in the still-open period
and the close follows. Matches the lock demo (close blocks 2052 ms vs 59 ms).

### Gaps from Round 1 — now covered
- **Multi-currency:** *intentionally blocked* — a non-home-currency line is rejected (`currency_unsupported`,
  single-currency pilot). E1/E2 confirm; this closes the per-currency-balance risk surface entirely.
- **Period boundaries / calendar:** month-end vs next-month-first land in **different** periods (E4); **leap** Feb
  2028 period ends `2028-02-29` (E5); **December** period ends `2026-12-31`, year boundary clean (E6).
- **Reverse roll-forward, multi-state:** explicit closed date → 409 (E7a); default → rolls to an open period
  (E7b); reverse-a-reversal allowed (E10); a `pending_review` entry **cannot** be reversed (`not_posted`, E14).
- **Double close / double reopen:** idempotent — stays closed / stays open with `closed_by` null (E8/E9).
- **Authorization negatives:** stranger close → 403 (E11); read_only CPA post → 403 (E15); **pending** (not
  active) engagement → 403 (E16); non-existent period → handled (E12, see F7); another org's period → handled
  (E13, see F7).
- **Input validation:** single-line → 400 (N1); zero amount → 422 (N2); missing idempotency key → 400 (N3);
  unbalanced → 422 (N4); approve an already-posted entry → `not_pending` (N5); reverse non-existent → 404 (N6);
  idempotent replay returns the same entry, no double-post (N7).

### F7 — `ledger-periods` 400-instead-of-404 (P3, fixed)
Closing a **non-existent** or **cross-org** period returned **400** instead of 404. The RPC raises
`using errcode = 'no_data_found'`, which Postgres surfaces as **SQLSTATE `P0002`**, but the edge fn matched the
literal string `"no_data_found"` (never the code), so it fell through to 400. *Not a security issue* — the close
is correctly denied; only the status code was wrong. **Fix:** match `P0002` (mirrors `ledger-entries`) —
[`supabase/functions/ledger-periods/index.ts:55`](../../../supabase/functions/ledger-periods/index.ts#L55).

## Still not covered (honest remaining gaps)
1. **Full UI click-through** (`apps/app` Periods/Journal screens) — verified at the API layer the UI calls, but
   not by driving the rendered app (needs a running app + authenticated session; the `e2e.yml` harness is the
   right place). The reverse button's code path (no date passed) is now handled server-side.
2. **F4 drift** — needs PR #122 landed to `main` (not this session's to merge).
3. **F5 / F6** — documented, intentionally not fixed (message-regex 409 mapping; unbounded far-date periods).
4. **Sustained production load** (hundreds of concurrent users) — proven at the lock/serialization level, not load-tested.
