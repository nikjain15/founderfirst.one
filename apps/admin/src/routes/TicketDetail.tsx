import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { getTicket, replyToTicket, getFeedbackForTicket, setTicketTopic, logAudit, type TicketFeedback } from "../lib/supabase";
import { IconArrowLeft, IconSend, IconAlert, IconThumbsUp, IconThumbsDown, channelIcon } from "../lib/icons";
import { slaForTicket, slaLabel } from "../lib/sla";
import { TOPICS } from "../lib/topics";

export function TicketDetail() {
  const { ticketId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Ticket thread + feedback — cached per ticketId; feedback failure is swallowed
  // (resolves to null) so a missing feedback row doesn't take the thread down.
  const {
    data,
    isPending: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => getTicket(ticketId),
  });
  const { data: feedback = null } = useQuery({
    queryKey: ["ticketFeedback", ticketId],
    queryFn: () => getFeedbackForTicket(ticketId).catch(() => null as TicketFeedback | null),
  });

  const [reply, setReply] = useState("");
  const [resolve, setResolve] = useState(true);

  // Write errors (reply / set-topic) surface here; read errors come from the query.
  const [error, setError] = useState<string | null>(null);

  // Reply — on resolve we leave the page, otherwise we invalidate so the new
  // admin message lands in the thread.
  const replyMut = useMutation({
    mutationFn: (vars: { body: string; resolve: boolean }) =>
      replyToTicket(ticketId, vars.body, vars.resolve),
    onSuccess: (_res, vars) => {
      void logAudit("ticket.reply", "ticket", ticketId, {
        body: vars.body,
        resolved: vars.resolve,
        ticket_subject: data?.ticket.subject ?? null,
        contact_email:  data?.ticket.contact_email ?? null,
        channel:        data?.ticket.channel ?? null,
      });
      setReply("");
      if (vars.resolve) {
        navigate("/support");
      } else {
        void qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      }
    },
    onError: (e) => setError((e as Error).message),
  });
  const sending = replyMut.isPending;

  // Topic change — optimistic via setQueryData; on failure we revert by refetching.
  const topicMut = useMutation({
    mutationFn: (vars: { next: string | null }) => setTicketTopic(ticketId, vars.next),
    onSuccess: (_res, vars) => {
      void logAudit("ticket.topic_set", "ticket", ticketId, { from: data?.ticket.topic ?? null, to: vars.next });
    },
    onError: (e) => {
      setError((e as Error).message);
      void qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
  });

  function onSend() {
    if (!reply.trim()) return;
    setError(null);
    replyMut.mutate({ body: reply.trim(), resolve });
  }

  if (loading) return <div className="empty">Loading…</div>;
  if (queryError || error) {
    return (
      <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
        <IconAlert size={18} />
        <p className="empty-title" style={{ marginTop: 10 }}>Something broke.</p>
        {error ?? (queryError as Error).message}
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
                onChange={(e) => {
                  const next = e.target.value || null;
                  setError(null);
                  // Optimistic update so the dropdown reflects the change immediately;
                  // the mutation reverts via invalidate on failure.
                  qc.setQueryData(["ticket", ticketId], (d: typeof data) =>
                    d ? { ...d, ticket: { ...d.ticket, topic: next } } : d);
                  topicMut.mutate({ next });
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
          <span className="feedback-rating">
            {feedback.rating === "up" ? (
              <IconThumbsUp size={14} aria-label="thumbs up" />
            ) : (
              <IconThumbsDown size={14} aria-label="thumbs down" />
            )}
          </span>
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
