# [stress:csv] CSV / bank-statement import — findings + fixes

**TAG:** `CSVTEST` · **Feature #6, Wave 2** · black-box on live prod
(`ejqsfzggyfsjzrcevlnq`). Files in scope: `apps/app/src/import/{ImportFlow.tsx,
csv.ts}`, `supabase/functions/imports/index.ts`,
`supabase/migrations/20260629160000_phase3_import_batches.sql` (+ the later
`20260630075000_import_commit_integrity.sql`).

---

## What we crashed

**One impossible calendar date in a CSV silently detonates the entire import.**

A row like `02/30/2026` (or `04/31`, `06/31`, `09/31`, `11/31`, or `02/29` in a
non-leap year) sails through the browser preview marked **✓ ready** — the parser
only checked `day ≤ 31`. The importer then stages *every* row in one
`INSERT … SELECT` that casts each `txn_date` with `::date`. Postgres rejects the
impossible date with **`22008: date/time field value out of range`**, which aborts
the whole statement — so **0 of N rows stage** and the entire file (including all
the perfectly good rows) fails to import. The user sees only the raw, row-less
message `date/time field value out of range: "2026-02-30"`.

Proven live, end-to-end, on prod:

```
TEST B — file = [good row 02/01] + [02/30/2026 row, shown ✓ in preview]
  add_rows → 400 {"error":"date/time field value out of range: \"2026-02-30\"","code":"22008"}
  rows staged in batch B: 0            ← the good row died with the bad one
  org trial balance: Dr=335817 Cr=335817 ✔ unchanged   ← atomic: nothing half-posted (the one thing that DID work)
```

The atomicity guarantee held — no partial post, books still tied — but the
feature is unusable for any statement that contains a single malformed date, and
the failure is opaque. **Fixed** (F1): the parser now rejects impossible calendar
dates, so the row shows as invalid in the preview and the rest of the file
imports. Re-proven live post-fix (TEST D): the bad row degrades to `error`, the
good row posts, books stay balanced (`Dr=Cr=679334`, 7 entries).

---

## Findings (ranked)

| # | Sev | Status | Title |
|---|-----|--------|-------|
| F1 | **P1** | FIXED (client) + hardened (migration, un-deployed) | Impossible calendar date aborts the whole import batch |
| F2 | P2 | FIXED (client) | Failed `add_rows` leaves an orphan `draft` batch |
| F3 | P2 | FIXED (client) | Semicolon/tab-delimited exports (EU bank/QBO) import nothing |
| F4 | P2 | REPORTED (needs product decision) | Re-importing the same file double-posts — no dedup, no warning |
| F5 | P3 | REPORTED | UTF-16 / non-UTF-8 files decode to mojibake |
| F6 | P3 | REPORTED | Duplicate header names collapse in `raw` provenance |
| F7 | P4 | PASS-with-note | Bank == contra account is accepted (nets to zero) |

Everything else we threw at it **passed** (see "What held" below).

---

### F1 · P1 · Impossible calendar date aborts the whole import — FIXED
- **Repro:** import a CSV whose date column contains `02/30/2026` (or `4/31`,
  `2/29/2027`, …) alongside valid rows. Preview marks it ✓; commit/staging 400s
  with `22008` and nothing imports.
- **Root cause:** `parseDateCell` (`apps/app/src/import/csv.ts:81-83`, pre-fix)
  validated only `month 1..12 / day 1..31`, emitting a syntactically-valid but
  calendrically-impossible ISO string. `add_import_rows`
  (`supabase/migrations/20260629160000_phase3_import_batches.sql`) casts it with
  `nullif(r->>'txn_date','')::date` over all rows in one INSERT → batch-wide abort.
- **Fix (client, deployable):** new `isRealCalendarDate(y,m,d)` round-trips the
  date through `Date.UTC` and rejects any value that doesn't survive; used in both
  the ISO and the slash/dash branches of `parseDateCell`. Impossible dates now
  return `null` → the row is flagged invalid in the preview, the valid rows import.
- **Fix (server, defense-in-depth — written, NOT deployed):**
  `supabase/migrations/20260630130000_import_add_rows_safe_date.sql` adds
  `safe_to_date(text)` (cast-or-NULL, never raises) and points `add_import_rows`
  at it, so a malformed date from *any* caller degrades that one row to a NULL
  date (→ commit marks it `error`) instead of aborting the batch. **Flag for
  integrator: this is a migration — review + deploy in a wave.**

### F2 · P2 · Orphan `draft` batch on staging failure — FIXED
- **Repro:** any `add_rows` failure (e.g. the F1 crash) after `createImportBatch`.
  Confirmed live: batch B is left `status=draft, rows=0` forever.
- **Root cause:** `CsvImport.doImport` / `OpeningBalances.doImport`
  (`ImportFlow.tsx`) wrapped only `commitImportBatch` in the discard-on-error
  guard; a throw from `addImportRows` skipped straight to the outer catch, leaving
  the created batch behind.
