# [stress:reports] Financial reports correctness — findings & fixes

**Date:** 2026-06-30 · **Baseline:** `main` @ 50861aa · **Env:** prod `ejqsfzggyfsjzrcevlnq` (penny.founderfirst.one)
**Method:** seeded known fixtures on prod, fetched with the *exact* app query, ran the
**actual production `reports.ts`** over the data (Node 26 type-stripping), and asserted every figure
against hand-computed expected values to the cent.

Reports under test (`apps/app/src/ledger/reports.ts`, rendered by `Ledger.tsx`):
Trial Balance · Profit & Loss · Balance Sheet · Overview KPIs.

---

## Verdict

The **report math is correct** — TB ties, BS balances, P&L articulates to retained/current earnings,
reversals net to zero, `pending_review` is excluded, integer minor units never drift on rounding.
*One* defect makes reports **wrong without ever looking wrong**, plus competitive gaps.

## Findings (ranked)

### P0 — `useEntries` silently truncates the ledger at 1000 rows → reports tie to the WRONG number
- **File:** `apps/app/src/ledger/api.ts` — `useEntries` (pre-fix: single `select` with no `.range()`).
- **Root cause:** prod PostgREST `max_rows = 1000` (confirmed via Management API `/config/postgrest`).
  Every report (TB/P&L/BS/Overview) derives from this one entry list (`Ledger.tsx`). For any org with
  **>1000 entries** the list is silently capped to the **most-recent 1000** (`order entry_date.desc`),
  so the **oldest** entries — opening balances, capital injections, prior-year activity — are dropped.
- **Why it's insidious:** every entry is internally balanced, so the truncated reports **still tie to
  the cent** and show `balanced: true` / no "out of balance" banner. They're just **wrong** (understated).
  For a CPA this is the worst failure mode: a clean-looking statement that omits transactions.
- **Live repro (Scenario B, org `9153e789…`, 1010 entries of $1.00 cash↔capital each):**

  | fetch | entries | Total Assets | TB debit | banner |
  |---|---|---|---|---|
  | current `useEntries` (capped) | **1000** | **$1,000.00** | $1,000.00 | none (looks fine) |
  | paginated (the fix) | **1010** | **$1,010.00** | $1,010.00 | none |
  | hand-computed truth | 1010 | **$1,010.00** | $1,010.00 | — |

  → current report is **$10.00 short** and gives no signal. Realistic: a bank-fed business clears
  1000 transactions well within a year.
- **Fix (this PR):** page through every entry with `.range()` until a short page, with a total
  `entry_date,created_at,id` order so paging is stable. Most orgs still resolve in one request.
  Re-ran the exact fixed query live → **1010 entries, $1,010.00, ties.** ✅
- **Follow-up (not in this PR):** at much larger scale, loading the whole ledger into the browser to
  derive reports is itself a ceiling — promote hot reports to a server-side RPC / materialized view
  (ARCHITECTURE.md §6.5). Pagination is the correct *correctness* fix now; aggregation is the *scale* fix later.

### P3 — Reports are all-time only; the `dateFilter`/`asOf` params exist but are never wired to UI
- **File:** `Ledger.tsx` `Reports`/`PnlReport`/`BalanceSheetReport` call `profitAndLoss(entries)` /
  `balanceSheet(entries)` with no date argument. `reports.ts` already supports `dateFilter`/`asOf`.
- **Impact:** no period P&L (this month / quarter / FY), no "balance sheet as of", no comparative
  columns. Functionally a single lifetime column. Competitive gap vs QuickBooks/Xero.

### P3 — Archived account holding a balance vanishes from the Accounts view but persists in reports
- **File:** `Ledger.tsx` `Accounts` filters `!a.is_archived`; reports include all accounts (correct).
  If an account is archived while non-zero, BS/TB still include it (right) but the chart-of-accounts
  list hides it — the user can't reconcile the statement back to a visible account. Show archived
  accounts that still carry a balance (greyed), or block archiving a non-zero account.

### Competitive gaps (missing reports vs QuickBooks / Xero)
- **Cash flow statement** (operating/investing/financing) — absent.
- **AR / AP aging** (current/30/60/90) — absent; no aging dimension on receivable/payable accounts.
- **General ledger / account drill-down** — Journal lists entries; no per-account running-balance ledger.
- **Accrual vs cash toggle** — single basis only.
- **Comparative periods / period P&L** — see P3 above.

## Verified correct (no change needed)
- **Trial balance ties; Balance sheet balances; P&L net income == BS current earnings** — Scenario A,
  9 entries (capital, credit sale, COGS, rent, accrual, prepayment, AR collection, **+ a reversal**),
  every figure matched hand-computed to the cent. Encoded as regression tests in `reports.test.ts`.
- **Reversal** correctly leaves the original `reversed` entry's lines in the books offset by the
  reversal — net zero on every report (Rent stayed $2,300.00 after a $100 erroneous post + reversal).
- **`pending_review` excluded** from all reports; "out of balance" banner only fires on genuine drift.
- **Single-currency coherence holds.** A EUR line into a USD org is **rejected** server-side
  (`currency_unsupported`, errcode 23514) — multi-currency can't enter the books, so reports never mix
  currencies. (Note: that guard is live on prod but is **not** present in the local migration
  `20260629125000_phase2_ledger_writepath.sql`'s `post_journal_entry` — a migration/prod drift worth a
  separate reconciliation; out of scope for reports.)
- **Rounding:** integer minor units only; `formatMoney` divides by 100 at the edge — no float drift
  (verified with a 3334/3333/3333 thirds split).

---

## Test isolation & data manifest

All fixtures namespaced `[RPTTEST]`; users `…@rpttest.founderfirst.test`. No schema/config/deploy
changes; everything outside these fixtures was read-only. **Nothing deleted** — see `cleanup.sql` (un-run).

**Orgs created (4):**
| org_id | name | entries | accounts |
|---|---|---|---|
| `a963f241-b1f6-45e1-af67-6a3746055127` | [RPTTEST] Scenario A Co (orphan, empty — first run aborted) | 0 | 0 |
| `1520f733-9eff-4a34-a87e-caa5869ce18d` | [RPTTEST] Scenario A Co (known seed) | 9 | 9 |
| `9153e789-106f-40a5-865f-cae2f272734f` | [RPTTEST] Scenario B HighVolume (truncation proof) | 1010 | 2 |
| `0c055534-11b4-4dc6-bdaa-1ffcd04c2c8e` | [RPTTEST] Scenario C MultiCcy (currency-guard check) | 1 | 2 |

**Auth users created (3):** `owner.a@`, `owner.b@`, `owner.c@` `rpttest.founderfirst.test`.

**Row-count baseline (what `cleanup.sql` removes; scoped to the 4 test orgs):**
| table | rows |
|---|---|
| journal_lines | 2040 |
| journal_entries | 1020 |
| accounting_periods | 14 |
| ledger_accounts | 13 |
| org_accounting_settings | 4 |
| memberships | 4 |
| subscriptions | 4 |
| organizations | 4 |
| auth.users | 3 |

Cleanup must bypass the append-only DELETE guards on `journal_entries`/`journal_lines`
(`set session_replication_role = replica`) — `cleanup.sql` does this, scoped to `'[RPTTEST]%'` orgs
and `'%@rpttest.founderfirst.test'` users only.
