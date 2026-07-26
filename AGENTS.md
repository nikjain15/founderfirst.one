# FounderFirst

Operating software for business owners, starting with Penny, an autonomous AI bookkeeper.

## Project overview

FounderFirst is a pnpm monorepo for the FounderFirst platform and its first product, Penny. It contains the public marketing site, an authenticated product app with role-scoped lenses for business owners, CPAs, and platform staff, an admin console, a shared design system, a Supabase backend with row-level-security-enforced multi-tenancy, and the inference layer that every AI request flows through. It is built for founders who want clean, tax-ready books without becoming accountants, and for the CPAs who work alongside them.

## Tech stack

- Language: TypeScript across apps, packages, scripts, and tooling. SQL for the database layer.
- Marketing site (apps/web): Astro with React islands, rendered from the shared content model.
- Product and admin SPAs (apps/app, apps/admin): React, Vite, React Router, TanStack Query.
- Demo (apps/demo): React and Vite, the Penny interactive demo served at /penny/demo/.
- Backend: Supabase (Postgres, Auth, Storage) with Deno edge functions under supabase/functions.
- Testing: pgTAP for database policies and logic, Vitest for TypeScript units, Playwright for end-to-end and responsive checks, plus custom TypeScript gate scripts.
- Package manager: pnpm 9 with a workspace spanning packages/* and apps/*.
- Tooling: tsx for running TypeScript scripts, Node for the end-to-end and responsive harnesses.

## Setup

Requires Node 18.17 or newer and pnpm 9.

```
pnpm install
pnpm dev:web        # run the marketing site (apps/web) locally
pnpm --filter @ff/app dev     # run the product app
pnpm --filter @ff/admin dev   # run the admin console
pnpm --filter @ff/demo dev    # run the Penny demo
```

Database and edge-function work uses the Supabase CLI. `supabase db start` spins up a local Postgres stack and replays every migration in supabase/migrations.

## Build

```
pnpm build          # full pipeline: CSS import check, tenant predicate check, inference vendor check, inference judge, then build-all
pnpm build:web      # build the marketing site only
pnpm --filter @ff/app build       # typecheck then Vite build for the product app
pnpm --filter @ff/admin build     # typecheck then Vite build for the admin console
pnpm --filter @ff/demo build      # token check then Vite build for the demo
```

## Testing

This is the regression suite. All of it must pass before merge.

Database (pgTAP), run against a fresh local Supabase stack:

```
supabase db start
supabase test db    # runs every *_test.sql under supabase/tests
```

Edge functions (Deno):

```
deno check supabase/functions/_shared/send.harness.test.ts
deno test --allow-env supabase/functions/_shared/
```

Inference quality and cost gates:

```
pnpm check:inference        # parity harness (packages/inference/test/parity.ts)
pnpm check:judge            # LLM judge gate (packages/inference/test/judge.ts)
pnpm test:chat-latency      # chat latency check
pnpm check:vendor           # verify inference vendoring is in sync
pnpm eval:gates             # eval dataset gates (evals/run.ts against evals/dataset.jsonl)
```

Centralization and content gates:

```
pnpm check:css              # CSS import hygiene
pnpm check:css-vars         # CSS variable usage
pnpm check:app-strings      # centralized string usage
pnpm check:authed-headings  # authed page heading rules
pnpm check:tenant           # tenant predicate enforcement
```

Seed integrity and knowledge kernel gates (each seed script also has a --check mode):

```
pnpm check:kernel-seed       # knowledge kernel seed is in sync
pnpm check:tax-seed          # tax seed is in sync
pnpm check:depreciation-seed # depreciation seed is in sync
pnpm check:kernel-hardcodes  # no hardcoded kernel values
pnpm check:law-literals      # no stray legal literals
pnpm check:reg-watcher       # regulatory watcher replay test
```

Unit, end-to-end, and responsive:

```
pnpm --filter @ff/app test       # apps/app Vitest suite (report and status logic)
pnpm --filter @ff/admin test     # apps/admin Vitest suite
pnpm --filter @ff/demo test      # apps/demo Vitest suite
pnpm --filter @ff/soak-harness test   # soak harness Vitest suite
node tools/app-e2e/run.mjs       # product app E2E, responsive, and a11y smoke (build first)
node tools/admin-e2e/run.mjs     # admin E2E smoke (build first)
pnpm test:responsive             # build then run the responsive gate
pnpm test:responsive:only        # responsive gate against an existing dist/
```

CI mirrors these in .github/workflows (db-tests, deno-tests, regression, e2e, app-e2e, responsive, centralization, kernel-seed, regulatory-watcher, preflight, and more).

## Code style and conventions

- TypeScript throughout, ES modules (`"type": "module"`), targeting modern Node and browser runtimes.
- Prefer the shared packages over duplication: site-wide constants live in @ff/site, content and its Zod schema in @ff/content, design tokens and CSS in @ff/design-system, and the AI resolve path in @ff/inference.
- Content, copy, and site constants are single-source-of-truth. Do not hardcode strings that the centralization gates cover; the check:app-strings, check:css-vars, and check:authed-headings scripts enforce this.
- Compound-word hyphens are fine in prose. Keep commit messages and docs plain.
- Edge functions run on Deno; shared helpers live in supabase/functions/_shared.
- Contributors commonly use Claude Code and other AI agents as development tooling. These guidance files exist so those agents and human contributors share the same context.

## Project structure

- `apps/web`: Astro marketing site, the live founderfirst.one, rendered from @ff/content.
- `apps/app`: authenticated product SPA hosting the business owner, CPA, and admin lenses as role-scoped projections of one platform.
- `apps/admin`: admin console SPA.
- `apps/demo`: Penny interactive demo served at /penny/demo/.
- `packages/inference`: the AI quality and cost layer; one resolve() path every Penny AI request passes through, with per-runtime adapters and the ai_decisions record shape.
- `packages/content`: Zod content schema plus Supabase access; single source of truth for site, product, and email copy.
- `packages/design-system`: shared design tokens and CSS components.
- `packages/site`: site-wide constants (identity, contact, canonical URL, social links).
- `packages/soak-harness`: soak testing harness.
- `supabase/migrations`: ordered SQL migrations. `supabase/tests`: pgTAP suites. `supabase/functions`: Deno edge functions. `supabase/seeds` and `seed.sql`: seed data.
- `scripts`: TypeScript gate, seed, and vendor scripts run via tsx, plus the regulatory watcher.
- `tools`: end-to-end and responsive harnesses (app-e2e, admin-e2e, responsive-ci, e2e-lib) and supporting services.
- `evals`: eval dataset and runner for AI quality gates.
- `docs`: architecture, PRD, technical notes, and evaluation docs.

## Commit and PR guidelines

- Branch off `main` for every change; open a pull request into `main`.
- Keep commit messages plain and descriptive of the change.
- `main` is protected. All checks must pass before merge, and the full regression suite listed under Testing is the bar.
- Keep pull requests scoped. Update the relevant single-source-of-truth package rather than duplicating values.

## Security and secrets

- Multi-tenancy is enforced in the database with row-level security; the check:tenant gate guards the tenant predicate, and pgTAP isolation tests verify tenant boundaries.
- Secrets (Supabase service keys, provider API keys, webhook secrets) live in environment variables and edge-function configuration. They must never reach the client bundle. Client code uses only public, anon-scoped keys.
- Edge functions read secrets from their Deno environment; sensitive tokens such as third-party integration credentials are stored encrypted at rest (see the pgTAP encryption tests under supabase/tests).
- Never commit real secrets. Configure local values through the Supabase CLI environment and your own untracked env files.
