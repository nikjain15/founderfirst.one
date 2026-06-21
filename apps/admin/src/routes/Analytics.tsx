import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  getAnalytics,
  listRecentFeedback,
  type AnalyticsSnapshot,
  type FeedbackRow,
} from "../lib/supabase";
import { DualBarChart, HBarBreakdown, zipOpensResolves } from "../lib/charts";
import { IconAlert } from "../lib/icons";

export function AnalyticsSupport() {
  // Headline snapshot — surfaces errors below.
  const {
    data,
    isPending: loading,
    error,
  } = useQuery({ queryKey: ["analytics"], queryFn: getAnalytics });

  // Recent ratings — failure is swallowed (falls back to []) so a broken
  // feedback query doesn't take the whole panel down.
  const { data: feedback = [] } = useQuery({
    queryKey: ["recentFeedback", 20],
    queryFn: () => listRecentFeedback(20).catch(() => [] as FeedbackRow[]),
  });

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
          {error.message}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Headline KPIs */}
          <div className="kpi-grid">
            <KPI label="Open now"        value={data.open_count} />
            <KPI label="Stale (>24h)"    value={data.stale_count} tone={data.stale_count > 0 ? "warn" : undefined} />
            <KPI label="Avg first reply" value={formatMinutes(data.avg_first_response_minutes_7d)} sub="last 7d" />
            <KPI label="Resolved"        value={data.resolved_7d} sub="last 7d" tone="pos" />
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
                colorA="var(--ink)"
                colorB="var(--income)"
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
                  <p style={{ margin: 0, color: "var(--ink-3)", fontSize: "var(--fs-data-row)", lineHeight: 1.55 }}>
                    No ratings yet. Wire Penny + the bridge to call <code>submit_feedback</code> after each resolution.
                  </p>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                      <div className={`kpi-value num csat-${csatTone(data.csat_7d.score_pct)}`}>
                        {data.csat_7d.score_pct}%
                      </div>
                      <div className="num" style={{ color: "var(--ink-3)", fontSize: "var(--fs-data-row)" }}>
                        {data.csat_7d.up} 👍 · {data.csat_7d.down} 👎 · {data.csat_7d.count} total
                      </div>
                    </div>
                    <div className="hbar-track">
                      <div
                        className="hbar-fill"
                        style={{
                          width: `${data.csat_7d.score_pct ?? 0}%`,
                          background: `var(--${csatToneColor(csatTone(data.csat_7d.score_pct))})`,
                        }}
                      />
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
        </>
      )}
    </div>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "warn" | "pos" }) {
  const toneClass = tone === "warn" ? "kpi-warn" : tone === "pos" ? "kpi-pos" : "";
  return (
    <div className={`kpi ${toneClass}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// CSAT traffic-light: mirrors the SLA fresh/aging/stale pattern so green
// always means "doing well", amber "watch it", red "act now".
function csatTone(pct: number | null): "good" | "warn" | "bad" | "neutral" {
  if (pct == null) return "neutral";
  if (pct >= 80) return "good";
  if (pct >= 50) return "warn";
  return "bad";
}
function csatToneColor(t: "good" | "warn" | "bad" | "neutral"): "income" | "amber" | "error" | "ink" {
  return t === "good" ? "income" : t === "warn" ? "amber" : t === "bad" ? "error" : "ink";
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
  // P1 tinted red to match the priority pill; P2/P3 stay ink so we don't
  // burn the eye with three competing colors (DS-General §1.2).
  const tones: Record<"p1" | "p2" | "p3", "error" | undefined> = {
    p1: "error",
    p2: undefined,
    p3: undefined,
  };
  return (["p1", "p2", "p3"] as const)
    .map((k) => ({ key: k, label: k.toUpperCase(), value: p[k] ?? 0, tone: tones[k] }))
    .filter((x) => x.value > 0 || true);
}

function topicItems(t: AnalyticsSnapshot["topic_30d"]) {
  // Sort descending by count, cap at 8 rows so the card stays compact.
  return Object.entries(t ?? {})
    .map(([k, v]) => ({ key: k, label: k, value: v as number }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}
