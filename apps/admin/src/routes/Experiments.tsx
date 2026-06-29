import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { experiments, type ExperimentRow, type ArmRow, type ExpResultRow, type PolicyTier } from "../lib/supabase";

/**
 * Learning loop "Act" — Experiments. Create an A/B test on a section's copy,
 * add arms (hand-written or AI-drafted on the LIVE voice guide), start it, watch
 * per-arm conversion + lift, and promote the winner. PostHog decides assignment
 * (a multivariate flag keyed by the experiment key) and attributes signups.
 * Guardrail: pricing/legal/security are out of scope; tier defaults to `propose`.
 */
const SECTIONS = ["hero", "features", "showcase", "trust", "cta", "steps", "faq"];

export function Experiments() {
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ["experiments"], queryFn: experiments.list });

  const create = useMutation({
    mutationFn: (v: { key: string; name: string; section_type: string; policy_tier: PolicyTier }) => experiments.create(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["experiments"] }),
  });

  const [form, setForm] = useState({ name: "", section_type: "hero", policy_tier: "propose" as PolicyTier });
  const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const key = slug ? `exp-${form.section_type}-${slug}` : "";

  return (
    <div className="route">
      <div className="route-head">
        <p className="eyebrow">Penny · Learning loop</p>
        <h1>Experiments.</h1>
        <p className="route-sub">A/B test marketing copy, measure lift, promote winners — on-voice and guardrailed.</p>
      </div>

      <section className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 className="section-title">New experiment</h2>
        <div className="form-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
          <label style={{ flex: "2 1 220px" }}>
            <span className="field-label">Name</span>
            <input className="input" value={form.name} placeholder="e.g. Hero headline — outcome vs product" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label style={{ flex: "1 1 140px" }}>
            <span className="field-label">Section</span>
            <select className="input" value={form.section_type} onChange={(e) => setForm({ ...form, section_type: e.target.value })}>
              {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={{ flex: "1 1 130px" }}>
            <span className="field-label">Policy</span>
            <select className="input" value={form.policy_tier} onChange={(e) => setForm({ ...form, policy_tier: e.target.value as PolicyTier })}>
              <option value="propose">propose</option>
              <option value="auto">auto (bandit)</option>
              <option value="inform">inform</option>
            </select>
          </label>
          <button className="btn-primary" disabled={!key || create.isPending}
            onClick={() => create.mutate({ key, name: form.name, section_type: form.section_type, policy_tier: form.policy_tier })}>
            {create.isPending ? "Creating…" : "Create"}
          </button>
        </div>
        {key && <p className="hint" style={{ marginTop: 8 }}>PostHog flag key: <code>{key}</code> — create a multivariate flag with this key (variants <code>control</code>, <code>v1</code>, …) in PostHog.</p>}
        {create.error && <p className="error-text">{(create.error as Error).message}</p>}
      </section>

      {listQ.isPending && <div className="empty">Loading…</div>}
      {listQ.error && <div className="empty" style={{ color: "var(--error)" }}>{(listQ.error as Error).message}</div>}
      {listQ.data?.length === 0 && <div className="empty">No experiments yet — create one above.</div>}

      <div style={{ display: "grid", gap: 16 }}>
        {listQ.data?.map((e) => <ExperimentCard key={e.id} exp={e} />)}
      </div>
    </div>
  );
}

