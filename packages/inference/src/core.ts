/**
 * @ff/inference — the AI quality & cost layer's pure core.
 *
 * Every Penny AI request passes through `resolve(task, ctx)`. This file is the
 * single, runtime-agnostic "front desk": it picks the model, calls the provider,
 * times + prices the call, builds one `ai_decisions` record, and returns the raw
 * answer unchanged. It depends on NO runtime globals — `fetch`, `setTimeout`,
 * `AbortSignal`, `Date.now`, the Workers-AI binding, and the record sink are all
 * injected via `ctx` (see ResolveCtx). That's what lets the same logic run inside
 * a Cloudflare Worker, a Supabase Edge (Deno) function, and Node (the CI test).
 *
 * Design rules encoded here (see docs/plans/ai-quality-cost-layer-plan.html):
 *   D14  pure core + per-runtime adapters — the seam, not a config flip.
 *   D10  config-driven: routing + price tables are data, never per-file constants.
 *   D11  Cloudflare AI Gateway is the front door when configured; cache stays OFF
 *        in Phase 0 so answers are byte-identical and never cross tenants.
 *   D15  tenant_id is a non-empty invariant on every record (asserted here).
 *   D18  logging is async + crash-safe: recordSink is fire-and-forget; a failed
 *        write never throws and never blocks the answer.
 *   §arch the routing table refuses a @cf/* (Workers-AI) model on Deno/Node.
 *
 * Phase 0 keeps answers UNCHANGED: callers pass `pinModel` (their current model)
 * so routing is a faithful pass-through, and they keep their own parsing of the
 * raw text/object. Nothing here interprets the answer.
 *
 * NOTE: this file is intentionally self-contained (no internal imports) so it can
 * be consumed by esbuild (Worker), Deno (edge fn), and Vite/tsx (admin/CI)
 * without import-extension conflicts. Adapters are the only other files.
 */

/* ── Identity & config types ──────────────────────────────────────────────── */

export type Provider = "anthropic" | "workers-ai";
export type Runtime = "workers" | "deno" | "node";

export interface ModelRef {
  provider: Provider;
  /** e.g. "claude-haiku-4-5-20251001" or "@cf/meta/llama-3.3-70b-instruct-fp8-fast" */
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Per-million-token prices (USD). Workers-AI free tier = 0 but we still record usage. */
export interface PriceEntry {
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface InferenceConfig {
  /** use case -> the model it routes to. Phase 0 prefers task.pinModel; this is
   *  the future home that the admin (Phase 4) will populate from the DB (D10). */
  routing: Record<string, ModelRef>;
  /** model id -> price. Editable config (D10/D22); seed values, verify in admin. */
  prices: Record<string, PriceEntry>;
}

/* ── The ask / the answer ─────────────────────────────────────────────────── */

export interface ResolveTask {
  /** Stable id; keys the routing table + the ai_decisions record. */
  useCase: string;
  /** D15 isolation key. Namespaced: "org:founderfirst" | "anon:<sessionId>" |
   *  "org:<uuid>". Asserted non-empty — a missing tenant is a hard error. */
  tenantId: string;
  /** System prompt (provider-native placement handled per provider). */
  system?: string;
  /** Conversation turns the caller wants sent, verbatim. */
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  /** Anthropic structured-output contract -> output_config.json_schema. */
  jsonSchema?: Record<string, unknown>;
  /** Workers-AI structured-output -> response_format json_object. */
  jsonObject?: boolean;
  /** Anthropic-specific knobs preserved verbatim for byte-identical Phase 0. */
  anthropic?: {
    /** anthropic-beta header values, e.g. ["prompt-caching-2024-07-31"]. */
    betas?: string[];
    /** Wrap the system block with cache_control: ephemeral (chat does today). */
    cacheSystem?: boolean;
    /** 429 backoff retries (chat=2). 0 = no retry (insights throws -> fallback). */
    maxRetries?: number;
    /** Base backoff ms (chat=8000 -> 8s,16s). */
    retryBaseMs?: number;
  };
  /** Hard request timeout in ms (insights uses 60000). */
  timeoutMs?: number;
  /** Phase-0 escape hatch: force the exact current model, bypassing routing, so
   *  answers are provably unchanged. Relaxed once admin routing lands (Phase 4). */
  pinModel?: ModelRef;
  /** Record controls + correlation. */
  record?: {
    /** session id / run id stored as request_ref for correlation. */
    ref?: string | null;
    /** PII minimization: when false, `input` is stored null (D11). Default true. */
    storeInput?: boolean;
    /** Dual-write reconcile link to the legacy row this decision corresponds to. */
    legacyTable?: string | null;
    legacyId?: string | null;
  };
}

export interface ResolveResult {
  /** Raw model text — the caller parses/guards exactly as it does today. */
  text: string;
  /** Provider-native response payload (Workers-AI returns an object the caller
   *  branches on). Undefined for plain Anthropic text. */
  raw?: unknown;
  model: ModelRef;
  /** Model id the provider reported serving (Anthropic echoes it); falls back to
   *  model.model. Use this to keep any recorded "model" string identical. */
  providerModel: string;
  usage: { inputTokens?: number; outputTokens?: number };
  costUsd: number;
  latencyMs: number;
  cacheHit: boolean;
}

/* ── Injected runtime bindings ────────────────────────────────────────────── */

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: unknown },
) => Promise<HttpResponse>;

