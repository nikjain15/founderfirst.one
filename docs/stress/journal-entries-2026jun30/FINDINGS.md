# [stress:journal] Journal entries & reversals — adversarial stress-test

**Target:** `apps/app` ledger write-path on prod `penny.founderfirst.one`
(Supabase ref `ejqsfzggyfsjzrcevlnq`) — `post_journal_entry` / `reverse_journal_entry`
/ `approve_journal_entry` RPCs behind the `ledger-entries` / `ledger-reverse` edge
functions, plus the structural guards (balance trigger, append-only triggers,
home-currency trigger, `ledger_audit`).
**Baseline:** `origin/main` @ `ddb3b52` (worktree was rebased onto it; the original
worktree head `4d24e7c` predated the Phase-2 hardening migrations).
**Method:** real `[JETEST]`-namespaced org/user/accounts; posted/reversed via the
deployed edge functions and direct service-role RPC; inspected via PostgREST +
Management API. Isolation respected — own fixtures only, nothing deleted, no
schema/edge-fn/config changes on prod. Manifest + un-run `cleanup.sql` alongside.

## Headline

**P0 — concurrent double-reversal silently corrupts account balances.**
Reproduced **live on prod through the public `ledger-reverse` API**: 14 concurrent
reverse calls on one entry created **10 reversal entries** of it. Fix written
(not deployed) + proven locally + pgTAP regression added.

---

## Ranked findings

| # | Severity | Verdict | Scenario | Result |
|---|----------|---------|----------|--------|
| 1 | **P0** | **FAIL → fixed** | Concurrent reverse of one entry, different idempotency keys | **2–10 reversals of one original → over-cancelled account balances; org trial balance still ties (silent)** |
| 2 | P3 | PASS (note) | `approve_journal_entry` same lock-free read→mutate | Benign (no duplicate financial rows) but same TOCTOU class — locked for consistency in the same fix |
| 3 | P4 | PASS (note) | Same account on both D and C sides | Accepted (nets to zero, balanced) — data-quality nit, not corruption |
| 4 | P4 | PASS (note) | Far-future / far-past `entry_date` | Accepted; auto-creates the monthly period. No date sanity bound (e.g. year 9999) |
| — | — | PASS | Balanced 2-line / 1-cent / 3–50 line | 201, balanced |
| — | — | PASS | Unbalanced | 422 `unbalanced` (step-5 belt) |
| — | — | PASS | Zero / negative amount | 422 `bad_line` |
| — | — | PASS | `> 2^53` amount as JSON **number** | 422 `amount_too_large` (edge `normalizeAmounts` guard) |
| — | — | PASS | `> 2^53` amount as **string** | 201, stored EXACT (`9007199254740993`) |
| — | — | PASS | Non-home currency (EUR) / mixed USD+EUR | 422 `currency_unsupported` (`assert_line_home_currency`) |
| — | — | PASS | Duplicate idempotency-key replay | Returns the original entry, no double-post |
| — | — | PASS | 10 simultaneous **posts**, same idempotency key | Exactly 1 row (unique(org_id,idempotency_key) + caught `unique_violation`) |
| — | — | PASS | Cross-org account in a line | 422 `bad_account` |
| — | — | PASS | UPDATE / DELETE posted `journal_lines` (svc role) | Blocked `23001` (append-only trigger) |
| — | — | PASS | UPDATE financial field / DELETE `journal_entries` | Blocked `23001` (guard trigger) |
| — | — | PASS | Client-JWT direct status UPDATE | RLS denies (0 rows) |
| — | — | PASS | Post into a CLOSED period | 409 `period_closed` |
| — | — | PASS | Reverse with default date into a closed period | 409 `period_closed` (correction needs an open date) |
| — | — | PASS | Reverse into an open period (explicit date) | 201, lands in the open month |
| — | — | PASS | Reverse the reversal / reverse already-reversed (serial) | re-reversal 201; already-reversed 409 |
| — | — | PASS | Reverse-replay same key | Returns the same reversal, no double |
| — | — | PASS | Every post/reverse logged to `ledger_audit` | 1 audit row per entry (post→`entry.post`, reversal→`entry.reverse`) |

