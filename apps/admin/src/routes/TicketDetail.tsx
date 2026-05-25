import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getTicket, replyToTicket, getFeedbackForTicket, setTicketTopic, type TicketDetail as TD, type TicketFeedback } from "../lib/supabase";
import { IconArrowLeft, IconSend, IconAlert, channelIcon } from "../lib/icons";
import { slaForTicket, slaLabel } from "../lib/sla";
import { TOPICS } from "../lib/topics";

export function TicketDetail() {
  const { ticketId = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<TD | null>(null);
  const [feedback, setFeedback] = useState<TicketFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [resolve, setResolve] = useState(true);
  const [sending, setSending] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [d, f] = await Promise.all([
        getTicket(ticketId),
        getFeedbackForTicket(ticketId).catch(() => null),
      ]);
      setData(d);
      setFeedback(f);
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
  if (error) {
    return (
      <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
        <IconAlert size={18} />
        <p className="empty-title" style={{ marginTop: 10 }}>Something broke.</p>
        {error}
      </div>
    );
  }
  if (!data) return <div className="empty">Ticket not found.</div>;

  const { ticket, messages } = data;
  const canReply = ticket.status !== "resolved" && ticket.status !== "closed";

  return (
    <div>
      <Link to="/support" className="back-link">
        <IconArrowLeft size={14} />
        Back to inbox
      </Link>

      <header className="ticket-header">
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Ticket · {ticket.id.slice(0, 8)}</div>
          <h1>{ticket.subject || "(no subject)"}</h1>
          <div className="ticket-tags">
            <span className={`priority-pill ${ticket.priority}`}>{ticket.priority.toUpperCase()}</span>
            {(() => {
              const sla = slaForTicket(ticket);
              return sla !== "na" ? <span className={`sla-pill ${sla}`}>{slaLabel(sla)}</span> : null;
            })()}
            <span className="tag">{channelIcon(ticket.channel, 12)}{ticket.channel}</span>
            <span className="tag">{ticket.status === "in_progress" ? "in progress" : ticket.status}</span>
            <label className="topic-edit tag" title="Edit topic">
              <span>topic:</span>
              <select
                value={ticket.topic ?? ""}
                onChange={async (e) => {
                  const next = e.target.value || null;
                  // Optimistic update so the dropdown reflects the change immediately.
                  setData((d) => d ? { ...d, ticket: { ...d.ticket, topic: next } } : d);
                  try { await setTicketTopic(ticket.id, next); }
                  catch (err) { setError((err as Error).message); await refresh(); }
                }}
              >
                <option value="">untagged</option>
                {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            {ticket.contact_email && <span className="tag">{ticket.contact_email}</span>}
            {ticket.contact_discord && <span className="tag">@{ticket.contact_discord}</span>}
          </div>
        </div>
      </header>

      {feedback && (
        <div className={`feedback-strip ${feedback.rating}`}>
          <span className="feedback-rating">{feedback.rating === "up" ? "👍" : "👎"}</span>
          <div>
            <div className="feedback-strip-label">
              User rated this {feedback.rating === "up" ? "helpful" : "not helpful"} · {new Date(feedback.created_at).toLocaleDateString()}
            </div>
            {feedback.comment && <div className="feedback-comment">"{feedback.comment}"</div>}
          </div>
        </div>
      )}

      <div className="thread">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.author}`}>
            {m.author === "bot" ? (
              <span className="p-mark p-mark-sm" aria-label="Bot">P</span>
            ) : m.author === "admin" ? (
              <span className="ff-mark ff-mark-sm" aria-label="Admin">FF</span>
            ) : (
              <span className="msg-mark user" aria-label="User">U</span>
            )}
            <div className="msg-body-wrap">
              <div className="msg-head">
                {m.author === "user" ? "User" : m.author === "bot" ? "Penny" : "You"}
                {" · "}
                {new Date(m.created_at).toLocaleString()}
              </div>
              <div className="msg-body">{m.body}</div>
            </div>
          </div>
        ))}
      </div>

      {canReply && (
        <div className="reply-card">
          <div className="eyebrow">Your reply</div>
          <div className="field">
            <label htmlFor="reply" className="visually-hidden" style={{ position: "absolute", left: -9999 }}>Reply</label>
            <textarea
              id="reply"
              placeholder="Short, direct, on-brand. The user sees this in their original channel."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </div>
          <div className="reply-actions">
            <label>
              <input type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)} />
              Mark resolved
            </label>
            <button className="btn" disabled={sending || !reply.trim()} onClick={onSend}>
              <IconSend size={14} />
              {sending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
