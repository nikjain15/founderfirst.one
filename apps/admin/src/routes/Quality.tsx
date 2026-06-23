/**
 * Quality — the admin health dashboard.
 *
 * Reads `audit_runs` (written by the weekly /audit agent) and shows, per quality
 * dimension, the current 0–100 score, its trend, and open P0/P1/P2 counts. The
 * point: see where quality is slipping and improve it week over week.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditRuns, type AuditRunRow, type AuditDimensionScore } from "../lib/supabase";
import { IconAlert, IconExternalLink } from "../lib/icons";

// The ten dimensions /audit scores, in display order. Keys must match what the
// audit agent writes into audit_runs.dimensions.
const DIMENSIONS: Array<{ key: string; label: string }> = [
  { key: "ia_ux",          label: "IA / UX" },
  { key: "design_system",  label: "Design system" },
  { key: "responsive",     label: "Responsive" },
  { key: "accessibility",  label: "Accessibility" },
  { key: "security",       label: "Security" },
  { key: "data_integrity", label: "Data integrity" },
  { key: "copy_docs",      label: "Copy / docs" },
  { key: "dead_code",      label: "Dead code" },
  { key: "performance",    label: "Performance" },
  { key: "tests",          label: "Tests" },
];

export function Quality() {
  const { data: runs = [], isPending, error } = useQuery({
    queryKey: ["auditRuns"],
    queryFn: () => listAuditRuns(26),
  });

  // runs come newest-first; chronological (oldest→newest) for trend lines.
  const chrono = useMemo(() => [...runs].reverse(), [runs]);
  const latest = runs[0];
  const prev = runs[1];

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · quality</div>
      <h1 className="page-title">Where quality stands.</h1>
      <p className="page-sub">
        Scored every week by the audit across ten dimensions. Higher is healthier; watch the trend, not just today.
      </p>

      {isPending && <div className="empty">Loading…</div>}

      {error && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load audit history.</p>
          {error.message}
          <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
            If this says the relation is missing, the <code>audit_runs</code> migration hasn't been applied yet.
          </p>
        </div>
      )}

      {!isPending && !error && !latest && (
        <div className="empty">
          <p className="empty-title">No audits yet.</p>
          The weekly audit hasn't recorded a run. Once it does, scores and trends land here.
        </div>
      )}

      {!isPending && !error && latest && (
        <>
          {/* Headline: overall score + run meta */}
          <section className="analytics-section">
            <div className="quality-headline">
              <div className={`quality-overall score-${tone(latest.overall)}`}>
                <div className="quality-overall-num num">{latest.overall}</div>
                <div className="quality-overall-label">overall · 100</div>
              </div>
              <div className="quality-headline-meta">
                <Delta now={latest.overall} then={prev?.overall} unit="pts" />
                <div className="quality-meta-row">
                  Last run {fmtDate(latest.run_at)}
                  {latest.commit_sha ? <> · <code>{latest.commit_sha.slice(0, 7)}</code></> : null}
                </div>
                <div className="quality-meta-row">
                  <SeverityPills totals={latest.totals} />
                </div>
                {latest.pr_url && (
                  <a className="btn-link" href={latest.pr_url} target="_blank" rel="noreferrer">
                    Open findings PR <IconExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
            {latest.summary && <p className="quality-summary">{latest.summary}</p>}
          </section>

          {/* Per-dimension grid */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">By dimension</div>
              <h2 className="section-title">Every side of the house.</h2>
            </div>
            <div className="quality-grid">
              {DIMENSIONS.map((d) => {
                const cur = latest.dimensions?.[d.key];
                const series = chrono.map((r) => r.dimensions?.[d.key]?.score ?? null);
                const prevScore = prev?.dimensions?.[d.key]?.score;
                return (
                  <div key={d.key} className="quality-card">
                    <div className="quality-card-head">
                      <span className="quality-card-label">{d.label}</span>
                      <span className={`quality-score num score-${tone(cur?.score)}`}>
                        {cur ? cur.score : "—"}
                      </span>
                    </div>
                    <Sparkline values={series} />
                    <div className="quality-card-foot">
                      <Delta now={cur?.score} then={prevScore} unit="" compact />
                      <FindingCounts d={cur} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ---- bits ------------------------------------------------------------------ */

function tone(score: number | undefined | null): "good" | "warn" | "bad" | "none" {
  if (score == null) return "none";
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

function Delta({ now, then, unit, compact }: { now?: number; then?: number; unit: string; compact?: boolean }) {
  if (now == null || then == null) return <span className="quality-delta flat">{compact ? "" : "no prior run"}</span>;
  const d = now - then;
  const dir = d > 0 ? "up" : d < 0 ? "down" : "flat";
  const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "—";
  return (
    <span className={`quality-delta ${dir}`} title="vs previous run">
      {arrow} {d === 0 ? "0" : `${Math.abs(d)}`}{unit ? ` ${unit}` : ""}
    </span>
  );
}

function SeverityPills({ totals }: { totals: AuditRunRow["totals"] }) {
  return (
    <span className="quality-sev">
      <span className="quality-sev-pill p0">{totals?.p0 ?? 0} P0</span>
      <span className="quality-sev-pill p1">{totals?.p1 ?? 0} P1</span>
      <span className="quality-sev-pill p2">{totals?.p2 ?? 0} P2</span>
    </span>
  );
}

function FindingCounts({ d }: { d?: AuditDimensionScore }) {
  if (!d) return <span className="quality-card-counts muted">—</span>;
  const parts: string[] = [];
  if (d.p0) parts.push(`${d.p0} P0`);
  if (d.p1) parts.push(`${d.p1} P1`);
  if (d.p2) parts.push(`${d.p2} P2`);
  return <span className="quality-card-counts">{parts.length ? parts.join(" · ") : "clean"}</span>;
}

/** Minimal inline-SVG sparkline. `values` oldest→newest; nulls break the line. */
function Sparkline({ values }: { values: Array<number | null> }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  const W = 120;
  const H = 28;
  if (pts.length < 2) return <div className="quality-spark-empty">not enough history</div>;
  const xs = (i: number) => (values.length === 1 ? 0 : (i / (values.length - 1)) * W);
  const ys = (v: number) => H - (Math.max(0, Math.min(100, v)) / 100) * H;
  const dPath = pts.map((p, k) => `${k === 0 ? "M" : "L"}${xs(p.i).toFixed(1)},${ys(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="quality-spark" aria-hidden>
      <path d={dPath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs(last.i)} cy={ys(last.v)} r="2" fill="currentColor" />
    </svg>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
