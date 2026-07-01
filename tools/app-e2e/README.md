# App E2E — authenticated smoke + responsive test

Verifies the auth-gated unified app (`apps/app` — the owner/CPA books, Categorize,
and Import screens on penny.founderfirst.one) end to end in CI, so changes behind
the login can be checked without a human (the app uses magic-link auth).

## How it works

- **Auto-login shim** — `apps/app/src/lib/devAuth.ts` does a real
  `signInWithPassword` when `import.meta.env.DEV` **or** `VITE_E2E=1`, **and**
  test creds are present. A normal production build sets neither flag and ships
  no creds, so the path is dead code / tree-shaken out.
- **Runner** — `tools/app-e2e/run.mjs` serves `apps/app/dist/` (built by the
  workflow with `VITE_E2E=1`) and drives headless Chromium. For the owner's key
  surfaces (Overview · Categorize · Journal · Import) it asserts: the app renders
  past the login wall → an org loaded → each tab's panel renders → **no horizontal
  overflow at 390px** (the `apps/admin/RESPONSIVE.md` invariant). Saves a
  `desktop-<tab>.png` and `mobile-<tab>.png` per screen.
- **Workflow** — `.github/workflows/app-e2e.yml` (runs on `pull_request`, push to
  main, and `workflow_dispatch`). Uploads the screenshots as an artifact.

## Test account (throwaway, by design)

A dedicated Supabase user that **owns a seeded org** — it must be an **owner**
(the write-only Categorize + Import tabs only render with write access) and the
org needs at least a couple of accounts + a transaction so those screens aren't
empty. The seeded `e2e1-maria@e2e.founderfirst.test` owner (org "[E2E] Maria's
Bakery LLC") already fits; a fresh account needs an org seeded first.

The account must have **password auth enabled** (the shim uses `signInWithPassword`,
not magic link).

Credentials live as:
- **CI:** repo secrets `E2E_APP_EMAIL` / `E2E_APP_PASSWORD`.
- **Local:** `apps/app/.env.local` (gitignored) as
  `VITE_DEV_APP_EMAIL` / `VITE_DEV_APP_PASSWORD`.

If the secrets are absent the build won't auto-login and the job fails loudly at
"still on the login wall" — that's the signal to add them, not a silent skip.

## Verifying a change (incl. for an AI agent)

```sh
gh workflow run app-e2e.yml --ref <branch>     # or just push to the PR
gh run watch <id> --exit-status
gh run download <id> -D /tmp/app-shots         # → app-e2e-screenshots/*.png
```

Prefer the **`pull_request`** run: it checks out branch-merged-with-main, so it
includes the latest main. A bare `workflow_dispatch` on a stale branch won't.
