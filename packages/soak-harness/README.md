# @ff/soak-harness

Load/soak test harness for the two highest-risk write paths — the ledger post RPC
(`post_journal_entry`) and the Plaid sync path (`plaid_ingest_transactions`) — plus
an additive structured-observability helper. RV2-E production-readiness slice.

Full operational context (running the live soak, SLOs/alerting, backup & DR) is in
[docs/plans/production-readiness-runbook.md](../../docs/plans/production-readiness-runbook.md).

## What it proves

- **No double-post under concurrency** — a flood of N posts sharing an
  `idempotency_key` collapses to one row per key (`unique(org_id, idempotency_key)`).
- **Tie-out balances** — Σ debits == Σ credits after the flood.
- **Plaid dedup** — re-pulled transactions are no-ops on `(org_id, external_id)`.
- **Latency / errors** — p50/p95/p99 + error rate per run (`metrics.ts`).

## Two backends, one assertion set

`runner.ts` drives any `PostBackend` and applies the same `assertLedgerInvariants`.

- **CI smoke** (`pnpm test`) drives the in-memory `LedgerModel` / `PlaidIngestModel`
  in `model.ts` — a faithful, DB-free reimplementation of the RPC guarantees. No
  Postgres, no secrets. This is the gate wired into
  `.github/workflows/soak-harness.yml`.
- **Live sandbox** (`pnpm soak`) drives `LiveLedgerBackend` against the real
  `post_journal_entry` RPC. Fenced by `config.ts` → `assertLiveRunAllowed`:
  requires `SOAK_TARGET=sandbox`, a namespaced `SOAK_FIXTURE_PREFIX`, and creds.
  **Never runs against prod data.** See the runbook § 2b for the full invocation.

## Observability helper

`observability.ts` exports `slog` / `timed` / `withObservability` — structured
single-line JSON logs edge fns and Workers can adopt incrementally (additive, no
rewrite). The Deno twin for edge functions lives at
`supabase/functions/_shared/observability.ts` and is adopted as a reference in
`loop-heartbeat`.

## Commands

```
pnpm --dir packages/soak-harness test        # CI-safe smoke (vitest)
pnpm --dir packages/soak-harness typecheck    # tsc --noEmit
pnpm --dir packages/soak-harness soak         # live sandbox soak (fenced)
```
