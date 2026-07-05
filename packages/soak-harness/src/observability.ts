/**
 * Additive structured-log / metric helper for edge functions and workers.
 *
 * ADDITIVE by design (RV2-E gate): existing functions are NOT rewritten. A function
 * opts in by wrapping its handler in `withObservability(name, fn, handler)` or by
 * calling `slog()` / `timed()` directly. Output is a single structured JSON line
 * per event on stdout — the shape Supabase log drains, Logflare, or a future
 * alerting sink can parse. No external dependency, runtime-agnostic (Deno / Node /
 * Workers), so any surface can adopt it.
 *
 * The alerting/SLO plan (docs/plans/production-readiness-runbook.md) lists which of
 * these events to alert on and the thresholds — this helper only EMITS them.
 */

export type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [k: string]: string | number | boolean | null | undefined;
}

export interface StructuredEvent extends LogFields {
  ts: string;
  level: Level;
  fn: string;
  event: string;
}

/** Sink is injectable so tests can capture without touching real stdout. */
export type Sink = (line: string) => void;

const defaultSink: Sink = (line) => {
  // eslint-disable-next-line no-console
  console.log(line);
};

/** Emit one structured JSON log line. */
export function slog(fn: string, event: string, level: Level, fields: LogFields = {}, sink: Sink = defaultSink): void {
  const payload: StructuredEvent = { ts: new Date().toISOString(), level, fn, event, ...fields };
  sink(JSON.stringify(payload));
}

/**
 * Time an async operation and emit a structured event with duration_ms and ok.
 * Emits `${event}.ok` (info) on success or `${event}.err` (error) on throw, then
 * re-throws — the caller's control flow is unchanged (purely additive).
 */
export async function timed<T>(
  fn: string,
  event: string,
  op: () => Promise<T>,
  fields: LogFields = {},
  sink: Sink = defaultSink,
): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await op();
    slog(fn, `${event}.ok`, "info", { ...fields, duration_ms: Date.now() - t0, ok: true }, sink);
    return r;
  } catch (e) {
    slog(
      fn,
      `${event}.err`,
      "error",
      { ...fields, duration_ms: Date.now() - t0, ok: false, error: (e as Error).message.slice(0, 200) },
      sink,
    );
    throw e;
  }
}

/**
 * Wrap an edge-function-style handler so every request emits a start + end event
 * with status + duration. Additive: existing handlers keep their signature.
 */
export function withObservability<Req, Res extends { status?: number }>(
  fn: string,
  handler: (req: Req) => Promise<Res>,
  statusOf: (res: Res) => number = (r) => r.status ?? 200,
  sink: Sink = defaultSink,
): (req: Req) => Promise<Res> {
  return async (req: Req) => {
    const t0 = Date.now();
    slog(fn, "request.start", "info", {}, sink);
    try {
      const res = await handler(req);
      const status = statusOf(res);
      slog(fn, "request.end", status >= 500 ? "error" : "info", { status, duration_ms: Date.now() - t0 }, sink);
      return res;
    } catch (e) {
      slog(fn, "request.end", "error", { status: 500, duration_ms: Date.now() - t0, error: (e as Error).message.slice(0, 200) }, sink);
      throw e;
    }
  };
}
