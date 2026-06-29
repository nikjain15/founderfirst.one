/**
 * AI quality & cost — the operator dashboard for the inference layer.
 *
 * Reads ai_decisions (written by @ff/inference resolve() — Phase 0) via
 * is_admin()-gated RPCs and shows what Penny's AI costs and how it's behaving:
 * spend per use case, models in play, latency, cache-hit rate, and anything
 * awaiting a human. Phase 1 = visibility; judging (Phase 2), the review queue
 * (Phase 3), and the autonomy ramp (Phase 5) light up the dashed fields here.
 *
 * Until the layer is deployed, every RPC returns zero rows and the page shows an
 * honest empty state explaining where the data comes from.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAIOverview, type AIUseCaseRow } from "../lib/supabase";
import { Takeaway } from "../lib/Takeaway";
import { IconAlert } from "../lib/icons";
import { AIEvals } from "./AIEvals";
import { AIReview } from "./AIReview";
import { AIModels } from "./AIModels";

const WINDOWS: Array<{ id: number; label: string }> = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
];

const USE_CASE_LABELS: Record<string, string> = {
  penny_chat: "Penny chat",
  insights: "Insights",
  email_compose: "Email drafting",
};

type SubTab = "overview" | "evals" | "review" | "models";

export function AIQuality() {
  const location = useLocation();
  const sub: SubTab =
    location.hash === "#evals" ? "evals"
      : location.hash === "#review" ? "review"
        : location.hash === "#models" ? "models"
          : "overview";
  const [days, setDays] = useState(30);
  const { data, isPending, error } = useQuery({
    queryKey: ["aiOverview", days],
    queryFn: () => getAIOverview(days),
    enabled: sub === "overview",
  });

  // Keep the document scrolled to top when switching sub-tabs via hash.
  useEffect(() => {
    if (sub) window.scrollTo({ top: 0 });
  }, [sub]);

  const kpis = data?.kpis;
  const empty = !isPending && !error && (!kpis || kpis.decision_count === 0);

  const takeaway = useMemo(() => {
    if (!kpis || kpis.decision_count === 0) return null;
    const spend = fmtUsd(kpis.total_cost_usd);
    const n = kpis.decision_count;
    if (kpis.awaiting_review > 0) {
      return (
        <Takeaway tone="watch">
          <strong>{spend}</strong> across {n} AI decision{n === 1 ? "" : "s"} in the last {kpis.window_days}d ·{" "}
          <strong>{kpis.awaiting_review}</strong> awaiting human review.
        </Takeaway>
      );
    }
    return (
      <Takeaway tone="good">
        <strong>{spend}</strong> across {n} AI decision{n === 1 ? "" : "s"} in the last {kpis.window_days}d — nothing awaiting review.
      </Takeaway>
    );
  }, [kpis]);

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · AI</div>
      <h1 className="page-title">What Penny's AI costs — and how it's doing.</h1>
      <p className="page-sub">
        Every AI request flows through one layer that records cost, speed, and quality. Watch spend per use case, tune the quality checks, and see what needs a human.
      </p>

      <div className="tabs" role="tablist" aria-label="AI sections" style={{ marginBottom: 6 }}>
        <a role="tab" aria-selected={sub === "overview"} className={`tab ${sub === "overview" ? "active" : ""}`} href="#overview">Overview</a>
        <a role="tab" aria-selected={sub === "review"} className={`tab ${sub === "review" ? "active" : ""}`} href="#review">Review queue</a>
        <a role="tab" aria-selected={sub === "models"} className={`tab ${sub === "models" ? "active" : ""}`} href="#models">Models</a>
        <a role="tab" aria-selected={sub === "evals"} className={`tab ${sub === "evals" ? "active" : ""}`} href="#evals">Eval setup</a>
      </div>

      {sub === "evals" && <AIEvals />}
      {sub === "review" && <AIReview />}
      {sub === "models" && <AIModels />}

      {sub === "overview" && (
      <>
      <div className="tabs" role="tablist" aria-label="Time window">
        {WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={days === w.id}
            className={`tab ${days === w.id ? "active" : ""}`}
            onClick={() => setDays(w.id)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {isPending && <div className="empty">Loading…</div>}

      {error && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load AI records.</p>
          {error.message}
          <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
            If this says the relation or function is missing, the <code>ai_decisions</code> / <code>admin_ai_*</code> migrations haven't been applied yet.
          </p>
        </div>
      )}

      {empty && (
        <div className="empty">
          <p className="empty-title">No AI decisions recorded yet.</p>
          Once the AI quality &amp; cost layer is deployed, every Penny AI request (chat, insights, email drafts) records a row here — cost, model, latency, and outcome. Trends and per-use-case spend land automatically.
        </div>
      )}

      {!isPending && !error && kpis && kpis.decision_count > 0 && data && (
        <>
          {takeaway}

          {/* KPI strip */}
          <div className="kpi-strip" style={{ marginTop: 16 }}>
            <Kpi label="Total spend" value={fmtUsd(kpis.total_cost_usd)} sub={`last ${kpis.window_days}d`} />
            <Kpi label="Decisions" value={String(kpis.decision_count)} />
            <Kpi label="Cost / resolved" value={fmtUsd(num(kpis.cost_per_resolved))} sub={`${kpis.resolved_count} resolved`} />
            <Kpi label="Avg latency" value={kpis.avg_latency_ms == null ? "—" : `${kpis.avg_latency_ms} ms`} />
            <Kpi label="Cache hit" value={kpis.cache_hit_pct == null ? "—" : `${kpis.cache_hit_pct}%`} />
            <Kpi label="Awaiting review" value={String(kpis.awaiting_review)} warn={kpis.awaiting_review > 0} />
            <Kpi
              label="Judge cost %"
              value={kpis.judge_cost_pct == null ? "—" : `${kpis.judge_cost_pct}%`}
              sub={kpis.judged_count ? `${kpis.judged_count} judged · ${fmtUsd(num(kpis.judge_cost_usd))}` : "no judged answers yet"}
            />
            <Kpi
              label="Gate outcomes"
              value={kpis.judged_count ? `${kpis.gate_passed ?? 0} ✓` : "—"}
              sub={
                kpis.judged_count
                  ? `${kpis.gate_blocked ?? 0} blocked · ${kpis.gate_escalated ?? 0} escalated · ${kpis.gate_failed_closed ?? 0} failed-closed`
                  : "from the judge panel"
              }
              warn={!!(kpis.gate_blocked || kpis.gate_failed_closed)}
            />
          </div>

          {/* Daily spend trend */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">Spend trend</div>
              <h2 className="section-title">Cost by day.</h2>
            </div>
            <SpendSparkline values={data.daily.map((d) => num(d.cost))} />
          </section>

          {/* Per-use-case breakdown */}
          <section className="analytics-section">
            <div className="section-head">
              <div className="eyebrow">By use case</div>
              <h2 className="section-title">Where the spend goes.</h2>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Use case</th>
                    <th className="num">Decisions</th>
                    <th className="num">Total cost</th>
                    <th className="num">Cost / task</th>
                    <th className="num">Judge cost</th>
                    <th>Gates ✓/✕/⤴</th>
                    <th className="num">Avg latency</th>
                    <th className="num">Cache</th>
                    <th>Models</th>
                    <th className="num">Awaiting</th>
                  </tr>
                </thead>
                <tbody>
                  {data.useCases.map((u) => (
                    <tr key={u.use_case}>
                      <td>{USE_CASE_LABELS[u.use_case] ?? u.use_case}</td>
                      <td className="num">{u.decisions}</td>
                      <td className="num">{fmtUsd(num(u.total_cost))}</td>
                      <td className="num">{fmtUsd(num(u.cost_per_task))}</td>
                      <td className="num">{u.judge_cost == null ? "—" : fmtUsd(num(u.judge_cost))}</td>
                      <td className="num">
                        {u.judged ? `${u.gate_passed ?? 0}/${u.gate_blocked ?? 0}/${u.gate_escalated ?? 0}` : <span className="muted">—</span>}
                      </td>
                      <td className="num">{u.avg_latency_ms == null ? "—" : `${u.avg_latency_ms} ms`}</td>
                      <td className="num">{u.cache_hit_pct == null ? "—" : `${u.cache_hit_pct}%`}</td>
                      <td><ModelList models={u.models} /></td>
                      <td className="num">{u.awaiting_review || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Migration reconcile (D21) */}
          {data.reconcile.length > 0 && (
            <section className="analytics-section">
              <div className="section-head">
                <div className="eyebrow">Migration</div>
                <h2 className="section-title">Legacy ↔ new reconcile.</h2>
              </div>
              <div className="ai-reconcile">
                {data.reconcile.map((r) => (
                  <div key={r.surface} className={`ai-reconcile-card ${r.drift === 0 ? "ok" : "warn"}`}>
                    <div className="ai-reconcile-head">
                      <span className="ai-reconcile-surface">{r.surface}</span>
                      <span className="ai-reconcile-drift">{r.drift === 0 ? "in sync" : `drift ${r.drift}`}</span>
                    </div>
                    <div className="ai-reconcile-counts">
                      legacy {r.legacy_count} · new {r.new_count} <span className="muted">({r.window_days}d sample)</span>
                    </div>
                    <div className="ai-reconcile-note">{r.note}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}

/* ---- bits ------------------------------------------------------------------ */

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`kpi-tile ${warn ? "kpi-warn" : ""}`}>
      <div className="kpi-tile-label">{label}</div>
      <div className="kpi-tile-value num">{value}</div>
      {sub && <div className="kpi-tile-sub">{sub}</div>}
    </div>
  );
}

function ModelList({ models }: { models: AIUseCaseRow["models"] }) {
  if (!models || models.length === 0) return <span className="muted">—</span>;
  return (
    <span className="ai-models">
      {models.map((m) => (
        <span key={m} className="ai-model-pill">{shortModel(m)}</span>
      ))}
    </span>
  );
}

/** Trim provider noise so "claude-haiku-4-5-20251001" → "haiku-4-5",
 *  "@cf/meta/llama-3.3-70b-instruct-fp8-fast" → "llama-3.3-70b". */
function shortModel(m: string): string {
  if (m.startsWith("@cf/")) {
    const tail = m.split("/").pop() ?? m;
    return tail.replace(/-instruct.*$/, "").replace(/-fp8.*$/, "");
  }
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

/** Coerce a PostgREST numeric (string) | number | null to a finite number. */
function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

/** Minimal inline-SVG sparkline for daily spend (oldest→newest). */
function SpendSparkline({ values }: { values: number[] }) {
  const W = 320;
  const H = 40;
  if (values.length < 2) return <div className="quality-spark-empty">not enough history yet</div>;
  const max = Math.max(...values, 0.000001);
  const xs = (i: number) => (i / (values.length - 1)) * W;
  const ys = (v: number) => H - (v / max) * H;
  const dPath = values.map((v, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="ai-spend-spark" aria-hidden>
      <path d={dPath} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs(last)} cy={ys(values[last])} r="2.5" fill="currentColor" />
    </svg>
  );
}
