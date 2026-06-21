/**
 * Signals — social listening + outreach.
 *
 * Tabs (plain admin nouns, like Content): Posts · Leads · Keywords · Capture.
 * All data comes from the admin-gated sig_* RPCs in lib/supabase.ts. Lead detail
 * opens from the Leads board (like TicketDetail opens from Inbox). See
 * SIGNALS_SOLUTION.md.
 */
import { useMemo, useState } from "react";
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
  SIG_STAGES,
  type SigItemRow,
  type SigLeadRow,
  type SigKeywordRow,
} from "../lib/supabase";

type Tab = "posts" | "leads" | "keywords" | "capture";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "posts",    label: "Posts" },
  { id: "leads",    label: "Leads" },
  { id: "keywords", label: "Keywords" },
  { id: "capture",  label: "Capture" },
];

export function Signals() {
  const [tab, setTab] = useState<Tab>(() => {
    const h = (typeof window !== "undefined" ? window.location.hash.slice(1) : "") as Tab;
    return TABS.some((t) => t.id === h) ? h : "posts";
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
        Posts we've caught voicing bookkeeping pain, scored for intent, and turned into
        human-approved outreach. Capture from closed communities with the browser extension,
        or paste a link below.
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
        {tab === "posts"    && <PostsTab />}
        {tab === "leads"    && <LeadsTab />}
        {tab === "keywords" && <KeywordsTab />}
        {tab === "capture"  && <CaptureTab />}
      </div>
    </div>
  );
}

/* ---- Posts ----------------------------------------------------------------- */

const STATUS_FILTERS = ["all", "pending", "scored", "promoted", "archived"] as const;

function PostsTab() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const { data = [], isPending, error } = useQuery({
    queryKey: ["sig-items", status],
    queryFn: () => listSigItems({ status: status === "all" ? null : status }),
  });

  return (
    <div>
      <div className="sig-filterbar">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`chip ${status === s ? "is-on" : ""}`}
            onClick={() => setStatus(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="sig-err">{(error as Error).message}</p>}
      {isPending ? (
        <div className="empty">Loading…</div>
      ) : data.length === 0 ? (
        <div className="empty"><p className="empty-title">No posts yet.</p><p>Capture one from a group or paste a link in Capture.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Post</th><th>Platform</th><th>Intent</th><th>Pain</th><th>Status</th><th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.map((it: SigItemRow) => (
                <tr key={it.id}>
                  <td>
                    <div className="sig-cell-title">{it.title || (it.body ?? "").slice(0, 80) || "—"}</div>
                    <div className="sig-cell-sub">{it.author_handle || "unknown"}{it.external_url ? <> · <a href={it.external_url} target="_blank" rel="noreferrer">source ↗</a></> : null}</div>
                  </td>
                  <td>{it.platform}</td>
                  <td>{it.intent ?? "—"}</td>
                  <td>{(it.pain_tags ?? []).slice(0, 2).join(", ") || "—"}</td>
                  <td><StatusBadge status={it.status} /></td>
                  <td className="sig-cell-sub">{fmt(it.captured_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---- Leads (board) --------------------------------------------------------- */

function LeadsTab() {
  const { data = [], isPending, error } = useQuery({ queryKey: ["sig-leads"], queryFn: () => listSigLeads() });
  const [openLead, setOpenLead] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const m = new Map<string, SigLeadRow[]>();
    SIG_STAGES.forEach((s) => m.set(s, []));
    data.forEach((l: SigLeadRow) => m.get(l.stage)?.push(l));
    return m;
  }, [data]);

  if (error) return <p className="sig-err">{(error as Error).message}</p>;
  if (isPending) return <div className="empty">Loading…</div>;
  if (data.length === 0) return <div className="empty"><p className="empty-title">No leads yet.</p><p>High-intent posts get promoted here automatically.</p></div>;

  return (
    <div>
      <div className="sig-board">
        {SIG_STAGES.map((stage) => (
          <div className="sig-col" key={stage}>
            <div className="sig-col-head">{stage} <span className="sig-col-count">{byStage.get(stage)?.length ?? 0}</span></div>
            {(byStage.get(stage) ?? []).map((l) => (
              <button key={l.id} className="sig-card" onClick={() => setOpenLead(l.id)}>
                <div className="sig-card-title">{l.title || l.author_handle || "Lead"}</div>
                <div className="sig-card-meta">
                  {l.platform}{l.intent != null ? ` · intent ${l.intent}` : ""}
                  {l.competitor ? ` · ${l.competitor}` : ""}
                </div>
                {l.has_draft && <span className="badge badge-draft">draft</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      {openLead && <LeadDetail leadId={openLead} onClose={() => setOpenLead(null)} />}
    </div>
  );
}

function LeadDetail({ leadId, onClose }: { leadId: string; onClose: () => void }) {
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
    <div className="sig-drawer" role="dialog" aria-label="Lead detail">
      <div className="sig-drawer-head">
        <strong>Lead</strong>
        <button className="btn-link" onClick={onClose}>Close ✕</button>
      </div>

      {isPending || !lead ? (
        <div className="empty">Loading…</div>
      ) : (
        <>
          <div className="sig-meta-grid">
            <span>Author</span><span>{item?.author_handle || "unknown"}</span>
            <span>Platform</span><span>{item?.platform}</span>
            <span>Intent</span><span>{score?.intent ?? "—"} {score?.competitor ? `· ${score.competitor}` : ""}</span>
            <span>Stage</span>
            <span>
              <select
                value={lead.stage}
                disabled={busy}
                onChange={(e) => withBusy(() => updateSigLeadStage(leadId, e.target.value), "Stage updated")}
              >
                {SIG_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </span>
          </div>

          <div className="sig-post">
            <div className="sig-post-label">Original post</div>
            <p>{item?.body || item?.title || "—"}</p>
            {item?.external_url && <a href={item.external_url} target="_blank" rel="noreferrer">Open original ↗</a>}
          </div>

          <div className="field">
            <label htmlFor="sig-draft">Outreach draft</label>
            <textarea
              id="sig-draft"
              value={draftValue}
              placeholder="The worker drafts this for promoted leads. Edit before sending."
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>

          <div className="sig-actions">
            <button
              className="btn"
              disabled={busy || !draftValue.trim()}
              onClick={() => withBusy(() => saveSigLeadDraft(leadId, draftValue), "Draft saved")}
            >Save draft</button>
            <button
              className="btn btn-ghost"
              disabled={!draftValue.trim()}
              onClick={() => { navigator.clipboard?.writeText(draftValue); setNote("Copied — reply on the platform, then mark sent."); }}
            >Copy</button>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => withBusy(() => markSigLeadSent(leadId, "on_platform"), "Marked sent")}
            >Mark sent</button>
          </div>
          {note && <p className="sig-note">{note}</p>}
        </>
      )}
    </div>
  );
}

/* ---- Keywords -------------------------------------------------------------- */

function KeywordsTab() {
  const qc = useQueryClient();
  const { data = [], isPending } = useQuery({ queryKey: ["sig-keywords"], queryFn: listSigKeywords });
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
    try { await addSigIcpExample(icp.trim()); setIcp(""); setNote("ICP example added — the worker will embed it."); }
    catch (e) { setNote((e as Error).message); }
  }

  return (
    <div className="sig-cols-2">
      <div>
        <h2 className="sig-h2">Keywords</h2>
        <div className="sig-inline-form">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. behind on my books" />
          <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="pain">pain</option>
            <option value="competitor">competitor</option>
          </select>
          <button className="btn" onClick={addKeyword}>Add</button>
        </div>
        {isPending ? <div className="empty">Loading…</div> : (
          <>
            <div className="sig-kw-group"><span className="sig-kw-label">Pain phrases</span>
              <div className="sig-chips">{pain.map((k) => <span key={k.id} className="chip">{k.term}</span>)}</div>
            </div>
            <div className="sig-kw-group"><span className="sig-kw-label">Competitors</span>
              <div className="sig-chips">{comp.map((k) => <span key={k.id} className="chip">{k.term}</span>)}</div>
            </div>
          </>
        )}
      </div>

      <div>
        <h2 className="sig-h2">ICP pain examples</h2>
        <p className="page-sub">Reference posts the brain scores relevance against. Add a few real examples of your ideal customer's pain.</p>
        <div className="field">
          <textarea value={icp} onChange={(e) => setIcp(e.target.value)} placeholder="Paste an example post that captures the pain…" />
        </div>
        <button className="btn" onClick={addExample}>Add example</button>
      </div>

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
    <div className="sig-capture">
      <p className="page-sub">Paste a public post to push it into the pipeline — no extension needed. Use this for one-off finds.</p>
      <div className="field">
        <label htmlFor="cap-platform">Platform</label>
        <input id="cap-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="reddit / hackernews / linkedin / x" />
      </div>
      <div className="field">
        <label htmlFor="cap-url">URL (optional)</label>
        <input id="cap-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="field">
        <label htmlFor="cap-title">Title (optional)</label>
        <input id="cap-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="cap-body">Post text</label>
        <textarea id="cap-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste the post body…" />
      </div>
      <button className="btn" disabled={busy} onClick={submit}>{busy ? "Adding…" : "Add to pipeline"}</button>
      {note && <p className="sig-note">{note}</p>}
    </div>
  );
}

/* ---- bits ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: SigItemRow["status"] }) {
  const cls = status === "promoted" ? "badge-live" : status === "archived" ? "badge-draft" : "badge-warn";
  return <span className={`badge ${cls}`}>{status}</span>;
}

function fmt(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}
