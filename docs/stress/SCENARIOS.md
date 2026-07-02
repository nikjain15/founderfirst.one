# Regression scenarios (REG pack)

Status · 2026-07-03 · Owner: build-loop

Named, re-runnable regression scenarios for the unified app. Each row is a
behaviour we never want to silently break; the `id` is quotable in a PR/ledger.
A scenario points at the automated check that enforces it (unit / E2E) so the
"proof" is a green gate, not a manual note.

| id | surface | asserts | enforced by |
|---|---|---|---|
| W1.2-EXPORT | Reports → exports | All four reports (TB / P&L / BS / GL detail) export CSV + PDF; the CSV ties to the on-screen numbers **to the cent**; GL detail is the full line dump with per-account running balances; period/as-of scoping filters correctly; a 10k-entry org exports **completely** (no 1000-row truncation); the PDF is a structurally valid, branded document; the download flow yields one period-stamped file. | `apps/app/src/ledger/export.test.ts` (serialization + tie-out + scale) · `tools/app-e2e/run.mjs` → `verifyReportDownload` (real download event) |

## W1.2-EXPORT — detail

**Why it matters.** A CPA hands the exported package to tax software at year-end.
If the file disagrees with the screen by a cent, or drops the oldest entries
(opening balances, capital injections — the RPTTEST truncation P0), the books
look balanced but are wrong. Exports must be complete and tie exactly.

**Tie-out invariant.** CSV amounts are formatted from the SAME integer minor
units the on-screen report renders, via the same derivation functions
(`reports.ts`). The GL export reuses the exact `generalLedger()` pure function the
on-screen GL renders — screen and file cannot diverge.

**Completeness invariant.** The serializers are pure functions over the already-
paginated entry list (`api.ts useEntries` pages via `.range()` until a short
page). The unit test serializes a 10k-entry org and asserts every line is present
(20,000 GL rows) with a correct running balance — no truncation at any scale.

**Audit invariant.** Every export records one `report.export` row in
`ledger_audit` (via the `report-export` edge function, actor from the verified
JWT, gated by `can_access_org`). A read-only CPA CAN export (read capability) and
is audited, but the path mutates nothing in the books.

**Re-run.** `pnpm --dir apps/app test` (unit) and the App E2E workflow
(`.github/workflows/app-e2e.yml`, drives the real authed Reports tab and captures
the download). No prod fixtures — the unit seed is the RPTTEST Scenario A seed.

---

## W1.1 — bank reconciliation

| id | surface | asserts | enforced by |
|---|---|---|---|
| W1.1-AUTOMATCH | Books → Reconcile | Auto-match pairs a statement line (import_rows) to a ledger entry by the account's debit-positive net: EXACT (same signed amount + same date) first, FUZZY (amount within ±windowDays, nearest date) second; each line + entry consumed at most once; already-confirmed matches excluded; withdrawals (negative) carry the right sign. | `apps/app/src/ledger/reconcile.test.ts` (autoMatch) · `supabase/tests/w1_1_reconciliation_test.sql` (match RPC) |
| W1.1-TIEOUT | Books → Reconcile | The report ties to the cent: `computed_closing = opening + Σ cleared` (integer minor units, no float); `difference = statement closing − computed_closing`; a reconciled month has difference 0; `reconcile_lock` REFUSES unless opening + Σ cleared = closing. | `apps/app/src/ledger/reconcile.test.ts` (reconciliationReport) · `supabase/tests/w1_1_reconciliation_test.sql` (lock tie-out) |
| W1.1-REVERSAL | Ledger + Reconcile | Reversing a matched entry REOPENS its match (soft — `reopened_at` + `reopened_reason='entry_reversed'`, keeping the trail) and UNLOCKS the containing reconciled session; the reopen is audit-logged; a subsequent lock then refuses (books no longer tie). A trigger on `journal_entries.status→'reversed'` enforces this for every reversal path. | `supabase/tests/w1_1_reconciliation_test.sql` (reversal-reopen + re-lock refusal) |
| W1.1-ISO | reconcile RPCs | Match/unmatch/lock RPCs are SECURITY DEFINER, EXECUTE granted to service_role ONLY (no anon/authenticated → no p_actor forgery); `can_write_org_as` gates a read_only CPA out server-side; cross-tenant actor refused; every action audit-logged. | `supabase/tests/w1_1_reconciliation_test.sql` (grant absence · read_only gate · cross-tenant · audit rows) |

**Why it matters.** Reconciliation is the #1 CPA trust surface: the point of the
month-end close is to prove the books agree with the bank statement, line by line.
If a reconciled month can silently drift — an entry it cleared gets reversed
later, or the report ties to the wrong number — the "Reconciled ✓" badge lies.

**Tie-out invariant.** The report is derived by the pure `reconciliationReport()`
over the same confirmed matches the DB stores; screen and lock-RPC agree because
both compute `opening + Σ cleared` in integer minor units. `reconcile_lock`
refuses to stamp ✓ unless that equals the statement closing balance.

**Reversal-reopen invariant.** A DB trigger, not the client, reopens matches and
unlocks the session on any reversal — so the guarantee holds whether the reversal
came from `reverse_journal_entry`, a categorize repost, or a future path.

**Isolation invariant.** The reconciliation tables deny client writes (RLS
select-only); all mutation flows through the `reconcile` edge fn → service_role-
only RPCs. A read-only CPA reads the numbers but is refused every write server-
side (`can_write_org_as`), independent of the disabled UI buttons.

**Source note.** Statement lines come from `import_rows` today; when the Plaid-fed
`bank_transactions` lands (W2.3), the matcher's `StatementLine` shape is the swap
point — the engine and tie-out are source-agnostic.

**Re-run.** `pnpm --dir apps/app test` (matcher + tie-out unit) · `supabase test
db` (pgTAP match RPCs) · the App E2E workflow drives the real Books → Reconcile
tab across the width ladder. No prod fixtures — the pgTAP seed is self-contained.
