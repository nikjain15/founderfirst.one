/**
 * Bank reconciliation surface (W1.1) — CPA · monthly close. Dead simple: pick a
 * bank/cash account + statement date, enter opening/closing, auto-match, resolve
 * the short unmatched list, then "Reconcile ✓". A clean month is two taps + a
 * confirm. Owner never lands here (they see a "Reconciled ✓" chip on Home); this
 * lives under CPA Books and owner Advanced.
 *
 * Every match/unmatch/lock is a server RPC (can_write_org_as gated) — a read-only
 * CPA sees the numbers but the action buttons are disabled AND refused server-side
 * (the disabled button is a courtesy, not the control). Matching math is derived
 * by the pure `reconcile.ts` engine, so screen and tests share one source.
 */
import { useMemo, useState } from "react";
import {
  lockReconciliation, matchReconciliation, openReconciliation, reopenReconciliation,
  unmatchReconciliation, useReconciliationMatches, useReconciliationRefresh,
  useReconciliationSessions, useStatementRows,
  type ReconciliationSession,
} from "./api";
import {
  autoMatch, movementsForAccount, reconciliationReport,
  type StatementLine,
} from "./reconcile";
import { formatMoney, parseMoneyToMinor } from "./money";
import type { JournalEntry, LedgerAccount } from "./types";
import { COPY } from "../copy";

const C = COPY.reconcile;

