/**
 * AI · Autonomy ramp (D5) — "as the AI proves itself, it earns less oversight."
 *
 * Per use case: the current review level (full vs sampling N%), and a data-driven
 * recommendation computed from real decisions (zero-edit approval rate, gate pass
 * rate, safety failures, volume). The system PROPOSES; you APPROVE (the Apply
 * button) — never auto-changed. Gate stops always queue regardless; this only
 * governs how much of the PASSED work a human still spot-checks. Lowering it
 * reduces review load via the queue's per-use-case shadow sample.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRampRecommendations, setReviewMode, type AIRampRow } from "../lib/supabase";

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const lvl = (mode: string, rate: number | string | null): string =>
  mode === "full" ? "Full review" : `Sampling ${Math.round(num(rate) * 100)}%`;

export function AIRamp() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["aiRamp"], queryFn: () => getRampRecommendations(30) });
  const apply = useMutation({
    mutationFn: (r: AIRampRow) => setReviewMode(r.use_case, r.recommended_mode as "full" | "sampling", num(r.recommended_sample_rate)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aiRamp"] });
      qc.invalidateQueries({ queryKey: ["aiReview"] });
    },
  });

  const rows = q.data ?? [];
  const changes = useMemo(
    () => rows.filter((r) => r.recommended_mode !== r.current_mode || num(r.recommended_sample_rate) !== num(r.current_sample_rate)),
    [rows],
  );

  if (q.isPending || rows.length === 0) return null;

  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="section-head" style={{ marginBottom: 8 }}>
        <div className="eyebrow">Autonomy</div>
        <h2 className="section-title">
          {changes.length > 0 ? `${changes.length} review level${changes.length === 1 ? "" : "s"} ready to adjust.` : "Review levels — all holding steady."}
        </h2>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Autonomy review levels">
        <table className="data-table">
          <thead>
            <tr>
              <th>Use case</th>
              <th>Now</th>
              <th className="num">Approved no-edit</th>
              <th className="num">Decisions</th>
              <th className="num">Safety fails</th>
              <th>Recommendation</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const changed = r.recommended_mode !== r.current_mode || num(r.recommended_sample_rate) !== num(r.current_sample_rate);
              return (
                <tr key={r.use_case}>
                  <td>{r.label}</td>
                  <td>{lvl(r.current_mode, r.current_sample_rate)}</td>
                  <td className="num">{r.zero_edit_pct == null ? <span className="muted">—</span> : `${num(r.zero_edit_pct)}%`}</td>
                  <td className="num">{r.decisions}</td>
                  <td className="num">{r.safety_fail > 0 ? <span style={{ color: "var(--text-warning)" }}>{r.safety_fail}</span> : "0"}</td>
                  <td>
                    <div style={{ fontSize: "var(--fs-body)" }}>{changed ? lvl(r.recommended_mode, r.recommended_sample_rate) : <span className="muted">no change</span>}</div>
                    <div className="ai-eval-desc">{r.rationale}</div>
                  </td>
                  <td>
                    {changed && (
                      <button type="button" className="btn btn-primary" disabled={apply.isPending} onClick={() => apply.mutate(r)}>
                        Apply
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {apply.error && <p style={{ color: "var(--error)", marginTop: 8 }}>{(apply.error as Error).message}</p>}
    </section>
  );
}