- **Fix:** the discard-on-failure `try/catch` now wraps `addImportRows` **and**
  `commitImportBatch`, so any post-create failure discards the batch — no orphans.
  (Zero ledger impact either way; this is hygiene of the staging table.)

### F3 · P2 · Non-comma delimiters import nothing — FIXED
- **Repro:** upload a `;`- or tab-delimited export (standard for EU locales,
  where `,` is the decimal separator, and some QBO/Xero regional exports). The
  whole line becomes one field → one column → Date/Amount unmappable → 0 ready rows.
- **Root cause:** `parseCsv` split on a hard-coded `,`.
- **Fix:** `detectDelimiter` sniffs `, ; \t` outside quotes on the header line and
  picks the most frequent (comma wins ties); the parser uses the detected delimiter.
  Verified: `;`- and tab-files now yield 3 columns. Combined with the existing EU
  amount support (`1.234,56`), EU statements now import.

### F4 · P2 · Re-import double-posts — REPORTED (product decision)
- **Repro (live, TEST C):** import `good.csv`, then import the identical file
  again → entries go 3 → 6. Books still tie, but the org now has duplicate txns.
- **Root cause:** the per-row idempotency key is
  `import:<batch_id>:<import_row_id>` and both ids are freshly generated per batch,
  so there is no cross-batch dedup — every re-import is "new". `post_journal_entry`
  idempotency can't catch it (different key each time).
- **Not auto-fixed** because de-dup is a semantics/product call (content-hash key?
  warn-on-overlap? allow as intentional re-import of a corrected file?). **Flag for
  integrator.** Recommendation: on the preview screen, detect a prior *committed*
  batch for the org with the same filename + row signature and warn before commit;
  optionally derive the row idempotency key from a stable content hash.

### F5 · P3 · UTF-16 / non-UTF-8 → mojibake — REPORTED
- `File.text()` always decodes UTF-8; a UTF-16 export (some Windows tools) becomes
  replacement characters and headers won't match. Out of scope to fix safely in
  this pass (needs encoding sniffing). Note for backlog.

### F6 · P3 · Duplicate header names collapse `raw` — REPORTED
- `raw` is built via `Object.fromEntries(headers.map(...))`; two columns named
  e.g. `Amount` collide, so one column's original value is lost from the
  provenance blob (the normalized `amount`/`date` are unaffected). Low impact;
  note for backlog (de-dup header keys, e.g. `Amount`, `Amount__2`).

### F7 · P4 · Bank == contra accepted — PASS-with-note
- Selecting the same account as both "bank" and "default category" posts D and C
  to it for each row: balanced, ties, but nets to zero and adds noise. Harmless;
  a soft warning would be nice. No change.

---

## What held (passed)

- **US m/d/y ⇄ UK d/m/y selector:** the same `03/04/2026` flips correctly
  (`2026-03-04` mdy vs `2026-04-03` dmy); self-disambiguating values (`13/04`)
  override the selector; `13/13`, month 0, day 0 → null.
- **Amounts:** `$1,234.56`, EU `1.234,56`, bare `1234,56`, parens-negative
  `(45.00)`, leading-minus, `$`/currency noise, US thousands `1,234` — all exact.
  **Sub-cent (`1.005`) rejected** (no silent rounding). Blank/zero rows excluded.
- **Money-precision guard:** a `> 2^53` `amount_minor` is rejected `422` by the
  edge fn (string-bigint required), so no float truncation of money.
- **Atomicity:** a mid-batch failure rolls the whole staging/commit back — **never
  a half-posted batch**; the org trial balance tied to the cent after every commit.
- **Discard-before-commit:** a batch is pure staging until commit; discard is
  reversible and leaves zero ledger impact.
- **Commit integrity (existing migration):** account-less CSV rows route to the
  Uncategorized holding account (no drop); opening-balance plug is sized over the
  exact posted set.
- **Auth/RLS:** `import_batches`/`import_rows` deny client writes; every op funnels
  through the service-role RPCs with `can_write_org_as`; actor is the JWT, not the
  body. No cross-tenant access observed.
- **Empty / header-only / BOM:** empty file → `{headers:[],rows:[]}`; header-only →
  0 rows; UTF-8 BOM stripped. No crash.

---

## Shared-file note for the integrator
- **Client only, deployable:** `apps/app/src/import/csv.ts`,
  `apps/app/src/import/ImportFlow.tsx`. No shared CSS/tokens touched.
- **Migration — WRITE-BUT-DON'T-DEPLOY:**
  `supabase/migrations/20260630130000_import_add_rows_safe_date.sql` redefines
  `add_import_rows` (and adds `safe_to_date`). Defense-in-depth only; the client
  fix already resolves the user-facing break. Sequence + deploy with the other
  Wave-2 migrations. No edge-fn change.
- Verification harness + live e2e scripts: `docs/stress/csv/` references; fixture
  `manifest.md` + un-run `cleanup.sql` included.
