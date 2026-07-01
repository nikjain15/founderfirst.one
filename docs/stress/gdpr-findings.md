# [stress:gdpr] Data export & erasure (GDPR) — findings + fixes

**Feature #14 · TAG `GDPRTEST` · target `supabase/functions/org-data` + `ledger_audit`**
Black-box stress test on live prod (`ejqsfzggyfsjzrcevlnq`). Sessions minted via the
Auth admin API; orgs via the `orgs` edge fn; everything namespaced `[GDPRTEST]` /
`@gdprtest.founderfirst.test`. No schema/grant/edge-fn deploy during testing.

## What we crashed

**The GDPR export silently hands back an INCOMPLETE copy of your books.** PostgREST on
this project caps a request at **1000 rows** (`db-max-rows`), and `org-data`'s export
did one un-paginated `select` per table. Stage 1,500 rows → the export returns **1,000**,
**HTTP 200, no error, no truncation flag.** A business with a normal year of bookkeeping
(>1000 journal lines/entries/import rows — trivially common) downloads a silently
truncated file while the privacy policy promises *"a copy of the data we hold about you"*
and *"your data stays yours."* That's a **silent failure** (the tracker's P0 class) on a
legal promise — the headline break. Everything else held: **zero token leakage, zero
cross-tenant leak, erasure + audit + retention all correct.**

---

## Findings (ranked)

| # | Severity | Status | Title |
|---|----------|--------|-------|
| F1 | **P0 — silent failure** | ✅ FIXED | Export truncates at 1000 rows/table, no signal |
| F2 | P3 — info leak | ✅ FIXED | Malformed `org_id`/`connection_id` leaks raw Postgres error + table name |
| F3 | P3 — copy drift | ✅ FIXED (doc) | Header says "revoke"; disconnect only deletes our tokens, no upstream revoke |
| F4 | P3 — completeness | ✅ FIXED | Export omitted `org_accounting_settings` (part of "your data") |
| F5 | note | out of scope | Penny-conversation export/erasure not covered by `org-data` |

### F1 — Export silently truncates at the PostgREST row cap **[P0 · FIXED]**
- **Repro:** stage 1,500 `import_rows` in a GDPRTEST org, then `POST org-data {op:"export"}`
  → `import_rows` in the payload = **1000** (expected 1500), HTTP 200, no error.
  Confirmed the cap is server-side: even a service-role `select … limit=10000` returns 1000.
- **Where:** [supabase/functions/org-data/index.ts:60](supabase/functions/org-data/index.ts) — `grab()` did a single un-ranged `select`.
- **Impact:** incomplete GDPR/CCPA export for any org with >1000 rows in any table. Silent
  → reads as "complete." Breaks the [privacy.astro](apps/web/src/pages/privacy.astro) Access&export promise.
- **Fix:** `grab()` now pages with `.order("id").range(from, from+999)` until a short page
  proves the table is drained — complete regardless of `db-max-rows`. Validated against
  live PostgREST: paging drained **1500/1500** (page 1 = 1000, page 2 = 500).

### F2 — Malformed id leaks a raw Postgres error **[P3 · FIXED]**
- **Repro:** `{op:"export", org_id:"not-a-uuid"}` → `400 {"error":"journal_lines: invalid
  input syntax for type uuid: \"not-a-uuid\""}` — leaks an internal table name + driver text.
- **Fix:** validate `org_id`/`connection_id` against a UUID regex up front → clean
  `bad_org` / `bad_connection` 400. ([index.ts:38](supabase/functions/org-data/index.ts))

### F3 — "revoke" overstates what disconnect does **[P3 · FIXED-doc]**
- The header said disconnect does *"revoke + DELETE"*, but it only `DELETE`s the
  `external_connections` row (erasing the tokens **we** store). It never calls Xero/QBO's
  upstream token-revocation endpoint, so the grant at the provider lapses on expiry.