export interface AnthropicTransport {
  apiKey: string;
  fetch: FetchLike;
}
export interface WorkersAiTransport {
  /** env.AI.run(model, input, options?) */
  run: (model: string, input: unknown, options?: unknown) => Promise<unknown>;
}

/** Cloudflare AI Gateway routing (D11). Config-gated — absent = call providers
 *  directly (byte-identical to today). */
export interface GatewayConfig {
  accountId: string;
  gatewayId: string;
}

export interface ResolveCtx {
  runtime: Runtime;
  config: InferenceConfig;
  transports: {
    anthropic?: AnthropicTransport;
    workersAi?: WorkersAiTransport;
  };
  gateway?: GatewayConfig;
  /** Crash-safe, fire-and-forget record write (D18). The adapter wraps this in
   *  ctx.waitUntil / EdgeRuntime.waitUntil and swallows errors. Optional: when
   *  absent, resolve() simply doesn't log (the answer still ships). */
  recordSink?: (record: AiDecisionRecord) => void;
  /** Injected runtime helpers (adapters supply real implementations). */
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Builds an AbortSignal for a timeout; undefined -> no timeout applied. */
  timeoutSignal?: (ms: number) => unknown;
}

/* ── The record (mirrors the ai_decisions table, server-defaulted cols omitted) ─ */

export interface AiDecisionRecord {
  tenant_id: string;
  use_case: string;
  runtime: Runtime;
  provider: Provider;
  model: string;
  request_ref?: string | null;
  input?: unknown;
  output?: string | null;
  output_json?: unknown;
  usage: Record<string, unknown>;
  cost_usd: number | null;
  latency_ms: number | null;
  cache_hit: boolean;
  /** Phase 2 fills evals + gate_status; Phase 0 ships the answer as-is. */
  gate_status: "unevaluated";
  legacy_table?: string | null;
  legacy_id?: string | null;
}

/* ── Default config (seed; admin overrides this from the DB in Phase 4) ──────── */

export const USE_CASE = {
  PENNY_CHAT: "penny_chat",
  INSIGHTS: "insights",
  EMAIL_COMPOSE: "email_compose",
} as const;

export const TENANT_FOUNDERFIRST = "org:founderfirst";
export const anonTenant = (sessionId: string): string => `anon:${sessionId}`;
export const orgTenant = (id: string): string => `org:${id}`;

/**
 * Seed price table (USD per million tokens). Cost is config (D10/D22) and does
 * NOT affect answers — these feed the Phase-1 cost KPIs. Verified against the
 * Anthropic price list via the claude-api skill (table cached 2026-06-04):
 * Haiku 4.5 = $1 / $5, Sonnet 4.6 = $3 / $15. Workers-AI models are free-tier
 * -> 0, but token usage is still recorded. Admin model config (Phase 4) will let
 * these be edited live; re-confirm pricing then if it has moved.
 */
export const DEFAULT_PRICES: Record<string, PriceEntry> = {
  "claude-haiku-4-5-20251001": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "claude-sonnet-4-6": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { inputPerMTok: 0, outputPerMTok: 0 },
};

/**
 * Seed routing (documentation of the current live mapping). Phase 0 callers pass
 * `pinModel` from their own env so behavior is unchanged; this table becomes
 * authoritative once admin model config lands (Phase 4).
 */
