/**
 * Categorize — the trust-tiered autonomy surface (card W3.2). Penny no longer
 * asks about everything (the demo model = homework at scale). Instead each
 * uncategorized transaction is TRIAGED server-side into one of three tiers, with
 * the cutoffs + the ≤5-asks/week budget read from platform_config (CENTRAL-1 —
 * never a magic number here):
 *
 *   HIGH   (learned rule / repeat vendor / high-confidence pick) → Penny posts it
 *          herself; it shows in the "Penny did this" feed with 1-tap undo. No card.
 *   MEDIUM → a batch-approve list: one "Approve all" confirms them (≤2 taps), or
 *          open one to change it.
 *   LOW    → an approval card, ONE per real unknown. Income goes to the digest,
 *          not a card; once the week's ≤5 budget is spent, the rest defer to the
 *          digest instead of interrupting.
 *
 * Every approve/auto-post reverses + reposts (append-only) and is server-gated by
 * canWrite AND the RPC. The feed lives above the queue so what Penny did is the
 * first thing the owner sees.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  approveCategory, triageEntry, useUncategorized, useUncategorizedRefresh,
  usePennyActivityRefresh, useAskBudgetRefresh,
  type CategoryProposal, type TriageResult, type UncategorizedEntry,
} from "./api";
import { formatMoney } from "./money";
import type { LedgerAccount } from "./types";
import PennyDidThis from "./PennyDidThis";
import { COPY } from "../copy";
import { CONFIG_DEFAULTS, useBehaviorConfig } from "../copy/config";

// The disposition of one entry after triage — what the UI does with it.
type Disposition =
  | { tier: "high" }                                    // auto-posted → in the feed
  | { tier: "medium"; proposal: CategoryProposal }      // batch-approvable
  | { tier: "low"; proposal: CategoryProposal | null }  // needs the owner's call
  | { tier: "digest"; proposal: CategoryProposal | null }; // deferred (income / budget)

export default function Categorize({
  orgId, canWrite, accounts, onChange,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[]; onChange: () => void;
}) {
  const q = useUncategorized(orgId);
  const refreshUncat = useUncategorizedRefresh(orgId);
  const refreshActivity = usePennyActivityRefresh(orgId);
  const refreshBudget = useAskBudgetRefresh(orgId);
  // The ≤5-asks/week budget + tier cutoffs come from config (CENTRAL-1).
  const cfg = useBehaviorConfig(orgId).data ?? CONFIG_DEFAULTS;
  const live = accounts.filter((a) => !a.is_archived);

  // Triage results keyed by entry_id. We triage the first `auto_propose_limit`
  // rows on mount (the auto-work cost guard, #11); the rest stay untriaged until
  // the owner asks — so opening a fresh multi-hundred-row import doesn't fire
  // hundreds of concurrent triage calls.
  const [results, setResults] = useState<Record<string, Disposition>>({});
  const [budgetSpent, setBudgetSpent] = useState<number | null>(null);
  const triaging = useRef<Set<string>>(new Set());

  const rows = useMemo(() => q.data ?? [], [q.data]);

  // Triage a single entry (idempotent per entry: skips if in-flight or done).
  async function triage(entryId: string) {
    if (results[entryId] || triaging.current.has(entryId)) return;
    triaging.current.add(entryId);
    try {
      const r: TriageResult = await triageEntry(orgId, entryId);
      applyResult(entryId, r);
    } catch {
      // On failure, treat as a low-confidence card so the item is never lost.
      setResults((s) => ({ ...s, [entryId]: { tier: "low", proposal: null } }));
    } finally {
      triaging.current.delete(entryId);
    }
  }

  function applyResult(entryId: string, r: TriageResult) {
    if (typeof r.spent === "number") setBudgetSpent(r.spent);
    if (r.tier === "high") {
      setResults((s) => ({ ...s, [entryId]: { tier: "high" } }));
      // The row left the uncategorized queue (it's posted) and joined the feed.
      refreshActivity(); onChange();
    } else if (r.tier === "medium" && r.proposal) {
      setResults((s) => ({ ...s, [entryId]: { tier: "medium", proposal: r.proposal! } }));
    } else if (r.tier === "digest") {
      setResults((s) => ({ ...s, [entryId]: { tier: "digest", proposal: r.proposal } }));
    } else {
      setResults((s) => ({ ...s, [entryId]: { tier: "low", proposal: r.proposal } }));
    }
    if (typeof r.spent === "number") refreshBudget();
  }

  // Kick off auto-triage for the first N rows on mount / when the queue changes.
  useEffect(() => {
    if (!canWrite) return;
    rows.slice(0, cfg.auto_propose_limit).forEach((e) => { void triage(e.entry_id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, canWrite, cfg.auto_propose_limit]);

  if (q.isLoading) return <p className="muted">{COPY.categorize.loadingQueue}</p>;
  if (q.isError) return <p className="error">{COPY.categorize.loadError}</p>;

  // Bucket the rows we HAVE triaged; anything untriaged shows an "Ask Penny" chip.
  const medium = rows.filter((e) => results[e.entry_id]?.tier === "medium");
  const low = rows.filter((e) => results[e.entry_id]?.tier === "low");
  const digest = rows.filter((e) => results[e.entry_id]?.tier === "digest");
  const untriaged = rows.filter((e) => !results[e.entry_id]);

  const spent = budgetSpent ?? 0;
  const budget = cfg.asks_per_week;

  const afterAction = () => { refreshUncat(); refreshActivity(); refreshBudget(); onChange(); };

  return (
    <div className="categorize">
      {/* What Penny already did — the high-confidence auto-posts, first. */}
      <PennyDidThis orgId={orgId} canWrite={canWrite} onChange={afterAction} />

      {/* The honest weekly interruption budget (cap from config). */}
      <p className="ask-budget muted sm">
        {spent >= budget
          ? COPY.autonomy.budgetSpent
          : spent === 0
            ? COPY.autonomy.budgetClear(budget)
            : COPY.autonomy.budgetLine(spent, budget)}
      </p>

      {rows.length === 0 && (
        <div className="ledger-empty">
          <h3>{COPY.categorize.allCaughtUpTitle}</h3>
          <p className="muted">{COPY.categorize.allCaughtUpBody}</p>
        </div>
      )}

      {/* MEDIUM — a quick batch-approve. */}
      {medium.length > 0 && (
        <BatchApprove
          orgId={orgId} entries={medium} results={results} accounts={live}
          canWrite={canWrite} onDone={afterAction}
        />
      )}

      {/* LOW — the true unknowns, one card each. */}
      {low.length > 0 && (
        <section className="ask-queue">
          <h2 className="section-h">{COPY.autonomy.askTitle}</h2>
          <p className="muted sm">{COPY.autonomy.askLead}</p>
          <ul className="cat-list">
            {low.map((e) => (
              <LowCard
                key={e.entry_id} orgId={orgId} canWrite={canWrite} accounts={live}
                entry={e} proposal={(results[e.entry_id] as { proposal: CategoryProposal | null }).proposal}
                onApproved={afterAction}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Untriaged (beyond the auto-work limit) — ask on demand. */}
      {untriaged.length > 0 && (
        <section className="cat-more">
          <p className="muted sm">{COPY.categorize.found(untriaged.length).before}
            <strong>{untriaged.length}</strong>{COPY.categorize.found(untriaged.length).after}</p>
          {canWrite && (
            <button className="ghost sm" onClick={() => untriaged.forEach((e) => void triage(e.entry_id))}>
              <span className="p-mark p-mark-sm" aria-hidden="true">P</span> {COPY.categorize.askPenny}
            </button>
          )}
        </section>
      )}

      {/* Deferred to the digest (income + over-budget) — a quiet note, not a card. */}
      {digest.length > 0 && (
        <p className="muted sm deferred-note">{COPY.autonomy.deferredNote}</p>
      )}
    </div>
  );
}

function signedAmount(e: UncategorizedEntry): number {
  return e.side === "C" ? e.amount_minor : -e.amount_minor;
}

// ── MEDIUM — batch-approve (≤2 taps) ─────────────────────────────────────────
function BatchApprove({
  orgId, entries, results, accounts, canWrite, onDone,
}: {
  orgId: string; entries: UncategorizedEntry[];
  results: Record<string, Disposition>; accounts: LedgerAccount[];
  canWrite: boolean; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function approveAll() {
    setBusy(true); setErr(null);
    try {
      // Approve each onto Penny's proposed account (reverse+repost+learn). Serial
      // so a period-lock / conflict on one surfaces cleanly without half-applying.
      for (const e of entries) {
        const d = results[e.entry_id];
        if (d?.tier !== "medium") continue;
        await approveCategory(orgId, e.entry_id, d.proposal.account_id, e.memo);
      }
      onDone();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="batch-approve">
      <div className="panel-toolbar">
        <span className="penny-lead">
          <span className="p-mark p-mark-sm" aria-hidden="true">P</span> {COPY.autonomy.batchTitle}
        </span>
        {canWrite && (
          <button className="cat-approve" disabled={busy} onClick={approveAll}>
            {busy ? COPY.autonomy.approving : COPY.autonomy.approveAll}
          </button>
        )}
      </div>
      <p className="muted sm">{COPY.autonomy.batchLead} · {COPY.autonomy.batchCount(entries.length)}</p>
      {err && <p className="error sm">{err}</p>}
      <ul className="cat-list">
        {entries.map((e) => {
          const d = results[e.entry_id];
          const p = d?.tier === "medium" ? d.proposal : null;
          const amount = signedAmount(e);
          const isOpen = open === e.entry_id;
          return (
            <li key={e.entry_id} className="cat-row batch-row">
              <div className="cat-main">
                <span className="cat-date">{e.entry_date}</span>
                <span className="cat-memo">{e.memo || COPY.categorize.noDescription}</span>
                <span className={`cat-amt ${amount < 0 ? "out" : "in"}`}>{formatMoney(amount, e.currency)}</span>
              </div>
              <div className="cat-propose">
                {p && (
                  <span className="penny-suggest">
                    <span className="ps-text">
                      {COPY.categorize.suggestsPrefix}<strong>{p.code ? `${p.code} · ` : ""}{p.name}</strong>
                    </span>
                  </span>
                )}
                {canWrite && (
                  <button className="ghost sm" onClick={() => setOpen(isOpen ? null : e.entry_id)}>
                    {isOpen ? COPY.common.cancel : COPY.categorize.approve}
                  </button>
                )}
              </div>
              {isOpen && canWrite && (
                <LowCard orgId={orgId} canWrite={canWrite} accounts={accounts}
                  entry={e} proposal={p} onApproved={onDone} inline />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── LOW — one approval card (also the "change it" editor for a medium row) ────
function LowCard({
  orgId, canWrite, accounts, entry, proposal, onApproved, inline,
}: {
  orgId: string; canWrite: boolean; accounts: LedgerAccount[];
  entry: UncategorizedEntry; proposal: CategoryProposal | null;
  onApproved: () => void; inline?: boolean;
}) {
  const [chosen, setChosen] = useState<string>(proposal?.account_id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amount = signedAmount(entry);
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
    <li className={`cat-row${inline ? " cat-row-inline" : ""}`}>
      {!inline && (
        <div className="cat-main">
          <span className="cat-date">{entry.entry_date}</span>
          <span className="cat-memo">{entry.memo || COPY.categorize.noDescription}</span>
          <span className={`cat-amt ${amount < 0 ? "out" : "in"}`}>{formatMoney(amount, entry.currency)}</span>
        </div>
      )}
      {proposal && (
        <div className="cat-propose">
          <span className="penny-suggest">
            <span className="p-mark p-mark-sm" aria-hidden="true">P</span>
            <span className="ps-text">
              {COPY.categorize.suggestsPrefix}<strong>{proposal.code ? `${proposal.code} · ` : ""}{proposal.name}</strong>
              <span className="confidence c-lo">{COPY.categorize.sureSuffix(Math.round(proposal.confidence * 100))}</span>
            </span>
            {proposal.rationale && <span className="ps-why muted sm">{proposal.rationale}</span>}
          </span>
        </div>
      )}
      {!proposal && <p className="muted sm">{COPY.categorize.notSure}</p>}
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
