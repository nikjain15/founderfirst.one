/**
 * Signals — social listening + outreach.
 *
 * The four views form a pipeline and are rendered AS one (a .sig-pipeline nav):
 * Sources → Feed → ⚙ Scoring → Leads. Sources bring posts in, the Feed scores
 * them, Scoring is the filter you tune, and the strong ones land in Leads (the
 * daily workspace we default to). Jargon in table headers (intent / pain /
 * stage / status) carries a hover hint, and columns sort on click via <SortTh>.
 * Built on the existing admin patterns: .toolbar + .chip filters, .table-wrap /
 * .data-table lists, and the .drawer-overlay / .drawer detail (same as Users /
 * Audit). All data via the admin-gated sig_* RPCs. See SIGNALS_SOLUTION.md.
 */
import { useState, useEffect, useMemo, Fragment } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listSigItems,
  listSigLeads,
  getSigLead,
  saveSigLeadCard,
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
  listSigSettings,
  setSigSetting,
  getOptimizerReport,
  SIG_STAGES,
  type SigItemRow,
  type SigLeadRow,
  type SigKeywordRow,
  type SigIcpExampleRow,
  type SigSourceRow,
} from "../lib/supabase";
import { IconCheck, IconClose, IconExternalLink, IconSettings } from "../lib/icons";

// The four views aren't peers — they're a pipeline. We render them AS the
// pipeline (Sources → Feed → ⚙ Scoring → Leads) so the nav itself teaches the
// flow: posts come in, get scored through the filter you tune, and the strong
// ones land in Leads — the daily workspace we default to.
type Tab = "sources" | "feed" | "scoring" | "leads";
type Stage = { id: Tab; label: string; role: string; gate?: boolean };
const STAGES: Stage[] = [
  { id: "sources", label: "Sources", role: "where posts come from" },
  { id: "feed",    label: "Feed",    role: "every post, scored" },
  { id: "scoring", label: "Scoring", role: "tune the filter", gate: true },
  { id: "leads",   label: "Leads",   role: "your daily workspace" },
];

