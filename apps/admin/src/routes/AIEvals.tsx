/**
 * AI · Eval setup — the per-use-case eval config (plan §8, D7/D8/D10).
 *
 * Each use case picks evals from the shared library and tunes them: gate-or-score,
 * threshold, sample rate, enable/disable. The mandatory FLOOR (Safety + Privacy on
 * customer-facing; Source-exists + Source-correct + Math on financial) is LOCKED —
 * shown but not removable/downgradable (enforced in the DB trigger; the UI just
 * reflects it). Config is data, not code (D10); every change is audit-logged.
 *
 * Reads/writes via is_admin()-gated RPCs. The judge (@ff/inference) reads the same
 * config at runtime through a service-role twin, so changes here apply live.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAIUseCases,
  getAIEvalLibrary,
  getAIUseCaseEvals,
  setAIUseCaseEval,
  attachAIEval,
  detachAIEval,
  type AIUseCaseEval,
} from "../lib/supabase";
import { Takeaway } from "../lib/Takeaway";
import { IconAlert } from "../lib/icons";

const METHOD_LABELS: Record<string, string> = {
  deterministic: "Rule",
  sql_reconciliation: "SQL reconcile",
  llm_judge: "AI panel",
  classifier: "Classifier",
};

export function AIEvals() {
  const qc = useQueryClient();
  const [useCase, setUseCase] = useState<string | null>(null);

  const useCases = useQuery({ queryKey: ["aiUseCases"], queryFn: getAIUseCases });
  const library = useQuery({ queryKey: ["aiEvalLibrary"], queryFn: getAIEvalLibrary });

  // Default the selected use case to the first one once loaded.
  const activeUseCase = useCase ?? useCases.data?.[0]?.use_case ?? null;
  const ucMeta = useCases.data?.find((u) => u.use_case === activeUseCase);

  const evalsQ = useQuery({
    queryKey: ["aiUseCaseEvals", activeUseCase],
    queryFn: () => getAIUseCaseEvals(activeUseCase as string),
    enabled: !!activeUseCase,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["aiUseCaseEvals", activeUseCase] });

  const setMut = useMutation({
    mutationFn: (a: Parameters<typeof setAIUseCaseEval>[0]) => setAIUseCaseEval(a),
    onSuccess: invalidate,
  });
  const attachMut = useMutation({
    mutationFn: (evalKey: string) => attachAIEval(activeUseCase as string, evalKey),
    onSuccess: invalidate,
  });
  const detachMut = useMutation({
    mutationFn: (evalKey: string) => detachAIEval(activeUseCase as string, evalKey),
    onSuccess: invalidate,
  });

  const rows = evalsQ.data ?? [];
  const attachedKeys = new Set(rows.map((r) => r.eval_key));
  const available = (library.data ?? []).filter((e) => !attachedKeys.has(e.key));

  const takeaway = useMemo(() => {
    if (!rows.length) return null;
    const gates = rows.filter((r) => r.effective_kind === "gate" && r.enabled).length;
    const scores = rows.filter((r) => r.effective_kind === "score" && r.enabled).length;
    const floors = rows.filter((r) => r.is_floor).length;
    return (
      <Takeaway tone="neutral">
        <strong>{gates}</strong> gate{gates === 1 ? "" : "s"} + <strong>{scores}</strong> score check{scores === 1 ? "" : "s"} on{" "}
        {ucMeta?.label ?? activeUseCase} · <strong>{floors}</strong> locked by the mandatory floor.
      </Takeaway>
    );
  }, [rows, ucMeta, activeUseCase]);

  const err = useCases.error || library.error || evalsQ.error || setMut.error || attachMut.error || detachMut.error;

  return (
    <div>
      {useCases.data && useCases.data.length > 0 && (
        <div className="tabs" role="tablist" aria-label="Use case" style={{ marginBottom: 12 }}>
          {useCases.data.map((u) => (
            <button
              key={u.use_case}
              type="button"
              role="tab"
              aria-selected={activeUseCase === u.use_case}
              className={`tab ${activeUseCase === u.use_case ? "active" : ""}`}
              onClick={() => setUseCase(u.use_case)}
            >
              {u.label}
            </button>
          ))}
        </div>
      )}

      {ucMeta && (
        <p className="page-sub" style={{ marginTop: 0 }}>
          {ucMeta.customer_facing ? "Customer-facing — Safety + Privacy gates are locked on. " : "Internal — no customer-facing floor. "}
          {ucMeta.financial ? "Financial — Source + Math gates are locked on." : ""}
        </p>
      )}

      {takeaway}

      {err && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load or save eval config.</p>
          {(err as Error).message}
          <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
            If this says a function is missing, the <code>ai_evals</code> migration hasn't been applied yet.
          </p>
        </div>
      )}

      {evalsQ.isPending && activeUseCase && <div className="empty">Loading…</div>}

      {rows.length > 0 && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="AI evaluations">
          <table className="data-table">
            <thead>
              <tr>
                <th>Eval</th>
                <th>Method</th>
                <th>Type</th>
                <th className="num">Threshold</th>
                <th className="num">Sample</th>
                <th>On</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <EvalRow
                  key={r.eval_key}
                  row={r}
                  busy={setMut.isPending || detachMut.isPending}
                  onSet={(patch) => setMut.mutate({ useCase: activeUseCase as string, evalKey: r.eval_key, ...patch })}
                  onDetach={() => detachMut.mutate(r.eval_key)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {available.length > 0 && (
        <div className="ai-eval-add">
          <span className="ai-eval-add-label">Add from library:</span>
          {available.map((e) => (
            <button
              key={e.key}
              type="button"
              className="btn btn-ghost"
              disabled={attachMut.isPending}
              onClick={() => attachMut.mutate(e.key)}
            >
              + {e.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EvalRow({
  row,
  busy,
  onSet,
  onDetach,
}: {
  row: AIUseCaseEval;
  busy: boolean;
  onSet: (patch: { kindOverride?: "gate" | "score" | ""; thresholdOverride?: number; sampleRate?: number; enabled?: boolean }) => void;
  onDetach: () => void;
}) {
  const isGate = row.effective_kind === "gate";
  const locked = row.is_floor;
  const num = (v: number | string | null): string => (v == null ? "" : String(typeof v === "string" ? Number(v) : v));

  return (
    <tr className={locked ? "ai-eval-floor" : ""}>
      <td>
        <span className="ai-eval-name">{row.name}</span>
        {locked && <span className="badge badge-warn" title="Mandatory floor — locked on">Locked</span>}
        {row.description && <div className="ai-eval-desc">{row.description}</div>}
      </td>
      <td><span className="ai-model-pill">{METHOD_LABELS[row.method] ?? row.method}</span></td>
      <td>
        <select
          className="ai-eval-select"
          value={row.effective_kind}
          disabled={locked || busy || row.method !== "llm_judge"}
          title={row.method !== "llm_judge" ? "Rule/reconcile evals are always gates" : undefined}
          onChange={(e) => onSet({ kindOverride: e.target.value as "gate" | "score" })}
        >
          <option value="gate">Gate</option>
          <option value="score">Score</option>
        </select>
      </td>
      <td className="num">
        {row.effective_kind === "score" ? (
          <input
            className="ai-eval-input"
            type="number"
            min={0}
            max={1}
            step={0.05}
            defaultValue={num(row.effective_threshold)}
            disabled={busy}
            onBlur={(e) => {
              const v = e.target.value === "" ? undefined : Math.max(0, Math.min(1, Number(e.target.value)));
              if (v !== undefined) onSet({ thresholdOverride: v });
            }}
          />
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="num">
        {isGate ? (
          <span className="muted" title="Gates run on every answer">100%</span>
        ) : (
          <input
            className="ai-eval-input"
            type="number"
            min={0}
            max={1}
            step={0.05}
            defaultValue={num(row.sample_rate)}
            disabled={busy}
            onBlur={(e) => {
              const v = e.target.value === "" ? undefined : Math.max(0, Math.min(1, Number(e.target.value)));
              if (v !== undefined) onSet({ sampleRate: v });
            }}
          />
        )}
      </td>
      <td>
        <input
          type="checkbox"
          checked={row.enabled}
          disabled={locked || busy}
          aria-label={`Enable ${row.name}`}
          onChange={(e) => onSet({ enabled: e.target.checked })}
        />
      </td>
      <td>
        {!locked && (
          <button type="button" className="btn-link btn-link-muted" disabled={busy} onClick={onDetach}>
            Remove
          </button>
        )}
      </td>
    </tr>
  );
}
