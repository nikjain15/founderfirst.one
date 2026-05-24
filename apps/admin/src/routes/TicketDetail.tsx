import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getTicket, replyToTicket, type TicketDetail as TD } from "../lib/supabase";

export function TicketDetail() {
  const { ticketId = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<TD | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [resolve, setResolve] = useState(true);
  const [sending, setSending] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const d = await getTicket(ticketId);
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function onSend() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await replyToTicket(ticketId, reply.trim(), resolve);
      setReply("");
      if (resolve) {
        navigate("/support");
      } else {
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <div className="empty" style={{ color: "#b3261e" }}>Error: {error}</div>;
  if (!data) return <div className="empty">Ticket not found.</div>;

  const { ticket, messages } = data;

  return (
    <div>
      <Link to="/support" className="back-link">← Back to inbox</Link>

      <header className="ticket-header">
        <div>
          <h1>{ticket.subject || "(no subject)"}</h1>
          <div className="ticket-tags">
            <span className={`priority-pill ${ticket.priority}`}>{ticket.priority.toUpperCase()}</span>
            <span className="tag">{ticket.channel}</span>
            <span className="tag">{ticket.status === "in_progress" ? "in progress" : ticket.status}</span>
            {ticket.contact_email && <span className="tag">{ticket.contact_email}</span>}
            {ticket.contact_discord && <span className="tag">@{ticket.contact_discord}</span>}
          </div>
        </div>
      </header>

      <div className="thread">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.author}`}>
            <div className="msg-head">
              {m.author === "user" ? "User" : m.author === "bot" ? "Bot" : "You"} · {new Date(m.created_at).toLocaleString()}
            </div>
            <div className="msg-body">{m.body}</div>
          </div>
        ))}
      </div>

      {ticket.status !== "resolved" && ticket.status !== "closed" && (
        <div className="reply-card">
          <div className="field">
            <label htmlFor="reply">Reply</label>
            <textarea
              id="reply"
              placeholder="Short, direct, on-brand. The user sees this in their original channel."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </div>
          <div className="reply-actions">
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", color: "var(--ink-3)" }}>
              <input type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)} />
              Mark resolved
            </label>
            <button className="btn" disabled={sending || !reply.trim()} onClick={onSend}>
              {sending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
