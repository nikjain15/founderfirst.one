# GitHub Actions workflows

> Last verified: 2-Aug-2026 · **17 workflows exist; 9 are documented below.** The eight
> undocumented ones are finding S-6 in [../../docs/STAKEHOLDERS.md](../../docs/STAKEHOLDERS.md)
> and are still undocumented. Owner: Nik

All workflows also support manual `workflow_dispatch`. Note: there is no `penny.yml` -
the Penny app deploy is the `deploy-penny` job inside `pages.yml`.

| Workflow | Trigger | What it does | Deploys to |
|---|---|---|---|
| [pages.yml](pages.yml) | push to `main`; `repository_dispatch` (type `content-published`) | Runs 6 pre-build checks (CSS imports, tenant predicate, inference parity, judge, vendored inference), builds web + admin + demo via `scripts/build-all.ts`, then deploys. Second job `deploy-penny` builds apps/app (base `/`) and deploys it. | GitHub Pages (founderfirst.one) + Cloudflare Pages project `penny` (penny.founderfirst.one) |
| [e2e.yml](e2e.yml) | PR; push to `main` | Builds the admin SPA with E2E auto-login (`VITE_E2E=1`), runs a headless Playwright smoke test of authed admin nav (`tools/admin-e2e/run.mjs`); uploads screenshots as artifacts. |, (test gate) |
| [app-e2e.yml](app-e2e.yml) | PR; push to `main` | Builds apps/app with E2E auto-login, runs a headless Playwright smoke test of the authed categorize/ledger UI (`tools/app-e2e/run.mjs`); uploads screenshots. |, (test gate) |
| [responsive.yml](responsive.yml) | PR; push to `main` | Builds `dist/` (same env as pages.yml) and runs responsive invariants across a width ladder (`tools/responsive-ci/run.mjs`): no horizontal scroll, tap targets ≥ 44px, inputs ≥ 16px. |, (test gate) |
| [db-tests.yml](db-tests.yml) | PR touching `supabase/migrations/**`, `supabase/tests/**`, or `supabase/functions/**` | Spins up a local Supabase stack, replays all migrations from scratch, runs the pgTAP suite (`supabase/tests/*.sql`): tenant isolation, ledger balance, import integrity, admin tiers, currency guard. |, (test gate) |
| [migrations-unique.yml](migrations-unique.yml) | PR + push to `main` touching `supabase/migrations/**` | Asserts every migration file has a unique timestamp prefix; fails on duplicates. |, (test gate) |
| [deploy-worker.yml](deploy-worker.yml) | push to `main` touching `site-bubble/**` | Builds the Preact widget, syncs assets, deploys the Penny site-bubble Worker via `wrangler deploy`. | Cloudflare Worker (from `site-bubble/worker`) |
| [deploy-bridge.yml](deploy-bridge.yml) | push to `main` touching `scripts/discord-bridge/**` | Deploys the Discord concierge bridge via `flyctl deploy --remote-only`. | Fly.io |
| [security.yml](security.yml) | PR; push to `main`; weekly Mon 06:00 UTC | Three independent jobs. `dependency-audit` runs `scripts/audit-gate.mjs` over the pnpm workspace, `site-bubble` and `scripts/discord-bridge`, failing on any high or critical not covered by a live, unexpired entry in `.github/audit-allowlist.json` (and on any entry that is past its expiry). `secret-scan` runs gitleaks over the working tree every run and the full history weekly. `codeql` runs GitHub SAST over JavaScript and TypeScript. | (test gate) |
