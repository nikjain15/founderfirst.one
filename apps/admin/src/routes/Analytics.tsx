import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAnalytics,
  listRecentFeedback,
  type AnalyticsSnapshot,
  type FeedbackRow,
} from "../lib/supabase";
import { DualBarChart, HBarBreakdown, zipOpensResolves } from "../lib/charts";
import { IconAlert } from "../lib/icons";

export function Analytics() {
  const [data, setData] = useState<AnalyticsSnapshot | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getAnalytics(), listRecentFeedback(20).catch(() => [] as FeedbackRow[])])
      .then(([d, f]) => { if (!cancelled) { setData(d); setFeedback(f); } })
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
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
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
                <div className="card-eyebrow">By topic</div>
                <HBarBreakdown items={topicItems(data.topic_30d)} />
              </div>
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

          {/* CSAT */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">Last 7 days · customer satisfaction</div>
              <h2 className="section-title">How users feel.</h2>
            </div>
            <div className="mix-grid">
              <div className="card">
                <div className="card-eyebrow">CSAT score</div>
                {data.csat_7d.count === 0 ? (
                  <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 14, lineHeight: 1.55 }}>
                    No ratings yet. Wire Penny + the bridge to call <code>submit_feedback</code> after each resolution.
                  </p>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                      <div className="kpi-value num">{data.csat_7d.score_pct}%</div>
                      <div className="num" style={{ color: "var(--ink-3)", fontSize: 13 }}>
                        {data.csat_7d.up} 👍 · {data.csat_7d.down} 👎 · {data.csat_7d.count} total
                      </div>
                    </div>
                    <div className="hbar-track">
                      <div className="hbar-fill" style={{ width: `${data.csat_7d.score_pct ?? 0}%` }} />
                    </div>
                  </>
                )}
              </div>
              <div className="card">
                <div className="card-eyebrow">Recent ratings</div>
                {feedback.length === 0 ? (
                  <p className="empty-inline">Nothing yet.</p>
                ) : (
                  <ul className="feedback-list">
                    {feedback.slice(0, 8).map((f) => (
                      <li key={f.id} className={`feedback-row ${f.rating}`}>
                        <span className="feedback-rating">{f.rating === "up" ? "👍" : "👎"}</span>
                        <div className="feedback-body">
                          <div className="feedback-meta">
                            <span>{f.source === "bot_resolved" ? "Penny" : "You"}</span>
                            <span className="sep">·</span>
                            <span>{f.channel ?? "—"}</span>
                            <span className="sep">·</span>
                            <span>{new Date(f.created_at).toLocaleDateString()}</span>
                          </div>
                          {f.comment && <div className="feedback-comment">"{f.comment}"</div>}
                          {f.ticket_id && (
                            <Link to={`/support/${f.ticket_id}`} className="feedback-ticket-link">
                              {f.ticket_subject || "view ticket"} →
                            </Link>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
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

function topicItems(t: AnalyticsSnapshot["topic_30d"]) {
  // Sort descending by count, cap at 8 rows so the card stays compact.
  return Object.entries(t ?? {})
    .map(([k, v]) => ({ key: k, label: k, value: v as number }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}
