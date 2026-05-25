import { useEffect, useMemo, useState } from "react";
import { listAudit, getAuditFacets, type AuditRow } from "../lib/supabase";
import { IconAlert } from "../lib/icons";

const SINCE_OPTIONS: Array<{ label: string; hours: number | null }> = [
  { label: "Last 24h",   hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
  { label: "All time",   hours: null },
];

export function Audit() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [actors, setActors] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [actorFilter, setActorFilter]   = useState<string>("");
  const [sinceIdx, setSinceIdx]         = useState<number>(1); // 7 days default
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  useEffect(() => {
    getAuditFacets()
      .then((f) => { setActions(f.actions); setActors(f.actors); })
      .catch(() => {});
  }, [rows.length]);

  const sinceIso = useMemo(() => {
    const opt = SINCE_OPTIONS[sinceIdx];
    if (!opt || opt.hours == null) return undefined;
    return new Date(Date.now() - opt.hours * 3600 * 1000).toISOString();
  }, [sinceIdx]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAudit({
      action: actionFilter || undefined,
      actor:  actorFilter  || undefined,
      since:  sinceIso,
      limit:  500,
    })
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [actionFilter, actorFilter, sinceIso]);

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · audit</div>
      <h1 className="page-title">Every move, recorded.</h1>
      <p className="page-sub">A row per admin action. Click any row to see the full payload.</p>

      <div className="toolbar">
        <select className="topic-select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="topic-select" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} aria-label="Filter by actor">
          <option value="">All actors</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="topic-select" value={sinceIdx} onChange={(e) => setSinceIdx(Number(e.target.value))} aria-label="Time range">
          {SINCE_OPTIONS.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}
        </select>
        <div className="toolbar-spacer" />
        <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{rows.length} {rows.length === 1 ? "row" : "rows"}</span>
      </div>

      {loading && <div className="empty">Loading…</div>}

      {error && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load audit log.</p>
          {error}
          <p style={{ marginTop: 10, fontSize: 12 }}>
            Did you run <code>SCHEMA-009-admin-audit.sql</code> in Supabase?
          </p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="empty">
          <p className="empty-title">No events yet.</p>
          Once you reply to a ticket or change a topic, rows will appear here.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>when</th>
                <th>actor</th>
                <th>action</th>
                <th>target</th>
                <th>summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setSelected(r)} className="row-clickable">
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.actor_email}</td>
                  <td><code style={{ fontSize: 12 }}>{r.action}</code></td>
                  <td style={{ color: "var(--ink-3)" }}>{r.target_type ? `${r.target_type}:${shortId(r.target_id)}` : "—"}</td>
                  <td>{summarize(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="drawer-overlay" onClick={() => setSelected(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <header className="drawer-head">
              <h2>{selected.action}</h2>
              <button onClick={() => setSelected(null)} aria-label="Close">✕</button>
            </header>
            <dl className="drawer-list">
              <div><dt>when</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></div>
              <div><dt>actor</dt><dd>{selected.actor_email}</dd></div>
              <div><dt>target</dt><dd>{selected.target_type ? `${selected.target_type} · ${selected.target_id ?? "—"}` : "—"}</dd></div>
            </dl>
            <h3 style={{ margin: "20px 0 8px", fontSize: 13, color: "var(--ink-3)", textTransform: "lowercase" }}>payload</h3>
            <pre style={{ background: "var(--paper)", padding: 12, borderRadius: 8, fontSize: 12, overflow: "auto", border: "1px solid var(--line)" }}>
              {JSON.stringify(selected.payload, null, 2)}
            </pre>
          </aside>
        </div>
      )}
    </div>
  );
}

function shortId(id: string | null): string {
  if (!id) return "—";
  if (id.length > 10) return id.slice(0, 8) + "…";
  return id;
}

function summarize(r: AuditRow): string {
  const p = r.payload || {};
  if (r.action === "ticket.reply") {
    const body = String(p.body ?? "");
    const resolved = p.resolved ? " · resolved" : "";
    return body.slice(0, 80) + (body.length > 80 ? "…" : "") + resolved;
  }
  if (r.action === "ticket.topic_set") {
    return `${p.from ?? "untagged"} → ${p.to ?? "untagged"}`;
  }
  if (r.action.startsWith("auth.")) return "";
  const keys = Object.keys(p);
  return keys.length ? `${keys.length} field${keys.length === 1 ? "" : "s"}` : "";
}
