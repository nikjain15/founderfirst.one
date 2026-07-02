/**
 * Categorize — Penny's lovable core. Every transaction sitting on the
 * "Uncategorized" holding account is shown with Penny's grounded proposal (a
 * learned rule when one fits, otherwise the inference layer constrained to this
 * org's own accounts). One tap Approves: the entry is reversed + reposted onto
 * the chosen account and the fix is learned, so the same call isn't needed twice
 * (ARCHITECTURE.md §6, §11). Edit-to-a-different-account before approving when
 * Penny's pick isn't right. Every action is gated by canWrite here AND server-side.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  approveCategory, proposeCategory, useUncategorized, useUncategorizedRefresh,
  type UncategorizedEntry,
} from "./api";
import { formatMoney } from "./money";
import type { LedgerAccount } from "./types";
import { COPY } from "../copy";
import { CONFIG_DEFAULTS, confBand, useBehaviorConfig, type BehaviorConfig } from "../copy/config";

export default function Categorize({
  orgId, canWrite, accounts, onChange,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[]; onChange: () => void;
}) {
  const q = useUncategorized(orgId);
  const refreshUncat = useUncategorizedRefresh(orgId);
  // Behavior thresholds (auto-propose limit, confidence bands) come from config —
  // not magic numbers (card CENTRAL-1). Falls back to CONFIG_DEFAULTS while loading.
  const cfg = useBehaviorConfig(orgId).data ?? CONFIG_DEFAULTS;
  const live = accounts.filter((a) => !a.is_archived);

  if (q.isLoading) return <p className="muted">{COPY.categorize.loadingQueue}</p>;
  if (q.isError) return <p className="error">{COPY.categorize.loadError}</p>;

  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="ledger-empty">
        <h3>{COPY.categorize.allCaughtUpTitle}</h3>
        <p className="muted">{COPY.categorize.allCaughtUpBody}</p>
      </div>
    );
  }

  const found = COPY.categorize.found(rows.length);
  return (
    <div className="categorize">
      <div className="panel-toolbar">
        <span className="penny-lead">
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
          {found.before}<strong>{found.count}</strong>{found.after}
        </span>
      </div>
      <ul className="cat-list">
        {rows.map((e, i) => (
          <CategorizeRow
            key={e.entry_id} orgId={orgId} canWrite={canWrite} accounts={live} entry={e}
            autoPropose={i < cfg.auto_propose_limit} cfg={cfg}
            onApproved={() => { refreshUncat(); onChange(); }}
          />
        ))}
      </ul>
    </div>
  );
}

// Only auto-ask Penny for the first N rows on mount (config: auto_propose_limit);
// the rest fetch on demand (an "Ask Penny" button), so opening the tab on a fresh
// multi-hundred-row import doesn't fire hundreds of concurrent LLM calls (#11 —
// thundering herd / cost).

function signedAmount(e: UncategorizedEntry): number {
  // On the holding line a credit = money in (+), a debit = money out (−).
  return e.side === "C" ? e.amount_minor : -e.amount_minor;
}

function CategorizeRow({
  orgId, canWrite, accounts, entry, autoPropose, cfg, onApproved,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[];
  entry: UncategorizedEntry; autoPropose: boolean; cfg: BehaviorConfig; onApproved: () => void;
}) {
  const [chosen, setChosen] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wanted, setWanted] = useState(autoPropose);

  const proposal = useQuery({
    queryKey: ["categorize-propose", orgId, entry.entry_id],
    enabled: canWrite && wanted,
    staleTime: Infinity,
    retry: false,
    queryFn: () => proposeCategory(orgId, entry.entry_id),
  });

  // default the picker to Penny's suggestion once it arrives (don't clobber a manual pick).
  useEffect(() => {
    const id = proposal.data?.proposal?.account_id;
    if (id && !chosen) setChosen(id);
  }, [proposal.data, chosen]);

  const amount = signedAmount(entry);
  const p = proposal.data?.proposal ?? null;
  // Never offer the holding ("Uncategorized") account this line already sits on as
  // a target — "categorizing" a txn back onto Uncategorized is a no-op reverse/
  // repost that also learns a useless rule. (Penny's proposal already excludes it;
  // this closes the manual-select path.)
  const targets = accounts.filter((a) => a.id !== entry.from_account_id);

  async function approve() {
    if (!chosen) return;
    setBusy(true); setErr(null);
    try {
      await approveCategory(orgId, entry.entry_id, chosen, entry.memo);
      onApproved();
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  }

  return (
    <li className="cat-row">
      <div className="cat-main">
        <span className="cat-date">{entry.entry_date}</span>
        <span className="cat-memo">{entry.memo || COPY.categorize.noDescription}</span>
        <span className={`cat-amt ${amount < 0 ? "out" : "in"}`}>{formatMoney(amount, entry.currency)}</span>
      </div>

      <div className="cat-propose">
        {!wanted && canWrite && (
          <button type="button" className="ghost sm" onClick={() => setWanted(true)}>
            <span className="p-mark p-mark-sm" aria-hidden="true">P</span> {COPY.categorize.askPenny}
          </button>
        )}
        {proposal.isLoading && <span className="muted sm">{COPY.categorize.thinking}</span>}
        {proposal.isError && <span className="muted sm">{COPY.categorize.reachError}</span>}
        {proposal.isSuccess && (
          p ? (
            <span className="penny-suggest">
              <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
              <span className="ps-text">
                {COPY.categorize.suggestsPrefix}<strong>{p.code ? `${p.code} · ` : ""}{p.name}</strong>
                <span className={`confidence c-${p.source === "rule" ? "rule" : confBand(p.confidence, cfg)}`}>
                  {p.source === "rule" ? COPY.categorize.learnedRule : COPY.categorize.sureSuffix(Math.round(p.confidence * 100))}
                </span>
              </span>
              {p.rationale && <span className="ps-why muted sm">{p.rationale}</span>}
            </span>
          ) : (
            <span className="muted sm">{COPY.categorize.notSure}</span>
          )
        )}
      </div>

      {canWrite && (
        <div className="cat-actions">
          <select value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label={COPY.common.accountAria}>
            <option value="">{COPY.common.selectAccount}</option>
            {targets.map((a) => (
              <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>
            ))}
          </select>
          <button className="cat-approve" disabled={busy || !chosen} onClick={approve}>
            {busy ? COPY.common.saving : COPY.categorize.approve}
          </button>
        </div>
      )}
      {err && <p className="error sm">{err}</p>}
    </li>
  );
}
