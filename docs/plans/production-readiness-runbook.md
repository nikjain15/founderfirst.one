> Status: active · 2026-07-04 · Owner: Nik (RV2-E production-readiness slice)

# Production-readiness runbook — load/soak, observability, backup & DR

This is the operational runbook for the RV2-E production-readiness slice: how we
**prove** the two highest-risk paths hold under load, what we **observe/alert** on,
and how we **back up and restore** when something goes wrong. It is additive — it
adds a harness, an observability helper, and drills; it changes no posting logic.

Scope of the shipped slice (this PR):

- `packages/soak-harness/` — the load/soak harness (ledger post RPC + Plaid sync
  dedup), with a CI-safe smoke test (`.github/workflows/soak-harness.yml`).
- `supabase/functions/_shared/observability.ts` — additive structured-log helper,
  adopted as a reference in `loop-heartbeat`.
- This runbook (backup/restore + DR + SLO/alerting plan).

Anything marked **decision-needed** is a Nik call, not built here.

---

## 1. Environment inventory

- **Supabase project (prod):** ref `ejqsfzggyfsjzrcevlnq` (`penny.founderfirst.one`
  + `founderfirst.one/admin` share it). Postgres + Auth + Storage + Edge Functions.
- **Edge functions:** catalog in `supabase/functions/README.md`. The highest-risk
  write paths are `ledger-entries` (→ `post_journal_entry`) and `plaid-sync` /
  `plaid-webhook` / `plaid-exchange` (→ `plaid_ingest_transactions`).
- **Migration ledger:** `supabase/migrations/` is the single schema source of truth
  (LEARNINGS rule 2/3). `schema_migrations` in prod must match it exactly.
- **Mac host services:** compose-server, signals-worker (see
  `tools/signals-worker/README.md`) — not in the customer write path, lower RPO.

### 1a. Secret INVENTORY (names only — never values; LEARNINGS + centralization gate)

Stored in `~/.config/founderfirst/secrets.env` and as Supabase fn secrets / GitHub
secrets. **This list is names only.** Rotating any of these is part of the DR drill.

| Name | Where | Purpose |
|---|---|---|
| `SUPABASE_URL` | fn env (auto), GH var | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | fn env (auto), GH secret | service-role writes |
| `SUPABASE_ANON_KEY` | GH secret | client anon key |
| `SUPABASE_DB_URL` / DB password | ops only | pg_dump / restore |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | fn secrets | Plaid API |
| `LOOP_HEARTBEAT_TOKEN` | fn secret | loop dashboard bearer |
| `RESEND_API_KEY`, `NOTIFY_FROM` | fn secrets | transactional email |
| `CLOUDFLARE_API_TOKEN` | GH secret | Pages/DNS deploy |
| `COMPOSE_ENDPOINT_URL` | fn secret | AI email drafting tunnel |

> Full authoritative list lives in `secrets.env` on the Mac host; keep this table's
> **names** in sync when a secret is added (LEARNINGS rule 7).

---

## 2. Load / soak testing

### 2a. What the harness proves

`packages/soak-harness/` drives the two highest-risk paths and asserts the
invariants a real incident would break:

- **No double-post under concurrency.** A flood of N posts where many share the
  same `idempotency_key` must collapse to exactly one row per key — the
  `unique(org_id, idempotency_key)` guarantee inside `post_journal_entry`. The
  harness asserts `created == distinct idempotency keys`.
- **Tie-out still balances.** After the whole flood, Σ debits == Σ credits.
- **Plaid dedup holds.** Re-pulled transactions (duplicate webhook / re-sync)
  are no-ops — dedup on `(org_id, external_id)`.
- **Latency / errors recorded.** p50/p95/p99 + error rate per run.

The CI-safe smoke test runs these assertions against a faithful in-memory model
(`src/model.ts`) at small N — no DB, no secrets — so the concurrency guarantee is
proven on every PR. The **live** driver (`src/soak.ts`) runs the SAME runner +
assertions against the real RPC.

### 2b. Running the live soak (sandbox only — never prod data)

The driver is fenced (`src/config.ts` → `assertLiveRunAllowed`): it refuses to run
unless `SOAK_TARGET=sandbox`, a namespaced `SOAK_FIXTURE_PREFIX` is set, and
credentials are present. Provision fixtures in a **sandbox** project first (a
throwaway org + actor membership + two accounts), then:

```
SOAK_TARGET=sandbox \
SOAK_FIXTURE_PREFIX=soak-20260704- \
SUPABASE_URL=<sandbox-url> SUPABASE_SERVICE_ROLE_KEY=<sandbox-key> \
SOAK_ORG_ID=<fixture-org> SOAK_ACTOR_ID=<fixture-actor> \
SOAK_CASH_ACCOUNT_ID=<acct> SOAK_REV_ACCOUNT_ID=<acct> \
SOAK_CONCURRENCY=32 SOAK_TOTAL_ENTRIES=5000 SOAK_DISTINCT_KEYS=2000 \
pnpm --dir packages/soak-harness soak
```

**Tie-out verification (out-of-band).** After a live run, confirm the sandbox org's
trial balance still ties:

```sql
select coalesce(sum(case when jl.side='D' then jl.amount_minor else 0 end),0) as debits,
       coalesce(sum(case when jl.side='C' then jl.amount_minor else 0 end),0) as credits
  from journal_lines jl join journal_entries je on je.id = jl.entry_id
 where je.org_id = '<fixture-org>';
-- debits must equal credits
```

