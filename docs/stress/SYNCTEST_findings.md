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

## Scale + messy-data assault (30-Jun, "think crazy")

Drove the real ledger posting path (`post_journal_entry`, what the fixed commit loops over)
on prod inside rolled-back transactions — a 100-year-old company with filthy data.

- **40,000 transactions spanning a full 100 years** (1925→2025), with duplicates, null dates,
  zero amounts, unicode/emoji/RTL memos, self-referencing accounts, and ¥900-trillion "huge"
  amounts: **books tied to the cent** (Σdebits == Σcredits = 3,600,019,038,174,123),
  **1,200 monthly periods** auto-created with no failure, 91 broken rows skipped gracefully,
  duplicates collapsed by the new `ext:` key, **no overflow**, ~1.04 ms/row (linear, no
  degradation). 5k calibration: same ties, 165 periods, 1.79 ms/row.
- **Pathological single values:** year 9999, year 0001, `bigint`-max amount, 100k-char memo,
  emoji/RTL, and a **SQL-injection memo** (`');drop table journal_entries;--`) all post or
  fail per-row gracefully — **the books stay balanced**, injection is neutralised
  (parameterised). The invalid `1900-02-29` leap date is caught per-row, not a crash.
- **Connector transform fuzz** (`supabase/functions/_shared/connectors_test.ts`, 4 Deno tests,
  28 assertions): garbage into `toMinor`/`xeroDate`/`minorFactor`/account-mapping never throws
  or returns NaN.

### F8 (P3) — malformed Xero `/Date(…)/` crashed the whole pull → FIXED
The fuzz found that `xeroDate("/Date(99999999999999999999)/")` **threw** "Invalid time value"
(`new Date(hugeEpoch).toISOString()`), and since `xeroDate` runs inside the transaction loop,
**one bad date from Xero aborted the entire transaction import**. Fixed: out-of-range/garbage
epochs now return `null` (→ the single row is skipped, not the whole pull). Deployed.

### ⚠ NEW prod finding (P1, parallel-session collision) — `commit_import_batch` overload is ambiguous
A parallel session added `commit_import_batch(p_actor, p_org, p_batch, p_limit integer DEFAULT
4000)`. Because `p_limit` has a **default**, a 3-arg call matches **both** overloads →
PostgREST returns **`PGRST203` "Could not choose the best candidate"** (HTTP 300) — reproduced
live for **both** anon+JWT and service-role direct RPC. The production `imports` edge fn (via
supabase-js) currently resolves it consistently (3/3), so imports aren't *down* — but this is a
fragile latent break on a core path. **Recommend** the overload's owner/integrator either drop
the `DEFAULT 4000` (so 3-arg calls unambiguously hit the 3-arg fn) or rename the 4-arg
(`commit_import_batch_chunked`). That 4-arg body also still has the old csv-only branch + no
dedup, so it must get the F0/F1 fix before anything routes through it.

### 🚨 INTEGRATOR: `commit_import_batch` is being edited by ≥3 parallel sessions
This function is a collision hotspot. Known concurrent changes:
- **This PR (#142):** adds the qbo/xero branch (F0) + `ext:` idempotency key (F1) to the 3-arg fn.
- **OBTEST (PR #135):** rewrites the same 3-arg fn (opening-balance silent-drop fix, migration
  `20260630160000`) — a plain `create or replace` would **clobber my F0/F1 changes** (or mine
  clobbers theirs), depending on apply order.
- **A parallel session:** added the 4-arg `p_limit DEFAULT 4000` overload (the PGRST203 source).

These must be **merged into one `commit_import_batch` body**, not applied independently
(last-writer-wins silently drops a fix). I deployed my 3-arg change after verifying the live
body was the clean 075000 version (no clobber at deploy time), but the next session to deploy
its own copy will regress mine unless reconciled.

## Hardening notes (not fixed — flagged)

- **Unbounded `amount_minor`.** A near-`bigint`-max value posts and can overflow `bigint`
  aggregations in reports (trial balance / account totals). Wildly unrealistic ($92
  quadrillion), but a sane upper-bound validation in `post_journal_entry` would harden it.

- **F6 (P4) — OAuth `state` never expires and is not cleared on the error path.** Verified
  live: after a failed token exchange the connection keeps `status='error'` *and* its
  `state` nonce. Not exploitable (the `state` column is unreadable by clients — proven
  403), but a stale nonce lives forever. Suggest: clear `state` on terminal error + add a
  `created_at` age check in the callbacks.
- Tokens are still **plaintext at rest** (already tracked in the phase3 migration): move to
  Vault/pgsodium before GA.
- Provider→home-currency **FX conversion** is out of scope; imports coerce to home currency
  without conversion. Multi-currency provider data needs a follow-up.

## DEPLOYED to prod (30-Jun, owner-authorized)

- Migration `20260630161500_sync_provider_commit_and_dedup.sql` applied + recorded in the
  ledger. Verified live: `import_rows.external_id` exists; `commit_import_batch(3-arg)` now
  routes qbo/xero through the bank branch + keys on `ext:<source>:<external_id>`;
  `add_import_rows` persists `external_id`.
- Edge fns `qbo-import` + `xero-import` deployed (with `_shared/{qbo,xero}.ts`). **F2 fix
  verified live**: the same bogus-token pull that previously leaked the raw Xero body now
  returns `"xero_api_failed Accounts: 401"` (status-only).
- ⚠ **Integrator coordination:** prod has a SECOND `commit_import_batch(p_actor,p_org,p_batch,
  p_limit int)` overload from a parallel session — it still has the old csv-only branch + no
  dedup. The app's commit path (`imports` edge fn) calls the **3-arg** version (fixed), so
  this overload is dormant for the app, but whoever owns the `p_limit` chunked-commit work
  must apply the same F0/F1 changes (qbo/xero branch + `ext:` key) before routing through it.

## Fixes in this PR

- **Edge fns (write-but-don't-deploy — flag):** `_shared/qbo.ts`, `_shared/xero.ts`,
  `qbo-import/index.ts`, `xero-import/index.ts` — F2, F3, F4, F5 + send `external_id` per
  row + pre-skip already-imported txns (degrades gracefully pre-migration).
- **Migration (write-but-don't-deploy — flag):**
  `20260630161500_sync_provider_commit_and_dedup.sql` — adds `import_rows.external_id`;
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
