/**
 * "Penny did this" — the high-confidence activity feed (card W3.2).
 *
 * The trust-tier pipeline auto-posts what Penny is sure of (a learned rule, a
 * repeat vendor, or a high-confidence pick — cutoffs from platform_config), so
 * the owner sees it already DONE here instead of as homework. Every row has a
 * 1-tap Undo that reverses the reposted entry through the same reversal path the
 * ledger uses everywhere else — the books stay balanced and append-only.
 *
 * This component is deliberately self-contained (reads the feed + owns undo) so
 * W3.1's thread and W3.4's Home can drop it in without re-plumbing.
 */
import { useState } from "react";
import {
  undoActivity, usePennyActivity, usePennyActivityRefresh, type PennyActivity,
} from "./api";
import { COPY } from "../copy";

// created_at is an ISO timestamp; show the calendar date (local).
const asDate = (iso: string) => (iso ? iso.slice(0, 10) : "");

export default function PennyDidThis({
  orgId, canWrite, onChange,
}: {
  orgId: string; canWrite: boolean; onChange?: () => void;
}) {
  const q = usePennyActivity(orgId);
  const refresh = usePennyActivityRefresh(orgId);

  if (q.isLoading) return <p className="muted">{COPY.autonomy.feedLoading}</p>;
  if (q.isError) return <p className="error">{COPY.autonomy.feedError}</p>;
  const rows = q.data ?? [];

  return (
    <section className="penny-did">
      <div className="penny-did-head">
        <h2 className="section-h">
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span> {COPY.autonomy.feedTitle}
        </h2>
        <p className="muted sm">{COPY.autonomy.feedLead}</p>
      </div>
      {rows.length === 0 ? (
        <p className="muted">{COPY.autonomy.feedEmpty}</p>
      ) : (
        <ul className="penny-did-list">
          {rows.map((a) => (
            <ActivityRow key={a.id} orgId={orgId} canWrite={canWrite} activity={a}
              onUndone={() => { refresh(); onChange?.(); }} />
          ))}
        </ul>
      )}
    </section>
  );
}

function sourceLabel(source: PennyActivity["source"]): string {
  if (source === "rule") return COPY.autonomy.viaRule;
  if (source === "vendor_prior") return COPY.autonomy.viaVendor;
  return COPY.autonomy.viaPenny;
}

function ActivityRow({
  orgId, canWrite, activity, onUndone,
}: {
  orgId: string; canWrite: boolean; activity: PennyActivity; onUndone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const undone = Boolean(activity.undone_at);

  async function undo() {
    setBusy(true); setErr(null);
    try {
      await undoActivity(orgId, activity.id);
      onUndone();
    } catch (e) {
      setErr((e as Error).message || COPY.autonomy.undoError);
      setBusy(false);
    }
  }

  return (
    <li className={`penny-did-row${undone ? " is-undone" : ""}`}>
      <span className="pd-date">{asDate(activity.created_at)}</span>
      <span className="pd-summary">{activity.summary}</span>
      <span className="pd-source">
        {sourceLabel(activity.source)}
        {activity.source === "penny" && ` · ${COPY.autonomy.sureSuffix(Math.round(activity.confidence * 100))}`}
      </span>
      {undone ? (
        <span className="pd-undone">{COPY.autonomy.undone}</span>
      ) : canWrite ? (
        <button className="ghost sm" disabled={busy} onClick={undo}>
          {busy ? COPY.autonomy.undoing : COPY.autonomy.undo}
        </button>
      ) : <span />}
      {err && <p className="error sm pd-err">{err}</p>}
    </li>
  );
}
