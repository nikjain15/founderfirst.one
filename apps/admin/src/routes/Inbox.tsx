import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listTickets, getAnalytics, type TicketRow } from "../lib/supabase";
import { channelIcon, IconAlert } from "../lib/icons";
import { bySlaUrgency, slaForTicket, slaLabel } from "../lib/sla";
import { TOPICS } from "../lib/topics";

type StatusFilter = TicketRow["status"] | "all";

export function Inbox() {
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [topicFilter, setTopicFilter] = useState<string>("all");

  // KPI strip — cached; a failure here is swallowed (stats stays undefined) so a
  // broken analytics RPC doesn't take the inbox down with it.
  const { data: stats } = useQuery({ queryKey: ["analytics"], queryFn: getAnalytics });

  // Ticket list — cached per status filter; refetches automatically on change.
  const {
    data: tickets = [],
    isPending: loading,
    error,
  } = useQuery({
    queryKey: ["tickets", filter],
    queryFn: () => listTickets(filter === "all" ? undefined : filter),
  });

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Support · inbox</div>
      <h1 className="page-title">What needs you.</h1>
      <p className="page-sub">Tickets the bot couldn't close on its own. Top of the list first.</p>

      {stats && (
        <div className="kpi-strip">
          <KpiTile label="Open"          value={stats.open_count} />
          <KpiTile label="Stale"         value={stats.stale_count} tone={stats.stale_count > 0 ? "warn" : undefined} />
          <KpiTile label="Avg first reply" value={formatMins(stats.avg_first_response_minutes_7d)} sub="7d" />
          <KpiTile label="Resolved"      value={stats.resolved_7d} sub="7d" />
          <Link to="/analytics" className="kpi-more">More →</Link>
        </div>
      )}

      <div className="toolbar">
        {(["open", "in_progress", "resolved", "all"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            className={`chip ${filter === s ? "active" : ""}`}
            onClick={() => setFilter(s)}
            type="button"
          >
            {s === "in_progress" ? "in progress" : s}
          </button>
        ))}
        <div className="toolbar-spacer" />
        <select
          className="topic-select"
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          aria-label="Filter by topic"
        >
          <option value="all">All topics</option>
          <option value="untagged">Untagged</option>
          {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading && <div className="empty">Loading…</div>}
      {error && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Something broke.</p>
          {error.message}
        </div>
      )}

      {!loading && !error && tickets.length === 0 && (
        <div className="empty">
          <p className="empty-title">Quiet day.</p>
          Nothing in the queue. Go ship something.
        </div>
      )}

      {!loading && !error && tickets.length > 0 && (
        <ul className="ticket-list">
          {/* Sort by SLA urgency only when viewing actionable buckets; resolved/all
              keep the server's order so history reads chronologically. */}
          {(filter === "open" || filter === "in_progress" ? bySlaUrgency(tickets) : tickets)
            .filter((t) => topicFilter === "all"
              || (topicFilter === "untagged" ? !t.topic : t.topic === topicFilter))
            .map((t) => {
            const sla = slaForTicket(t);
            return (
              <li key={t.id}>
                <Link to={`/support/${t.id}`} className="ticket-row">
                  <span className={`priority-pill ${t.priority}`}>{t.priority.toUpperCase()}</span>
                  <div>
                    <p className="ticket-subject">{t.subject || "(no subject)"}</p>
                    <p className="ticket-meta">
                      <span className="channel-tag">
                        {channelIcon(t.channel)}
                        {t.channel}
                      </span>
                      {t.topic && (
                        <>
                          <span className="sep">·</span>
                          <span className="topic-tag">{t.topic}</span>
                        </>
                      )}
                      <span className="sep">·</span>
                      <span>{t.contact_email || t.contact_discord || "no contact"}</span>
                      <span className="sep">·</span>
                      <span>{t.message_count} message{t.message_count === 1 ? "" : "s"}</span>
                      <span className="sep">·</span>
                      <span>{timeAgo(t.created_at)}</span>
                    </p>
                  </div>
                  <span className="ticket-status">
                    {sla !== "na" && (
                      <span className={`sla-pill ${sla}`} title={`SLA: ${slaLabel(sla)}`}>
                        {slaLabel(sla)}
                      </span>
                    )}
                    {t.status === "in_progress" ? "in progress" : t.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function KpiTile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "warn" }) {
  return (
    <div className={`kpi-tile ${tone === "warn" ? "kpi-warn" : ""}`}>
      <div className="kpi-tile-label">{label}</div>
      <div className="kpi-tile-value">{value}{sub && <span className="kpi-tile-sub"> · {sub}</span>}</div>
    </div>
  );
}

function formatMins(n: number | null): string {
  if (n == null) return "—";
  if (n < 60) return `${Math.round(n)}m`;
  const h = n / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
