import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ga, type GaTrafficRow } from "../lib/supabase";
import { HBarBreakdown } from "../lib/charts";
import { IconAlert } from "../lib/icons";

const RANGES: Array<{ label: string; days: number }> = [
  { label: "Last 7d",  days: 7  },
  { label: "Last 30d", days: 30 },
  { label: "Last 90d", days: 90 },
];

export function AnalyticsMarketing() {
  const [rangeIdx, setRangeIdx] = useState(1);

  const days = RANGES[rangeIdx].days;

  // GA4 reads, all keyed on the active range so they refetch when it changes.
  const overviewQ = useQuery({ queryKey: ["ga.overview", days], queryFn: () => ga.overview(days) });
  const trafficQ  = useQuery({ queryKey: ["ga.traffic", days],  queryFn: () => ga.traffic(days) });
  const pagesQ    = useQuery({ queryKey: ["ga.topPages", days], queryFn: () => ga.topPages(days, 10) });
  const sourcesQ  = useQuery({ queryKey: ["ga.sources", days],  queryFn: () => ga.sources(days, 10) });

  const loading = overviewQ.isPending || trafficQ.isPending || pagesQ.isPending || sourcesQ.isPending;
  const error = overviewQ.error || trafficQ.error || pagesQ.error || sourcesQ.error;
  const overview = overviewQ.data;
  const traffic = trafficQ.data?.rows ?? [];
  const pages = pagesQ.data?.rows ?? [];
  const sources = sourcesQ.data?.rows ?? [];

  if (loading) return <div className="empty">Loading from Google Analytics…</div>;
  if (error) {
    return (
      <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
        <IconAlert size={18} />
        <p className="empty-title" style={{ marginTop: 10 }}>Couldn't reach GA4.</p>
        {error.message}
        <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
          Check: (1) <code>ga-proxy</code> edge function deployed; (2) <code>GA4_PROPERTY_ID</code> + <code>GCP_SA_JSON</code> secrets set;
          (3) service account has Viewer role on the GA4 property.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="toolbar" style={{ marginTop: 0, marginBottom: 20 }}>
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            className={`chip ${i === rangeIdx ? "active" : ""}`}
            onClick={() => setRangeIdx(i)}
            type="button"
          >
            {r.label}
          </button>
        ))}
        <div className="toolbar-spacer" />
        <span style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)" }}>via Google Analytics 4</span>
      </div>

      {overview && (
        <div className="kpi-strip">
          <Kpi label="Users"        value={overview.totalUsers.toLocaleString()} />
          <Kpi label="Sessions"     value={overview.sessions.toLocaleString()} />
          <Kpi label="Page views"   value={overview.pageViews.toLocaleString()} />
          <Kpi label="Bounce rate"  value={`${(overview.bounceRate * 100).toFixed(0)}%`} />
          <Kpi label="Avg session"  value={fmtSeconds(overview.avgSessionSec)} />
        </div>
      )}

      <section style={{ marginTop: 28 }}>
        <h2 className="section-title">Traffic over time</h2>
        <p className="section-sub">Sessions per day.</p>
        <TrafficSparkline rows={traffic} days={days} />
      </section>

      <div className="analytics-two-col">
        <section>
          <h2 className="section-title">Top pages</h2>
          <p className="section-sub">Most-viewed URLs.</p>
          <HBarBreakdown
            items={pages.map((p) => ({ key: p.path, label: p.path, value: p.views }))}
          />
        </section>

        <section>
          <h2 className="section-title">Top sources</h2>
          <p className="section-sub">Where traffic is coming from.</p>
          <HBarBreakdown
            items={sources.map((s) => ({ key: s.source, label: s.source || "(direct)", value: s.sessions }))}
          />
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="kpi-tile">
      <div className="kpi-tile-label">{label}</div>
      <div className="kpi-tile-value">{value}</div>
    </div>
  );
}

function fmtSeconds(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

function TrafficSparkline({ rows, days }: { rows: GaTrafficRow[]; days: number }) {
  if (rows.length === 0) {
    return <div className="empty-inline">No traffic data yet.</div>;
  }
  // GA4 returns dates as "YYYYMMDD"
  const max = Math.max(1, ...rows.map((r) => r.sessions));
  const W = 720, H = 140, P = 10;
  const stepX = rows.length > 1 ? (W - 2 * P) / (rows.length - 1) : 0;
  const points = rows.map((r, i) => {
    const x = P + i * stepX;
    const y = H - P - (r.sessions / max) * (H - 2 * P);
    return `${x},${y}`;
  }).join(" ");
  const first = formatGaDate(rows[0].date);
  const last  = formatGaDate(rows[rows.length - 1].date);

  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="sparkline">
        <polyline points={points} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
      </svg>
      <div className="sparkline-axis">
        <span>{first}</span>
        <span style={{ color: "var(--ink-3)" }}>peak {max} sessions · {days}d</span>
        <span>{last}</span>
      </div>
    </div>
  );
}

function formatGaDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
