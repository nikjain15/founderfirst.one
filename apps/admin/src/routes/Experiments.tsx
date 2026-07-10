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
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Penny · Learning loop</div>
      <h1 className="page-title">Experiments.</h1>
      <p className="page-sub">A/B test marketing copy, measure lift, promote winners — on-voice and guardrailed.</p>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 className="section-title">New experiment</h2>
        <form className="toolbar" style={{ marginTop: 12, alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); if (key) create.mutate({ key, name: form.name, section_type: form.section_type, policy_tier: form.policy_tier }); }}>
          <div className="field" style={{ flex: "2 1 240px", margin: 0 }}>
            <label htmlFor="exp-name">Name</label>
            <input id="exp-name" value={form.name} placeholder="e.g. Hero headline — outcome vs product" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field" style={{ flex: "1 1 140px", margin: 0 }}>
            <label htmlFor="exp-section">Section</label>
            <select id="exp-section" value={form.section_type} onChange={(e) => setForm({ ...form, section_type: e.target.value })}>
              {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 130px", margin: 0 }}>
            <label htmlFor="exp-policy">Policy</label>
            <select id="exp-policy" value={form.policy_tier} onChange={(e) => setForm({ ...form, policy_tier: e.target.value as PolicyTier })}>
              <option value="propose">propose</option>
              <option value="auto">auto (bandit)</option>
              <option value="inform">inform</option>
            </select>
          </div>
          <button className="btn" type="submit" disabled={!key || create.isPending}>{create.isPending ? "Creating…" : "Create →"}</button>
        </form>
        {key && <p className="section-sub" style={{ marginTop: 10 }}>PostHog flag key: <code>{key}</code> — create a multivariate flag with this key (variants <code>control</code>, <code>v1</code>, …) in PostHog.</p>}
        {create.error && <div className="login-status err" style={{ marginTop: 10 }}>{(create.error as Error).message}</div>}
      </div>

      {listQ.isPending && <div className="empty" style={{ marginTop: 20 }}>Loading…</div>}
      {listQ.error && <div className="empty" style={{ marginTop: 20, color: "var(--error)", borderColor: "var(--error-bg)" }}>{(listQ.error as Error).message}</div>}
      {listQ.data?.length === 0 && <div className="empty" style={{ marginTop: 20 }}>No experiments yet — create one above.</div>}

      <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
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
  const promote = useMutation({ mutationFn: (w: ArmRow) => experiments.promoteWinner(exp, w), onSuccess: refresh });
  const addArm = useMutation({
    mutationFn: (a: { variant_key: string; headline: string; is_control?: boolean }) =>
      experiments.addArm({ experiment_id: exp.id, variant_key: a.variant_key, payload: { headline: a.headline }, is_control: a.is_control }),
    onSuccess: refresh,
  });

  const arms = armsQ.data ?? [];
  const results = resQ.data ?? [];
  const resultFor = (vk: string): ExpResultRow | undefined => results.find((r) => r.variant_key === vk);
  const nextVariantKey = arms.some((a) => a.is_control) ? `v${arms.length}` : "control";
  // Winner = best-converting arm with real data (else can't promote).
  const winnerArm = arms
    .map((a) => ({ a, r: resultFor(a.variant_key) }))
    .filter((x) => x.r && x.r.exposures > 0 && x.r.conv_rate != null)
    .sort((x, y) => (y.r!.conv_rate! - x.r!.conv_rate!))[0]?.a;

  const [draftText, setDraftText] = useState("");
  const [brief, setBrief] = useState("");
  const controlText = String((arms.find((a) => a.is_control)?.payload as any)?.headline ?? "");
  const draft = useMutation({ mutationFn: () => experiments.draft("headline", controlText || "Operating software for business.", brief), onSuccess: (t) => setDraftText(t) });

  return (
    <div className="card">
      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span className="chip">{exp.status}</span>{" "}
          <strong>{exp.name}</strong>
          <p className="section-sub" style={{ marginTop: 4 }}>{exp.section_type} · {exp.primary_metric} · tier {exp.policy_tier} · <code>{exp.key}</code></p>
        </div>
        <div className="toolbar" style={{ gap: 8 }}>
          {exp.status === "draft" && <button className="btn-ghost" disabled={arms.length < 2} onClick={() => setStatus.mutate("running")}>Start</button>}
          {exp.status === "running" && <button className="btn-ghost" onClick={() => setStatus.mutate("stopped")}>Stop</button>}
          {exp.status !== "promoted" && (
            <button className="btn-ghost" disabled={!winnerArm || promote.isPending} title={winnerArm ? `Apply "${winnerArm.variant_key}" to the live site` : "Needs conversion data to pick a winner"}
              onClick={() => winnerArm && promote.mutate(winnerArm)}>
              {promote.isPending ? "Publishing…" : winnerArm ? `Promote ${winnerArm.variant_key} → live` : "Promote winner"}
            </button>
          )}
        </div>
      </div>
      {promote.error && <div className="login-status err" style={{ marginTop: 10 }}>{(promote.error as Error).message}</div>}
      {exp.status === "promoted" && exp.winning_variant_key && <div className="login-status ok" style={{ marginTop: 10 }}>Published <code>{exp.winning_variant_key}</code> to the live site.</div>}

      <div className="table-wrap" style={{ marginTop: 14 }} tabIndex={0} role="region" aria-label="Experiment variants">
        <table className="data-table">
          <thead><tr><th>Variant</th><th>Headline</th><th>Exposures</th><th>Conv.</th><th>Rate</th><th>Lift</th></tr></thead>
          <tbody>
            {arms.map((a: ArmRow) => {
              const r = resultFor(a.variant_key);
              return (
                <tr key={a.id}>
                  <td><code>{a.variant_key}</code>{a.is_control && <span className="section-sub"> (control)</span>}</td>
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
      </div>

      {exp.status === "draft" && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <div className="toolbar" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 240px", margin: 0 }}>
              <label htmlFor={`brief-${exp.id}`}>Angle for AI draft (optional)</label>
              <input id={`brief-${exp.id}`} placeholder="e.g. lead with time saved" value={brief} onChange={(e) => setBrief(e.target.value)} />
            </div>
            <button className="btn-ghost" disabled={draft.isPending} onClick={() => draft.mutate()}>{draft.isPending ? "Drafting…" : "Draft with AI (on-voice)"}</button>
          </div>
          {draft.error && <div className="login-status err" style={{ marginTop: 8 }}>{(draft.error as Error).message}</div>}
          <div className="toolbar" style={{ alignItems: "flex-end", marginTop: 8 }}>
            <div className="field" style={{ flex: "1 1 320px", margin: 0 }}>
              <label htmlFor={`arm-${exp.id}`}>{arms.length === 0 ? "Control headline (current live copy)" : "New variant headline"}</label>
              <input id={`arm-${exp.id}`} value={draftText} onChange={(e) => setDraftText(e.target.value)} />
            </div>
            <button className="btn" disabled={!draftText.trim() || addArm.isPending}
              onClick={() => { addArm.mutate({ variant_key: nextVariantKey, headline: draftText.trim(), is_control: arms.length === 0 }); setDraftText(""); }}>
              Add {nextVariantKey} →
            </button>
          </div>
          <p className="section-sub" style={{ marginTop: 8 }}>Add the control first (current live copy), then one or more variants. Run voice-check before publishing.</p>
        </div>
      )}
    </div>
  );
}
