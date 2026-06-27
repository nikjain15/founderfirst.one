# Admin E2E — authenticated smoke test

Verifies the auth-gated admin SPA end to end in CI, so changes behind the login
can be checked without a human (the admin uses magic-link auth; local dev
servers are also unreachable in some sandboxes).

## How it works

- **Auto-login shim** — `apps/admin/src/lib/devAuth.ts` does a real
  `signInWithPassword` when `import.meta.env.DEV` **or** `VITE_E2E=1`, **and**
  test creds are present. A normal production build sets neither flag and ships
  no creds, so the path is dead code / tree-shaken out.
- **Runner** — `tools/admin-e2e/run.mjs` builds nothing itself; the workflow
  builds the admin with `VITE_E2E=1`, then this serves `dist/` and drives
  headless Chromium (raw `playwright` lib, same as the responsive gate). It
  asserts: authed nav renders → Analytics loads → Insights config panel shows
  (sources + the 3 improve areas + Generate). Saves `insights.png`.
- **Workflow** — `.github/workflows/e2e.yml` (runs on `pull_request`, push to
  main, and `workflow_dispatch`). Uploads the screenshot as an artifact.

## Test account (throwaway, by design)

`tester@founderfirst.one` — a Supabase user that **must be in the `admins`
allow-list** (insert a row in `public.admins`; the SQL editor bypasses the
super-admin-only RLS).

Credentials live as:
- **CI:** repo secrets `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`.
- **Local:** `apps/admin/.env.local` (gitignored) as
  `VITE_DEV_ADMIN_EMAIL` / `VITE_DEV_ADMIN_PASSWORD`.

## Verifying a change (incl. for an AI agent)

```sh
gh workflow run e2e.yml --ref <branch>     # or just push to the PR
gh run watch <id> --exit-status
gh run download <id> -D /tmp/e2e-shots     # → admin-e2e-screenshots/insights.png
```

Prefer the **`pull_request`** run: it checks out branch-merged-with-main, so it
includes the latest main. A bare `workflow_dispatch` on a stale branch won't.
