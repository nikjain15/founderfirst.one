import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  listInsightRuns,
  getInsightRun,
  generateInsights,
  setInsightActionStatus,
  type InsightActionRow,
  type InsightGoal,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";

/**
 * Analytics → Insights — a customizable, grounded synthesis tool.
 *
 * Pick which data SOURCES to feed Penny and which of three outcome AREAS to
 * improve, then Generate. Penny reads the real metrics and proposes prioritized
 * actions, each bucketed by area, tagged with a target surface, and backed by
 * the exact datapoints it's grounded in (no hallucinated numbers — the backend
 * drops any finding whose evidence isn't real). Accept / dismiss / mark done.
 */
const STATUS_LABEL: Record<InsightActionRow["status"], string> = {
  suggested: "Suggested", accepted: "Accepted", dismissed: "Dismissed", done: "Done",
};

const SOURCES: Array<{ id: string; label: string }> = [
  { id: "product", label: "Product usage" },
  { id: "marketing", label: "Marketing · GA4" },
  { id: "waitlist", label: "Waitlist & referrals" },
  { id: "support", label: "Support & CSAT" },
  { id: "signals", label: "Signals · market" },
];

const GOALS: Array<{ id: InsightGoal; label: string; sub: string }> = [
  { id: "product", label: "Product", sub: "website · CPA app · owner app · admin" },
  { id: "content", label: "Content engine", sub: "blog · podcast · social — SEO / GEO / AI / trust" },
  { id: "customer", label: "Customer problems", sub: "solve at scale, improve every day" },
];
const GOAL_LABEL: Record<InsightGoal, string> = { product: "Product", content: "Content engine", customer: "Customer problems" };
const WINDOWS = [7, 30, 90];

export function AnalyticsInsights() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Config — default to everything on, so one click gives a full read.
  const [sources, setSources] = useState<string[]>(SOURCES.map((s) => s.id));
  const [goals, setGoals] = useState<InsightGoal[]>(GOALS.map((g) => g.id));
  const [days, setDays] = useState(30);

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

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
    mutationFn: () => generateInsights({ days, sources, goals }),
    onSuccess: async (r) => {
      setError(null);
      setFlash(`New run — ${r.finding_count} grounded finding(s)${r.dropped ? ` · ${r.dropped} unsupported dropped` : ""}.`);
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

  // Group actions by outcome area, in canonical order. Untyped (legacy) actions
  // fall into a trailing "Other" bucket so older runs still render.
  const grouped = useMemo(() => {
    const buckets: Array<{ key: string; label: string; items: InsightActionRow[] }> = GOALS.map((g) => ({
      key: g.id, label: GOAL_LABEL[g.id], items: [],
    }));
    const other: InsightActionRow[] = [];
    for (const a of actions) {
      const b = buckets.find((x) => x.key === a.theme);
      if (b) b.items.push(a); else other.push(a);
    }
    const out = buckets.filter((b) => b.items.length > 0);
    if (other.length) out.push({ key: "other", label: "Other", items: other });
    return out;
  }, [actions]);

  const canGenerate = sources.length > 0 && goals.length > 0 && !genMut.isPending;

  return (
    <div>
      <div className="eyebrow">Learning loop · synthesize + act</div>
      <p className="page-sub" style={{ margin: "0 0 16px" }}>
        Pick what to feed Penny and what to improve. Every finding is grounded in real metrics — no guesses.
      </p>

      {/* ---- Config panel ---------------------------------------------------- */}
      <div className="ins-config">
        <div className="ins-config-row">
          <div className="ins-config-label">Feed Penny</div>
          <div className="ins-chips">
            {SOURCES.map((s) => (
              <button key={s.id} type="button"
                className={`chip ${sources.includes(s.id) ? "active" : ""}`}
                aria-pressed={sources.includes(s.id)}
                onClick={() => setSources((p) => toggle(p, s.id))}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ins-config-row">
          <div className="ins-config-label">Improve</div>
          <div className="ins-goals">
            {GOALS.map((g) => {
              const on = goals.includes(g.id);
              return (
                <button key={g.id} type="button"
                  className={`ins-goal ${on ? "on" : ""}`} aria-pressed={on}
                  onClick={() => setGoals((p) => toggle(p, g.id))}>
                  <span className="ins-goal-tick" aria-hidden>{on ? "☑" : "☐"}</span>
                  <span>
                    <span className="ins-goal-title">{g.label}</span>
                    <span className="ins-goal-sub">{g.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="ins-config-row ins-config-gen">
          <div className="ins-chips">
            {WINDOWS.map((w) => (
              <button key={w} type="button"
                className={`chip ${days === w ? "active" : ""}`}
                onClick={() => setDays(w)}>Last {w}d</button>
            ))}
          </div>
          <div className="toolbar-spacer" />
          <button className="btn primary" onClick={() => genMut.mutate()} disabled={!canGenerate}>
            {genMut.isPending ? "Generating…" : "Generate insights"}
          </button>
        </div>
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
        <div className="empty">No insight runs yet. Choose sources + areas above and click “Generate insights”.</div>
      ) : (
        <div className="prompt-editor prompt-editor-grid">
          <aside>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Run history</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {runs.map((r) => {
                const isSel = r.id === activeId;
                return (
                  <li key={r.id}>
                    <button onClick={() => setSelectedId(r.id)}
                      className={`version-row ${isSel ? "active" : ""}`}
                      style={{
                        width: "100%", textAlign: "left", padding: "10px 12px",
                        border: "1px solid", borderColor: isSel ? "var(--ink)" : "var(--line)",
                        background: isSel ? "var(--paper)" : "transparent", borderRadius: 8,
                        cursor: "pointer", fontSize: "var(--fs-data-row)",
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <strong>{new Date(r.created_at).toLocaleDateString()}</strong>
                        {r.open_actions > 0 && (
                          <span style={{ fontSize: "var(--fs-tiny)", color: "var(--amber)" }}>{r.open_actions} open</span>
                        )}
                      </div>
                      <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 3 }}>
                        {r.finding_count} finding(s) · {r.window_days}d
                        {r.sources?.length ? ` · ${r.sources.length} source(s)` : ""}
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
                {detail.run.summary && (
                  <p style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 16 }}>
                    {detail.run.summary}
                  </p>
                )}

                {actions.length === 0 && <div className="empty">No grounded findings in this run.</div>}

                {grouped.map((bucket) => (
                  <div key={bucket.key} className="ins-area">
                    <div className="ins-area-head">
                      <span className="ins-area-name">{bucket.label}</span>
                      <span className="ins-area-count">{bucket.items.length}</span>
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {bucket.items.map((a) => (
                        <div key={a.id} className="ins-card">
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                            <strong style={{ fontSize: "var(--fs-data-row)" }}>{a.title}</strong>
                            <span className={`badge ${a.status === "done" ? "badge-live" : a.status === "dismissed" ? "badge-warn" : "badge-draft"}`}>
                              {STATUS_LABEL[a.status]}
                            </span>
                          </div>
                          {a.observation && <p className="ins-card-obs">{a.observation}</p>}
                          <div className="ins-badges">
                            {a.surface && <span className="badge badge-live">{a.surface}</span>}
                            {(a.evidence ?? []).slice(0, 4).map((e, i) => (
                              <span key={i} className="ins-evidence" title="Grounded in this real metric">
                                {e.metric}: <strong>{String(e.value)}</strong>
                              </span>
                            ))}
                            {a.confidence && <span className="ins-conf">confidence: {a.confidence}</span>}
                          </div>
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
                  </div>
                ))}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