export default function Reconcile({
  orgId, canWrite, accounts, entries, onCategorize,
}: {
  orgId: string;
  canWrite: boolean;
  accounts: LedgerAccount[];
  entries: JournalEntry[];
  onCategorize: () => void;
}) {
  // Reconcilable accounts = asset accounts (bank / cash) — a statement reconciles
  // a cash-side account. Keeps the picker short and on-task.
  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.type === "asset" && !a.is_archived),
    [accounts],
  );
  const [accountId, setAccountId] = useState<string>("");
  const [statementEnd, setStatementEnd] = useState<string>("");
  const [opening, setOpening] = useState<string>("");
  const [closing, setClosing] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sessions = useReconciliationSessions(orgId, accountId || undefined);
  const statementRows = useStatementRows(orgId, accountId || undefined);
  const refresh = useReconciliationRefresh(orgId);

  // The active session for the chosen statement date (if it exists yet).
  const session: ReconciliationSession | undefined = useMemo(
    () => sessions.data?.find((s) => s.statement_end === statementEnd),
    [sessions.data, statementEnd],
  );
  const matches = useReconciliationMatches(orgId, session?.id);

  // Statement lines (from import_rows) as the matcher's StatementLine shape.
  const lines: StatementLine[] = useMemo(
    () => (statementRows.data ?? [])
      .filter((r) => r.txn_date && r.amount_minor != null && r.amount_minor !== 0)
      .map((r) => ({ id: r.id, txn_date: r.txn_date as string, description: r.description, amount_minor: r.amount_minor as number })),
    [statementRows.data],
  );

  // Ledger movements on the reconciled account (debit-positive net).
  const movements = useMemo(
    () => (accountId ? movementsForAccount(entries, accountId) : []),
    [entries, accountId],
  );

  const liveMatches = matches.data ?? [];
  const matchedRowIds = new Set(liveMatches.map((m) => m.import_row_id));
  const matchedEntryIds = new Set(liveMatches.map((m) => m.entry_id));

  // Unmatched lines are what remains after confirmed matches.
  const auto = useMemo(
    () => autoMatch({
      lines, movements,
      alreadyMatchedRowIds: matchedRowIds,
      alreadyMatchedEntryIds: matchedEntryIds,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, movements, liveMatches.length],
  );

  const report = useMemo(() => reconciliationReport({
    opening_minor: session?.opening_minor ?? (parseMoneyToMinor(opening) ?? 0),
    closing_minor: session?.closing_minor ?? (parseMoneyToMinor(closing) ?? 0),
    confirmed: liveMatches.map((m) => ({ amount_minor: m.amount_minor })),
    outstandingLines: auto.unmatchedLines,
  }), [session, opening, closing, liveMatches, auto.unmatchedLines]);

  const locked = session?.status === "locked";
  const disabled = !canWrite || locked;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr(null);
    try { await fn(); refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : C.loadError); }
    finally { setBusy(null); }
  };

  const startReconciling = () =>
    run("start", () => openReconciliation({
      org_id: orgId, account_id: accountId, statement_end: statementEnd,
      opening_minor: parseMoneyToMinor(opening) ?? 0,
      closing_minor: parseMoneyToMinor(closing) ?? 0,
    }));

  // Auto-match applies every EXACT candidate in one pass (the "one tap"); fuzzy
  // candidates are proposed inline in the unmatched list for a confirm.
  const applyAutoMatch = () => {
    if (!session) return;
    return run("auto", async () => {
      for (const c of auto.candidates.filter((x) => x.kind === "exact")) {
        await matchReconciliation({
          org_id: orgId, session_id: session.id,
          import_row_id: c.import_row_id, entry_id: c.entry_id, kind: c.kind,
        });
      }
    });
  };

  const fuzzyByRow = new Map(auto.candidates.filter((c) => c.kind === "fuzzy").map((c) => [c.import_row_id, c]));

  return (
    <div className="reconcile">
      <p className="eyebrow">{C.eyebrow}</p>
      <p className="muted">{C.lead}</p>
      {!canWrite && <p className="readonly-chip">{C.readonlyNote}</p>}
      {err && <p className="error" role="alert">{err}</p>}

      <div className="reconcile-setup">
        <label>
          {C.accountLabel}
          <select aria-label={C.accountAria} value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setStatementEnd(""); }}>
            <option value="">{COPY.common.selectAccount}</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code ? `${a.code} · ${a.name}` : a.name}</option>
            ))}
          </select>
        </label>
        {accountId && (
          <>
            <label>
              {C.statementEndLabel}
              <input type="date" aria-label={C.statementEndAria} value={statementEnd}
                onChange={(e) => setStatementEnd(e.target.value)} />
            </label>
            <label>
              {C.openingLabel}
              <input inputMode="decimal" aria-label={C.openingAria}
                value={session ? formatMoney(session.opening_minor) : opening}
                disabled={Boolean(session)} onChange={(e) => setOpening(e.target.value)} />
            </label>
            <label>
              {C.closingLabel}
              <input inputMode="decimal" aria-label={C.closingAria}
                value={session ? formatMoney(session.closing_minor) : closing}
                disabled={Boolean(session)} onChange={(e) => setClosing(e.target.value)} />
            </label>
          </>
        )}
      </div>

      {!accountId && <p className="muted">{C.selectAccountFirst}</p>}
      {accountId && statementRows.data && lines.length === 0 && (
        <p className="muted">{C.noStatementLines}</p>
      )}

      {accountId && statementEnd && !session && (
        <button className="btn primary" disabled={disabled || busy !== null || !statementEnd}
          onClick={startReconciling}>
          {busy === "start" ? COPY.common.saving : C.startReconciling}
        </button>
      )}

      {session && (
        <>
          {locked && (
            <p className="reconciled-note">{C.lockedNote}</p>
          )}

          {/* Tie-out summary */}
          <dl className="reconcile-summary" aria-label={C.eyebrow}>
            <div><dt>{C.summaryOpening}</dt><dd>{formatMoney(report.opening_minor)}</dd></div>
            <div><dt>{C.summaryCleared}</dt><dd>{formatMoney(report.cleared_minor)}</dd></div>
            <div><dt>{C.summaryOutstanding}</dt><dd>{formatMoney(report.outstanding_minor)}</dd></div>
            <div><dt>{C.summaryClosing}</dt><dd>{formatMoney(report.closing_minor)}</dd></div>
            <div className={report.ties ? "ties" : "off"}>
              <dt>{C.summaryDifference}</dt><dd>{formatMoney(report.difference_minor)}</dd>
            </div>
          </dl>
          <p className={report.ties ? "ties-msg" : "off-msg"}>
            {report.ties ? C.tiesOut : C.doesNotTie(formatMoney(Math.abs(report.difference_minor)))}
          </p>

          {/* Actions: auto-match (1 tap) + lock/reopen */}
          {!locked && (
            <div className="reconcile-actions">
              <button className="btn" disabled={disabled || busy !== null || auto.candidates.filter((c) => c.kind === "exact").length === 0}
                onClick={applyAutoMatch}>
                {busy === "auto" ? C.autoMatching : C.autoMatch}
              </button>
              <button className="btn primary" disabled={disabled || busy !== null || !report.ties}
                onClick={() => run("lock", () => lockReconciliation(orgId, session.id))}>
                {busy === "lock" ? C.locking : C.lock}
              </button>
            </div>
          )}
          {locked && (
            <div className="reconcile-actions">
              <span className="reconciled-chip">{C.reconciledChip}</span>
              {session.locked_at && <span className="muted">{C.reconciledOn(session.locked_at.slice(0, 10))}</span>}
              <button className="btn" disabled={!canWrite || busy !== null}
                onClick={() => run("reopen", () => reopenReconciliation(orgId, session.id))}>
                {busy === "reopen" ? C.reopening : C.reopen}
              </button>
            </div>
          )}

          {/* Matched list */}
          {liveMatches.length > 0 && (
            <section className="reconcile-matched">
              <h3>{C.matchedTitle} · {C.matchedCount(liveMatches.length)}</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{C.colAmount}</th><th /></tr></thead>
                  <tbody>
                    {liveMatches.map((m) => (
                      <tr key={m.id}>
                        <td>{formatMoney(m.amount_minor)} <span className="kind-badge">{m.kind === "exact" ? C.exactBadge : m.kind === "fuzzy" ? C.fuzzyBadge : C.manualBadge}</span></td>
                        <td>
                          <button className="btn small" disabled={disabled || busy !== null}
                            onClick={() => run(`unmatch-${m.id}`, () => unmatchReconciliation(orgId, m.id))}>
                            {busy === `unmatch-${m.id}` ? C.unmatching : C.unmatch}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Unmatched queue — the short list to resolve */}
          <section className="reconcile-unmatched">
            <h3>{C.unmatchedTitle}</h3>
            {auto.unmatchedLines.length === 0 ? (
              <p className="muted">{C.noUnmatched}</p>
            ) : (
              <>
                <p className="muted">{C.unmatchedLead}</p>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{C.colDate}</th><th>{C.colDescription}</th><th>{C.colAmount}</th><th /></tr></thead>
                    <tbody>
                      {auto.unmatchedLines.map((l) => {
                        const fuzzy = fuzzyByRow.get(l.id);
                        return (
                          <tr key={l.id}>
                            <td>{l.txn_date}</td>
                            <td>{l.description ?? COPY.common.emDash}</td>
                            <td>{formatMoney(l.amount_minor)}</td>
                            <td>
                              {fuzzy ? (
                                <button className="btn small" disabled={disabled || busy !== null}
                                  onClick={() => run(`match-${l.id}`, () => matchReconciliation({
                                    org_id: orgId, session_id: session.id,
                                    import_row_id: l.id, entry_id: fuzzy.entry_id, kind: "fuzzy",
                                  }))}>
                                  {busy === `match-${l.id}` ? C.matching : `${C.match} · ${C.fuzzyBadge}`}
                                </button>
                              ) : (
                                <button className="btn small" disabled={disabled || busy !== null}
                                  onClick={onCategorize}>
                                  {C.createMissing}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
