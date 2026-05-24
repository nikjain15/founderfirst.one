import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTickets, type TicketRow } from "../lib/supabase";

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
      <h1 className="page-title">Support inbox</h1>
      <p className="page-sub">Tickets the bot filed because it couldn't answer alone.</p>

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
      {error && <div className="empty" style={{ color: "#b3261e" }}>Error: {error}</div>}

      {!loading && !error && tickets.length === 0 && (
        <div className="empty">Nothing here. Quiet day.</div>
      )}

      {!loading && !error && tickets.length > 0 && (
        <ul className="ticket-list">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link to={`/support/${t.id}`} className="ticket-row">
                <span className={`priority-pill ${t.priority}`}>{t.priority.toUpperCase()}</span>
                <div>
                  <p className="ticket-subject">{t.subject || "(no subject)"}</p>
                  <p className="ticket-meta">
                    {t.channel} · {t.contact_email || t.contact_discord || "no contact"} · {t.message_count} message{t.message_count === 1 ? "" : "s"}
                    {" · "}
                    {timeAgo(t.created_at)}
                  </p>
                </div>
                <span className="ticket-status">{t.status === "in_progress" ? "in progress" : t.status}</span>
              </Link>
            </li>
          ))}
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
