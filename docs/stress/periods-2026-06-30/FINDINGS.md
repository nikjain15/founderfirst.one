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
| F1 | **P0** | `close` races a concurrent `post` → entry lands in a **closed** period | **Fixed** (migration) |
| F2 | **P1** | Approval workflow **bypasses the period lock** — approve finalizes an entry into closed books | **Fixed** (migration) |
| F3 | **P1** | `reverse` is **bricked** once the current month is closed (contradicts the documented invariant) | **Fixed** (migration) |
| F4 | **P1** | **Prod ↔ `main` drift**: the entire `ledger_audit` trail exists on prod but not in `main` | **Flag for integrator** |
| F5 | **P3** | Closed-period → HTTP 409 mapping depends on a **message regex**, not the SQLSTATE | Documented (latent) |
| F6 | **P3** | Period auto-creation is **unbounded** — a typo'd date (`2099`, `1900`) silently mints a period | Documented |

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
→ [`20260630100000_period_lock_hardening.sql`](../../../supabase/migrations/20260630100000_period_lock_hardening.sql) (F1 block).

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
  (8 assertions: `FOR SHARE` present, approve-into-open ✓, approve-into-closed rejected, reverse rolls forward into
  an open period past the closed month, original marked reversed). Run with `supabase test db`.
- Change set is **SQL-only** (one migration + one test). No TypeScript / edge-fn / UI files changed, so
  `tsc --noEmit` / `vite build` are unaffected. (Worktree has no installed deps; validated on real Postgres
  instead — see above.)

## Deploy note for the integrator
- **Do NOT auto-deploy.** `supabase/migrations/20260630100000_period_lock_hardening.sql` is written but undeployed.
- Apply order is flexible vs PR #122 (this migration is independent). After applying, `ensure_open_period` /
  `approve_journal_entry` / `reverse_journal_entry` are replaced; grants are preserved (identical signatures).
- Then run `cleanup.sql` (un-run) to remove this session's prod fixtures — **scoped to exact ids, not the
  `[PERIODTEST]` namespace** (a parallel session shares it).
