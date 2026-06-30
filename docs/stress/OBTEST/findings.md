# [stress:opening-balances] — OBTEST findings + fixes

Adversarial black-box stress-test of the **opening-balances import** on live prod
(`ejqsfzggyfsjzrcevlnq`), driven end-to-end through the real edge functions
(`orgs` → `ledger-accounts` → `imports`) as a freshly-minted owner, with trial-balance
tie-out verified after every commit. Fixtures namespaced `[OBTEST]` /
`@obtest.founderfirst.test`; nothing deleted (see `cleanup.sql`).

## What we crashed

**A user who types an opening balance but forgets to pick its account loses that money
with zero warning — and the books still say "balanced."** The opening-balances screen
counts the half-filled row in the on-screen "we'll balance $X into an opening-balance
account" preview, then drops it at commit; the deployed server folds the gap into the
Opening Balance Equity plug, posts a *balanced* entry, and returns success. Verified live:

```
User enters:  Cash  D  $1000.00   (account picked)
              ----  C   $300.00    (forgot to pick the account)
Screen says:  "we'll balance $700.00 into an opening-balance account"
Actually posts: Cash D $1000.00,  Opening Balance Equity C $1000.00
                → the $300.00 row VANISHED, OBE inflated $700 → $1000,
                  UI shows "Opening balances saved.", no error anywhere.
```

For an accounting product onboarding real businesses, a **silently wrong but
internally-balanced** opening balance sheet is worse than a loud failure — a CPA has no
signal anything is off.

Second crash: **the live prod `commit_import_batch` does not match its own migration
ledger.** The ledger records `20260630075000_import_commit_integrity` (which *raises* and
posts nothing on a bad opening row) as the latest definition, but the deployed function is
a later, out-of-band version that *reverted* that guard to silent-drop-and-post. Ledger
drift on a money write-path.

## Ranked findings

| # | Sev | Verdict | What | Where |
|---|-----|---------|------|-------|
| 1 | **P0** | **FAIL** | Half-filled opening row (balance, no account / account, no balance / non-positive amount) is **silently dropped**; its value is absorbed by the OBE plug; commit returns `committed` (HTTP 200), UI shows success. Books tie but the balance sheet is wrong, with no error surfaced. The client preview totals include the row that will be dropped, so **preview ≠ committed**. | client `ImportFlow.tsx` `OpeningBalances` (totals/`canImport`/`doImport`) **and** deployed `commit_import_batch` opening branch |
| 2 | **P2** | **FAIL** | **Prod ledger drift**: live `commit_import_batch` ≠ the body recorded by `20260630075000`. The deployed opening branch silently drops invalid `ready` rows + posts anyway, reverting the migration's `#6` hard-guard intent. (Deployed body also carries `statement_timeout='170s'` + a CSV per-row sub-block that exist in no repo migration.) | prod DB vs `supabase/migrations/` |
| 3 | **P2** | **FAIL** | **Re-running opening balances double-posts.** No guard against a second opening import for the same org/cutover — each run adds a full opening entry **and a second OBE plug**, doubling the books. Verified: two identical imports → two entries at `2024-10-15`, OBE doubled. | `commit_import_batch` / `OpeningBalances` (no existing-opening check) |
| 4 | **P3** | **FAIL** | **Misleading success copy.** "Anything that didn't add up was set aside in an opening-balance account your accountant can review." Dropped rows are not set aside as reviewable lines — their value is folded into a generic OBE plug, losing the account + the distinct amount. | `ImportFlow.tsx` done-screen |
| 5 | — | **PASS** | Balanced set posts with no plug; TB ties. | A |
| 6 | — | **PASS** | Unbalanced set → OBE plug correct **side and amount both directions** (D>C → C plug; C>D → D plug). Balance sheet ties as of cutover. | B (C 70000), B2 (D 40000) |
| 7 | — | **PASS** | Cutover in a **closed period** → `period_closed` (HTTP 409), **atomic — nothing posted**, TB unchanged. | D |
| 8 | — | **PASS** | Cutover in a month with no period → **auto-creates an open period**, posts. | H |
| 9 | — | **PASS** | **Duplicate account** in one opening entry (Cash D and Cash C) → posts, no unique-constraint break, account nets, TB ties. | E |
| 10 | — | **PASS** | Zero ready rows → `nothing_to_commit` (HTTP 404), atomic. | F |
| 11 | — | **PASS** | **Idempotent re-commit** of a committed batch → returns `committed`, no double-post (entry delta 0). | J |
| 12 | — | **PASS** | **Large set** (600 lines, one entry) → posts within `statement_timeout`, TB ties. | G |
| 13 | — | **PASS** | Money precision: `amount_minor` is bigint; the `imports` edge fn rejects a JS number beyond 2^53 (`amount_too_large`), requiring a string. | (read) |

## Fixes in this PR

**1. Client (deployable now) — `apps/app/src/import/ImportFlow.tsx` `OpeningBalances`:**
- Each row is classified `complete` (account + positive balance) / `blank` (empty
  add-row) / `partial` (exactly one filled, or a non-positive amount on a real row).
- Debits/credits/plug preview is computed over **complete rows only** → the preview now
  matches exactly what posts.
- Import is **blocked while any row is partial**, with an inline message naming the
  row(s): *"Row N need both an account and a balance…"*. Partial rows get a `bad`
  highlight. Nothing the user entered can be dropped behind their back.
- `doImport` stages **only complete rows** as `ready`.
- Success copy corrected to describe the OBE plug accurately.

**2. Server (write-but-don't-deploy) — `supabase/migrations/20260630160000_opening_balance_no_silent_drop.sql`:**
- Reproduces the **exact deployed body verbatim** (CSV/bank branch, `statement_timeout`,
  per-row isolation untouched — preserved for the parallel CSV-import work) and changes
  **only** the opening/trial-balance branch: if any `ready` opening row is missing
  account/side/amount → **raise `import_row_invalid` and post nothing** (atomic),
  restoring the `20260630075000` intent. Defense-in-depth behind the client fix for
  API misuse / non-UI callers.

**3. pgTAP — `supabase/tests/phase3_import_test.sql`** (`plan(15)`→`plan(18)`): a bad
opening row is rejected (`22023`), posts **nothing** (atomic), and leaves the batch
`previewed` for the user to fix.

## ⚠️ Integrator notes
- **Shared write-path function** `commit_import_batch` — also touched by CSV-import (#6)
  and Phase 4. This migration keeps the CSV branch byte-identical; sequence accordingly.
- **Resolve the ledger drift first (finding #2).** Decide whether the deployed body is the
  intended baseline and back-fill it into a real migration, *then* layer this
  opening-branch correction on top. Do **not** `db push` blindly.
- **Finding #3 (double opening import)** is *not* fixed here — it needs a product decision
  (warn? block a second opening_balances batch per org? require explicit confirm?). Flagged
  for triage.
- Build: `tsc --noEmit && vite build` green for `apps/app`.

## Verification commands (live)
Harness in session scratchpad: `run.py` (A,B,B2,C,E,F,H), `run2.py` (D,I,J,G), plus the
exact-UI-payload repro. All mint a fresh JWT via the Auth admin API and drive prod edge
functions. Fixtures + `cleanup.sql`: `docs/stress/OBTEST/`.
