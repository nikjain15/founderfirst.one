# COATEST fixture manifest

Prod ref `ejqsfzggyfsjzrcevlnq`. All created via the edge-fn write-path (orgs +
ledger-accounts + ledger-entries). Nothing deleted. Cleanup: `cleanup.sql` (un-run).

## Row-count snapshot (before → after)

| table | before | after | COATEST share |
|---|---|---|---|
| organizations | 39 | 104 | **+2** (rest = parallel sessions) |
| ledger_accounts | 212 | 302 | **+17** |
| journal_entries | 2443 | 42175 | **+1** |
| journal_lines | 4903 | 95385 | **+2** |
| ledger_audit | 2450 | 42251 | **+1** |

The large global deltas are concurrent parallel stress sessions, not COATEST.

## Users
- `owner-a@coatest.founderfirst.test` — `0e73974e-5533-4615-805f-bcbfc2937961`
- `owner-b@coatest.founderfirst.test` — `b37491ee-0cf8-42ed-ad75-d9df48e114f4`

## Orgs
- `[COATEST] Org A` — `bfc19d9b-2e09-49bf-b831-7e3120a01aca` (16 accounts, 1 entry, 2 lines, 1 audit)
- `[COATEST] Org B` — `774fb673-c388-4234-b478-11a69921da02` (1 account: `BP100` B-parent)

## Accounts (org A) — includes adversarial rows left in place
`a100` asset · `l100` liability · `e100` equity · `i100` income · `1000` dup1 ·
`CASH1` Cash (archived, was bal 100000) · `REV1` (renamed "Renamed-After-Posting") ·
`P100` parent · `C100`/null child (parent → income INC1, cross-type) · `INC1` inc-parent ·
`RACE1` (1 of 8 concurrent winners) · `xss1` `<script>alert(1)</script>` ·
`ccy1` currency `ZZZ` · `ccy3` currency `usd` · `crash1` currency `US$` (F4 crash repro) ·
`9999…(5000 chars)` bigcode (F3 repro).

## Entry
- 1 balanced entry 2026-06-15: Dr `CASH1` 100000 / Cr `REV1` 100000 (verifies tie-out).
