/**
 * Cloudflare Workers adapter for @ff/inference.
 *
 * Builds a ResolveCtx from the Worker's Env + ExecutionContext: Anthropic over
 * HTTP (gateway-routed when configured) AND the Workers-AI binding, with the
 * decision-log write registered on ctx.waitUntil so it never blocks the response
 * and log-drops gracefully if Supabase is unreachable (D18).
 *
 * Type-checked by the Worker's own tsconfig (it has @cloudflare/workers-types),
 * not by the package's pure-only tsconfig — this file references Worker globals
 * (fetch, AbortSignal, setTimeout, console, ExecutionContext).
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
} from "../core";

/** The subset of the Worker Env @ff/inference needs (structurally compatible
 *  with site-bubble/worker's Env). */
export interface WorkersInferenceEnv {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  /** The Workers-AI binding. Typed loosely so the Worker's strongly-typed `Ai`
   *  binding (whose run() is overloaded on a model-name union) assigns cleanly;
   *  we always call it with a routed model string. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AI: { run: (...args: any[]) => Promise<unknown> };
  /** Cloudflare AI Gateway (D11) — set both to route through the gateway; unset =
   *  call providers directly (byte-identical to today). */
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export function makeWorkersCtx(
  env: WorkersInferenceEnv,
  exec: ExecutionContextLike,
  config: InferenceConfig = DEFAULT_CONFIG,
): ResolveCtx {
  const gateway: GatewayConfig | undefined =
    env.AI_GATEWAY_ACCOUNT_ID && env.AI_GATEWAY_ID
      ? { accountId: env.AI_GATEWAY_ACCOUNT_ID, gatewayId: env.AI_GATEWAY_ID }
      : undefined;

  const recordSink = (record: AiDecisionRecord) => {
    const { url, init } = buildRecordRequest(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, record);
    exec.waitUntil(
      fetch(url, init)
        .then(async (res) => {
          if (!res.ok && res.status !== 409) {
            console.error(`ai_decisions log-drop (${res.status}): ${(await res.text()).slice(0, 200)}`);
          }
        })
        .catch((e) => console.error("ai_decisions log-drop:", e instanceof Error ? e.message : e)),
    );
  };

  return {
    runtime: "workers",
    config,
    transports: {
      anthropic: { apiKey: env.ANTHROPIC_API_KEY, fetch: fetch as unknown as FetchLike },
      workersAi: { run: (m, i, o) => env.AI.run(m, i, o) },
    },
    gateway,
    recordSink,
    now: () => Date.now(),
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    timeoutSignal: (ms: number) => AbortSignal.timeout(ms),
  };
}

export function resolveOnWorkers(
  task: ResolveTask,
  env: WorkersInferenceEnv,
  exec: ExecutionContextLike,
  config?: InferenceConfig,
): Promise<ResolveResult> {
  return resolve(task, makeWorkersCtx(env, exec, config));
}
