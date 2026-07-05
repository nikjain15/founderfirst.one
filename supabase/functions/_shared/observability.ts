/**
 * observability — additive structured-log helper for edge functions (RV2-E).
 *
 * Deno-native twin of packages/soak-harness/src/observability.ts (the workspace
 * has the same helper for Node/Workers; edge fns import THIS one to stay inside
 * Deno's dependency-free _shared boundary).
 *
 * ADDITIVE: existing functions are not rewritten. A function opts in by emitting
 * one structured JSON line per event with `slog`, or wrapping a unit of work in
 * `timed`. Supabase's log drain / Logflare / a future alerting sink parses these.
 *
 * The alerting/SLO plan (docs/plans/production-readiness-runbook.md) lists which
 * events to alert on and the thresholds; this helper only EMITS them.
 */

export type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [k: string]: string | number | boolean | null | undefined;
}

export type Sink = (line: string) => void;

const defaultSink: Sink = (line) => console.log(line);

/** Emit one structured JSON log line: { ts, level, fn, event, ...fields }. */
export function slog(fn: string, event: string, level: Level, fields: LogFields = {}, sink: Sink = defaultSink): void {
  sink(JSON.stringify({ ts: new Date().toISOString(), level, fn, event, ...fields }));
}

/**
 * Time an async op; emit `${event}.ok` (info) or `${event}.err` (error) with
 * duration_ms + ok, then return / re-throw. Purely additive to control flow.
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
    slog(fn, `${event}.err`, "error", { ...fields, duration_ms: Date.now() - t0, ok: false, error: String((e as Error).message).slice(0, 200) }, sink);
    throw e;
  }
}
