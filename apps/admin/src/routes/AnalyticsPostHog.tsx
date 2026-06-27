import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { posthog, type PhTrafficRow } from "../lib/supabase";
import { HBarBreakdown } from "../lib/charts";
import { IconAlert } from "../lib/icons";

/**
 * PostHog product analytics — pageviews, users, sessions, traffic, top pages
 * and top events, read server-side via the `posthog-proxy` edge function
 * (HogQL). Capture runs live on the site after consent; this surfaces it.
 */
const RANGES: Array<{ label: string; days: number }> = [
  { label: "Last 7d",  days: 7  },
  { label: "Last 30d", days: 30 },
  { label: "Last 90d", days: 90 },
];

export function AnalyticsPostHog() {
  const [rangeIdx, setRangeIdx] = useState(1);
  const days = RANGES[rangeIdx].days;

  const overviewQ = useQuery({ queryKey: ["ph.overview", days],  queryFn: () => posthog.overview(days) });
  const trafficQ  = useQuery({ queryKey: ["ph.traffic", days],   queryFn: () => posthog.traffic(days) });
  const pagesQ    = useQuery({ queryKey: ["ph.topPages", days],  queryFn: () => posthog.topPages(days, 10) });
  const eventsQ   = useQuery({ queryKey: ["ph.topEvents", days], queryFn: () => posthog.topEvents(days, 10) });

  const loading = overviewQ.isPending || trafficQ.isPending || pagesQ.isPending || eventsQ.isPending;
  const error = overviewQ.error || trafficQ.error || pagesQ.error || eventsQ.error;
  const overview = overviewQ.data;
  const traffic = trafficQ.data?.rows ?? [];
  const pages = pagesQ.data?.rows ?? [];
  const events = eventsQ.data?.rows ?? [];

  if (loading) return <div className="empty">Loading from PostHog…</div>;
  if (error) {
    return (
      <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
        <IconAlert size={18} />
        <p className="empty-title" style={{ marginTop: 10 }}>Couldn't reach PostHog.</p>
        {error.message}
        <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
          Check: (1) <code>posthog-proxy</code> edge function deployed; (2) <code>POSTHOG_PERSONAL_API_KEY</code> secret set
          (read scope); (3) project <code>394556</code> on US Cloud.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="toolbar" style={{ marginTop: 0, marginBottom: 20 }}>
        {RANGES.map((r, i) => (
          <button key={r.label} className={`chip ${i === rangeIdx ? "active" : ""}`} onClick={() => setRangeIdx(i)} type="button">
            {r.label}
          </button>
        ))}
        <div className="toolbar-spacer" />
        <a href="https://us.posthog.com/project/394556" target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)" }}>via PostHog ↗</a>
      </div>

      {overview && (
        <div className="kpi-strip">
          <Kpi label="Page views" value={overview.pageviews.toLocaleString()} />
          <Kpi label="Unique users" value={overview.users.toLocaleString()} />
          <Kpi label="Sessions" value={overview.sessions.toLocaleString()} />
        </div>
      )}

      <section style={{ marginTop: 28 }}>
        <h2 className="section-title">Page views over time</h2>
        <p className="section-sub">Pageviews per day (consent-gated capture).</p>
        <TrafficSparkline rows={traffic} days={days} />
      </section>

      <div className="analytics-two-col">
        <section>
          <h2 className="section-title">Top pages</h2>
          <p className="section-sub">Most-viewed paths.</p>
          <HBarBreakdown items={pages.map((p) => ({ key: p.path, label: p.path || "/", value: p.views }))} />
        </section>

        <section>
          <h2 className="section-title">Top events</h2>
          <p className="section-sub">Custom & autocaptured actions.</p>
          <HBarBreakdown items={events.map((e) => ({ key: e.event, label: e.event, value: e.count }))} />
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

function TrafficSparkline({ rows, days }: { rows: PhTrafficRow[]; days: number }) {
  if (rows.length === 0) return <div className="empty-inline">No page views captured yet.</div>;
  const max = Math.max(1, ...rows.map((r) => r.pageviews));
  const W = 720, H = 140, P = 10;
  const stepX = rows.length > 1 ? (W - 2 * P) / (rows.length - 1) : 0;
  const points = rows.map((r, i) => {
    const x = P + i * stepX;
    const y = H - P - (r.pageviews / max) * (H - 2 * P);
    return `${x},${y}`;
  }).join(" ");
  const fmt = (iso: string) => (iso.length >= 10 ? iso.slice(5, 10) : iso);

  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="sparkline">
        <polyline points={points} fill="none" stroke="var(--brand)" strokeWidth={1.5} />
      </svg>
      <div className="sparkline-axis">
        <span>{fmt(rows[0].date)}</span>
        <span style={{ color: "var(--ink-3)" }}>peak {max}/day · {days}d</span>
        <span>{fmt(rows[rows.length - 1].date)}</span>
      </div>
    </div>
  );
}