export function Signals({ embedded = false }: { embedded?: boolean } = {}) {
  // When embedded under Audience, sub-tab state lives in memory (no hash) so it
  // doesn't fight the parent hub's #web / #discord / #signals hash. Either way
  // we land on Leads — the job — not the raw Feed.
  const [tab, setTab] = useState<Tab>(() => {
    if (embedded) return "leads";
    const h = (typeof window !== "undefined" ? window.location.hash.slice(1) : "") as Tab;
    return STAGES.some((t) => t.id === h) ? h : "leads";
  });
  function go(t: Tab) {
    setTab(t);
    if (!embedded && typeof window !== "undefined") window.location.hash = t;
  }

  return (
    <div>
      {!embedded && (
        <>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · signals</div>
          <h1 className="page-title">Signals.</h1>
          <p className="page-sub">Find people voicing bookkeeping pain and turn the strongest into human-approved outreach.</p>
        </>
      )}

      <nav className="sig-pipeline" role="tablist" aria-label="Signals pipeline">
        {STAGES.map((s, i) => {
          const active = tab === s.id;
          return (
            <Fragment key={s.id}>
              {i > 0 && <span className="sig-pipe-arrow" aria-hidden="true">→</span>}
              <button
                role="tab"
                aria-selected={active}
                className={`sig-pipe-node ${active ? "active" : ""} ${s.gate ? "is-gate" : ""}`}
                onClick={() => go(s.id)}
              >
                <span className="sig-pipe-label">
                  {s.gate && <IconSettings size={13} />}
                  {s.label}
                </span>
                <span className="sig-pipe-role">{s.role}</span>
              </button>
            </Fragment>
          );
        })}
      </nav>

      <p className="page-sub" style={{ margin: "0 0 16px" }}>
        Pipeline performance — reply &amp; win rates, drop-off, market themes — lives in{" "}
        <Link to="/analytics#signals">Analytics → Signals →</Link>
      </p>

      <div className="tab-panel">
        {tab === "sources"  && <SourcesTab />}
        {tab === "feed"     && <FeedTab />}
        {tab === "leads"    && <LeadsTab />}
        {tab === "scoring"  && <ScoringTab />}
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

// Plain-English hints for the domain jargon, reused by table headers and the
// lead drawer so the wording stays in one place.
const TERM_HINT: Record<string, string> = {
  intent: "How urgently this person needs help right now (0–100). Higher = stronger buying signal.",
  pain: "The bookkeeping pain themes we detected in the post.",
  status: "Where the post sits in the pipeline: pending (awaiting scoring) → promoted (cleared the intent bar, became a lead) or archived (scored below the bar).",
  stage: "Where the lead sits in your outreach: new → reviewing → drafted → sent → replied → won (or dead).",
  relevance: "How closely the post matches your Scoring examples.",
  competitor: "The accounting tool the post mentions, if any.",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

/* ---- Sorting --------------------------------------------------------------- */
// Click a column header to sort; click again to flip, a third time to clear.
// Sorting is client-side over the already-fetched rows. Empty values sort last.

type SortDir = "asc" | "desc";
interface SortState { key: string; dir: SortDir; }
type Accessors<T> = Record<string, (r: T) => string | number | null | undefined>;

function useTableSort<T>(rows: T[], accessors: Accessors<T>, initial: SortState | null = null) {
  const [sort, setSort] = useState<SortState | null>(initial);
  const sorted = useMemo(() => {
    const acc = sort && accessors[sort.key];
    if (!sort || !acc) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = acc(a), vb = acc(b);
      const ea = va === null || va === undefined || va === "";
      const eb = vb === null || vb === undefined || vb === "";
      if (ea && eb) return 0;
      if (ea) return 1;            // empties always last, regardless of direction
      if (eb) return -1;
      return (va! < vb! ? -1 : va! > vb! ? 1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  function toggle(key: string) {
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  }
  return { sorted, sort, toggle };
}

/** A sortable column header. `label` doubles as the sort key unless `sortKey` is set. */
function SortTh({ label, sortKey, sort, toggle, hint }: {
  label: string; sortKey?: string; sort: SortState | null; toggle: (k: string) => void; hint?: string;
}) {
  const key = sortKey ?? label;
  const active = sort?.key === key;
  const tip = hint ?? TERM_HINT[label];
  return (
    <th>
      <button type="button" className={`sig-sort ${active ? "is-active" : ""}`} onClick={() => toggle(key)} title={tip}>
        {label}
        <span className="sig-sort-arrow" aria-hidden="true">{active ? (sort!.dir === "asc" ? "↑" : "↓") : ""}</span>
      </button>
    </th>
  );
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
  const { sorted, sort, toggle: sortBy } = useTableSort<SigSourceRow>(polled, {
    platform:    (r) => platLabel(r.platform),
    query:       (r) => (r.query || "").toLowerCase(),
    every:       (r) => r.cadence_minutes ?? 360,
    status:      (r) => (r.enabled ? 1 : 0),
    found:       (r) => counts[r.id] ?? 0,
    "last poll": (r) => r.last_polled_at,
  });

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
      <h2 className="sig-h2">Automated</h2>
      <p className="page-sub">We poll each search on its schedule and pull matching posts in. Change how often with “every”, or toggle a source off to pause it.</p>

      {isPending ? <div className="empty">Loading…</div> : polled.length === 0 ? (
        <div className="empty"><p className="empty-title">No automated sources yet.</p><p>Add one below to start pulling posts.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh label="platform" sort={sort} toggle={sortBy} />
                <SortTh label="query" sort={sort} toggle={sortBy} />
                <SortTh label="every" sort={sort} toggle={sortBy} hint="How often we poll this source." />
                <SortTh label="status" sort={sort} toggle={sortBy} hint="Whether this source is actively polling." />
                <SortTh label="found" sort={sort} toggle={sortBy} hint="Posts captured from this source." />
                <SortTh label="last poll" sort={sort} toggle={sortBy} hint="When we last checked this source." />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s: SigSourceRow) => (
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
        <input className="sig-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search query, e.g. hate quickbooks" aria-label="search query" style={{ flex: 1, minWidth: 180 }} />
        <select className="sig-select sig-select-inline" value={cadence} onChange={(e) => setCadence(Number(e.target.value))} aria-label="cadence">
          {CADENCES.map((c) => <option key={c.m} value={c.m}>{c.label}</option>)}
        </select>
        <button className="btn" onClick={add}>Add source</button>
      </div>
      {note && <p className="sig-note sig-note-err">{note}</p>}

      <h2 className="sig-h2" style={{ marginTop: 28 }}>Manual</h2>
      <p className="page-sub">Add a post yourself — paste a link or text for a one-off, or use the Facebook extension for closed groups the poller can’t reach. It enters the same pipeline.</p>
      <CaptureTab />
    </div>
  );
}

/* ---- Feed ------------------------------------------------------------------ */

// "scored" is omitted on purpose: the worker never rests a post there — it goes
// pending → promoted or archived. A "scored" chip would always be empty.
const STATUS_FILTERS = ["all", "pending", "promoted", "archived"] as const;

function FeedTab() {
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [platform, setPlatform] = useState("all");
  const [geo, setGeo] = useState("all");
  const [role, setRole] = useState("all");
  const [fresh, setFresh] = useState("all"); // all | 7 | 30 (days)
  const { data = [], isPending, error } = useQuery({
    queryKey: ["sig-items", status],
    queryFn: () => listSigItems({ status: status === "all" ? null : status }),
  });

  const platforms = useMemo(
    () => Array.from(new Set(data.map((d: SigItemRow) => d.platform).filter(Boolean))).sort(),
    [data],
  );
  const hasGeo = useMemo(() => data.some((d: SigItemRow) => d.geo), [data]);
  const filtered = useMemo(() => {
    const days = fresh === "all" ? null : Number(fresh);
    const cutoff = days ? Date.now() - days * 86400000 : null;
    return data.filter((d: SigItemRow) =>
      (platform === "all" || d.platform === platform) &&
      (geo === "all" || d.geo === geo) &&
      (role === "all" || d.role === role) &&
      (!cutoff || (d.posted_at && new Date(d.posted_at).getTime() >= cutoff)),
    );
  }, [data, platform, geo, role, fresh]);
  const { sorted, sort, toggle } = useTableSort<SigItemRow>(filtered, {
    post:     (r) => (r.title || r.body || "").toLowerCase(),
    platform: (r) => r.platform,
    intent:   (r) => r.intent ?? null,
    pain:     (r) => (r.pain_tags ?? []).join(", "),
    status:   (r) => r.status,
    when:     (r) => r.captured_at,
  });

  return (
    <div>
      <p className="page-sub">Every post we’ve brought in, scored for intent. High scorers become Leads automatically.</p>
      <div className="toolbar">
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={`chip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>
            {s}
          </button>
        ))}
        <select className="sig-select" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Filter by platform">
          <option value="all">all platforms</option>
          {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {hasGeo && (
          <>
            <select className="sig-select" value={geo} onChange={(e) => setGeo(e.target.value)} aria-label="Filter by geography">
              <option value="all">any geo</option>
              <option value="us">US</option>
              <option value="non_us">non-US</option>
              <option value="unknown">unknown</option>
            </select>
            <select className="sig-select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
              <option value="all">any role</option>
              <option value="needs_help">needs help</option>
              <option value="offering_services">sells services</option>
              <option value="hiring">hiring</option>
              <option value="other">other</option>
            </select>
          </>
        )}
        <select className="sig-select" value={fresh} onChange={(e) => setFresh(e.target.value)} aria-label="Filter by post age">
          <option value="all">any age</option>
          <option value="7">posted ≤ 7 days</option>
          <option value="30">posted ≤ 30 days</option>
        </select>
      </div>

      {error && <p className="sig-note sig-note-err">{(error as Error).message}</p>}
      {isPending ? (
        <div className="empty">Loading…</div>
      ) : data.length === 0 ? (
        <div className="empty"><p className="empty-title">No posts yet.</p><p>Add a source or paste a post under Sources.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh label="post" sort={sort} toggle={toggle} />
                <SortTh label="platform" sort={sort} toggle={toggle} />
                <SortTh label="intent" sort={sort} toggle={toggle} />
                <SortTh label="pain" sort={sort} toggle={toggle} />
                <SortTh label="status" sort={sort} toggle={toggle} />
                <SortTh label="when" sortKey="when" sort={sort} toggle={toggle} hint="When the post was captured." />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="sig-sub">No posts match this filter.</td></tr>
              ) : sorted.map((it: SigItemRow) => (
                <tr key={it.id}>
                  <td title={it.body ?? ""}>
                    <span className="sig-strong">{it.title || (it.body ?? "").slice(0, 70) || "—"}</span>
                    <span className="sig-sub">{it.author_handle || "unknown"}{it.external_url ? <> · <a href={it.external_url} target="_blank" rel="noreferrer">source <IconExternalLink size={12} /></a></> : null}</span>
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

// Friendly "fit" summary — every lead should be US + needs-help; flag any that
// slipped through (e.g. an industry peer scored offering_services).
function leadFit(role?: string, geo?: string): string {
  const ok = role === "needs_help" && geo === "us";
  const geoLabel = geo === "us" ? "US" : geo === "non_us" ? "non-US" : "geo?";
  const roleLabel = role === "needs_help" ? "needs help" : role === "offering_services" ? "sells services" : role === "hiring" ? "hiring" : "other";
  return `${ok ? "✓" : "⚠"} ${geoLabel} · ${roleLabel}`;
}

// Post age — outreach on a stale thread is wasted; flag anything over 30 days.
function leadAge(postedAt?: string | null): string {
  if (!postedAt) return "unknown";
  const days = Math.floor((Date.now() - new Date(postedAt).getTime()) / 86400000);
  if (days < 0) return "just now";
  if (days === 0) return "today";
  const base = days === 1 ? "1 day ago" : `${days} days ago`;
  return days >= 30 ? `${base} ⚠ stale` : base;
}

// Pre-fill contact fields from the post so the user confirms instead of typing
// (same spirit as the auto-drafted outreach). Pure extraction — no LLM; only
// fills a field when nothing's been saved yet, and the user can always edit.
const PUBLIC_EMAIL_HOST = /^(gmail|outlook|hotmail|yahoo|ymail|proton|protonmail|icloud|aol|live|me|msn)\./i;
function deriveContact(item: any): { name: string; email: string; company: string; details: string } {
  const text = `${item?.title ?? ""}\n${item?.body ?? ""}`;
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? "";
  const domain = email.split("@")[1] ?? "";
  const company = domain && !PUBLIC_EMAIL_HOST.test(domain) ? domain.split(".")[0] : "";
  const links = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  const social = links.find((u) => /linkedin\.com|calendly\.com|twitter\.com|x\.com|github\.com/i.test(u)) ?? "";
  const phone = text.match(/\+?\d[\d\s().-]{8,}\d/)?.[0]?.trim() ?? "";
  return {
    name: item?.author_handle ?? "",
    email,
    company,
    details: item?.author_url || social || phone || "",
  };
}

function LeadsTab() {
  const [stage, setStage] = useState<string>("all");
  const [platform, setPlatform] = useState("all");
  const { data = [], isPending, error } = useQuery({
    queryKey: ["sig-leads", stage],
    queryFn: () => listSigLeads(stage === "all" ? null : stage),
  });
  const [openLead, setOpenLead] = useState<string | null>(null);

  const platforms = useMemo(
    () => Array.from(new Set(data.map((d: SigLeadRow) => d.platform).filter(Boolean))).sort(),
    [data],
  );
  const filtered = useMemo(
    () => (platform === "all" ? data : data.filter((d: SigLeadRow) => d.platform === platform)),
    [data, platform],
  );
  const { sorted, sort, toggle } = useTableSort<SigLeadRow>(filtered, {
    lead:     (r) => (r.title || r.author_handle || "").toLowerCase(),
    platform: (r) => r.platform,
    intent:   (r) => r.intent ?? null,
    stage:    (r) => r.stage,
    draft:    (r) => (r.has_draft ? 1 : 0),
    when:     (r) => r.created_at,
  });

  return (
    <div>
      <p className="page-sub">High-intent posts land here with a draft ready to review. Open one to edit and send.</p>
      <div className="toolbar">
        <button className={`chip ${stage === "all" ? "active" : ""}`} onClick={() => setStage("all")}>all</button>
        {SIG_STAGES.map((s) => (
          <button key={s} className={`chip ${stage === s ? "active" : ""}`} onClick={() => setStage(s)}>{s}</button>
        ))}
        <select className="sig-select" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Filter by platform">
          <option value="all">all platforms</option>
          {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
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
              <tr>
                <SortTh label="lead" sort={sort} toggle={toggle} />
                <SortTh label="platform" sort={sort} toggle={toggle} />
                <SortTh label="intent" sort={sort} toggle={toggle} />
                <SortTh label="stage" sort={sort} toggle={toggle} />
                <SortTh label="draft" sort={sort} toggle={toggle} hint="Whether an outreach draft is ready." />
                <SortTh label="when" sort={sort} toggle={toggle} hint="When the lead was created." />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="sig-sub">No leads match this filter.</td></tr>
              ) : sorted.map((l: SigLeadRow) => (
                <tr key={l.id} className="row-clickable" onClick={() => setOpenLead(l.id)}>
                  <td>
                    <span className="sig-strong">{l.title || l.author_handle || "Lead"}</span>
                    <span className="sig-sub">{l.author_handle || "unknown"}{l.competitor ? ` · ${l.competitor}` : ""}</span>
                  </td>
                  <td>{l.platform}</td>
                  <td>{l.intent ?? "—"}</td>
                  <td><Badge value={l.stage} map={STAGE_BADGE} /></td>
                  <td>{l.has_draft ? <IconCheck size={14} /> : "—"}</td>
                  <td className="sig-sub">{fmt(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openLead && <LeadDrawer key={openLead} leadId={openLead} onClose={() => setOpenLead(null)} />}
    </div>
  );
}

function LeadDrawer({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["sig-lead", leadId], queryFn: () => getSigLead(leadId) });
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [contactCompany, setContactCompany] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [contactDetails, setContactDetails] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);

  const lead = data?.lead;
  const item = data?.item;
  const score = data?.score;
  const draftValue = draft ?? lead?.draft ?? "";
  const notesValue = notes ?? lead?.notes ?? "";
  const suggested = useMemo(() => deriveContact(item), [item]);
  const contactNameValue = contactName ?? lead?.contact_name ?? suggested.name;
  const contactCompanyValue = contactCompany ?? lead?.contact_company ?? suggested.company;
  const contactEmailValue = contactEmail ?? lead?.contact_email ?? suggested.email;
  const contactDetailsValue = contactDetails ?? lead?.contact_details ?? suggested.details;
  const stageValue = stage ?? lead?.stage ?? "new";
  const noteHistory: any[] = (data?.events ?? []).filter(
    (e: any) => e.kind === "card_saved" || e.kind === "note_saved",
  );

  function saveCard(toStage?: string) {
    const next = toStage ?? stageValue;
    return withBusy(
      () => saveSigLeadCard({
        leadId, stage: next, draft: draftValue,
        contactName: contactNameValue, contactCompany: contactCompanyValue,
        contactEmail: contactEmailValue, contactDetails: contactDetailsValue,
        notes: notesValue,
      }),
      toStage === "sent" ? "Marked sent" : "Saved",
    );
  }

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
      <aside className="drawer" role="dialog" aria-labelledby="drawer-title" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2 id="drawer-title">Lead</h2>
          <button onClick={onClose} aria-label="Close"><IconClose size={16} /></button>
        </header>

        {isPending || !lead ? (
          <div className="empty">Loading…</div>
        ) : (
          <>
            <dl className="drawer-list">
              <div><dt>author</dt><dd>{item?.author_handle || "unknown"}</dd></div>
              <div><dt>platform</dt><dd>{item?.platform}</dd></div>
              <div><dt><span className="sig-help" title={TERM_HINT.intent}>intent</span></dt><dd>{score?.intent ?? "—"}</dd></div>
              <div><dt>fit</dt><dd>{leadFit(score?.role, score?.geo)}</dd></div>
              <div><dt><span className="sig-help" title={TERM_HINT.relevance}>match</span></dt><dd>{score?.relevance != null ? `${Math.round(score.relevance * 100)}%` : "—"}</dd></div>
              <div><dt>posted</dt><dd>{leadAge(item?.posted_at)}</dd></div>
              <div><dt><span className="sig-help" title={TERM_HINT.competitor}>competitor</span></dt><dd>{score?.competitor || "—"}</dd></div>
              <div><dt><span className="sig-help" title={TERM_HINT.pain}>pain</span></dt><dd>{(score?.pain_tags ?? []).join(", ") || "—"}</dd></div>
              {item?.external_url && <div><dt>source</dt><dd><a href={item.external_url} target="_blank" rel="noreferrer">open original <IconExternalLink size={12} /></a></dd></div>}
            </dl>

            <div className="sig-post">
              <span className="sig-label">original post</span>
              <p>{item?.body || item?.title || "—"}</p>
            </div>

            <div className="sig-notes">
              <span className="sig-label">notes &amp; tracking</span>

              <div className="field">
                <label htmlFor="sig-stage">stage</label>
                <select id="sig-stage" className="sig-select" value={stageValue} onChange={(e) => setStage(e.target.value)}>
                  {SIG_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="sig-notes-grid">
                <div className="field">
                  <label htmlFor="sig-contact">contact</label>
                  <input id="sig-contact" value={contactNameValue} placeholder="name" onChange={(e) => setContactName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="sig-company">company</label>
                  <input id="sig-company" value={contactCompanyValue} placeholder="company" onChange={(e) => setContactCompany(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="sig-email">email</label>
                <input id="sig-email" type="email" value={contactEmailValue} placeholder="name@company.com" onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="sig-contact-details">other contact</label>
                <input id="sig-contact-details" value={contactDetailsValue} placeholder="phone, LinkedIn, handle…" onChange={(e) => setContactDetails(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="sig-draft">outreach draft</label>
                <textarea
                  id="sig-draft" value={draftValue}
                  placeholder="The worker drafts this for promoted leads. Edit before sending."
                  onChange={(e) => setDraft(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="sig-notes">notes</label>
                <textarea
                  id="sig-notes" value={notesValue}
                  placeholder="Who they are, how the company replied, whether it's resolved, comments from others…"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="sig-actions">
                <button className="btn" disabled={busy} onClick={() => saveCard()}>Save</button>
                <button className="btn btn-ghost" disabled={!draftValue.trim()} onClick={() => { navigator.clipboard?.writeText(draftValue); setNote("Copied — reply on the platform, then mark sent."); }}>Copy draft</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => saveCard("sent")}>Mark sent</button>
              </div>

              {noteHistory.length > 0 && (
                <details className="sig-history">
                  <summary>History ({noteHistory.length})</summary>
                  <div className="sig-history-list">
                    {noteHistory.map((e) => (
                      <div className="sig-history-item" key={e.id}>
                        <div className="sig-history-meta">
                          {(e.actor_email || "unknown").split("@")[0]} · {leadAge(e.created_at)}
                          {e.detail?.stage ? ` · ${e.detail.stage}` : ""}
                        </div>
                        {e.detail?.notes && <div className="sig-history-body">{e.detail.notes}</div>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {note && <p className="sig-note">{note}</p>}
          </>
        )}
      </aside>
    </div>
  );
}

/* ---- Keywords -------------------------------------------------------------- */

function SliderRow({ label, hint, value, suffix, onCommit }:
  { label: string; hint: string; value: number; suffix: string; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="sig-slider">
      <div className="sig-slider-head">
        <span className="sig-label">{label}</span>
        <span className="sig-slider-val">{v}{suffix}</span>
      </div>
      <input type="range" min={0} max={100} step={1} value={v} aria-label={label}
        onChange={(e) => setV(Number(e.target.value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))} />
      <span className="sig-slider-hint">{hint}</span>
    </div>
  );
}

/* Daily optimizer report — what the self-improving loop learned + proposals. */
function OptimizerPanel() {
  const qc = useQueryClient();
  const { data: report } = useQuery({ queryKey: ["sig-optimizer"], queryFn: getOptimizerReport });
  const { data: sources = [] } = useQuery({ queryKey: ["sig-sources"], queryFn: listSigSources });
  const [note, setNote] = useState("");
  if (!report) return null;

  const srcByQuery = new Map((sources as SigSourceRow[]).map((s) => [s.query, s]));
  const pending = report.proposed.filter((p) => {
    const s = srcByQuery.get(p.query);
    return s && !s.enabled; // only proposals not yet enabled/dismissed
  });

  async function approve(query: string) {
    const s = srcByQuery.get(query);
    if (!s) return;
    try {
      await upsertSigSource({ id: s.id, platform: s.platform, query: s.query, captured_via: "api_direct", enabled: true, cadence_minutes: s.cadence_minutes ?? 360 });
      setNote(`Enabled “${query}”.`); qc.invalidateQueries({ queryKey: ["sig-sources"] });
    } catch (e) { setNote((e as Error).message); }
  }
  async function dismiss(query: string) {
    const s = srcByQuery.get(query);
    if (!s) return;
    try { await deleteSigSource(s.id); setNote(`Dismissed “${query}”.`); qc.invalidateQueries({ queryKey: ["sig-sources"] }); }
    catch (e) { setNote((e as Error).message); }
  }

  return (
    <section className="sig-optimizer">
      <h2 className="sig-h2">What the daily optimizer learned</h2>
      <p className="page-sub" style={{ margin: "2px 0 0" }}>
        {report.summary} <span className="sig-label">· last run {new Date(report.ran_at).toLocaleString()}</span>
      </p>

      {report.threshold_suggestions.length > 0 && report.threshold_suggestions.map((t, i) => (
        <p key={i} className="sig-note">💡 {t}</p>
      ))}

      {report.pain_themes.length > 0 && (
        <>
          <span className="sig-label" style={{ marginTop: 14, display: "block" }}>Top pain themes (US, needs-help)</span>
          <div className="sig-chips">
            {report.pain_themes.map((t) => <span key={t.tag} className="topic-tag">{t.tag} · {t.count}</span>)}
          </div>
        </>
      )}

      {pending.length > 0 && (
        <>
          <span className="sig-label" style={{ marginTop: 16, display: "block" }}>Proposed new queries — validated, review &amp; enable</span>
          <ul className="sig-icp-list">
            {pending.map((p) => (
              <li key={p.query} className="sig-icp-item">
                <p>{p.platform} · {p.query} <span className="badge badge-live">{Math.round(p.hit_rate * 100)}% on-topic</span></p>
                <div className="sig-icp-meta">
                  <button className="btn" onClick={() => approve(p.query)}>Enable</button>
                  <button className="btn-link" onClick={() => dismiss(p.query)}>Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {note && <p className="sig-note">{note}</p>}
    </section>
  );
}

function ScoringTab() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ["sig-settings"], queryFn: listSigSettings });
  const { data = [] } = useQuery({ queryKey: ["sig-keywords"], queryFn: listSigKeywords });
  const { data: examples = [] } = useQuery({ queryKey: ["sig-icp"], queryFn: listSigIcpExamples });
  const [term, setTerm] = useState("");
  const [icp, setIcp] = useState("");
  const [note, setNote] = useState("");

  const pain = data.filter((k: SigKeywordRow) => k.kind === "pain");

  async function save(key: "intent_threshold" | "relevance_threshold" | "relevance_floor", value: number) {
    try { await setSigSetting(key, value); qc.invalidateQueries({ queryKey: ["sig-settings"] }); }
    catch (e) { setNote((e as Error).message); }
  }
  async function addKeyword() {
    if (!term.trim()) return;
    try { await upsertSigKeyword({ term: term.trim(), kind: "pain" }); setTerm(""); setNote("Added."); qc.invalidateQueries({ queryKey: ["sig-keywords"] }); }
    catch (e) { setNote((e as Error).message); }
  }
  async function addExample() {
    if (!icp.trim()) return;
    try { await addSigIcpExample(icp.trim()); setIcp(""); setNote("Relevance example added — the worker will embed it."); qc.invalidateQueries({ queryKey: ["sig-icp"] }); }
    catch (e) { setNote((e as Error).message); }
  }
  async function removeExample(id: string) {
    try { await deleteSigIcpExample(id); qc.invalidateQueries({ queryKey: ["sig-icp"] }); }
    catch (e) { setNote((e as Error).message); }
  }

  return (
    <div>
      <OptimizerPanel />
      <p className="page-sub" style={{ maxWidth: 720 }}>
        This is the filter between <strong>Feed</strong> and <strong>Leads</strong>. A post becomes a
        lead only when it both <strong>matches your examples</strong> (relevance) and shows a
        <strong> strong enough need</strong> (intent). Set it up top-to-bottom:
      </p>

      <ol className="sig-steps">
        <li className="sig-step">
          <div className="sig-step-no" aria-hidden="true">1</div>
          <div className="sig-step-body">
            <h2 className="sig-h2">Teach it what a good post looks like</h2>
            <p className="page-sub">Paste real posts from your ideal customers. The AI scores how similar each new post is to these — that’s “relevance”. More varied examples = smarter matching.</p>
            <div className="field" style={{ maxWidth: 560 }}>
              <textarea value={icp} onChange={(e) => setIcp(e.target.value)} placeholder="Paste an example post that captures the pain…" aria-label="Example post" />
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
          </div>
        </li>

        <li className="sig-step">
          <div className="sig-step-no" aria-hidden="true">2</div>
          <div className="sig-step-body">
            <h2 className="sig-h2">Set the bars that make a lead</h2>
            <p className="page-sub">Drag to make leads stricter (fewer, stronger) or looser (more, noisier). Saves instantly — applies to new posts within ~1 minute.</p>
            {cfg && (
              <>
                <SliderRow label="How urgent must their need be?" hint="Only promote people whose buying signal is at least this strong. Higher = fewer, stronger leads." suffix="/100"
                  value={cfg.intent_threshold} onCommit={(v) => save("intent_threshold", v)} />
                <SliderRow label="How closely must it match your examples?" hint="How similar a post must be to your Step 1 examples to count as on-topic. Higher = stricter, cleaner leads." suffix="%"
                  value={Math.round(cfg.relevance_threshold * 100)} onCommit={(v) => save("relevance_threshold", v / 100)} />
                <details className="sig-advanced">
                  <summary>Advanced</summary>
                  <SliderRow label="Ignore posts below" hint="Posts this far below your match level are skipped before the AI reads them, to save cost. Most people never change this." suffix="%"
                    value={Math.round(cfg.relevance_floor * 100)} onCommit={(v) => save("relevance_floor", v / 100)} />
                </details>
              </>
            )}
          </div>
        </li>

        <li className="sig-step">
          <div className="sig-step-no" aria-hidden="true">3</div>
          <div className="sig-step-body">
            <h2 className="sig-h2">Always-score certain phrases <span className="sig-step-opt">optional</span></h2>
            <p className="page-sub">If a post contains one of these exact phrases, it skips the match check and always gets scored — so you never miss wording you care about.</p>
            <div className="toolbar">
              <input className="sig-input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. behind on my books" aria-label="Always-score phrase" />
              <button className="btn" onClick={addKeyword}>Add</button>
            </div>
            <div className="sig-chips">{pain.map((k) => <span key={k.id} className="topic-tag">{k.term}</span>)}</div>
          </div>
        </li>
      </ol>

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
      setNote("Added — it'll be scored on the next worker run. See it in the Feed.");
      qc.invalidateQueries({ queryKey: ["sig-items"] });
    } catch (e) { setNote((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="sig-form">
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