function ExperimentCard({ exp }: { exp: ExperimentRow }) {
  const qc = useQueryClient();
  const armsQ = useQuery({ queryKey: ["exp.arms", exp.id], queryFn: () => experiments.arms(exp.id) });
  const resQ = useQuery({ queryKey: ["exp.results", exp.id], queryFn: () => experiments.results(exp.id) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["exp.arms", exp.id] }); qc.invalidateQueries({ queryKey: ["experiments"] }); };

  const setStatus = useMutation({ mutationFn: (s: ExperimentRow["status"]) => experiments.setStatus(exp.id, s), onSuccess: refresh });
  const addArm = useMutation({
    mutationFn: (a: { variant_key: string; headline: string; is_control?: boolean }) =>
      experiments.addArm({ experiment_id: exp.id, variant_key: a.variant_key, payload: { headline: a.headline }, is_control: a.is_control }),
    onSuccess: refresh,
  });

  const arms = armsQ.data ?? [];
  const results = resQ.data ?? [];
  const resultFor = (vk: string): ExpResultRow | undefined => results.find((r) => r.variant_key === vk);
  const nextVariantKey = arms.some((a) => a.is_control) ? `v${arms.length}` : "control";

  const [draftText, setDraftText] = useState("");
  const [brief, setBrief] = useState("");
  const controlText = String((arms.find((a) => a.is_control)?.payload as any)?.headline ?? "");
  const draft = useMutation({ mutationFn: () => experiments.draft("headline", controlText || "Operating software for business.", brief), onSuccess: (t) => setDraftText(t) });

  return (
    <section className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span className={`chip status-${exp.status}`}>{exp.status}</span>{" "}
          <strong style={{ fontSize: "var(--fs-ui)" }}>{exp.name}</strong>
          <div className="hint">{exp.section_type} · {exp.primary_metric} · tier {exp.policy_tier} · <code>{exp.key}</code></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {exp.status === "draft" && <button className="btn-sm" disabled={arms.length < 2} onClick={() => setStatus.mutate("running")}>Start</button>}
          {exp.status === "running" && <button className="btn-sm" onClick={() => setStatus.mutate("stopped")}>Stop</button>}
          {exp.status !== "promoted" && <button className="btn-sm" onClick={() => setStatus.mutate("promoted")}>Promote winner</button>}
        </div>
      </div>

      {/* Arms + results */}
      <table className="table" style={{ marginTop: 14, width: "100%" }}>
        <thead><tr><th>Variant</th><th>Headline</th><th>Exposures</th><th>Conv.</th><th>Rate</th><th>Lift</th></tr></thead>
        <tbody>
          {arms.map((a: ArmRow) => {
            const r = resultFor(a.variant_key);
            return (
              <tr key={a.id}>
                <td><code>{a.variant_key}</code>{a.is_control && <span className="hint"> (control)</span>}</td>
                <td>{String((a.payload as any).headline ?? "")}</td>
                <td>{r?.exposures ?? "—"}</td>
                <td>{r?.conversions ?? "—"}</td>
                <td>{r?.conv_rate != null ? `${(r.conv_rate * 100).toFixed(1)}%` : "—"}</td>
                <td style={{ color: (r?.lift ?? 0) > 0 ? "var(--income)" : (r?.lift ?? 0) < 0 ? "var(--error)" : "var(--ink-3)" }}>
                  {r?.lift != null && !a.is_control ? `${r.lift > 0 ? "+" : ""}${(r.lift * 100).toFixed(0)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Add arm (draft + add) — only while editable */}
      {exp.status === "draft" && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input className="input" placeholder="Angle for AI draft (optional) — e.g. lead with time saved" value={brief} onChange={(e) => setBrief(e.target.value)} style={{ flex: "1 1 240px" }} />
            <button className="btn-sm" disabled={draft.isPending} onClick={() => draft.mutate()}>{draft.isPending ? "Drafting…" : "Draft with AI (on-voice)"}</button>
          </div>
          {draft.error && <p className="error-text">{(draft.error as Error).message}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <input className="input" placeholder={arms.length === 0 ? "Control headline (current live copy)" : "New variant headline"} value={draftText} onChange={(e) => setDraftText(e.target.value)} style={{ flex: "1 1 320px" }} />
            <button className="btn-primary" disabled={!draftText.trim() || addArm.isPending}
              onClick={() => { addArm.mutate({ variant_key: nextVariantKey, headline: draftText.trim(), is_control: arms.length === 0 }); setDraftText(""); }}>
              Add {nextVariantKey}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>Add the control first (current live copy), then one or more variants. Run voice-check before publishing.</p>
        </div>
      )}
    </section>
  );
}
