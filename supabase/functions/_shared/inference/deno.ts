// GENERATED FILE — do not edit by hand.
// Source: packages/inference/src/adapters/deno.ts
// Regenerate with `pnpm vendor:inference`; drift is guarded by `pnpm check:vendor`.
// Vendored so Supabase Edge (Deno) deploys bundle inference code from within
// supabase/functions/ — the single source of truth is packages/inference/src.

/**
 * Supabase Edge (Deno) adapter for @ff/inference.
 *
 * HTTP only — there is NO Workers-AI binding on Supabase Edge, so this ctx
 * provides only the Anthropic transport. The routing guard in core.ts will throw
 * if a @cf/* model is ever routed here (defense in depth). The decision-log write
 * is registered on EdgeRuntime.waitUntil when available, else fire-and-forget;
 * either way it log-drops gracefully and never blocks the response (D18).
 *
 * Imports core with an explicit ".ts" extension (Deno requires it). Type-checked
 * by Deno at runtime, not by the package's pure-only tsconfig.
 *
 * DEPLOY: edge functions do NOT import this file across the repo root. It is
 * vendored into supabase/functions/_shared/inference/ by `pnpm vendor:inference`
 * (the vendored copy rewrites "../core.ts" -> "./core.ts"), so Supabase bundles
 * it from within supabase/functions/. This file remains the single source of
 * truth; `pnpm check:vendor` fails CI if the vendored copy drifts.
 */
import {
  resolve,
  buildRecordRequest,
  DEFAULT_CONFIG,
  type AiDecisionRecord,
  type FetchLike,
  type GatewayConfig,
  type InferenceConfig,
  type ResolveCtx,
  type ResolveResult,
  type ResolveTask,
} from "./core.ts";

export interface DenoInferenceEnv {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
}

export function makeDenoCtx(
  env: DenoInferenceEnv,
  config: InferenceConfig = DEFAULT_CONFIG,
): ResolveCtx {
  const gateway: GatewayConfig | undefined =
    env.AI_GATEWAY_ACCOUNT_ID && env.AI_GATEWAY_ID
      ? { accountId: env.AI_GATEWAY_ACCOUNT_ID, gatewayId: env.AI_GATEWAY_ID }
      : undefined;

  const recordSink = (record: AiDecisionRecord) => {
    const { url, init } = buildRecordRequest(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, record);
    const p = fetch(url, init)
      .then(async (res) => {
        if (!res.ok && res.status !== 409) {
          console.error(`ai_decisions log-drop (${res.status}): ${(await res.text()).slice(0, 200)}`);
        }
      })
      .catch((e) => console.error("ai_decisions log-drop:", e instanceof Error ? e.message : e));
    // Supabase Edge keeps the isolate alive for waitUntil'd work after the
    // response; fall back to fire-and-forget if the global isn't present.
    const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") er.waitUntil(p);
  };

  return {
    runtime: "deno",
    config,
    transports: {
      anthropic: { apiKey: env.ANTHROPIC_API_KEY, fetch: fetch as unknown as FetchLike },
    },
    gateway,
    recordSink,
    now: () => Date.now(),
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    timeoutSignal: (ms: number) => AbortSignal.timeout(ms),
  };
}

export function resolveOnDeno(
  task: ResolveTask,
  env: DenoInferenceEnv,
  config?: InferenceConfig,
): Promise<ResolveResult> {
  return resolve(task, makeDenoCtx(env, config));
}
