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
