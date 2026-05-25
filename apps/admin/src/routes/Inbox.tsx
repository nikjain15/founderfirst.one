import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets, type TicketRow } from "../lib/supabase";
import { channelIcon, IconAlert } from "../lib/icons";
import { bySlaUrgency, slaForTicket, slaLabel } from "../lib/sla";

type StatusFilter = TicketRow["status"] | "all";

export function Inbox() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTickets(filter === "all" ? undefined : filter)
      .then((rows) => {
        if (!cancelled) setTickets(rows);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Support · inbox</div>
      <h1 className="page-title">What needs you.</h1>
      <p className="page-sub">Tickets the bot couldn't close on its own. Top of the list first.</p>

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
      </div>

      {loading && <div className="empty">Loading…</div>}
      {error && (
        <div className="empty" style={{ color: "#b3261e", borderColor: "#fde2e1" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Something broke.</p>
          {error}
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
          {(filter === "open" || filter === "in_progress" ? bySlaUrgency(tickets) : tickets).map((t) => {
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
