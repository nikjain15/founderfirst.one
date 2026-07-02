# Supabase — migrations, types, functions, cron

> Status: **live** (prod project `ejqsfzggyfsjzrcevlnq`, serves penny.founderfirst.one + /admin) · Last verified: 2026-07-01

The database workflow rules live in [LEARNINGS.md](../LEARNINGS.md) (they all come
from real incidents — read rules 2, 3, 4 and 11 before touching this folder).
This README is the operational map.

## Migrations (`migrations/`)

- **This folder is the ONLY schema source of truth** (LEARNINGS rule 2). No
  parallel `SCHEMA-*.sql` copies, no hand-written squashed dumps. New change =
  `supabase migration new <name>`.
- **Never reuse a timestamp** (rule 11) — a version collision makes Supabase
  silently skip one file. CI guard: `.github/workflows/migrations-unique.yml`.
- **`supabase db push` deploys ALL pending migrations** (rule 3) — run
  `supabase migration list` first and set aside anything that isn't yours.
  An out-of-order pending migration needs `db push --include-all`.
- Single small migrations are often applied **manually via the dashboard SQL
  editor** (no CI applies them); whichever path you use, backfill
  `supabase_migrations.schema_migrations` so `migration list` stays truthful.

## Generated types

`apps/admin/src/lib/database.types.ts` (and app equivalents) are generated from
the **live** schema — `supabase gen types typescript --linked`. Regenerate after
every applied migration; generated types catch drift `tsc` can't (rule 11).

## Edge functions (`functions/`)

~43 functions. Conventions: admin-gated fns re-check `is_admin()` server-side;
shared code is vendored into `functions/_shared/` (`pnpm vendor:inference` for
`@ff/inference` — never edit the vendored copy). Email system docs:
[functions/_shared/EMAIL.md](functions/_shared/EMAIL.md) (voice/anatomy) +
[EMAIL_REGISTRY.md](functions/_shared/EMAIL_REGISTRY.md) (every email that sends,
and how). Ledger/platform write-path fns are specified in
[docs/plans/ARCHITECTURE.md](../docs/plans/ARCHITECTURE.md).

## Scheduled jobs (pg_cron)

The recurring jobs live in migrations, not in any dashboard-only config:

| Job | Cadence | Migration | What it does |
|---|---|---|---|
| `email-dispatch` | hourly | `20260623180000` | reads `email_schedules` (the single source of truth for ALL recurring email timing) and sends/invokes what's due |
| signals digest | daily | `20260622110000` | `listening-digest` → Resend email of new high-intent leads |
| AI overview reconcile | daily | `20260628130000` | reconciles `ai_decisions` aggregates |

The old per-email crons are retired — do not add a new cron for a new email;
add a row to `email_schedules` instead (see EMAIL_REGISTRY).