export const DEFAULT_ROUTING: Record<string, ModelRef> = {
  [USE_CASE.PENNY_CHAT]: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  [USE_CASE.INSIGHTS]: { provider: "anthropic", model: "claude-sonnet-4-6" },
  [USE_CASE.EMAIL_COMPOSE]: { provider: "workers-ai", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
};

export const DEFAULT_CONFIG: InferenceConfig = {
  routing: DEFAULT_ROUTING,
  prices: DEFAULT_PRICES,
};

/* ── Cost math ────────────────────────────────────────────────────────────── */

export function computeCostUsd(
  model: string,
  usage: { inputTokens?: number; outputTokens?: number },
  prices: Record<string, PriceEntry>,
): number {
  const p = prices[model];
  if (!p) return 0;
  const inTok = usage.inputTokens ?? 0;
  const outTok = usage.outputTokens ?? 0;
  return (inTok / 1_000_000) * p.inputPerMTok + (outTok / 1_000_000) * p.outputPerMTok;
}

/* ── Provider calls (protocol lives in the core; runtime bindings are injected) ─ */

class InferenceError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limited" | "provider_error" | "config_error" | "transport_error",
  ) {
    super(message);
    this.name = "InferenceError";
  }
}
export { InferenceError };

interface ProviderOutput {
  text: string;
  raw?: unknown;
  usage: { inputTokens?: number; outputTokens?: number };
  /** The model id the provider reports it actually served (Anthropic echoes it).
   *  Lets callers preserve a recorded "model" field byte-for-byte. */
  providerModel?: string;
}

async function callAnthropic(
  task: ResolveTask,
  model: ModelRef,
  ctx: ResolveCtx,
): Promise<ProviderOutput> {
  const t = ctx.transports.anthropic;
  if (!t) throw new InferenceError("anthropic transport not provided", "config_error");

  const url = ctx.gateway
    ? `https://gateway.ai.cloudflare.com/v1/${ctx.gateway.accountId}/${ctx.gateway.gatewayId}/anthropic/v1/messages`
    : "https://api.anthropic.com/v1/messages";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": t.apiKey,
    "anthropic-version": "2023-06-01",
  };
  const betas = task.anthropic?.betas ?? [];
  if (betas.length) headers["anthropic-beta"] = betas.join(",");

  const systemField =
    task.system === undefined
      ? undefined
      : task.anthropic?.cacheSystem
        ? [{ type: "text", text: task.system, cache_control: { type: "ephemeral" } }]
        : task.system;

  const body: Record<string, unknown> = {
    model: model.model,
    max_tokens: task.maxTokens,
    messages: task.messages,
  };
  if (systemField !== undefined) body.system = systemField;
  if (task.temperature !== undefined) body.temperature = task.temperature;
  if (task.jsonSchema) {
    body.output_config = { format: { type: "json_schema", schema: task.jsonSchema } };
  }

  const signal =
    task.timeoutMs && ctx.timeoutSignal ? ctx.timeoutSignal(task.timeoutMs) : undefined;

  const maxRetries = task.anthropic?.maxRetries ?? 0;
  const baseMs = task.anthropic?.retryBaseMs ?? 8_000;
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await t.fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (res.status === 429) {
      attempt++;
      if (attempt > maxRetries) throw new InferenceError("rate-limited", "rate_limited");
      await ctx.sleep(baseMs * Math.pow(2, attempt - 1));
      continue;
    }
    if (!res.ok) {
      const errText = await res.text();
      throw new InferenceError(`anthropic ${res.status}: ${errText.slice(0, 300)}`, "provider_error");
    }

    const data = (await res.json()) as {
      model?: string;
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string;
    };
    if (data.stop_reason === "refusal") {
      throw new InferenceError("anthropic_refusal", "provider_error");
    }
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    return {
      text,
      providerModel: data.model,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
    };
  }
}

