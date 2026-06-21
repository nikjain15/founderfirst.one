/**
 * Signals — social listening + outreach.
 *
 * Tabs (plain admin nouns, like Content): Posts · Leads · Keywords · Capture.
 * Built on the existing admin patterns: .toolbar + .chip filters, .table-wrap /
 * .data-table lists, and the .drawer-overlay / .drawer detail (same as Users /
 * Audit). All data via the admin-gated sig_* RPCs. See SIGNALS_SOLUTION.md.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSigItems,
  listSigLeads,
  getSigLead,
  updateSigLeadStage,
  saveSigLeadDraft,
  markSigLeadSent,
  quickAddSigItem,
  listSigKeywords,
  upsertSigKeyword,
  addSigIcpExample,
  listSigIcpExamples,
  deleteSigIcpExample,
  listSigSources,
  upsertSigSource,
  deleteSigSource,
  listSigSourceCounts,
  SIG_STAGES,
  type SigItemRow,
  type SigLeadRow,
  type SigKeywordRow,
  type SigIcpExampleRow,
  type SigSourceRow,
} from "../lib/supabase";

// Pipeline order — mirrors the flow (where posts come from → the feed → the
// people we act on → what we look for). Lands on Leads (the daily workspace).
type Tab = "sources" | "posts" | "leads" | "keywords";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "sources",  label: "Sources" },
  { id: "posts",    label: "Posts" },
  { id: "leads",    label: "Leads" },
  { id: "keywords", label: "Keywords" },
];

export function Signals() {
  const [tab, setTab] = useState<Tab>(() => {
    const h = (typeof window !== "undefined" ? window.location.hash.slice(1) : "") as Tab;
    return TABS.some((t) => t.id === h) ? h : "leads";
  });
  function go(t: Tab) {
    setTab(t);
    if (typeof window !== "undefined") window.location.hash = t;
  }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · signals</div>
      <h1 className="page-title">Signals.</h1>
      <p className="page-sub">
        Posts voicing bookkeeping pain, scored for intent and turned into human-approved
        outreach. <strong>Sources</strong> pull posts → <strong>Posts</strong> are scored →
        high-intent ones become <strong>Leads</strong> with a draft to review.
      </p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => go(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === "sources"  && <SourcesTab />}
        {tab === "posts"    && <PostsTab />}
        {tab === "leads"    && <LeadsTab />}
        {tab === "keywords" && <KeywordsTab />}
      </div>
    </div>
  );
}

/* ---- shared bits ----------------------------------------------------------- */

const STAGE_BADGE: Record<string, string> = {
  new: "badge-draft", reviewing: "badge-draft", drafted: "badge-warn",
  sent: "badge-live", replied: "badge-live", won: "badge-live", dead: "badge-draft",
};
const STATUS_BADGE: Record<string, string> = {
  promoted: "badge-live", archived: "badge-draft", pending: "badge-warn",
  scoring: "badge-warn", scored: "badge-draft",
};

