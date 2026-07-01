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

export default function Categorize({
  orgId, canWrite, accounts, onChange,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[]; onChange: () => void;
}) {
  const q = useUncategorized(orgId);
  const refreshUncat = useUncategorizedRefresh(orgId);
  const live = accounts.filter((a) => !a.is_archived);

  if (q.isLoading) return <p className="muted">Loading Penny's queue…</p>;
  if (q.isError) return <p className="error">Couldn't load the categorization queue. Try again.</p>;

  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="ledger-empty">
        <h3>All caught up 🎉</h3>
        <p className="muted">Nothing is waiting to be categorized. New transactions land here as they import.</p>
      </div>
    );
  }

  return (
    <div className="categorize">
      <div className="panel-toolbar">
        <span className="penny-lead">
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
          Penny found <strong>{rows.length}</strong> {rows.length === 1 ? "transaction" : "transactions"} to categorize
        </span>
      </div>
      <ul className="cat-list">
        {rows.map((e, i) => (
          <CategorizeRow
            key={e.entry_id} orgId={orgId} canWrite={canWrite} accounts={live} entry={e}
            autoPropose={i < AUTO_PROPOSE_LIMIT}
            onApproved={() => { refreshUncat(); onChange(); }}
          />
        ))}
      </ul>
    </div>
  );
}

// Only auto-ask Penny for the first N rows on mount; the rest fetch on demand
// (an "Ask Penny" button), so opening the tab on a fresh multi-hundred-row import
// doesn't fire hundreds of concurrent LLM calls (#11 — thundering herd / cost).
const AUTO_PROPOSE_LIMIT = 8;

function signedAmount(e: UncategorizedEntry): number {
  // On the holding line a credit = money in (+), a debit = money out (−).
  return e.side === "C" ? e.amount_minor : -e.amount_minor;
}

function CategorizeRow({
  orgId, canWrite, accounts, entry, autoPropose, onApproved,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[];
  entry: UncategorizedEntry; autoPropose: boolean; onApproved: () => void;
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
        <span className="cat-memo">{entry.memo || "(no description)"}</span>
        <span className={`cat-amt ${amount < 0 ? "out" : "in"}`}>{formatMoney(amount, entry.currency)}</span>
      </div>

      <div className="cat-propose">
        {!wanted && canWrite && (
          <button type="button" className="ghost sm" onClick={() => setWanted(true)}>
            <span className="p-mark p-mark-sm" aria-hidden="true">P</span> Ask Penny
          </button>
        )}
        {proposal.isLoading && <span className="muted sm">Penny is thinking…</span>}
        {proposal.isError && <span className="muted sm">Couldn't reach Penny — pick an account below.</span>}
        {proposal.isSuccess && (
          p ? (
            <span className="penny-suggest">
              <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
              <span className="ps-text">
                Penny suggests <strong>{p.code ? `${p.code} · ` : ""}{p.name}</strong>
                <span className={`confidence c-${p.source === "rule" ? "rule" : confBand(p.confidence)}`}>
                  {p.source === "rule" ? "learned rule" : `${Math.round(p.confidence * 100)}% sure`}
                </span>
              </span>
              {p.rationale && <span className="ps-why muted sm">{p.rationale}</span>}
            </span>
          ) : (
            <span className="muted sm">Penny isn't sure on this one — pick the right account.</span>
          )
        )}
      </div>

      {canWrite && (
        <div className="cat-actions">
          <select value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label="Account">
            <option value="">Select account…</option>
            {targets.map((a) => (
              <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>
            ))}
          </select>
          <button className="cat-approve" disabled={busy || !chosen} onClick={approve}>
            {busy ? "Saving…" : "Approve"}
          </button>
        </div>
      )}
      {err && <p className="error sm">{err}</p>}
    </li>
  );
}

function confBand(c: number): "hi" | "mid" | "lo" {
  if (c >= 0.75) return "hi";
  if (c >= 0.45) return "mid";
  return "lo";
}