async function callWorkersAi(
  task: ResolveTask,
  model: ModelRef,
  ctx: ResolveCtx,
): Promise<ProviderOutput> {
  const t = ctx.transports.workersAi;
  if (!t) throw new InferenceError("workers-ai transport not provided", "config_error");

  const messages = task.system
    ? [{ role: "system", content: task.system }, ...task.messages]
    : task.messages;

  const input: Record<string, unknown> = { messages, max_tokens: task.maxTokens };
  if (task.temperature !== undefined) input.temperature = task.temperature;
  if (task.jsonObject) input.response_format = { type: "json_object" };

  // Gateway routing for the binding is config-gated; cache stays OFF in Phase 0
  // so answers are byte-identical (D11).
  const options = ctx.gateway
    ? { gateway: { id: ctx.gateway.gatewayId, skipCache: true } }
    : undefined;

  let out: { response?: unknown; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  try {
    out = (await t.run(model.model, input, options)) as typeof out;
  } catch (e) {
    throw new InferenceError(`workers-ai run failed: ${(e as Error).message}`, "provider_error");
  }
  const resp = out.response;
  const text = typeof resp === "string" ? resp : resp == null ? "" : JSON.stringify(resp);
  return {
    text,
    raw: resp,
    usage: {
      inputTokens: out.usage?.prompt_tokens,
      outputTokens: out.usage?.completion_tokens,
    },
  };
}

/* ── Record write (shared REST shape; adapters supply fetch) ──────────────── */

/**
 * Build the Supabase REST insert for one decision record. Adapters call this and
 * fire the resulting request through their runtime's fetch, wrapped in
 * waitUntil + a catch (D18). Uses the service-role key + Prefer: return=minimal,
 * matching the Worker's existing supabase.ts insert pattern.
 */
export function buildRecordRequest(
  supabaseUrl: string,
  serviceKey: string,
  record: AiDecisionRecord,
): { url: string; init: { method: string; headers: Record<string, string>; body: string } } {
  return {
    url: `${supabaseUrl}/rest/v1/ai_decisions`,
    init: {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(record),
    },
  };
}

/* ── resolve() — the one entry point ──────────────────────────────────────── */

export async function resolve(task: ResolveTask, ctx: ResolveCtx): Promise<ResolveResult> {
  // D15: tenant is a hard invariant, enforced in code (never an AI eval).
  if (!task.tenantId || task.tenantId.trim() === "") {
    throw new InferenceError(`tenant_id required for use case "${task.useCase}"`, "config_error");
  }

  const model = task.pinModel ?? ctx.config.routing[task.useCase];
  if (!model) {
    throw new InferenceError(`no model routed for use case "${task.useCase}"`, "config_error");
  }
  // The routing table refuses a @cf/* (Workers-AI) model off the Workers runtime —
  // Supabase Edge (Deno) and Node can't reach the AI binding.
  if (model.provider === "workers-ai" && ctx.runtime !== "workers") {
    throw new InferenceError(
      `workers-ai model "${model.model}" not reachable on runtime "${ctx.runtime}"`,
      "config_error",
    );
  }

  const started = ctx.now();
  let out: ProviderOutput;
  try {
    out = model.provider === "anthropic" ? await callAnthropic(task, model, ctx) : await callWorkersAi(task, model, ctx);
  } catch (err) {
    // We do not log failed generations here in Phase 0 (callers keep their own
    // error handling + fallbacks unchanged). Re-throw so behavior is identical.
    throw err;
  }
  const latencyMs = ctx.now() - started;
  const costUsd = computeCostUsd(model.model, out.usage, ctx.config.prices);

  // D18: build + fire the record off the hot path. Never let logging throw.
  if (ctx.recordSink) {
    const storeInput = task.record?.storeInput !== false;
    const record: AiDecisionRecord = {
      tenant_id: task.tenantId,
      use_case: task.useCase,
      runtime: ctx.runtime,
      provider: model.provider,
      model: model.model,
      request_ref: task.record?.ref ?? null,
      input: storeInput ? { messages: task.messages } : null,
      output: out.text,
      output_json: out.raw && typeof out.raw === "object" ? out.raw : null,
      usage: out.usage,
      cost_usd: costUsd,
      latency_ms: latencyMs,
      cache_hit: false,
      gate_status: "unevaluated",
      legacy_table: task.record?.legacyTable ?? null,
      legacy_id: task.record?.legacyId ?? null,
    };
    try {
      ctx.recordSink(record);
    } catch {
      /* recordSink must be fire-and-forget; swallow so the answer always ships. */
    }
  }

  return {
    text: out.text,
    raw: out.raw,
    model,
    providerModel: out.providerModel ?? model.model,
    usage: out.usage,
    costUsd,
    latencyMs,
    cacheHit: false,
  };
}