function Badge({ value, map }: { value: string; map: Record<string, string> }) {
  return <span className={`badge ${map[value] ?? "badge-draft"}`}>{value}</span>;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

/* ---- Sources --------------------------------------------------------------- */

// Platforms API Direct can pull (all share one response shape — see
// tools/signals-worker/providers/apidirect.mjs).
const AD_PLATFORMS = [
  { id: "reddit",   label: "Reddit" },
  { id: "twitter",  label: "X / Twitter" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "youtube",  label: "YouTube" },
];
const CADENCES = [
  { m: 15,   label: "15m" },
  { m: 30,   label: "30m" },
  { m: 60,   label: "1h" },
  { m: 180,  label: "3h" },
  { m: 360,  label: "6h" },
  { m: 720,  label: "12h" },
  { m: 1440, label: "24h" },
];
const platLabel = (id: string) => AD_PLATFORMS.find((p) => p.id === id)?.label ?? id;

function SourcesTab() {
  const qc = useQueryClient();
  const { data: sources = [], isPending } = useQuery({ queryKey: ["sig-sources"], queryFn: listSigSources });
  const { data: counts = {} } = useQuery({ queryKey: ["sig-source-counts"], queryFn: listSigSourceCounts });
  const [platform, setPlatform] = useState("reddit");
  const [query, setQuery] = useState("");
  const [cadence, setCadence] = useState(360);
  const [note, setNote] = useState("");

  const polled = sources.filter((s: SigSourceRow) => s.captured_via === "api_direct");

  function refresh() { qc.invalidateQueries({ queryKey: ["sig-sources"] }); }

  async function add() {
    if (!query.trim()) { setNote("Enter a search query."); return; }
    try { await upsertSigSource({ platform, query: query.trim(), captured_via: "api_direct", enabled: true, cadence_minutes: cadence }); setQuery(""); setNote(""); refresh(); }
    catch (e) { setNote((e as Error).message); }
  }
  async function toggle(s: SigSourceRow) {
    try { await upsertSigSource({ id: s.id, platform: s.platform, query: s.query, captured_via: s.captured_via, enabled: !s.enabled, cadence_minutes: s.cadence_minutes }); refresh(); }
    catch (e) { setNote((e as Error).message); }
  }
  async function remove(id: string) {
    try { await deleteSigSource(id); refresh(); }
    catch (e) { setNote((e as Error).message); }
  }
  async function changeCadence(s: SigSourceRow, m: number) {
    try { await upsertSigSource({ id: s.id, platform: s.platform, query: s.query, captured_via: s.captured_via, enabled: s.enabled, cadence_minutes: m }); refresh(); }
    catch (e) { setNote((e as Error).message); }
  }

  return (
    <div>
      <p className="page-sub">Where we pull posts from — each source is a platform + search query the worker polls on its cadence. Toggle off to pause a source; results flow into Posts and get scored.</p>

      {isPending ? <div className="empty">Loading…</div> : polled.length === 0 ? (
        <div className="empty"><p className="empty-title">No automated sources yet.</p><p>Add one below to start pulling posts.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>platform</th><th>query</th><th>every</th><th>status</th><th>found</th><th>last poll</th><th></th></tr>
            </thead>
            <tbody>
              {polled.map((s: SigSourceRow) => (
                <tr key={s.id}>
                  <td>{platLabel(s.platform)}</td>
                  <td><span className="sig-strong">{s.query}</span></td>
                  <td>
                    <select className="sig-select-inline" value={s.cadence_minutes ?? 360}
                            onChange={(e) => changeCadence(s, Number(e.target.value))} aria-label="poll frequency">
                      {CADENCES.map((c) => <option key={c.m} value={c.m}>{c.label}</option>)}
                    </select>
                  </td>
                  <td><button className={`chip ${s.enabled ? "active" : ""}`} onClick={() => toggle(s)}>{s.enabled ? "Active" : "Off"}</button></td>
                  <td>{counts[s.id] ?? 0}</td>
                  <td className="sig-sub">{fmt(s.last_polled_at)}</td>
                  <td><button className="btn-link" onClick={() => remove(s.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <select className="sig-select" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="platform">
          {AD_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <input className="sig-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search query, e.g. hate quickbooks" style={{ flex: 1, minWidth: 180 }} />
        <select className="sig-select sig-select-inline" value={cadence} onChange={(e) => setCadence(Number(e.target.value))} aria-label="cadence">
          {CADENCES.map((c) => <option key={c.m} value={c.m}>{c.label}</option>)}
        </select>
        <button className="btn" onClick={add}>Add source</button>
      </div>
      {note && <p className="sig-note sig-note-err">{note}</p>}
    </div>
  );
}

/* ---- Posts ----------------------------------------------------------------- */

const STATUS_FILTERS = ["all", "pending", "scored", "promoted", "archived"] as const;

function PostsTab() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [showAdd, setShowAdd] = useState(false);
  const { data = [], isPending, error } = useQuery({
    queryKey: ["sig-items", status],
    queryFn: () => listSigItems({ status: status === "all" ? null : status }),
  });

  return (
    <div>
      <div className="toolbar">
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={`chip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>
            {s}
          </button>
        ))}
        <span className="toolbar-spacer" />
        <button className={`chip ${showAdd ? "active" : ""}`} onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Close" : "+ Add post"}
        </button>
      </div>

      {showAdd && <div className="sig-add-panel"><CaptureTab /></div>}

      {error && <p className="sig-note sig-note-err">{(error as Error).message}</p>}
      {isPending ? (
        <div className="empty">Loading…</div>
      ) : data.length === 0 ? (
        <div className="empty"><p className="empty-title">No posts yet.</p><p>Capture one from a group, or paste a link in Capture.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>post</th><th>platform</th><th>intent</th><th>pain</th><th>status</th><th>when</th></tr>
            </thead>
            <tbody>
              {data.map((it: SigItemRow) => (
                <tr key={it.id}>
                  <td title={it.body ?? ""}>
                    <span className="sig-strong">{it.title || (it.body ?? "").slice(0, 70) || "—"}</span>
                    <span className="sig-sub">{it.author_handle || "unknown"}{it.external_url ? <> · <a href={it.external_url} target="_blank" rel="noreferrer">source ↗</a></> : null}</span>
                  </td>
                  <td>{it.platform}</td>
                  <td>{it.intent ?? "—"}</td>
                  <td>{(it.pain_tags ?? []).slice(0, 2).join(", ") || "—"}</td>
                  <td><Badge value={it.status} map={STATUS_BADGE} /></td>
                  <td className="sig-sub">{fmt(it.captured_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---- Leads (table + drawer) ------------------------------------------------ */

function LeadsTab() {
  const [stage, setStage] = useState<string>("all");
  const { data = [], isPending, error } = useQuery({
    queryKey: ["sig-leads", stage],
    queryFn: () => listSigLeads(stage === "all" ? null : stage),
  });
  const [openLead, setOpenLead] = useState<string | null>(null);

  return (
    <div>
      <div className="toolbar">
        <button className={`chip ${stage === "all" ? "active" : ""}`} onClick={() => setStage("all")}>all</button>
        {SIG_STAGES.map((s) => (
          <button key={s} className={`chip ${stage === s ? "active" : ""}`} onClick={() => setStage(s)}>{s}</button>
        ))}
      </div>

      {error && <p className="sig-note sig-note-err">{(error as Error).message}</p>}
      {isPending ? (
        <div className="empty">Loading…</div>
      ) : data.length === 0 ? (
        <div className="empty"><p className="empty-title">No leads yet.</p><p>High-intent posts get promoted here automatically.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>lead</th><th>platform</th><th>intent</th><th>stage</th><th>draft</th><th>when</th></tr>
            </thead>
            <tbody>
              {data.map((l: SigLeadRow) => (
                <tr key={l.id} className="row-clickable" onClick={() => setOpenLead(l.id)}>
                  <td>
                    <span className="sig-strong">{l.title || l.author_handle || "Lead"}</span>
                    <span className="sig-sub">{l.author_handle || "unknown"}{l.competitor ? ` · ${l.competitor}` : ""}</span>
                  </td>
                  <td>{l.platform}</td>
                  <td>{l.intent ?? "—"}</td>
                  <td><Badge value={l.stage} map={STAGE_BADGE} /></td>
                  <td>{l.has_draft ? "✓" : "—"}</td>
                  <td className="sig-sub">{fmt(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openLead && <LeadDrawer leadId={openLead} onClose={() => setOpenLead(null)} />}
    </div>
  );
}

function LeadDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["sig-lead", leadId], queryFn: () => getSigLead(leadId) });
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const lead = data?.lead;
  const item = data?.item;
  const score = data?.score;
  const draftValue = draft ?? lead?.draft ?? "";

  function refresh() {
    qc.invalidateQueries({ queryKey: ["sig-lead", leadId] });
    qc.invalidateQueries({ queryKey: ["sig-leads"] });
  }
  async function withBusy(fn: () => Promise<void>, ok: string) {
    setBusy(true); setNote("");
    try { await fn(); setNote(ok); refresh(); }
    catch (e) { setNote((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>Lead</h2>
          <button onClick={onClose} aria-label="Close">✕</button>
        </header>

        {isPending || !lead ? (
          <div className="empty">Loading…</div>
        ) : (
          <>
            <dl className="drawer-list">
              <div><dt>author</dt><dd>{item?.author_handle || "unknown"}</dd></div>
              <div><dt>platform</dt><dd>{item?.platform}</dd></div>
              <div><dt>intent</dt><dd>{score?.intent ?? "—"}</dd></div>
              <div><dt>competitor</dt><dd>{score?.competitor || "—"}</dd></div>
              <div><dt>pain</dt><dd>{(score?.pain_tags ?? []).join(", ") || "—"}</dd></div>
              {item?.external_url && <div><dt>source</dt><dd><a href={item.external_url} target="_blank" rel="noreferrer">open original ↗</a></dd></div>}
            </dl>

            <div className="sig-post">
              <span className="sig-label">original post</span>
              <p>{item?.body || item?.title || "—"}</p>
            </div>

            <label className="sig-label" htmlFor="sig-stage">stage</label>
            <select
              id="sig-stage" className="sig-select" value={lead.stage} disabled={busy}
              onChange={(e) => withBusy(() => updateSigLeadStage(leadId, e.target.value), "Stage updated")}
            >
              {SIG_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="sig-draft">outreach draft</label>
              <textarea
                id="sig-draft" value={draftValue}
                placeholder="The worker drafts this for promoted leads. Edit before sending."
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>

            <div className="sig-actions">
              <button className="btn" disabled={busy || !draftValue.trim()} onClick={() => withBusy(() => saveSigLeadDraft(leadId, draftValue), "Draft saved")}>Save draft</button>
              <button className="btn btn-ghost" disabled={!draftValue.trim()} onClick={() => { navigator.clipboard?.writeText(draftValue); setNote("Copied — reply on the platform, then mark sent."); }}>Copy</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => withBusy(() => markSigLeadSent(leadId, "on_platform"), "Marked sent")}>Mark sent</button>
            </div>
            {note && <p className="sig-note">{note}</p>}
          </>
        )}
      </aside>
    </div>
  );
}

/* ---- Keywords -------------------------------------------------------------- */

function KeywordsTab() {
  const qc = useQueryClient();
  const { data = [], isPending } = useQuery({ queryKey: ["sig-keywords"], queryFn: listSigKeywords });
  const { data: examples = [] } = useQuery({ queryKey: ["sig-icp"], queryFn: listSigIcpExamples });
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<"pain" | "competitor">("pain");
  const [icp, setIcp] = useState("");
  const [note, setNote] = useState("");

  const pain = data.filter((k: SigKeywordRow) => k.kind === "pain");
  const comp = data.filter((k: SigKeywordRow) => k.kind === "competitor");

  async function addKeyword() {
    if (!term.trim()) return;
    try { await upsertSigKeyword({ term: term.trim(), kind }); setTerm(""); setNote("Added."); qc.invalidateQueries({ queryKey: ["sig-keywords"] }); }
    catch (e) { setNote((e as Error).message); }
  }
  async function addExample() {
    if (!icp.trim()) return;
    try { await addSigIcpExample(icp.trim()); setIcp(""); setNote("ICP example added — the worker will embed it."); qc.invalidateQueries({ queryKey: ["sig-icp"] }); }
    catch (e) { setNote((e as Error).message); }
  }
  async function removeExample(id: string) {
    try { await deleteSigIcpExample(id); qc.invalidateQueries({ queryKey: ["sig-icp"] }); }
    catch (e) { setNote((e as Error).message); }
  }

  return (
    <div className="sig-grid-2">
      <section>
        <h2 className="sig-h2">Keywords</h2>
        <p className="page-sub">Pain phrases drive the prefilter; competitor names get flagged on each lead.</p>
        <div className="toolbar">
          <input className="sig-input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. behind on my books" />
          <select className="sig-select sig-select-inline" value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="pain">pain</option>
            <option value="competitor">competitor</option>
          </select>
          <button className="btn" onClick={addKeyword}>Add</button>
        </div>
        {isPending ? <div className="empty">Loading…</div> : (
          <>
            <span className="sig-label">pain phrases</span>
            <div className="sig-chips">{pain.map((k) => <span key={k.id} className="topic-tag">{k.term}</span>)}</div>
            <span className="sig-label" style={{ marginTop: 14, display: "block" }}>competitors</span>
            <div className="sig-chips">{comp.map((k) => <span key={k.id} className="topic-tag">{k.term}</span>)}</div>
          </>
        )}
      </section>

      <section>
        <h2 className="sig-h2">ICP pain examples</h2>
        <p className="page-sub">Reference posts the brain scores relevance against. Add a few real examples of your ideal customer's pain.</p>
        <div className="field">
          <textarea value={icp} onChange={(e) => setIcp(e.target.value)} placeholder="Paste an example post that captures the pain…" />
        </div>
        <button className="btn" onClick={addExample}>Add example</button>

        <span className="sig-label" style={{ marginTop: 16, display: "block" }}>
          {examples.length} example{examples.length === 1 ? "" : "s"}
        </span>
        <ul className="sig-icp-list">
          {examples.map((ex: SigIcpExampleRow) => (
            <li key={ex.id} className="sig-icp-item">
              <p>{ex.body}</p>
              <div className="sig-icp-meta">
                <span className={`badge ${ex.has_embedding ? "badge-live" : "badge-warn"}`}>
                  {ex.has_embedding ? "embedded" : "embedding…"}
                </span>
                <button className="btn-link" onClick={() => removeExample(ex.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {note && <p className="sig-note">{note}</p>}
    </div>
  );
}

/* ---- Capture (Quick-Add) --------------------------------------------------- */

function CaptureTab() {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState("reddit");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!body.trim() && !title.trim()) { setNote("Add the post text (or a title)."); return; }
    setBusy(true); setNote("");
    try {
      await quickAddSigItem({ platform, url: url.trim() || null, title: title.trim() || null, body: body.trim() || null });
      setUrl(""); setTitle(""); setBody("");
      setNote("Added — it'll be scored on the next worker run. See it under Posts.");
      qc.invalidateQueries({ queryKey: ["sig-items"] });
    } catch (e) { setNote((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="sig-form">
      <p className="page-sub">Paste a public post to push it into the pipeline — no extension needed. Use this for one-off finds.</p>
      <div className="field">
        <label htmlFor="cap-platform">platform</label>
        <input id="cap-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="reddit / hackernews / linkedin / x" />
      </div>
      <div className="field">
        <label htmlFor="cap-url">url (optional)</label>
        <input id="cap-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="field">
        <label htmlFor="cap-title">title (optional)</label>
        <input id="cap-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="cap-body">post text</label>
        <textarea id="cap-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste the post body…" />
      </div>
      <button className="btn" disabled={busy} onClick={submit}>{busy ? "Adding…" : "Add to pipeline"}</button>
      {note && <p className="sig-note">{note}</p>}
    </div>
  );
}
