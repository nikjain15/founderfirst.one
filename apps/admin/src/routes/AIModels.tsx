/**
 * AI · Models — per-use-case model routing, caps & caching (plan §8, D10/D11).
 *
 * The model each use case runs on, an optional cheaper backup (used when the
 * monthly spend cap is hit — a cap is a fallback, never a failure, D11), a caching
 * toggle, and the spend cap are all editable DATA, not hardcoded (D10). Plus the
 * per-million-token price list that feeds the cost KPIs (D22).
 *
 * "Test before saving" validates a change client-side (model exists, runtime ↔
 * provider compatible, cap is sane) before it's written; the DB trigger is the
 * backstop. Reads/writes via is_admin()-gated RPCs; @ff/inference loads the same
 * config at runtime through a service-role twin (~60s cache), so changes apply live.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAIModelConfig,
  getAIModels,
  setAIModelConfig,
  setAIPrice,
  type AIModelConfigRow,
  type AIModelPrice,
} from "../lib/supabase";
import { Takeaway } from "../lib/Takeaway";
import { IconAlert } from "../lib/icons";

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtUsd = (n: number): string =>
  n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;

export function AIModels() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["aiModelConfig"], queryFn: getAIModelConfig });
  const pricesQ = useQuery({ queryKey: ["aiModels"], queryFn: getAIModels });

  const saveMut = useMutation({
    mutationFn: (a: Parameters<typeof setAIModelConfig>[0]) => setAIModelConfig(a),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aiModelConfig"] }),
  });
  const priceMut = useMutation({
    mutationFn: (a: Parameters<typeof setAIPrice>[0]) => setAIPrice(a),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aiModels"] }),
  });

  const rows = cfgQ.data ?? [];
  const prices = pricesQ.data ?? [];
  const err = cfgQ.error || pricesQ.error || saveMut.error || priceMut.error;

  const takeaway = useMemo(() => {
    if (!rows.length) return null;
    const spend = rows.reduce((s, r) => s + num(r.spend_mtd_usd), 0);
    const capped = rows.filter((r) => r.monthly_cap_usd != null).length;
    return (
      <Takeaway tone="neutral">
        <strong>{fmtUsd(spend)}</strong> spent this month across {rows.length} use case{rows.length === 1 ? "" : "s"} ·{" "}
        {capped === 0 ? "no spend caps set" : `${capped} with a cap`}.
      </Takeaway>
    );
  }, [rows]);

  return (
    <div>
      <p className="page-sub" style={{ marginTop: 0 }}>
        Pick the model each use case runs on, a cheaper backup for when a spend cap is hit, caching, and the cap itself. Changes apply live (~1 min) and are audit-logged.
      </p>

      {takeaway}

      {err && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load or save model config.</p>
          {(err as Error).message}
          <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
            If this says a function is missing, the <code>ai_model_config</code> migration hasn't been applied yet.
          </p>
        </div>
      )}

      {cfgQ.isPending && <div className="empty">Loading…</div>}

      {rows.map((r) => (
        <UseCaseModelCard
          key={r.use_case}
          row={r}
          prices={prices}
          busy={saveMut.isPending}
          onSave={(patch) => saveMut.mutate({ useCase: r.use_case, ...patch })}
        />
      ))}

      {prices.length > 0 && (
        <section className="analytics-section">
          <div className="section-head">
            <div className="eyebrow">Pricing</div>
            <h2 className="section-title">Per-million-token prices.</h2>
          </div>
          <p className="page-sub" style={{ marginTop: 0 }}>
            Feeds the cost KPIs — editing a price never changes an answer. Re-confirm against the provider price list when models change.
          </p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Per-million-token model prices">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Provider</th>
                  <th className="num">Input $/Mtok</th>
                  <th className="num">Output $/Mtok</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <PriceRow key={p.model} price={p} busy={priceMut.isPending} onSave={(input, output) =>
                    priceMut.mutate({ model: p.model, provider: p.provider, inputPerMTok: input, outputPerMTok: output })
                  } />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

type SavePatch = {
  mainProvider: string;
  mainModel: string;
  backupProvider: string | null;
  backupModel: string | null;
  cacheEnabled: boolean;
  monthlyCapUsd: number | null;
};

function UseCaseModelCard({
  row,
  prices,
  busy,
  onSave,
}: {
  row: AIModelConfigRow;
  prices: AIModelPrice[];
  busy: boolean;
  onSave: (patch: SavePatch) => void;
}) {
  const [mainModel, setMainModel] = useState(row.main_model);
  const [backupModel, setBackupModel] = useState(row.backup_model ?? "");
  const [cacheEnabled, setCacheEnabled] = useState(row.cache_enabled);
  const [cap, setCap] = useState(row.monthly_cap_usd == null ? "" : String(num(row.monthly_cap_usd)));
  const [tested, setTested] = useState<string | null>(null);

  // A @cf/* (Workers-AI) model is only reachable on the Workers runtime.
  const allowed = prices.filter((p) => row.runtime === "workers" || p.provider !== "workers-ai");
  const providerOf = (model: string): string | null => prices.find((p) => p.model === model)?.provider ?? null;

  const issues = useMemo(() => {
    const out: string[] = [];
    if (!mainModel) out.push("Pick a main model.");
    else if (!providerOf(mainModel)) out.push(`Main model "${mainModel}" has no price entry.`);
    else if (row.runtime !== "workers" && providerOf(mainModel) === "workers-ai")
      out.push(`This use case runs on ${row.runtime}; a Workers-AI model isn't reachable.`);
    if (backupModel) {
      if (!providerOf(backupModel)) out.push(`Backup model "${backupModel}" has no price entry.`);
      else if (row.runtime !== "workers" && providerOf(backupModel) === "workers-ai")
        out.push(`Backup must be reachable on ${row.runtime} (no Workers-AI).`);
    }
    if (cap !== "" && (!Number.isFinite(Number(cap)) || Number(cap) < 0)) out.push("Cap must be a non-negative number.");
    return out;
  }, [mainModel, backupModel, cap, prices, row.runtime]);

  const dirty =
    mainModel !== row.main_model ||
    backupModel !== (row.backup_model ?? "") ||
    cacheEnabled !== row.cache_enabled ||
    cap !== (row.monthly_cap_usd == null ? "" : String(num(row.monthly_cap_usd)));

  const save = () => {
    setTested(null);
    if (issues.length) return;
    onSave({
      mainProvider: providerOf(mainModel) as string,
      mainModel,
      backupProvider: backupModel ? providerOf(backupModel) : null,
      backupModel: backupModel || null,
      cacheEnabled,
      monthlyCapUsd: cap === "" ? null : Number(cap),
    });
  };

  const cacheBlocked = row.customer_facing || row.financial;

  return (
    <section className="ai-cfg-card">
      <div className="ai-cfg-head">
        <span className="ai-cfg-title">{row.label}</span>
        <span className="ai-cfg-meta">
          runs on {row.runtime}
          {row.customer_facing && " · customer-facing"}
          {row.financial && " · financial"}
          {" · "}{fmtUsd(num(row.spend_mtd_usd))} this month
        </span>
      </div>

      <div className="ai-cfg-grid">
        <label className="ai-cfg-field">
          <span className="ai-cfg-label">Main model</span>
          <select className="ai-eval-select" value={mainModel} disabled={busy} onChange={(e) => setMainModel(e.target.value)}>
            {!allowed.some((p) => p.model === mainModel) && <option value={mainModel}>{mainModel}</option>}
            {allowed.map((p) => <option key={p.model} value={p.model}>{p.model}</option>)}
          </select>
        </label>

        <label className="ai-cfg-field">
          <span className="ai-cfg-label">Backup (on cap hit)</span>
          <select className="ai-eval-select" value={backupModel} disabled={busy} onChange={(e) => setBackupModel(e.target.value)}>
            <option value="">None</option>
            {allowed.map((p) => <option key={p.model} value={p.model}>{p.model}</option>)}
          </select>
        </label>

        <label className="ai-cfg-field">
          <span className="ai-cfg-label">Monthly cap (USD)</span>
          <input
            className="ai-eval-input"
            type="number"
            min={0}
            step={1}
            placeholder="no cap"
            value={cap}
            disabled={busy}
            onChange={(e) => setCap(e.target.value)}
          />
        </label>

        <label className="ai-cfg-field ai-cfg-toggle">
          <span className="ai-cfg-label">Reuse cached answers</span>
          <span>
            <input
              type="checkbox"
              checked={cacheEnabled}
              disabled={busy || cacheBlocked}
              onChange={(e) => setCacheEnabled(e.target.checked)}
            />{" "}
            <span className="muted">{cacheBlocked ? "off — not allowed for this use case" : cacheEnabled ? "on" : "off"}</span>
          </span>
        </label>
      </div>

      {issues.length > 0 && (
        <ul className="ai-cfg-issues">
          {issues.map((i) => <li key={i}>{i}</li>)}
        </ul>
      )}
      {tested && issues.length === 0 && <div className="ai-cfg-ok">✓ {tested}</div>}

      <div className="ai-cfg-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty || issues.length > 0} onClick={save}>
          Save changes
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => setTested(issues.length === 0 ? "Looks good — safe to save." : null)}
        >
          Test before saving
        </button>
      </div>
    </section>
  );
}

function PriceRow({
  price,
  busy,
  onSave,
}: {
  price: AIModelPrice;
  busy: boolean;
  onSave: (input: number, output: number) => void;
}) {
  const [input, setInput] = useState(String(num(price.input_per_mtok)));
  const [output, setOutput] = useState(String(num(price.output_per_mtok)));
  const dirty = input !== String(num(price.input_per_mtok)) || output !== String(num(price.output_per_mtok));
  const valid = Number.isFinite(Number(input)) && Number(input) >= 0 && Number.isFinite(Number(output)) && Number(output) >= 0;

  return (
    <tr>
      <td><span className="ai-model-pill">{price.model}</span></td>
      <td>{price.provider}</td>
      <td className="num">
        <input className="ai-eval-input" type="number" min={0} step={0.5} value={input} disabled={busy} onChange={(e) => setInput(e.target.value)} />
      </td>
      <td className="num">
        <input className="ai-eval-input" type="number" min={0} step={0.5} value={output} disabled={busy} onChange={(e) => setOutput(e.target.value)} />
      </td>
      <td>
        <button type="button" className="btn-link" disabled={busy || !dirty || !valid} onClick={() => onSave(Number(input), Number(output))}>
          Save
        </button>
      </td>
    </tr>
  );
}