**Fixture cleanup.** Purge the namespaced fixtures after the run (the prefix makes
them selectable) — same discipline as the 2-Jul prod fixture purge.

---

## 3. Observability & alerting (SLOs)

### 3a. Instrumentation

`supabase/functions/_shared/observability.ts` (Deno) and
`packages/soak-harness/src/observability.ts` (Node/Workers) emit one structured
JSON line per event: `{ ts, level, fn, event, ...fields }`. Adopted as a reference
in `loop-heartbeat` (auth.rejected / beat.recorded). Other fns opt in incrementally
— it is additive, never a wholesale rewrite. Lines land in the Supabase log drain.

### 3b. What to alert on (SLO targets — thresholds are proposals for Nik)

| Signal | Source event / metric | Proposed threshold | Why |
|---|---|---|---|
| Edge-fn error rate | `request.end` level=error / total | > 2% over 5 min | broad regression |
| Ledger post failures | `post_journal_entry` non-idempotent errors | any sustained | trust moat (Signal #5) |
| Plaid sync failures | `plaid-sync` `.err` / `external_connections.status='error'` | > 3 in 15 min | broken bank feed |
| RPC latency | soak/live p95 of post path | > 800 ms | user-visible lag |
| Migration drift | `schema_migrations` vs `supabase/migrations/` | any mismatch | LEARNINGS rule 3 |
| Auth rejections spike | `auth.rejected` rate | anomalous | probing / leaked token |

- **decision-needed — alerting sink.** We emit structured logs; we do **not** yet
  have a hosted alerting destination wired (PagerDuty / Logflare alerts / a Slack
  webhook). No new hosted service is added in this slice (gate). Nik to pick the
  sink; until then, alerts are manual review of the log drain + the admin **Quality**
  and **Build** dashboards.

---

## 4. Backup / restore & disaster recovery

### 4a. What to back up

1. **Database** — full logical dump of prod (`ejqsfzggyfsjzrcevlnq`). Supabase
   provides automated daily backups (PITR on paid tiers); we additionally keep an
   on-demand `pg_dump` before any risky migration/destructive op (LEARNINGS rule 4).
2. **Migration ledger** — `supabase/migrations/` in git IS the schema backup; the
   repo is the source of truth. A restore replays these from zero.
3. **Seeds** — `supabase/seed.sql` + the kernel/tax/depreciation seeds
   (`scripts/seed-*.ts`), which are NOT all in migrations (LEARNINGS: W3.3 CoA seed
   loaded separately). These must be part of a restore.
4. **Secrets inventory** — §1a (names). Values live in `secrets.env` + the secret
   stores; a restore re-sets fn/GH secrets from the operator's copy, never from git.
5. **Storage** — receipt/attachment buckets (Supabase Storage), if used.

### 4b. RPO / RTO targets (proposals)

- **RPO (max data loss):** ≤ 24 h from automated daily backup; ≤ 0 for the window
  since the last pre-op `pg_dump`. **decision-needed:** enable PITR for near-zero
  RPO (paid-tier feature — Nik call, no new service added here).
- **RTO (time to restore):** ≤ 2 h — provision a fresh project, replay migrations +
  seeds, restore the dump, re-set secrets, re-point DNS/edge config.

### 4c. Restore drill (run in a scratch project — never in place on prod first)

1. Create a scratch Supabase project.
2. `supabase db push` replays every migration from zero (verify count matches
   `ls supabase/migrations/ | wc -l` and that `supabase migration list` is clean —
   LEARNINGS rule 3).
3. Apply `supabase/seed.sql`, then run `scripts/seed-kernel.ts`, `seed-tax.ts`,
   `seed-depreciation.ts` (and verify with their `--check` modes).
4. Restore the latest logical dump into the scratch project.
5. Re-set fn secrets from the inventory (§1a) — from `secrets.env`, not git.
6. Smoke: run the soak harness against the restored project (`SOAK_TARGET=sandbox`)
   to confirm the post path works and ties out.
7. Record wall-clock time → that's the measured RTO. File deltas as LEARNINGS if a
   step was missing.

### 4d. Rollback-one-step-away discipline (LEARNINGS rule 5)

- Before any prod migration: `supabase migration list` first; set aside anything
  not yours; take an on-demand `pg_dump`.
- Deploy migration **then** the edge fns that depend on it (never the reverse).
- Verify every deploy from the system itself (`supabase db`, re-query,
  `wrangler tail` / `flyctl logs`) and keep the previous state one command away.
- `main == prod` for the app: a bad merge is a prod incident — revert the merge is
  the fastest rollback.

---

## 5. Coverage delta

New AUDIT.md ledger row: **soak-harness** — the load/soak harness for the ledger
post RPC + Plaid dedup. Starts ⬜ untested → the CI smoke suite
(`.github/workflows/soak-harness.yml`) is its first stress pass (concurrency /
idempotency / tie-out assertions green). Live sandbox soak is operator-run per §2b.

## 6. Open decisions for Nik

1. **Alerting sink** — which hosted destination for the structured logs (none added
   here; gate forbids a new service without approval). §3b.
2. **PITR** — enable point-in-time recovery for near-zero RPO (paid tier). §4b.
3. **Soak cadence** — should the live sandbox soak run on a schedule (nightly/weekly
   against a standing sandbox org), or stay operator-invoked? §2b.
