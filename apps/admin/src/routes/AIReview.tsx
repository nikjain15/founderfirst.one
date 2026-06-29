/**
 * AI human review queue (Phase 3). Lists the answers the judge flagged
 * (blocked / escalated / failed-closed) plus a D25 shadow sample of passed
 * answers, and lets an operator approve / edit / reject. The verdict captures
 * zero_edit — the lagging signal the autonomy ramp reads to propose less review
 * (D5) — and an edit records the corrected answer, fed back into the loop.
 *
 * Reuses the Inbox (list) + TicketDetail (detail + action) patterns. Every write
 * goes through an is_admin()-gated, audit-logged RPC (admin_ai_review_submit).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  getAIReviewQueue,
  getAIReviewKpis,
  submitAIReview,
  type AIReviewItem,
  type AIReviewFilter,
  type AIReviewVerdict,
  type AIEvalResult,
} from "../lib/supabase";
import { Takeaway } from "../lib/Takeaway";
import { IconAlert } from "../lib/icons";
import { AIRamp } from "./AIRamp";

const FILTERS: Array<{ id: AIReviewFilter; label: string }> = [
  { id: "needs", label: "Needs review" },
  { id: "shadow", label: "Shadow sample" },
  { id: "all", label: "All" },
];

const USE_CASE_LABELS: Record<string, string> = {
  penny_chat: "Penny chat",
  insights: "Insights",
  email_compose: "Email drafting",
  bookkeeping_categorization: "Bookkeeping",
};

const GATE_LABEL: Record<string, string> = {
  passed: "passed",
  blocked: "blocked",
  escalated: "escalated",
  failed_closed: "failed closed",
  unevaluated: "unevaluated",
};

export function AIReview() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<AIReviewFilter>("needs");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: kpis } = useQuery({ queryKey: ["aiReviewKpis"], queryFn: () => getAIReviewKpis(30) });
  const { data: items, isPending, error } = useQuery({
    queryKey: ["aiReviewQueue", filter],
    queryFn: () => getAIReviewQueue(filter, 50),
  });

  const submit = useMutation({
    mutationFn: submitAIReview,
    onSuccess: () => {
      setOpenId(null);
      void qc.invalidateQueries({ queryKey: ["aiReviewQueue"] });
      void qc.invalidateQueries({ queryKey: ["aiReviewKpis"] });
      void qc.invalidateQueries({ queryKey: ["aiOverview"] });
    },
  });

  const takeaway = useMemo(() => {
    if (!kpis) return null;
    if (kpis.awaiting > 0) {
      return (
        <Takeaway tone="watch">
          <strong>{kpis.awaiting}</strong> answer{kpis.awaiting === 1 ? "" : "s"} awaiting review.{" "}
          {kpis.reviewed > 0 && (
            <>
              Of {kpis.reviewed} reviewed in {kpis.window_days}d, <strong>{kpis.zero_edit_pct ?? 0}%</strong> approved with no edit.
            </>
          )}
        </Takeaway>
      );
    }
    return (
      <Takeaway tone="good">
        Nothing awaiting review.{" "}
        {kpis.reviewed > 0 && (
          <>
            <strong>{kpis.zero_edit_pct ?? 0}%</strong> of the last {kpis.reviewed} were approved with zero edits — the autonomy-ramp signal.
          </>
        )}
      </Takeaway>
    );
  }, [kpis]);

  return (
    <div>
      <AIRamp />

      {takeaway}

      {kpis && (
        <div className="kpi-strip" style={{ marginTop: 16 }}>
          <Kpi label="Awaiting" value={String(kpis.awaiting)} warn={kpis.awaiting > 0} />
          <Kpi label="Reviewed" value={String(kpis.reviewed)} sub={`last ${kpis.window_days}d`} />
          <Kpi label="Approved" value={kpis.approved_pct == null ? "—" : `${kpis.approved_pct}%`} />
          <Kpi label="Zero-edit" value={kpis.zero_edit_pct == null ? "—" : `${kpis.zero_edit_pct}%`} sub="ramp signal" />
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Review filter" style={{ marginTop: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`tab ${filter === f.id ? "active" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isPending && <div className="empty">Loading…</div>}

      {error && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load the review queue.</p>
          {error.message}
        </div>
      )}

      {!isPending && !error && items && items.length === 0 && (
        <div className="empty">
          <p className="empty-title">
            {filter === "shadow" ? "No shadow-sampled answers yet." : "Nothing to review."}
          </p>
          {filter === "needs"
            ? "When the judge blocks, escalates, or fails closed, the answer lands here for a human verdict."
            : "A small slice of passed answers is sampled here so the panel keeps getting checked even after it auto-passes."}
        </div>
      )}

      {!isPending && !error && items && items.length > 0 && (
        <ul className="ai-review-list">
          {items.map((it) => (
            <ReviewCard
              key={it.id}
              item={it}
              open={openId === it.id}
              onToggle={() => setOpenId(openId === it.id ? null : it.id)}
              onSubmit={(verdict, edit, reason) => submit.mutate({ id: it.id, verdict, edit, reason })}
              submitting={submit.isPending}
              submitError={submit.isError && openId === it.id ? (submit.error as Error).message : null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---- one review card ------------------------------------------------------- */

