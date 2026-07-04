/**
 * Latency / error recorder for the soak harness. Pure, dependency-free, so it is
 * exercised by the CI-safe smoke test and reused by the live driver.
 */

export interface Sample {
  ok: boolean;
  ms: number;
  /** Set when ok=false — the classified failure reason (e.g. "double_post", "rpc_error"). */
  reason?: string;
}

export interface MetricsSummary {
  count: number;
  ok: number;
  errors: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  reasons: Record<string, number>;
}

export class Metrics {
  private samples: Sample[] = [];

  record(s: Sample): void {
    this.samples.push(s);
  }

  private pct(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  }

  summary(): MetricsSummary {
    const lat = this.samples.map((s) => s.ms).sort((a, b) => a - b);
    const errors = this.samples.filter((s) => !s.ok);
    const reasons: Record<string, number> = {};
    for (const e of errors) reasons[e.reason ?? "unknown"] = (reasons[e.reason ?? "unknown"] ?? 0) + 1;
    const count = this.samples.length;
    return {
      count,
      ok: count - errors.length,
      errors: errors.length,
      errorRate: count === 0 ? 0 : errors.length / count,
      p50: this.pct(lat, 50),
      p95: this.pct(lat, 95),
      p99: this.pct(lat, 99),
      max: lat.length ? lat[lat.length - 1] : 0,
      reasons,
    };
  }
}
