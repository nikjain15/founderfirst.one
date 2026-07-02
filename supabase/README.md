# Supabase — migrations, cron, tests

> Last verified: 1-Jul-2026 · 114 migrations, 4 live cron jobs, 14 pgTAP suites. Owner: Nik

What lives here:

- [config.toml](config.toml) — local-stack config + per-function `verify_jwt` settings.
- [functions/](functions/) — 43 edge functions; the catalog with purpose + caller for each is
  [functions/README.md](functions/README.md).
- [migrations/](migrations/) — the append-only schema ledger (see below).
- [tests/](tests/) — pgTAP suites, run in CI.

## Migrations

One timestamped file per change, `YYYYMMDDHHMMSS_name.sql`, append-only — never edit a landed
migration; correct forward with a new one. Two CI gates guard the ledger on every PR that
touches `supabase/**`:

- **migrations-unique** — every file's timestamp prefix must be unique (post-collision rule).
- **db-tests** — spins up a local stack, replays *all* migrations from scratch, then runs the
  pgTAP suites; a migration that only works on top of prod state fails here.

**Prod parity:** `main == prod`. No workflow deploys migrations — they are applied to prod
manually, and anything applied to prod outside the repo gets back-filled as a `[reconcile]`
parity-marker migration (e.g. `20260702000000_reconcile_period_journal_locks.sql`) so the
replay-from-scratch stays truthful. Ops gotcha: running prod SQL through the Supabase
Management API requires a `User-Agent` header (the WAF 403s without one).

## Cron jobs (pg_cron)

Every schedule is created by a `cron.schedule(...)` call inside a migration — this table is
the current net state:

| Job | Schedule (UTC) | What it runs |
|---|---|---|
| `email-dispatch-hourly` | `0 * * * *` | POSTs the [email-dispatch](functions/email-dispatch/) edge function — the **single timing driver for every recurring email** (see below). |
| `geo-daily-probe` | `0 11 * * *` | POSTs [geo-probe](functions/geo-probe/) (AI-answer visibility). |
| `learning-loop-bandit` | `0 12 * * *` | POSTs [bandit](functions/bandit/) (experiment traffic optimizer). |
| `ai-reconcile-daily` | `0 2 * * *` | `select ai_reconcile_tick();` — SQL-only, no edge function. |

Retired crons: `signals-daily-digest` and `changelog-weekly-digest` were unscheduled by
`20260623280000_email_schedules_builtin.sql`. Recurring-email timing now lives in the
`email_schedules` table (single source of truth, editable in the admin Scheduled tab);
the hourly `email-dispatch` reads it and *invokes* the specialised function
(`listening-digest`, `changelog-digest`) for built-in rows. Details in
[functions/_shared/EMAIL.md](functions/_shared/EMAIL.md).

## Tests (pgTAP)

`tests/*.sql` assert the invariants the platform leans on: tenant isolation, balanced-ledger
posting, period locks, import integrity, categorization, admin tiers/guards, platform-staff
reads. They run on every `supabase/**` PR via the db-tests workflow
([.github/workflows/README.md](../.github/workflows/README.md)).
