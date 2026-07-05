/**
 * Firm-level month-end close (card RV2-C1) — the practice-OS view nested INSIDE
 * the CPA Practice home (no new top-level nav; a mode toggle on the existing
 * firm landing). The CPA batch-selects clients, sees each one's close readiness,
 * runs the close across many at once, and chases missing docs — a clean client
 * is zero-touch.
 *
 * Everything server-authoritative: readiness + the batch close come from RPCs
 * gated by cpa_firm_clients (no cross-firm bleed), the close itself is refused
 * per-client for read_only engagements and for clients with unresolved blockers.
 * The UI only renders what the server returns; it never decides who may close.
 */
import { useMemo, useState } from "react";
import {
  useCloseReadiness, useDocTemplates, batchClose, requestDocs, useCloseRefresh,
  type CloseReadiness, type BatchCloseResult,
} from "./monthEndCloseApi";
import type { QueueItem } from "./practiceQueue";
import { COPY } from "../copy";

const C = COPY.monthEnd;
const BLOCKER_KEYS = ["uncategorized", "unreconciled", "pending_review", "open_flags"] as const;

export default function MonthEndClose({
  firm, open,
}: {
  firm: { id: string; name: string };
  open: (clientOrgId: string, surface: QueueItem["surface"]) => void;
}) {
  const readiness = useCloseReadiness(firm.id);
  const templates = useDocTemplates();
  const refresh = useCloseRefresh(firm.id);

  const rows = readiness.data ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<BatchCloseResult[] | null>(null);
  const [chaseFor, setChaseFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only FULL-access clients WITH a closable period can be selected — the server
  // refuses the rest anyway, but disabling here keeps the affordance honest.
  const selectable = useMemo(
    () => rows.filter((r) => r.access === "full" && r.period_id),
    [rows],
  );
  const readyIds = useMemo(
    () => selectable.filter((r) => r.ready).map((r) => r.client_org_id),
    [selectable],
  );

  const toggle = (id: string) => {
    setSummary(null);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runClose = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true); setError(null); setSummary(null);
    try {
      const res = await batchClose({ firm_id: firm.id, client_org_ids: [...selected] });
      setSummary(res.results);
      setSelected(new Set());
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loading = readiness.isLoading;

  return (
    <div className="me-close">
      {readiness.isError && <p className="error" role="alert">{C.loadError}</p>}
      {loading && !readiness.isError && <p className="muted">{C.loading}</p>}

      {!loading && !readiness.isError && rows.length === 0 && (
        <div className="ledger-empty">
          <h3>{C.emptyTitle}</h3>
          <p className="muted">{C.emptyBody}</p>
        </div>
      )}

      {!loading && !readiness.isError && rows.length > 0 && (
        <>
          <p className="muted me-intro">{C.intro}</p>

          {summary && <ResultBanner results={summary} />}
          {error && <p className="error" role="alert">{error}</p>}

          {/* ── batch action bar ─────────────────────────────────────────── */}
          <div className="me-bar">
            <button
              type="button" className="ghost sm"
              disabled={readyIds.length === 0}
              onClick={() => { setSummary(null); setSelected(new Set(readyIds)); }}
            >
              {C.selectAllReady}
            </button>
            {selected.size > 0 && (
              <button type="button" className="ghost sm" onClick={() => setSelected(new Set())}>
                {C.clearSelection}
              </button>
            )}
            <span className="me-sel-count">{C.selectedCount(selected.size)}</span>
            <button
              type="button" className="primary sm me-close-btn"
              disabled={selected.size === 0 || busy}
              onClick={runClose}
            >
              {busy ? C.closing : C.closeSelected(selected.size)}
            </button>
          </div>

          {/* ── the per-client checklist ─────────────────────────────────── */}
          <ul className="me-list" aria-label={C.listAria}>
            {rows.map((r) => (
              <ClientRow
                key={r.client_org_id}
                row={r}
                checked={selected.has(r.client_org_id)}
                onToggle={toggle}
                onOpen={open}
                onChase={() => setChaseFor(r.client_org_id)}
              />
            ))}
          </ul>
        </>
      )}

      {chaseFor && (
        <ChaseDialog
          firmId={firm.id}
          client={rows.find((r) => r.client_org_id === chaseFor)!}
          templates={templates.data ?? []}
          onClose={() => setChaseFor(null)}
          onSent={() => { setChaseFor(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ClientRow({
  row, checked, onToggle, onOpen, onChase,
}: {
  row: CloseReadiness;
  checked: boolean;
  onToggle: (id: string) => void;
  onOpen: (clientOrgId: string, surface: QueueItem["surface"]) => void;
  onChase: () => void;
}) {
  const selectable = row.access === "full" && Boolean(row.period_id);
  const blockers = BLOCKER_KEYS
    .map((k) => ({ k, n: row[k] as number }))
    .filter((b) => b.n > 0);

  return (
    <li className={`me-row${row.ready ? " is-ready" : ""}`}>
      <label className="me-check">
        <input
          type="checkbox"
          checked={checked}
          disabled={!selectable}
          aria-label={C.rowSelectAria(row.client_name)}
          onChange={() => onToggle(row.client_org_id)}
        />
      </label>
      <div className="me-main">
        <div className="me-name-line">
          <span className="me-name">{row.client_name}</span>
          {row.ready
            ? <span className="me-chip ready">{C.readyChip}</span>
            : <span className="me-chip exception">{C.exceptionChip}</span>}
          {row.overdue && <span className="me-chip overdue">{C.overdueChip}</span>}
          {row.access !== "full" && <span className="me-chip ro">{COPY.practice.ctaReadonly}</span>}
        </div>
        <div className="me-sub">
          <span className="me-period">
            {row.period_start && row.period_end
              ? C.periodLabel(row.period_start, row.period_end)
              : C.noPeriod}
          </span>
          {blockers.map((b) => (
            <span key={b.k} className="me-blocker">{C.blockerCount(b.n, C.blocker[b.k])}</span>
          ))}
          {row.open_doc_requests > 0 && (
            <span className="me-doc">{C.docBadge(row.open_doc_requests)}</span>
          )}
        </div>
      </div>
      <div className="me-actions">
        {row.access === "full" && (
          <button type="button" className="ghost sm" onClick={onChase}>{C.chaseDocs}</button>
        )}
        <button
          type="button" className="ghost sm"
          onClick={() => onOpen(row.client_org_id, "journal")}
        >
          {C.openClient}
        </button>
      </div>
    </li>
  );
}

function ResultBanner({ results }: { results: BatchCloseResult[] }) {
  const by = (r: BatchCloseResult["result"]) => results.filter((x) => x.result === r).length;
  const closed = by("closed"), blocked = by("blocked"), forbidden = by("forbidden"), skipped = by("skipped");
  const parts: string[] = [];
  if (closed) parts.push(C.resultClosed(closed));
  if (skipped) parts.push(C.resultSkipped(skipped));
  if (blocked) parts.push(C.resultBlocked(blocked));
  if (forbidden) parts.push(C.resultForbidden(forbidden));
  return (
    <p className={`me-result${closed ? " ok" : ""}`} role="status">
      {parts.length ? parts.join(" · ") : C.resultNone}
    </p>
  );
}

function ChaseDialog({
  firmId, client, templates, onClose, onSent,
}: {
  firmId: string;
  client: CloseReadiness;
  templates: { slug: string; label: string; body: string }[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [slug, setSlug] = useState(templates[0]?.slug ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = templates.find((t) => t.slug === slug)?.body ?? "";

  const send = async () => {
    if (!slug || busy) return;
    setBusy(true); setError(null);
    try {
      await requestDocs({
        firm_id: firmId, client_org_id: client.client_org_id,
        template: slug, note: note.trim() || undefined,
      });
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="me-chase-overlay" role="dialog" aria-modal="true" aria-label={C.chaseFor(client.client_name)}>
      <div className="me-chase">
        <h3 className="section-h">{C.chaseFor(client.client_name)}</h3>
        <label className="me-field">
          <span>{C.chaseDocs}</span>
          <select value={slug} onChange={(e) => setSlug(e.target.value)}>
            {templates.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
          </select>
        </label>
        {body && <p className="me-chase-body muted">{body}</p>}
        <label className="me-field">
          <span>{C.chaseNotePlaceholder}</span>
          <textarea
            value={note} rows={2}
            placeholder={C.chaseNotePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="me-chase-actions">
          <button type="button" className="ghost sm" onClick={onClose} disabled={busy}>{C.chaseCancel}</button>
          <button type="button" className="primary sm" onClick={send} disabled={!slug || busy}>
            {busy ? C.chaseSending : C.chaseSend}
          </button>
        </div>
      </div>
    </div>
  );
}
