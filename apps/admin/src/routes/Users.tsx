import { useEffect, useMemo, useState } from "react";
import { listWaitlist, type WaitlistRow } from "../lib/supabase";
import { IconAlert } from "../lib/icons";
import { DiscordLinks } from "./DiscordLinks";

type Tab = "web" | "discord";
type SortKey = "signed_up_at" | "email" | "source";

export function Users() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "web";
    const hash = window.location.hash.replace(/^#/, "");
    return hash === "discord" ? "discord" : "web";
  });

  useEffect(() => {
    const next = `#${tab}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", `${window.location.pathname}${next}`);
    }
  }, [tab]);

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Users</div>
      <h1 className="page-title">Everyone connected to FounderFirst.</h1>
      <p className="page-sub">
        People who've signed up on the website, or linked their Discord. One place per channel.
      </p>

      <div className="tabs" role="tablist" style={{ marginTop: 18, marginBottom: 18 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "web"}
          className={`tab ${tab === "web" ? "active" : ""}`}
          onClick={() => setTab("web")}
        >
          Web signups
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "discord"}
          className={`tab ${tab === "discord" ? "active" : ""}`}
          onClick={() => setTab("discord")}
        >
          Discord
        </button>
      </div>

      {tab === "web" ? <WebSignups /> : <DiscordLinks embedded />}
    </div>
  );
}

function WebSignups() {
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("signed_up_at");
  const [selected, setSelected] = useState<WaitlistRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listWaitlist(search)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search]);

  const HIDDEN = new Set(["id", "slug_seed", "updated_at"]);
  const PINNED: string[] = ["email", "source", "referred_by", "slug", "signed_up_at"];
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const k of PINNED) {
      if (rows.some((r) => k in r.row_data) && !HIDDEN.has(k)) { order.push(k); seen.add(k); }
    }
    for (const r of rows) {
      for (const k of Object.keys(r.row_data)) {
        if (!seen.has(k) && !HIDDEN.has(k)) { order.push(k); seen.add(k); }
      }
    }
    return order;
  }, [rows]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = String(a.row_data[sortKey] ?? a.signed_up_at);
      const bv = String(b.row_data[sortKey] ?? b.signed_up_at);
      if (sortKey === "signed_up_at") return bv.localeCompare(av);
      return av.localeCompare(bv);
    });
    return copy;
  }, [rows, sortKey]);

  const exportCsv = () => {
    const header = columns.join(",");
    const lines = sorted.map((r) =>
      columns.map((c) => csvCell(r.row_data[c])).join(","),
    );
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="topic-select"
          style={{ minWidth: 240 }}
        />
        <select
          className="topic-select"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Sort by"
        >
          <option value="signed_up_at">Newest first</option>
          <option value="email">Email A→Z</option>
          <option value="source">Source A→Z</option>
        </select>
        <div className="toolbar-spacer" />
        <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{sorted.length} {sorted.length === 1 ? "row" : "rows"}</span>
        <button type="button" onClick={exportCsv} disabled={sorted.length === 0}>Export CSV</button>
      </div>

      {loading && <div className="empty">Loading…</div>}

      {error && (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load waitlist.</p>
          {error}
          <p style={{ marginTop: 10, fontSize: 12 }}>
            Did you run <code>SCHEMA-008-admin-waitlist.sql</code> in Supabase?
          </p>
        </div>
      )}

      {!loading && !error && sorted.length === 0 && (
        <div className="empty">
          <p className="empty-title">No signups yet.</p>
          Either the waitlist is empty or your search returned nothing.
        </div>
      )}

      {!loading && !error && sorted.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>{columns.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} onClick={() => setSelected(r)} className="row-clickable">
                  {columns.map((c) => (
                    <td key={c}>{formatCell(r.row_data[c], c)}</td>
                  ))}
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
              <h2>{String(selected.row_data.email ?? "(no email)")}</h2>
              <button onClick={() => setSelected(null)} aria-label="Close">✕</button>
            </header>
            <dl className="drawer-list">
              {Object.entries(selected.row_data).map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replace(/_/g, " ")}</dt>
                  <dd>{formatCell(v, k)}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}

function formatCell(v: unknown, key: string): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (key.endsWith("_at") && typeof v === "string") {
    try { return new Date(v).toLocaleString(); } catch { return v; }
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