---

## Finding 1 (P0) — concurrent double-reversal

**Repro (direct RPC, fat original to widen the window):** post a 300-line balanced
entry, fire 12 concurrent `reverse_journal_entry` calls with distinct keys →
**2** entries with `reverses_id = <original>`.
**Repro (public API):** 14 concurrent `ledger-reverse` POSTs on a 400-line entry →
**10** reversals of one original.

**Corruption:** an original `Dr Cash 1500 / Cr Revenue 1500` reversed twice nets
**Cash → −1500** and **Revenue → +1500** that should both be zero. Every reversal
is internally balanced, so the **org trial balance still ties** (Σdebit = Σcredit) —
the corruption is invisible to a debits-equal-credits check; only per-account /
per-original analysis exposes it. `ledger_audit` honestly logs every reversal but
does not prevent the duplication.

**Root cause** — `reverse_journal_entry` (`supabase/migrations/20260629125000_phase2_ledger_writepath.sql:303`):

```
select * into v_orig from journal_entries where id = p_entry_id and org_id = p_org;  -- NO lock
if v_orig.status = 'reversed' then raise exception 'already_reversed'; end if;        -- TOCTOU
...
update journal_entries set status = 'reversed' where id = v_orig.id;                  -- no status precondition
```

Two transactions both read `status='posted'` before either commits → both insert a
reversal, both run the final UPDATE (no `WHERE status` guard, no re-check). Distinct
idempotency keys bypass the replay dedup. Reachable from the UI: `Journal.doReverse`
(`apps/app/src/ledger/Ledger.tsx:372`) mints a fresh `newIdempotencyKey()` per click
and only guards re-entry with a `busyId` React flag — two tabs, a network retry, or
two CPAs all produce distinct keys.

**Why this slipped through:** the sibling `recategorize_entry` (#122, "ledger/import
integrity") already hit and fixed this exact bug — it locks the original with
`for update` and comments *"concurrent approves now serialize → exactly one wins …
Closes the double-reverse/repost P0."* But the shared primitive it calls,
`reverse_journal_entry`, was never given the same lock, so the **direct** reverse
path stayed vulnerable.

**Fix** (`supabase/migrations/20260630130000_reverse_lock_double_reversal.sql`,
written, **NOT deployed** — flagged for integrator):
1. Add `for update` to `reverse_journal_entry`'s `select … into v_orig` — mirrors the
   proven `recategorize_entry` lock. The loser blocks at the SELECT, re-reads
   `reversed`, and raises `already_reversed`. Reversals of one entry serialize.
2. Same lock on `approve_journal_entry` (consistency; finding 2).
3. Defense-in-depth: partial unique index `(org_id, reverses_id) where reverses_id is
   not null` — a second reversal of any original becomes structurally impossible.
   **Integrator note:** the index errors if duplicate reversals already exist; real
   pilot orgs are clean (verified), only stress namespaces have dups — purge those or
   deploy the function fix alone first.

**Fix verified** — local two-connection test (`scratchpad/.../localproof.sh`):
lock-free variant → **2** reversals; `for update` variant → **1** reversal +
`already_reversed`. pgTAP regression added (`phase2_ledger_posting_test.sql`, tests
22–24) asserting both write paths lock the original and the unique index exists.

## Blast radius on prod (observed, not created here)
12 originals across 5 orgs already carry >1 reversal — **all in throw-away stress
namespaces** (`[JETEST]` / `[CATTEST]` from parallel sessions). **No real pilot org
is affected.** This confirms the race fires readily under realistic concurrent load.
Integrator should re-run the scan after deploy and decide on data repair (none needed
for real orgs today).

```sql
select org_id, reverses_id, count(*) n from journal_entries
where reverses_id is not null group by 1,2 having count(*) > 1;
```
