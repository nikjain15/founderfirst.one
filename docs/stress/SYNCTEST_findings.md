# [stress:sync] QBO / Xero connect & sync — findings + fixes

Adversarial black-box stress test of the QuickBooks/Xero connect→pull→preview→commit
path on **live prod** (`ejqsfzggyfsjzrcevlnq`), TAG `SYNCTEST`. Human did the OAuth
approval step; everything else is black-box via the deployed edge functions + PostgREST,
with mutations namespaced `[SYNCTEST]` and every ledger-touching proof run inside a
force-rolled-back transaction (zero persistence).

## What we crashed

1. **F0 — provider import commit was DEAD ON ARRIVAL (P1).** `qbo-import`/`xero-import`
   stage bank-style rows under `source = 'qbo'/'xero'`, but `commit_import_batch` only
   routed `source in ('csv','bank_statement')` to the per-row bank branch. `'qbo'/'xero'`
   fell through to the **opening-balance** branch, which requires `cutover_date` — `null`
   for provider pulls — so commit raised `no_cutover_date`. **Proven live** (SQLSTATE
   22023) on a synthetic `qbo` batch. Net: "pull your history from QuickBooks/Xero"
   produced staged rows that could **never** post.

2. **F1 — DOUBLE-POST on re-pull (P1).** The ledger idempotency key was
   `'import:<batch>:<row>'`. A second pull makes a new batch with new row ids → new keys,
   so the *same* provider transaction posts **twice** (the `unique(org,idempotency_key)`
   guard can't catch it). Confirmed by code (`commit_import_batch` line ~74) + the ledger
   model (`post_journal_entry` dedups only on `idempotency_key`). No dedup on the provider's
   stable txn id (`QBO Id` / `Xero BankTransactionID`).

## What held (verified live — PASS)

| Check | Result |
|---|---|
| Member reads `access_token`/`refresh_token`/`state` via PostgREST | **403** permission-denied (incl. `select=*`) |
| Member reads safe columns (`id,provider,status,tenant_name`) | 200 |
| Forged / missing OAuth `state` → callback (qbo + xero) | rejected, no DB mutation |
| Replay of a *successful* connect | state set `null` on success → not re-lookable |
| Cross-tenant connect (B→A) / import (B→A) | **403 forbidden** |
| IDOR: A imports org A but passes B's `connection_id` | **404 no_active_connection** (conn scoped to org) |
| Token-exchange failure → persisted `last_error` | sanitized `"xero_token_exchange_failed: 400"`; injected secret-marker code did **not** leak |
| Token-**refresh** failure (live Intuit, synthetic active conn, expired token) | graceful **502** `qbo_token_refresh_failed: 400`; persisted `last_error` sanitized; **0** import_batches/journal_entries (no orphan) |
| Failed pull leaves no ledger/staging orphan | confirmed — both imports failed before any post; org row-counts unchanged |
| `secure_connection_tokens` migration (token column wall) | live + effective (verified via `relacl`/`attacl` + real PostgREST 403) |

### Live confirmation of F2 (no real OAuth needed)
With a synthetic `active` connection carrying a **bogus token**, `xero-import` hit the real
Xero API and returned to the client:
`detail: "xero_api_failed Accounts: 401 {\"Type\":null,\"Title\":\"Unauthorized\",\"Status\":401,\"Detail\":\"AuthenticationUnsuccessful\",...}"`
— the **deployed** code leaks the raw provider body to the client (the F2 channel; the
bearer token itself was not echoed by Xero, so no secret leaked *this time*, but the channel
is real). The fix in this PR makes it status-only (`xero_api_failed Accounts: 401`).

## Lower-severity (fixed in this PR)

- **F2 (P3) — provider API error body leaked to client.** `qboQuery`/`xeroGet` put
  `await res.text()` into the thrown error, which `*-import` returns to the client as
  `detail` (Xero also into the user `note`). Inconsistent with the carefully status-only
  `exchangeCode`/`refreshToken`. → both helpers now status-only.
- **F3 (P2) — non-2-decimal currency mishandled.** `toMinor` hardcoded `×100`, inflating
  JPY/KRW (0-decimal) 100× (the entry still *balances* per-currency, but every figure is
  100× too large). → `minorFactor(ccy)` by ISO-4217 exponent; imports scale by the org's
  `home_currency`.
- **F4 (P3) — silent truncation.** Xero capped at 20 pages, QBO at 500+500, with no signal.
  → both now return `truncated` + a plain-language note so users know to re-pull.
- **F5 (P4) — stale scope copy.** xero-import referenced the old `accounting.transactions`
  scope; the app uses `accounting.banktransactions.read`. → corrected.

## Hardening notes (not fixed — flagged)

- **F6 (P4) — OAuth `state` never expires and is not cleared on the error path.** Verified
  live: after a failed token exchange the connection keeps `status='error'` *and* its
  `state` nonce. Not exploitable (the `state` column is unreadable by clients — proven
  403), but a stale nonce lives forever. Suggest: clear `state` on terminal error + add a
  `created_at` age check in the callbacks.
- Tokens are still **plaintext at rest** (already tracked in the phase3 migration): move to
  Vault/pgsodium before GA.
- Provider→home-currency **FX conversion** is out of scope; imports coerce to home currency
  without conversion. Multi-currency provider data needs a follow-up.

## Fixes in this PR

- **Edge fns (write-but-don't-deploy — flag):** `_shared/qbo.ts`, `_shared/xero.ts`,
  `qbo-import/index.ts`, `xero-import/index.ts` — F2, F3, F4, F5 + send `external_id` per
  row + pre-skip already-imported txns (degrades gracefully pre-migration).
- **Migration (write-but-don't-deploy — flag):**
  `20260630130000_sync_provider_commit_and_dedup.sql` — adds `import_rows.external_id`;
  `commit_import_batch` routes `'qbo'/'xero'` through the bank branch (F0) and keys provider
  rows on `'ext:<source>:<external_id>'` (F1); `add_import_rows` persists `external_id`.
  Reproduces the latest deployed bodies verbatim except those diffs. **⚠ Shared function:
  sequence with the edge-fn changes in one wave.**
- **pgTAP:** `supabase/tests/sync_provider_commit_dedup_test.sql` (11 assertions) covers
  F0 (qbo/xero commit via bank branch) + F1 (re-pull does not double-post) + CSV back-compat.

### Fix validated on prod (rolled back)
Simulated the fixed `commit_import_batch` logic against prod: a `qbo` row posts via the bank
branch (F0), a re-pulled txn with the same `external_id` returns the **same** journal entry
(F1, no double-post), and a different `external_id` creates a new one — `total_entries=2` not
3. The whole transaction was force-rolled-back; `external_id` is **not** deployed.

## Fixture manifest + footprint (DELETE NOTHING during test)

- Users: `owner-a@synctest.founderfirst.test`, `owner-b@synctest.founderfirst.test`
- Orgs: ORG_A `3d3bc99a-bd8b-47d4-bf80-80b0afecebcc`, ORG_B `17505c7b-f110-4268-b7c0-a5116ab315d8`
- **SYNCTEST footprint:** 2 orgs · 2 users · 7 `external_connections` (5 pending/error with
  **no tokens**; 2 synthetic `active` carrying **bogus** tokens, used to drive the live
  import-error paths) · **0** ledger_accounts / import_batches / journal_entries (all
  commit/post proofs rolled back; the live import attempts failed before staging → zero
  ledger impact). The cleanup deletes all `external_connections` for orgs A/B.
- Global before/after row-count diff is not meaningful: **parallel stress sessions** mutated
  shared tables concurrently during the run. Footprint above is the precise SYNCTEST-only set.
- Un-run cleanup: [`docs/stress/SYNCTEST_cleanup.sql`](./SYNCTEST_cleanup.sql).