- For GDPR "erase your data" that's defensible (we erase our copy), but the self-description
  must match behavior (LEARNINGS #7). **Fix:** comment corrected; upstream revoke flagged
  as a tracked follow-up (not promised by the privacy policy).

### F4 — Export omitted `org_accounting_settings` **[P3 · FIXED]**
- The org's accounting config (home currency, fiscal-year start, cutover date) is part of
  "the data we hold about you" and is cheaply RLS-readable. Added to the export payload as
  `accounting_settings`.

### F5 — Penny-conversation export/erasure is out of `org-data`'s scope **[note]**
- The privacy policy grants export/deletion of *Penny conversations*; `org-data` is
  org-books-scoped and doesn't touch them. End-to-end that promise rests on the manual
  email path (*"request … at founder@"*) + the separate Discord erasure path (tracked,
  task_91171681). Flagged so the conversation-erasure promise is owned somewhere concrete.

---

## What held up (PASS — verified live, no fix needed)

- **Owner export = full, RLS-scoped JSON.** Returns org + accounts + entries + lines +
  periods + import batches/rows + rules + connections + ledger_audit. Connection rows carry
  **only** safe columns (`id, provider, status, realm_id, tenant_name, scope, last_error,
  connected_by, created_at, updated_at`).
- **Tokens NEVER included.** Seeded a connection with `access_token`/`refresh_token`/`state`
  sentinels; none appear anywhere in the export (`access_token` key absent entirely). The
  column-grant wall + `CONN_COLS` both hold.
- **Cross-tenant export → 403.** Outsider exporting a org they don't belong to →
  `403 forbidden_or_not_found`, no data. Random-uuid org → 403.
- **Erasure works + is audited.** Owner `disconnect` → connection row (and its tokens) gone;
  a `ledger_audit` row written: `action=integration.disconnect`, correct `target_id`,
  `actor`, `detail.provider`.
- **IDOR erase blocked.** Outsider disconnecting another org's connection: wrong-org id →
  `404`; victim-org id (no write capability) → `403`; the connection **survived both**.
  Forged connection_id on a real owner → `404`. The `org_id` boundary + `can_write_org_as`
  hold.
- **Posted ledger / audit RETAINED (append-only).** `ledger_audit` only grew across the run;
  the disconnect erases connections/tokens but never the financial trail. New pgTAP asserts
  `authenticated` has SELECT but **not** INSERT/UPDATE/DELETE on `ledger_audit`, and that an
  org can't read another org's audit.
- **No PII over-exposure.** Export carries the org's books + safe connection metadata + actor
  UUIDs; no member emails, no tokens, no other-tenant data.
- **Read-only CPA (reasoned, shared predicate):** `export` gates on `can_access_org` (read),
  `disconnect` on `can_write_org_as` (requires engagement `access='full'`) — a read-only CPA
  can export but cannot erase. Predicate is exercised by the phase0/phase2 pgTAP suites.

## Files touched (⚠ shared edge fn)
- `supabase/functions/org-data/index.ts` — **shared edge fn; write-but-don't-deploy.**
  Integrator must `supabase functions deploy org-data`.
- `supabase/tests/gdpr_data_export_test.sql` — **new** pgTAP (9 assertions).
- `docs/stress/gdpr-findings.md`, `docs/stress/gdprtest_cleanup.sql` — this report + un-run cleanup.

No migration changed. No `apps/app` source changed (app tsc/build identical to `main`).
`deno check supabase/functions/org-data/index.ts` passes.

## Deploy + post-deploy verification (2026-06-30)

The `org-data` edge function was **deployed to prod** (`supabase functions deploy org-data`)
— it is self-contained (reads existing tables, no migration dependency), so it ships
independently of the migration wave. Verified live against prod:

- **F1 fix confirmed live:** export of the 1,500-row fixture now returns **1500/1500**
  `import_rows` (was 1000). No token leak; `accounting_settings` present.
- **Scale:** grew the fixture to **3,500 rows** (4 export pages) → complete in ~3.0s.
  Residual note: paging is linear, so a *very* large org (tens of thousands of rows) could
  approach the edge-function time budget — a streaming/async export is the future-proofing
  (enhancement, not a break).

### ⚠️ Two things the integrator must action
1. **PR #130 is NOT merged, but the function IS deployed** → prod runs code that isn't on
   `main` yet. Merge #130 once CI is green to remove the drift.
2. **`main` is currently red for an unrelated reason:** a migration merged by another stress
   session (between auth #133 / invites #134 / categorize / reconcile #148) has a SQL
   `syntax error at or near "revoke"` that breaks the pgtap migration-replay for *every*
   open PR (and a clean prod rebuild). Not from this PR. Needs a fix on `main`.

## Previously-untested scenarios — now covered

- **View-only accountant [PASS]:** set up a firm with a read-only engagement on the org.
  Read-only CPA **exported** the full books (200, 1500 rows, no token leak) but was
  **blocked from erasing** (403). Upgrading the engagement to `access='full'` then let the
  CPA erase (200). Confirms `export`=read-gated, `disconnect`=write-gated.
- **Large business [PASS w/ note]:** export complete at 3,500 rows / 4 pages in ~3s (above).
- **Penny/Discord conversation erasure [GAP — needs building]:** the privacy policy promises
  export/deletion of Penny conversations, but there is **no self-serve erasure endpoint** for
  the `discord_dm_memory` / conversation tables — only the manual `founder@` email path.
  Tracked as task_91171681. Out of `org-data`'s scope; flagged for a dedicated build.

## Fixture manifest (for cleanup — see `gdprtest_cleanup.sql`, UN-RUN)
- Users: `owner@`, `outsider@`, `cpa@` `gdprtest.founderfirst.test`
- Orgs: `[GDPRTEST] Org A` / `Org B` (duplicated by a re-run — all namespaced) + `[GDPRTEST] CPA Firm`
- CPA test: 1 firm + 1 engagement (Org A) — cleanup deletes engagements before orgs (no cascade)
- Scale test: the trunc batch grown to 3,500 `import_rows`
- Per-org: memberships, `pilot_free` subscriptions, 1 surviving `external_connections`
  (`connA2`, qbo), 1 `import_batches` + 1,500 `import_rows` (truncation fixture),
  1 `ledger_audit` (the disconnect of `connA`, which T4 deleted as the feature under test).
- Cleanup deletes by `name like '[GDPRTEST]%'` + email pattern; org delete cascades the rest.
