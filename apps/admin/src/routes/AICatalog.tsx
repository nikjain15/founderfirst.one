/**
 * AI · Catalog — the browsable model universe with recommendations (plan §8, Phase 5).
 *
 * Reads ai_model_catalog (kept fresh by the ai-catalog-sync edge fn from OpenRouter's
 * public /models — price, context, capabilities, benchmarks — plus Workers-AI task
 * tags and leaderboard signals as those enrichments land). Each model is tagged with
 * the archetypes it suits, so you can filter to "what's good for chat / reasoning /
 * cheap classification" and decide what to route per use case. Routing itself stays
 * in the Models tab (ai_model_prices); this is the discovery + recommendation surface.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAICatalog, syncAICatalog, setAIPrice, type AICatalogRow } from "../lib/supabase";
import { Takeaway } from "../lib/Takeaway";
import { IconAlert } from "../lib/icons";

const ARCHETYPES = [
  "classification",
  "extraction",
  "chat",
  "summarization",
  "reasoning",
  "writing",
  "coding",
  "safety",
] as const;

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtUsd = (n: number): string => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
const fmtCtx = (n: number | null): string => (!n ? "—" : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export function AICatalog() {
  const qc = useQueryClient();
  const [tag, setTag] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: ["aiCatalog", tag],
    queryFn: () => getAICatalog(tag ? { recommendedFor: tag } : undefined),
  });

  const syncMut = useMutation({
    mutationFn: syncAICatalog,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aiCatalog"] }),
  });

  // Register a catalog model into ai_model_prices → it becomes selectable per use
  // case in the Models tab. (The catalog `routable` flag updates on the next sync;
  // we mark it locally so the row reflects it immediately.)
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const registerMut = useMutation({
    mutationFn: (r: AICatalogRow) =>
      setAIPrice({ model: r.model, provider: r.provider, inputPerMTok: num(r.input_per_mtok), outputPerMTok: num(r.output_per_mtok) }),
    onSuccess: (_d, r) => {
      setRegistered((s) => new Set(s).add(r.model));
      qc.invalidateQueries({ queryKey: ["aiModelConfig"] });
      qc.invalidateQueries({ queryKey: ["aiModels"] });
    },
  });

  const rows = catalog.data ?? [];
  const err = catalog.error || syncMut.error || registerMut.error;
  const syncedAt = rows.find((r) => r.synced_at)?.synced_at;

  const takeaway = useMemo(() => {
    if (!rows.length) return null;
    const routable = rows.filter((r) => r.routable).length;
    return (
      <Takeaway tone="neutral">
        <strong>{rows.length}</strong> models{tag ? ` recommended for ${tag}` : ""} · {routable} routable today ·{" "}
        {syncedAt ? `synced ${new Date(syncedAt).toLocaleDateString()}` : "not synced yet"}
      </Takeaway>
    );
  }, [rows, tag, syncedAt]);

  const syncResult = syncMut.data as { openrouter?: { upserted?: number; error?: string } } | undefined;

  return (
    <div>
      <p className="page-sub" style={{ marginTop: 0 }}>
        The universe of hosted models, tagged by what they're good for. Filter, compare price &amp; context, then register the ones you want in the Models tab. The eval gates keep cheap picks honest.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "8px 0 14px" }}>
        <button type="button" className="btn btn-primary" disabled={syncMut.isPending} onClick={() => syncMut.mutate()}>
          {syncMut.isPending ? "Syncing…" : "Sync from OpenRouter"}
        </button>
        {syncResult?.openrouter && !syncResult.openrouter.error && (
          <span className="muted">Synced {syncResult.openrouter.upserted} models.</span>
        )}
      </div>

      {takeaway}

      <div className="tabs" role="tablist" aria-label="Recommended for" style={{ marginBottom: 12 }}>
        <button type="button" role="tab" aria-selected={tag === null} className={`tab ${tag === null ? "active" : ""}`} onClick={() => setTag(null)}>
          All
        </button>
        {ARCHETYPES.map((a) => (
          <button key={a} type="button" role="tab" aria-selected={tag === a} className={`tab ${tag === a ? "active" : ""}`} onClick={() => setTag(a)}>
            {a}
          </button>
        ))}
      </div>

      {err && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load or sync the catalog.</p>
          {(err as Error).message}
          <p style={{ marginTop: 10, fontSize: "var(--fs-eyebrow)" }}>
            If a function/relation is missing, the <code>ai_model_catalog</code> migration or <code>ai-catalog-sync</code> function isn't deployed yet.
          </p>
        </div>
      )}

      {catalog.isPending && <div className="empty">Loading…</div>}

      {!catalog.isPending && !err && rows.length === 0 && (
        <div className="empty">
          <p className="empty-title">Catalog is empty.</p>
          Click <strong>Sync from OpenRouter</strong> to pull the live model universe (price, context, capabilities, benchmarks) and tag each model by use case.
        </div>
      )}

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th className="num">Context</th>
                <th className="num">In $/Mtok</th>
                <th className="num">Out $/Mtok</th>
                <th>Recommended for</th>
                <th>Routable</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.model}>
                  <td>
                    <span className="ai-eval-name">{r.display_name ?? r.model}</span>
                    <div className="ai-eval-desc">{r.model}</div>
                  </td>
                  <td>{r.provider}</td>
                  <td className="num">{fmtCtx(r.context_length)}</td>
                  <td className="num">{fmtUsd(num(r.input_per_mtok))}</td>
                  <td className="num">{fmtUsd(num(r.output_per_mtok))}</td>
                  <td>
                    <span className="ai-models">
                      {(r.recommended_for ?? []).map((t) => (
                        <span key={t} className="ai-model-pill">{t}</span>
                      ))}
                      {(!r.recommended_for || r.recommended_for.length === 0) && <span className="muted">—</span>}
                    </span>
                  </td>
                  <td>
                    {r.routable || registered.has(r.model) ? (
                      <span className="badge badge-good">routable</span>
                    ) : (
                      <button type="button" className="btn-link" disabled={registerMut.isPending} onClick={() => registerMut.mutate(r)}>
                        Register
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
