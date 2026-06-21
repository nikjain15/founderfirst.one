import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFunnel,
  getEventsDaily,
  type FunnelStageRow,
  type EventsDailyRow,
} from "../lib/supabase";
import { IconAlert } from "../lib/icons";

const STAGE_LABELS: Record<string, { title: string; sub: string }> = {
  visited:        { title: "Visited site",      sub: "page_view event" },
  penny_opened:   { title: "Opened Penny",      sub: "penny_opened" },
  penny_messaged: { title: "Sent a message",    sub: "penny_message_sent" },
  signed_up:      { title: "Joined waitlist",   sub: "waitlist_signup" },
  returned_d1:    { title: "Came back later",   sub: "return_visit (≥1d)" },
};

const RANGES: Array<{ label: string; days: number }> = [
  { label: "Last 7d",  days: 7  },
  { label: "Last 30d", days: 30 },
  { label: "Last 90d", days: 90 },
];

export function AnalyticsProduct() {
  const [rangeIdx, setRangeIdx] = useState(1);

  const days = RANGES[rangeIdx].days;

  // Both reads keyed on the active range so they refetch when it changes.
  const funnelQ = useQuery({ queryKey: ["funnel", days], queryFn: () => getFunnel(days) });
  const eventsQ = useQuery({ queryKey: ["eventsDaily", days], queryFn: () => getEventsDaily(days) });

  const loading = funnelQ.isPending || eventsQ.isPending;
  const error = funnelQ.error || eventsQ.error;
  const funnel: FunnelStageRow[] = funnelQ.data ?? [];
  const events: EventsDailyRow[] = eventsQ.data ?? [];

  if (loading) return <div className="empty">Loading…</div>;
  if (error) {
    return (
      <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
        <IconAlert size={18} />
        <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load product funnel.</p>
        {error.message}
        <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
          Did you run <code>SCHEMA-010-events.sql</code> and <code>SCHEMA-011-funnel.sql</code>?
        </p>
      </div>
    );
  }

  const top = funnel[0]?.unique_users ?? 0;
  const totalEvents = events.reduce((s, e) => s + e.total, 0);
  const identifiedPct = totalEvents > 0
    ? Math.round((events.reduce((s, e) => s + e.identified, 0) / totalEvents) * 100)
    : 0;

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
        <span style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)" }}>
          {totalEvents.toLocaleString()} events · {identifiedPct}% identified
        </span>
      </div>

      {top === 0 ? (
        <div className="empty">
          <p className="empty-title">No identified events yet.</p>
          The funnel needs visitors who've accepted analytics consent. Once they do, anon_id-linked events show up here.
        </div>
      ) : (
        <section>
          <h2 className="section-title">Activation funnel</h2>
          <p className="section-sub">Unique visitors (post-consent) reaching each step.</p>
          <FunnelViz rows={funnel} />
        </section>
      )}

      <section style={{ marginTop: 32 }}>
        <h2 className="section-title">Events activity</h2>
        <p className="section-sub">Total events per day · dark = identified (consented), light = aggregate.</p>
        <EventsBarChart rows={events} days={days} />
      </section>
    </>
  );
}

function FunnelViz({ rows }: { rows: FunnelStageRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.unique_users));
  const first = rows[0]?.unique_users ?? 0;
  return (
    <div className="funnel">
      {rows.map((r, i) => {
        const meta = STAGE_LABELS[r.stage] ?? { title: r.stage, sub: "" };
        const widthPct = (r.unique_users / max) * 100;
        const overallPct = first > 0 ? Math.round((r.unique_users / first) * 100) : 0;
        const prevValue = i > 0 ? rows[i - 1].unique_users : null;
        const stepPct = prevValue && prevValue > 0
          ? Math.round((r.unique_users / prevValue) * 100)
          : null;
        return (
          <div key={r.stage} className="funnel-row">
            <div className="funnel-meta">
              <div className="funnel-title">{meta.title}</div>
              <div className="funnel-sub">{meta.sub}</div>
            </div>
            <div className="funnel-bar-wrap">
              <div className="funnel-bar" style={{ width: `${Math.max(widthPct, 1)}%` }}>
                <span className="funnel-bar-label">{r.unique_users.toLocaleString()}</span>
              </div>
            </div>
            <div className="funnel-pct">
              <div>{overallPct}%</div>
              {stepPct != null && <div className="funnel-step">{stepPct}% step</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventsBarChart({ rows, days }: { rows: EventsDailyRow[]; days: number }) {
  // Fill missing days
  const map = new Map(rows.map((r) => [r.day, r]));
  const today = new Date();
  const filled: EventsDailyRow[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    filled.push(map.get(iso) ?? { day: iso, total: 0, identified: 0 });
  }
  const max = Math.max(1, ...filled.map((r) => r.total));
  return (
    <div className="events-bars" style={{ display: "grid", gridTemplateColumns: `repeat(${filled.length}, 1fr)`, gap: 2, alignItems: "end", height: 120, border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "var(--white)" }}>
      {filled.map((r, i) => {
        const totalH = (r.total / max) * 100;
        const identH = (r.identified / max) * 100;
        return (
          <div key={i} style={{ position: "relative", height: "100%" }} title={`${r.day}: ${r.total} total, ${r.identified} identified`}>
            <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${totalH}%`, background: "var(--line)" }} />
            <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${identH}%`, background: "var(--ink)" }} />
          </div>
        );
      })}
    </div>
  );
}
