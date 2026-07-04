/**
 * W2.2 — QBO one-click migration with history. After a full pull, the owner works
 * through four steps: account mapping → post each year's history → compare the new
 * trial balance against QuickBooks' own (to the cent) → set the cutover date.
 *
 * Nothing here forks the ledger: posting goes through commitImportBatch (the
 * verified, deduped write-path), so re-posting a year is safe — already-imported
 * transactions are skipped, never doubled.
 */
import { useMemo, useState } from "react";
import {
  commitImportBatch, setMigrationCutover, useEntries,
  type ProviderMigration,
} from "../ledger/api";
import { accountBalances } from "../ledger/reports";
import { compareTrialBalances } from "./tbCompare";
import { formatMoney } from "../ledger/money";
import { COPY } from "../copy";

// Local date (en-CA → YYYY-MM-DD), not UTC.
const today = () => new Date().toLocaleDateString("en-CA");

interface YearCommit { posted: number; duplicates: number; errors: number; }

export default function MigrationFlow({
  orgId, migration, onDone,
}: {
  orgId: string; migration: ProviderMigration; onDone: () => void;
}) {
  const entries = useEntries(orgId);
  const [committed, setCommitted] = useState<Record<string, YearCommit>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cutover, setCutover] = useState(migration.cutover_date ?? today());
  const [done, setDone] = useState(migration.status === "committed");

  // The ledger trial balance vs QBO's own snapshot, matched by account name.
  const comparison = useMemo(() => {
    const balances = accountBalances(entries.data ?? []);
    return compareTrialBalances(migration.provider_tb ?? [], balances);
  }, [entries.data, migration.provider_tb]);

  const batchIds = migration.batch_ids ?? [];

  async function postBatch(batchId: string) {
    setBusy(batchId); setErr(null);
    try {
      const r = await commitImportBatch(orgId, batchId) as unknown as {
        posted?: number; duplicates?: number; errors?: number;
      };
      setCommitted((c) => ({
        ...c,
        [batchId]: { posted: r.posted ?? 0, duplicates: r.duplicates ?? 0, errors: r.errors ?? 0 },
      }));
      await entries.refetch();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function confirmCutover() {
    setBusy("cutover"); setErr(null);
    try {
      await setMigrationCutover(orgId, migration.id, cutover);
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="migration-flow">
        <div className="import-done">
          <h3>{COPY.migration.doneTitle}</h3>
          <p className="muted">{COPY.migration.doneBody(cutover)}</p>
          <button onClick={onDone}>{COPY.importFlow.backToBooks}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="migration-flow">
      <h3 className="section-h">{COPY.migration.reviewHeading}</h3>
      <p className="muted sm">
        {COPY.migration.pulledSummary(migration.accounts, migration.txn_count, batchIds.length)}
      </p>

      {/* Step 2 — post each year (step 1, mapping, is the existing chart-of-accounts UI) */}
      <section className="migration-step">
        <h4>{COPY.migration.step2}</h4>
        <p className="muted sm">{COPY.migration.step2Body}</p>
        <ul className="migration-batches">
          {batchIds.map((id, i) => {
            const c = committed[id];
            return (
              <li key={id}>
                <span>{`${i + 1}`}</span>
                <button className="ghost sm" disabled={busy === id} onClick={() => postBatch(id)}>
                  {busy === id ? COPY.migration.posting : COPY.migration.step2}
                </button>
                {c && (
                  <span className="muted sm">
                    {COPY.migration.posted(c.posted)}
                    {c.duplicates > 0 && ` · ${COPY.migration.duplicatesSkipped(c.duplicates)}`}
                    {c.errors > 0 && ` · ${COPY.migration.errorsCount(c.errors)}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Step 3 — trial-balance comparison, the trust moment */}
      <section className="migration-step">
        <h4>{COPY.migration.step3}</h4>
        <p className="muted sm">{COPY.migration.step3Body}</p>
        {migration.provider_tb && migration.provider_tb.length > 0 ? (
          <>
            {migration.provider_tb_as_of && (
              <p className="muted sm">{COPY.migration.tbAsOf(migration.provider_tb_as_of)}</p>
            )}
            <p className={comparison.tiesToTheCent ? "muted sm" : "error sm"}>
              {comparison.tiesToTheCent
                ? COPY.migration.tbTies
                : COPY.migration.tbVariance(formatMoney(comparison.totalVariance))}
            </p>
            {/* PENNY-UX-5 — scrollable region must be keyboard-reachable (axe: scrollable-region-focusable) */}
            <div className="table-wrap" tabIndex={0} role="region" aria-label={COPY.migration.tbTableAria}>
              <table className="migration-tb">
                <thead>
                  <tr>
                    <th>{COPY.migration.tbColAccount}</th>
                    <th className="num">{COPY.migration.tbColProvider}</th>
                    <th className="num">{COPY.migration.tbColLedger}</th>
                    <th className="num">{COPY.migration.tbColDiff}</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((r) => (
                    <tr key={r.name} className={r.diff !== 0 ? "tb-variance" : ""}>
                      <td>
                        {r.name}
                        {r.presence === "provider_only" && <span className="tb-tag">{COPY.migration.tbProviderOnly}</span>}
                        {r.presence === "ledger_only" && <span className="tb-tag">{COPY.migration.tbLedgerOnly}</span>}
                      </td>
                      <td className="num">{formatMoney(r.providerNet)}</td>
                      <td className="num">{formatMoney(r.ledgerNet)}</td>
                      <td className="num">{r.diff === 0 ? COPY.common.emDash : formatMoney(r.diff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="ghost sm" onClick={() => entries.refetch()}>{COPY.migration.tbRefresh}</button>
          </>
        ) : (
          <p className="muted sm">{COPY.migration.tbNoSnapshot}</p>
        )}
      </section>

      {/* Step 4 — cutover date */}
      <section className="migration-step">
        <h4>{COPY.migration.step4}</h4>
        <p className="muted sm">{COPY.migration.step4Body}</p>
        <div className="ledger-form">
          <div className="form-row">
            <label><span>{COPY.migration.cutoverLabel}</span>
              <input type="date" value={cutover} onChange={(e) => setCutover(e.target.value)} />
            </label>
          </div>
          <p className="muted sm">{COPY.migration.cutoverHelp}</p>
        </div>
      </section>

      {err && <p className="error sm">{err}</p>}
      <div className="form-actions">
        <button disabled={busy === "cutover" || !cutover} onClick={confirmCutover}>
          {busy === "cutover" ? COPY.migration.savingCutover : COPY.migration.confirmCutover}
        </button>
      </div>
    </div>
  );
}