function ReviewCard({
  item,
  open,
  onToggle,
  onSubmit,
  submitting,
  submitError,
}: {
  item: AIReviewItem;
  open: boolean;
  onToggle: () => void;
  onSubmit: (verdict: AIReviewVerdict, edit: string | null, reason: string | null) => void;
  submitting: boolean;
  submitError: string | null;
}) {
  const [mode, setMode] = useState<"none" | "edit" | "reject">("none");
  const [edit, setEdit] = useState(item.output ?? "");
  const [reason, setReason] = useState("");

  const question = lastUserMessage(item);
  const evalEntries = Object.entries(item.evals ?? {});

  return (
    <li className={`ai-review-card ${open ? "open" : ""}`}>
      <button type="button" className="ai-review-head" onClick={onToggle} aria-expanded={open}>
        <span className="ai-review-head-main">
          <GateBadge status={item.gate_status} />
          {item.is_shadow && <span className="ai-review-shadow">shadow</span>}
          <span className="ai-review-uc">{USE_CASE_LABELS[item.use_case] ?? item.use_case}</span>
          <span className="ai-review-snippet">{truncate(item.output ?? question ?? "—", 110)}</span>
        </span>
        <span className="ai-review-when">{timeAgo(item.created_at)}</span>
      </button>

      {open && (
        <div className="ai-review-body">
          {question && (
            <div className="ai-review-block">
              <div className="eyebrow">Question</div>
              <p className="ai-review-text">{question}</p>
            </div>
          )}

          <div className="ai-review-block">
            <div className="eyebrow">Answer · {shortModel(item.model)}</div>
            <p className="ai-review-text">{item.output ?? "—"}</p>
          </div>

          {evalEntries.length > 0 && (
            <div className="ai-review-block">
              <div className="eyebrow">Evals</div>
              <div className="ai-eval-results">
                {evalEntries.map(([key, r]) => (
                  <EvalResultRow key={key} name={key} r={r} />
                ))}
              </div>
            </div>
          )}

          {/* Action row */}
          {mode === "edit" && (
            <div className="ai-review-action">
              <label htmlFor={`edit-${item.id}`} className="eyebrow">Corrected answer</label>
              <textarea
                id={`edit-${item.id}`}
                className="ai-review-textarea"
                value={edit}
                onChange={(e) => setEdit(e.target.value)}
                rows={4}
              />
            </div>
          )}
          {mode === "reject" && (
            <div className="ai-review-action">
              <label htmlFor={`reason-${item.id}`} className="eyebrow">Why is this wrong?</label>
              <textarea
                id={`reason-${item.id}`}
                className="ai-review-textarea"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason — feeds the improvement loop"
              />
            </div>
          )}

          {submitError && <p className="ai-review-error">{submitError}</p>}

          <div className="ai-review-actions">
            {mode === "none" && (
              <>
                <button type="button" className="btn" disabled={submitting} onClick={() => onSubmit("approved", null, null)}>
                  Approve
                </button>
                <button type="button" className="btn-ghost" onClick={() => setMode("edit")}>Edit &amp; approve</button>
                <button type="button" className="btn-ghost" onClick={() => setMode("reject")}>Reject</button>
              </>
            )}
            {mode === "edit" && (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={submitting || !edit.trim()}
                  onClick={() => onSubmit("approved_after_edit", edit.trim(), null)}
                >
                  Save &amp; approve
                </button>
                <button type="button" className="btn-ghost" onClick={() => setMode("none")}>Cancel</button>
              </>
            )}
            {mode === "reject" && (
              <>
                <button type="button" className="btn-danger" disabled={submitting} onClick={() => onSubmit("rejected", null, reason.trim() || null)}>
                  Confirm reject
                </button>
                <button type="button" className="btn-ghost" onClick={() => setMode("none")}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function EvalResultRow({ name, r }: { name: string; r: AIEvalResult }) {
  const verdict =
    r.type === "gate"
      ? r.pass === false
        ? { label: "fail", cls: "fail" }
        : { label: "pass", cls: "pass" }
      : { label: r.score == null ? "—" : r.score.toFixed(2), cls: r.score != null && r.score < 0.6 ? "warn" : "ok" };
  return (
    <div className="ai-eval-result">
      <span className={`ai-eval-dot ${verdict.cls}`} aria-hidden />
      <span className="ai-eval-name">{name}</span>
      <span className="ai-eval-verdict">{verdict.label}</span>
      <span className="ai-eval-by">{r.by}</span>
      {r.rationale && <span className="ai-eval-rationale">{truncate(r.rationale, 80)}</span>}
    </div>
  );
}

function GateBadge({ status }: { status: AIReviewItem["gate_status"] }) {
  return <span className={`ai-gate-badge ${status}`}>{GATE_LABEL[status] ?? status}</span>;
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`kpi-tile ${warn ? "kpi-warn" : ""}`}>
      <div className="kpi-tile-label">{label}</div>
      <div className="kpi-tile-value num">{value}</div>
      {sub && <div className="kpi-tile-sub">{sub}</div>}
    </div>
  );
}

/* ---- helpers --------------------------------------------------------------- */

function lastUserMessage(it: AIReviewItem): string | null {
  const msgs = it.input?.messages;
  if (!msgs || msgs.length === 0) return null;
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "user") return msgs[i].content;
  return null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function shortModel(m: string): string {
  if (m.startsWith("@cf/")) {
    const tail = m.split("/").pop() ?? m;
    return tail.replace(/-instruct.*$/, "").replace(/-fp8.*$/, "");
  }
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
