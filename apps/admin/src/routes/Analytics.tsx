import { useEffect, useState } from "react";
import { getAnalytics, type AnalyticsSnapshot } from "../lib/supabase";
import { DualBarChart, HBarBreakdown, zipOpensResolves } from "../lib/charts";
import { IconAlert } from "../lib/icons";

export function Analytics() {
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAnalytics()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Support · analytics</div>
      <h1 className="page-title">How support is doing.</h1>
      <p className="page-sub">Volume, response time, ticket mix. Last 7–30 days.</p>

      {loading && <div className="empty">Loading…</div>}
      {error && (
        <div className="empty" style={{ color: "#b3261e", borderColor: "#fde2e1" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load analytics.</p>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Headline KPIs */}
          <div className="kpi-grid">
            <KPI label="Open now"        value={data.open_count} />
            <KPI label="Stale (>24h)"    value={data.stale_count} tone={data.stale_count > 0 ? "warn" : undefined} />
            <KPI label="Avg first reply" value={formatMinutes(data.avg_first_response_minutes_7d)} sub="last 7d" />
            <KPI label="Resolved"        value={data.resolved_7d} sub="last 7d" />
          </div>

          {/* Time series */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">Last 14 days</div>
              <h2 className="section-title">Opened vs resolved.</h2>
            </div>
            <div className="card">
              <DualBarChart
                series={zipOpensResolves(data.opens_by_day, data.resolves_by_day)}
                labelA="Opened"
                labelB="Resolved"
              />
            </div>
          </section>

          {/* Mix */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">Last 30 days · ticket mix</div>
              <h2 className="section-title">Where tickets come from.</h2>
            </div>
            <div className="mix-grid">
              <div className="card">
                <div className="card-eyebrow">By channel</div>
                <HBarBreakdown items={channelItems(data.channel_30d)} />
              </div>
              <div className="card">
                <div className="card-eyebrow">By priority</div>
                <HBarBreakdown items={priorityItems(data.priority_30d)} />
              </div>
            </div>
          </section>

          {/* Deflection placeholder — wired when Dify logs all conversations */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">Coming soon</div>
              <h2 className="section-title">Deflection rate.</h2>
            </div>
            <div className="card placeholder-card">
              <p>
                We can't measure this yet — Penny only writes to Supabase when she
                escalates. To compute "% of conversations she handled alone" we need
                Dify to log every conversation (not just the ones that turn into
                tickets). That's a small change to the Dify workflow: add an HTTP
                node on the resolution path that pings <code>log_conversation</code>.
              </p>
              <p style={{ marginTop: 8, color: "var(--ink-3)" }}>
                Once that's in place, this card lights up.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "warn" }) {
  return (
    <div className={`kpi ${tone === "warn" ? "kpi-warn" : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function formatMinutes(n: number | null): string {
  if (n == null) return "—";
  if (n < 60) return `${Math.round(n)}m`;
  const h = n / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function channelItems(c: AnalyticsSnapshot["channel_30d"]) {
  return (["discord", "web"] as const)
    .map((k) => ({ key: k, label: k, value: c[k] ?? 0 }))
    .filter((x) => x.value > 0 || true);
}

function priorityItems(p: AnalyticsSnapshot["priority_30d"]) {
  return (["p1", "p2", "p3"] as const)
    .map((k) => ({ key: k, label: k.toUpperCase(), value: p[k] ?? 0 }))
    .filter((x) => x.value > 0 || true);
}
