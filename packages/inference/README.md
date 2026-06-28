# @ff/inference — the AI quality & cost layer

One `resolve(task, ctx)` every Penny AI request passes through. The "front desk"
that routes to a model, calls the provider, times + prices the call, records one
`ai_decisions` row, and returns the raw answer **unchanged**. Built on the
existing Cloudflare + Supabase stack — no new services.

Plan + decisions: [`docs/plans/ai-quality-cost-layer-plan.html`](../../docs/plans/ai-quality-cost-layer-plan.html).
Phase 0 = the seam only (answers unchanged); judging, the dashboard, the review
queue, caching/ramp arrive in Phases 1–6.

## Shape

```
src/
  core.ts            pure, runtime-agnostic: types, config (routing + prices),
                     cost math, the ai_decisions record, resolve(). No runtime
                     globals — fetch/setTimeout/AbortSignal/Date.now/the AI
                     binding/the record sink are all injected via ctx.
  index.ts           re-exports the core for workspace consumers (apps/admin).
  adapters/
    workers.ts       Cloudflare Worker: Anthropic HTTP + env.AI.run, log on
                     ctx.waitUntil. (site-bubble/worker imports by relative path.)
    deno.ts          Supabase Edge: Anthropic HTTP only (no @cf/* here), log on
                     EdgeRuntime.waitUntil. VENDORED into
                     supabase/functions/_shared/inference/ by `pnpm vendor:inference`
                     so edge deploys bundle it from within supabase/functions/
                     (no cross-repo-root import). Drift-guarded by `pnpm check:vendor`.
    node.ts          Node/CI: defaults to global fetch; everything overridable.
test/parity.ts       proves resolve() builds the same request each call site
                     built before the seam (`pnpm check:inference`).
```

## Invariants (enforced in code, not by an AI eval)

- **tenant_id is required** on every call and every `ai_decisions` row (D15).
  `resolve()` throws on an empty tenant; a CI guard
  ([`scripts/check-tenant-predicate.ts`](../../scripts/check-tenant-predicate.ts))
  fails the build if any query touches `ai_decisions` without `tenant_id`.
  Namespaced: `org:founderfirst` (internal tools), `anon:<sessionId>` (site
  chat), `org:<uuid>` (real tenants later).
- **The routing table refuses a `@cf/*` (Workers-AI) model off the Workers
  runtime** — Supabase Edge (Deno) / Node can't reach the AI binding.
- **Logging is async + crash-safe** (D18): the record write is fire-and-forget on
  `waitUntil` and log-drops if Supabase is down — the answer always ships.
- **Config-driven** (D10): routing + prices are data (`DEFAULT_CONFIG`), the
  future home for admin-managed config (Phase 4). Phase 0 callers pass `pinModel`
  so behavior is provably unchanged.

## Cloudflare AI Gateway (D11)

Config-gated. Set `AI_GATEWAY_ACCOUNT_ID` + `AI_GATEWAY_ID` (Worker vars / Deno
env) to route every call through the gateway; unset = direct calls
(byte-identical to today). Keep gateway cache OFF in Phase 0.

## Verify

```
tsc -p packages/inference/tsconfig.json   # pure core typecheck
pnpm check:inference                       # request-parity test
pnpm check:tenant                          # tenant-predicate guard
```
