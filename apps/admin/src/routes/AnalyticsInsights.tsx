import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  listInsightRuns,
  getInsightRun,
  generateInsights,
  setInsightActionStatus,
  type InsightActionRow,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";

/**
 * Analytics → Insights — the Synthesize + Act stages of the learning loop.
 *
 * "Generate now" runs synthesize-insights (PostHog snapshot → AI findings).
 * The latest run's summary + findings render here, with an Act tracker: each
 * suggested action can be accepted / dismissed / marked done. Run history on the
 * left, same shape as the prompt/voice editors.
 */
const STATUS_LABEL: Record<InsightActionRow["status"], string> = {
  suggested: "Suggested", accepted: "Accepted", dismissed: "Dismissed", done: "Done",
};

export function AnalyticsInsights() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { data: runs = [], isPending: loading, error: qErr } = useQuery({
    queryKey: ["insightRuns"],
    queryFn: () => listInsightRuns(),
  });

  const activeId = selectedId ?? runs[0]?.id ?? null;
  const { data: detail } = useQuery({
    queryKey: ["insightRun", activeId],
    queryFn: () => (activeId ? getInsightRun(activeId) : Promise.resolve(null)),
    enabled: !!activeId,
  });

  const genMut = useMutation({
    mutationFn: () => generateInsights(30),
    onSuccess: async (r) => {
      setError(null);
      setFlash(`New run complete — ${r.finding_count} finding(s).`);
      await qc.invalidateQueries({ queryKey: ["insightRuns"] });
      setSelectedId(r.run_id);
    },
    onError: (e) => { setFlash(null); setError((e as Error).message); },
  });

  const actMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: InsightActionRow["status"] }) =>
      setInsightActionStatus(id, status),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["insightRun", activeId] });
      void qc.invalidateQueries({ queryKey: ["insightRuns"] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const displayError = error ?? (qErr ? (qErr as Error).message : null);
  const actions = detail?.actions ?? [];
  const metricsSummary = useMemo(() => {
    const m: any = detail?.run?.metrics;
    if (!m?.overview) return null;
    return `${m.overview.pageviews?.toLocaleString?.() ?? m.overview.pageviews} pageviews · ${m.overview.users?.toLocaleString?.() ?? m.overview.users} users · ${m.window_days}d`;
  }, [detail]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Learning loop · synthesize + act</div>
          <p className="page-sub" style={{ margin: 0 }}>AI reads the product metrics and proposes what to do. Accept, dismiss, or mark done.</p>
        </div>
        <button className="btn primary" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
          {genMut.isPending ? "Generating…" : "Generate now"}
        </button>
      </div>

      {displayError && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          <IconAlert size={16} /> <span>{displayError}</span>
        </div>
      )}
      {flash && (
        <div className="alert alert-success" style={{ marginBottom: 12 }}>
          <IconCheck size={16} /> <span>{flash}</span>
        </div>
      )}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="empty">No insight runs yet. Click “Generate now” to create the first one.</div>
      ) : (
        <div className="prompt-editor prompt-editor-grid">
          <aside>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Run history</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {runs.map((r) => {
                const isSel = r.id === activeId;
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className={`version-row ${isSel ? "active" : ""}`}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 12px",
                        border: "1px solid", borderColor: isSel ? "var(--ink)" : "var(--line)",
                        background: isSel ? "var(--paper)" : "transparent", borderRadius: 8,
                        cursor: "pointer", fontSize: "var(--fs-data-row)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong>{new Date(r.created_at).toLocaleDateString()}</strong>
                        {r.open_actions > 0 && (
                          <span style={{ fontSize: "var(--fs-tiny)", color: "var(--amber)" }}>{r.open_actions} open</span>
                        )}
                      </div>
                      <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 3 }}>
                        {r.finding_count} finding(s) · {r.window_days}d
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section>
            {detail?.run && (
              <>
                <div className="voice-header">
                  <div className="voice-header-meta">
                    <div className="voice-header-title">{new Date(detail.run.created_at).toLocaleString()}</div>
                    <div className="voice-header-sub">
                      {metricsSummary && <span className="badge badge-draft">{metricsSummary}</span>}
                      {detail.run.model && <span className="voice-header-author">via {detail.run.model}</span>}
                    </div>
                  </div>
                </div>

                {detail.run.summary && (
                  <p style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 16 }}>
                    {detail.run.summary}
                  </p>
                )}

                <div style={{ display: "grid", gap: 10 }}>
                  {actions.length === 0 && <div className="empty">No actions in this run.</div>}
                  {actions.map((a) => (
                    <div key={a.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 14, background: "var(--white)", display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                        <strong style={{ fontSize: "var(--fs-data-row)" }}>{a.title}</strong>
                        <span className={`badge ${a.status === "done" ? "badge-live" : a.status === "dismissed" ? "badge-warn" : "badge-draft"}`}>
                          {STATUS_LABEL[a.status]}
                        </span>
                      </div>
                      {a.observation && <p style={{ margin: 0, fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)" }}>{a.observation}</p>}
                      {a.confidence && <span style={{ fontSize: "var(--fs-tiny)", color: "var(--ink-4)" }}>Confidence: {a.confidence}</span>}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(["accepted", "done", "dismissed", "suggested"] as const)
                          .filter((s) => s !== a.status)
                          .map((s) => (
                            <button key={s} className="btn" disabled={actMut.isPending}
                              onClick={() => actMut.mutate({ id: a.id, status: s })}>
                              {s === "suggested" ? "Reset" : STATUS_LABEL[s]}
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
