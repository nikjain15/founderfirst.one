# [stress:csv] repro scripts

Evidence harnesses for the CSV-import stress pass. No secrets are baked in — they
read from the environment / the standard secrets file.

## `parser-harness.mts` — pure-parser adversarial table (no network)
Runs the **real** `apps/app/src/import/csv.ts` against dates, amounts, delimiters,
BOM, etc. Node ≥ 22 (uses native TS type-stripping).
```sh
cp apps/app/src/import/csv.ts apps/app/src/ledger/money.ts /tmp/p/
# edit csv.ts's import to "./money.ts", then:
node /tmp/p/parser-harness.mts
```
Pre-fix: 9 failures (impossible dates emit bad ISO; `;`/tab → 1 column).
Post-fix: ALL EXPECTATIONS MET.

## `live-e2e.mjs` — black-box end-to-end on prod (TESTS A/B/C)
Mints a `@csvtest.founderfirst.test` session, creates an org + accounts, then:
A) good path ties · B) `02/30/2026` aborts the whole batch (22008) · C) re-import
double-posts. Writes `e2e-out.json` (fixtures).
```sh
set -a; source ~/.config/founderfirst/secrets.env; set +a
# fetch the anon key into ./.anon first (Management API → /v1/projects/<ref>/api-keys)
node live-e2e.mjs
```

## `live-e2e-postfix.mjs` — proves the fix (TEST D)
Reuses the e2e org; stages the post-fix row shape (bad date → `txn_date:null`,
status `error`) and confirms the good row posts while the bad one degrades — books
stay balanced.

Cleanup of all fixtures: `../cleanup.sql` (un-run).
