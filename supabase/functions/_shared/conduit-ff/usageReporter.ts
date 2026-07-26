/**
 * Live-usage reporting for the Conduit gateway.
 *
 * A crash-safe, fire-and-forget reporter that mirrors each metered decision (one
 * per model call on the categorization path) to the Conduit gateway's
 * `POST /v1/decisions` endpoint. It exists so an operator can watch FounderFirst's
 * real spend and latency flow into Conduit live, without touching the model path.
 *
 * DESIGN INVARIANTS.
 *   * NO-OP when unconfigured: if either CONDUIT_GATEWAY_URL or
 *     CONDUIT_GATEWAY_TOKEN is absent, reportDecision returns immediately and
 *     sends nothing. Current behavior and every existing test are unchanged.
 *   * Never blocks, never throws: reportDecision returns void synchronously and
 *     the POST is dispatched off the hot path. Any error (network, timeout,
 *     abort, bad response) is swallowed so the caller's answer always ships.
 *   * Short timeout: the POST is aborted after a small budget so a slow or
 *     unreachable gateway can never pile up on the request path.
 *   * The metered-record math is not touched here. This reporter only observes
 *     the values resolve() already computed and forwards them.
 *
 * The tenant is NOT sent in the body: the gateway derives it from the bearer
 * token server-side.
 */

/** The metered decision, exactly as the gateway's `/v1/decisions` accepts it. */
export interface MeteredDecision {
  /** The real FounderFirst use case, e.g. "penny_categorize". */
  useCase: string;
  model: string;
  provider: string;
  costUsd: number;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  gateStatus?: string;
  /** ISO timestamp of the decision. Defaults to now when omitted. */
  at?: string;
}

/**
 * A narrowed `fetch` signature. The global `fetch` (and any spec-compatible
 * mock) is assignable to this, so callers and tests can pass either.
 */
export type ReporterFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<unknown>;

export interface ReporterDeps {
  /** Env accessor. Defaults to Deno.env.get (the edge runtime accessor). */
  getEnv?: (key: string) => string | undefined;
  /** HTTP transport. Defaults to the global fetch. */
  fetch?: ReporterFetch;
  /** Abort budget for the POST, in ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1500;
const DECISIONS_PATH = "/v1/decisions";

function defaultGetEnv(key: string): string | undefined {
  // Deno is the edge runtime; guarded so a non-Deno runtime is a NO-OP, not a throw.
  try {
    return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
      .Deno?.env.get(key);
  } catch {
    return undefined;
  }
}

/**
 * Fire-and-forget: mirror one metered decision to the Conduit gateway.
 *
 * Returns void immediately. When CONDUIT_GATEWAY_URL / CONDUIT_GATEWAY_TOKEN are
 * unset this is a pure NO-OP. Otherwise it dispatches an authed POST and swallows
 * every failure. The returned promise (from the dispatched send) is intentionally
 * not awaited by callers on the hot path; it is exposed only so tests can await
 * completion.
 */
export function reportDecision(
  decision: MeteredDecision,
  deps: ReporterDeps = {},
): Promise<void> {
  try {
    const getEnv = deps.getEnv ?? defaultGetEnv;
    const baseUrl = getEnv("CONDUIT_GATEWAY_URL");
    const token = getEnv("CONDUIT_GATEWAY_TOKEN");
    // NO-OP when either half of the config is missing.
    if (!baseUrl || !token) return Promise.resolve();

    const doFetch = deps.fetch ??
      ((url, init) =>
        (globalThis as { fetch: ReporterFetch }).fetch(url, init));
    const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const body: Record<string, unknown> = {
      useCase: decision.useCase,
      model: decision.model,
      provider: decision.provider,
      costUsd: decision.costUsd,
      latencyMs: decision.latencyMs,
      at: decision.at ?? new Date().toISOString(),
    };
    if (decision.tokensIn != null) body.tokensIn = decision.tokensIn;
    if (decision.tokensOut != null) body.tokensOut = decision.tokensOut;
    if (decision.gateStatus != null) body.gateStatus = decision.gateStatus;

    const url = baseUrl.replace(/\/+$/, "") + DECISIONS_PATH;

    return send(doFetch, url, token, JSON.stringify(body), timeoutMs);
  } catch {
    // Building the request must never throw on the hot path.
    return Promise.resolve();
  }
}

async function send(
  doFetch: ReporterFetch,
  url: string,
  token: string,
  body: string,
  timeoutMs: number,
): Promise<void> {
  const ac = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = ac
    ? setTimeout(() => {
      try {
        ac.abort();
      } catch { /* ignore */ }
    }, timeoutMs)
    : undefined;
  try {
    await doFetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body,
      ...(ac ? { signal: ac.signal } : {}),
    });
  } catch {
    // Swallow: reporting must never fail or block the request.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
