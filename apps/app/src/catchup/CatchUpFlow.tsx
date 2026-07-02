/**
 * Catch-up mode (W2.1) — the #1 Signals wedge: a years-behind owner gets organized
 * in ONE guided flow, without shame or a $10k quote.
 *
 * This is ORCHESTRATION over the existing, verified pipeline — it introduces no new
 * posting path:
 *   1. Drop files      → parse CSVs in the browser (import/csv.ts), grouped by year.
 *   2. Bring it in     → one import batch PER YEAR via the `imports` write-path
 *                        (createImportBatch → addImportRows → commitImportBatch).
 *   3. Penny sorts     → proposeCategory (rules + grounded model) for each landed
 *                        uncategorized entry.
 *   4. Confirm in one  → high-confidence picks bulk-approve in a single owner action
 *                        (batchApproveCatchUp → the trust-gated, audited RPC); only
 *                        the low-confidence handful become batched questions.
 *   5. Per-year package→ the progress meter, plus reconcile + export per year (the
 *                        reconciled + exportable package the flow ends in).
 *
 * The interruption budget is honored by design: the owner confirms the bulk set in
 * ONE tap and answers only the batched questions (capped at asks_per_week). Trust
 * tiers come from config (never a magic number); period-lock is inherited from the
 * reused recategorize write-path. All copy is COPY.catchUp (zero literals).
 */
import { useMemo, useState } from "react";
import {
  addImportRows, batchApproveCatchUp, commitImportBatch, createImportBatch,
  discardImportBatch, proposeCategory, useCatchUpPlan, useCatchUpProgress,
  useCatchUpRefresh, type BatchApproveItem, type StagedRow,
} from "../ledger/api";
import { parseAmountCell, parseCsv, parseDateCell, type DateFormat, type ParsedCsv } from "../import/csv";
import { formatMoney } from "../ledger/money";
import { CONFIG_DEFAULTS, useBehaviorConfig } from "../copy/config";
import {
  backlogYears, partitionProposals, questionsForThisWeek, yearOf, yearStatus,
  type CatchUpProposal,
} from "./catchup";
import type { LedgerAccount } from "../ledger/types";
import { COPY } from "../copy";

type Step = "entry" | "map" | "sorting" | "confirm" | "progress";

interface QueuedFile { name: string; csv: ParsedCsv; }

export default function CatchUpFlow({
  orgId, canWrite, accounts, onDone, onReconcile,
}: {
  orgId: string;
  canWrite: boolean;
  accounts: LedgerAccount[];
  onDone: () => void;
  /** Open the reconcile surface for a year (owner is routed to Advanced → Reconcile). */
  onReconcile?: () => void;
}) {
  const [step, setStep] = useState<Step>("entry");
  const cfg = useBehaviorConfig(orgId).data ?? CONFIG_DEFAULTS;
  const live = accounts.filter((a) => !a.is_archived);

  // Files + column mapping (shared across files with the same shape).
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [dateCol, setDateCol] = useState(-1);
  const [descCol, setDescCol] = useState(-1);
  const [amtCol, setAmtCol] = useState(-1);
  const [positiveIs, setPositiveIs] = useState<"in" | "out">("in");
  const [dateFmt, setDateFmt] = useState<DateFormat>("mdy");
  const [bankId, setBankId] = useState("");
  const [contraId, setContraId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // After sorting: Penny's proposals split into bulk + questions.
  const [proposals, setProposals] = useState<CatchUpProposal[]>([]);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);

  const progress = useCatchUpProgress(orgId);
  const plan = useCatchUpPlan(orgId);
  const refresh = useCatchUpRefresh(orgId);

  // Normalized rows across all files, using the shared column map.
  const rows = useMemo(() => {
    const all: { txn_date: string | null; description: string; amount: number | null; raw: Record<string, unknown>; year: number | null }[] = [];
    if (dateCol < 0 || amtCol < 0) return all;
    for (const f of files) {
      for (const r of f.csv.rows) {
        const date = parseDateCell(r[dateCol] ?? "", dateFmt);
        let amount = parseAmountCell(r[amtCol] ?? "");
        if (amount != null && positiveIs === "out") amount = -amount;
        const description = descCol >= 0 ? (r[descCol] ?? "").trim() : "";
        all.push({
          txn_date: date, description, amount,
          raw: Object.fromEntries(f.csv.headers.map((h, j) => [h, r[j] ?? ""])),
          year: yearOf(date),
        });
      }
    }
    return all;
  }, [files, dateCol, descCol, amtCol, positiveIs, dateFmt]);

  const readyRows = rows.filter((r) => r.txn_date && r.amount != null && r.amount !== 0 && r.year != null);
  const years = useMemo(() => backlogYears(readyRows.map((r) => r.txn_date)), [readyRows]);
  const canBringIn = Boolean(bankId && contraId && readyRows.length > 0 && !busy);

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    setErr(null);
    Promise.all(picked.map(async (f) => ({ name: f.name, csv: parseCsv(await f.text()) })))
      .then((qf) => {
        setFiles((prev) => [...prev, ...qf]);
        // Best-effort auto-map from the first file's headers.
        const headers = qf[0]?.csv.headers ?? [];
        const find = (re: RegExp) => headers.findIndex((h) => re.test(h.toLowerCase()));
        if (dateCol < 0) setDateCol(find(/date/));
        if (descCol < 0) setDescCol(find(/desc|payee|name|memo|detail/));
        if (amtCol < 0) setAmtCol(find(/amount|amt|debit|value/));
      })
      .catch(() => setErr(COPY.catchUp.dropReadError));
  }

  // Step 2→3: bring every year in (one batch per year), then sort with Penny.
  async function bringInAndSort() {
    setBusy(true); setErr(null); setStep("sorting");
    try {
      // Group ready rows by year → one import batch per year.
      for (const year of years) {
        const yearRows = readyRows.filter((r) => r.year === year);
        const { result: batch } = await createImportBatch({
          org_id: orgId, source: "bank_statement",
          filename: COPY.catchUp.yearInProgress(year), bank_account_id: bankId,
        });
        try {
          const staged: StagedRow[] = yearRows.map((r, i) => ({
            row_num: i + 1, raw: r.raw, txn_date: r.txn_date, description: r.description,
            amount_minor: r.amount, account_id: contraId, status: "ready",
          }));
          await addImportRows(orgId, batch.id, staged);
          await commitImportBatch(orgId, batch.id);
        } catch (e) {
          await discardImportBatch(orgId, batch.id).catch(() => {});
          throw e;
        }
      }
      // Sort: ask Penny for a grounded proposal on every landed uncategorized entry.
      // (list_uncategorized_entries is read under RLS via the categorize propose path.)
      const props = await proposeQueue(orgId);
      setProposals(props);
      setStep("confirm");
    } catch (e) {
      setErr((e as Error).message);
      setStep("map");
    } finally {
      setBusy(false);
    }
  }

  // Fallback proposer: read the uncategorized queue directly and propose each.
  async function proposeQueue(org: string): Promise<CatchUpProposal[]> {
    const { getClient } = await import("../lib/supabase");
    const sb = getClient();
    const { data } = await sb.rpc("list_uncategorized_entries", { p_org: org });
    const queue = (data ?? []) as { entry_id: string; memo: string | null }[];
    const out: CatchUpProposal[] = [];
    for (const q of queue) {
      try {
        const { proposal } = await proposeCategory(org, q.entry_id);
        out.push({
          entry_id: q.entry_id, memo: q.memo,
          to_account_id: proposal?.account_id ?? null,
          confidence: proposal?.confidence ?? 0,
          source: proposal?.source ?? "penny",
        });
      } catch {
        out.push({ entry_id: q.entry_id, memo: q.memo, to_account_id: null, confidence: 0, source: "penny" });
      }
    }
    return out;
  }

  const partition = useMemo(() => partitionProposals(proposals, cfg), [proposals, cfg]);
  const weeklyQuestions = useMemo(() => questionsForThisWeek(partition.questions, cfg), [partition.questions, cfg]);

  // Confirm the whole high-confidence set in one owner action.
  async function confirmBulk() {
    setBusy(true); setErr(null);
    try {
      const items: BatchApproveItem[] = partition.bulk.map((p) => ({
        entry_id: p.entry_id, to_account_id: p.to_account_id as string,
        confidence: p.confidence, learn_value: p.memo,
      }));
      const res = await batchApproveCatchUp(orgId, items);
      setApprovedCount(res.approved);
      refresh();
      await progress.refetch();
      setStep("progress");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canWrite) {
    return <p className="muted">{COPY.connections.importDisabled}</p>;
  }

  // ── Entry ───────────────────────────────────────────────────────────────────
  if (step === "entry") {
    return (
      <div className="catchup">
        <div className="catchup-hero">
          <h3 className="catchup-title">{COPY.catchUp.entryTitle}</h3>
          <p className="muted">{COPY.catchUp.entrySub}</p>
          {plan.data
            ? <p className="catchup-price">{COPY.catchUp.pricingFlat(formatMoney(plan.data.fee_per_year_minor, plan.data.currency))}</p>
            : <p className="muted sm">{COPY.catchUp.pricingNone}</p>}
          <button onClick={() => setStep("map")}>{COPY.catchUp.startCta}</button>
        </div>
        <CatchUpProgress orgId={orgId} onReconcile={onReconcile} onExport={onDone} />
      </div>
    );
  }

  // ── Drop files + map ──────────────────────────────────────────────────────────
  if (step === "map") {
    return (
      <div className="catchup">
        <h3 className="catchup-title">{COPY.catchUp.dropTitle}</h3>
        <p className="muted">{COPY.catchUp.dropLead}</p>
        <label className="file-drop">
          <input type="file" accept=".csv,text/csv" multiple onChange={onFiles} />
          <span>{COPY.catchUp.dropChoose}</span>
        </label>
        {files.length > 0 && (
          <ul className="catchup-files">
            {files.map((f, i) => (
              <li key={i}>
                <span>{f.name}</span>
                <button className="line-del" aria-label={COPY.catchUp.removeFileAria(f.name)}
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>×</button>
              </li>
            ))}
          </ul>
        )}

        {files.length > 0 && (
          <>
            <p className="muted sm">{COPY.catchUp.filesQueued(files.length)}</p>
            <h4 className="section-h">{COPY.catchUp.mapTitle}</h4>
            <p className="muted sm">{COPY.catchUp.mapLead}</p>
            <div className="ledger-form">
              <div className="form-row">
                <label><span>{COPY.importFlow.dateColumn}</span>
                  <ColSelect headers={files[0].csv.headers} value={dateCol} onChange={setDateCol} label={COPY.importFlow.dateColumn} />
                </label>
                <label><span>{COPY.importFlow.descriptionColumn}</span>
                  <ColSelect headers={files[0].csv.headers} value={descCol} onChange={setDescCol} allowNone label={COPY.importFlow.descriptionColumn} />
                </label>
                <label><span>{COPY.importFlow.amountColumn}</span>
                  <ColSelect headers={files[0].csv.headers} value={amtCol} onChange={setAmtCol} label={COPY.importFlow.amountColumn} />
                </label>
              </div>
              <div className="form-row">
                <label><span>{COPY.importFlow.positiveAmountsAre}</span>
                  <select value={positiveIs} onChange={(e) => setPositiveIs(e.target.value as "in" | "out")}>
                    <option value="in">{COPY.importFlow.moneyIn}</option>
                    <option value="out">{COPY.importFlow.moneyOut}</option>
                  </select>
                </label>
                <label><span>{COPY.importFlow.dateFormat}</span>
                  <select value={dateFmt} onChange={(e) => setDateFmt(e.target.value as DateFormat)}>
                    <option value="mdy">{COPY.importFlow.dateMdy}</option>
                    <option value="dmy">{COPY.importFlow.dateDmy}</option>
                  </select>
                </label>
                <label className="grow"><span>{COPY.catchUp.bankAccount}</span>
                  <AccountSelect accounts={live} value={bankId} onChange={setBankId} filterType="asset" />
                </label>
                <label className="grow"><span>{COPY.catchUp.defaultCategory}</span>
                  <AccountSelect accounts={live} value={contraId} onChange={setContraId} label={COPY.catchUp.defaultCategoryAria} />
                </label>
              </div>
            </div>
            {years.length > 0 && (
              <p className="muted sm">{COPY.catchUp.bringInLead(readyRows.length, years.length)}</p>
            )}
          </>
        )}
        {err && <p className="error sm">{err}</p>}
        <div className="form-actions">
          <button className="ghost sm" onClick={() => setStep("entry")}>{COPY.common.back}</button>
          <button disabled={!canBringIn} onClick={bringInAndSort}>
            {busy ? COPY.catchUp.bringingIn : COPY.catchUp.bringInCta}
          </button>
        </div>
      </div>
    );
  }

  // ── Sorting ───────────────────────────────────────────────────────────────────
  if (step === "sorting") {
    return (
      <div className="catchup">
        <h3 className="catchup-title">{COPY.catchUp.sortingTitle}</h3>
        <p className="muted">{COPY.catchUp.sortingLead}</p>
        <div className="catchup-spinner" role="status" aria-label={COPY.catchUp.sortingTitle} />
      </div>
    );
  }

  // ── Confirm (bulk + batched questions) ─────────────────────────────────────────
  if (step === "confirm") {
    return (
      <div className="catchup">
        <h3 className="catchup-title">{COPY.catchUp.sortedTitle(proposals.length)}</h3>

        <section className="catchup-block">
          <h4 className="section-h">{COPY.catchUp.batchTitle}</h4>
          {partition.bulk.length > 0 ? (
            <>
              <p className="muted">{COPY.catchUp.batchLead(partition.bulk.length)}</p>
              <button onClick={confirmBulk} disabled={busy}>
                {busy ? COPY.catchUp.batchApproving : COPY.catchUp.batchApproveCta(partition.bulk.length)}
              </button>
            </>
          ) : (
            <p className="muted">{COPY.catchUp.batchNoneConfident}</p>
          )}
        </section>

        <section className="catchup-block">
          <h4 className="section-h">{COPY.catchUp.questionsTitle}</h4>
          {partition.questions.length > 0 ? (
            <>
              <p className="muted">{COPY.catchUp.questionsLead(weeklyQuestions.length)}</p>
              <ul className="catchup-questions">
                {weeklyQuestions.map((q) => (
                  <li key={q.entry_id}>
                    <span className="cq-memo">{q.memo ?? COPY.common.emDash}</span>
                  </li>
                ))}
              </ul>
              <button className="ghost sm" onClick={() => { refresh(); onDone(); }}>{COPY.catchUp.close}</button>
            </>
          ) : (
            <p className="muted">{COPY.catchUp.questionsNone}</p>
          )}
        </section>
        {err && <p className="error sm">{err}</p>}
      </div>
    );
  }

  // ── Progress (the per-year meter + package) ────────────────────────────────────
  return (
    <div className="catchup">
      {approvedCount != null && <p className="catchup-done">{COPY.catchUp.batchDone(approvedCount)}</p>}
      <CatchUpProgress orgId={orgId} onReconcile={onReconcile} onExport={onDone} />
      <div className="form-actions">
        <button onClick={onDone}>{COPY.catchUp.done}</button>
      </div>
    </div>
  );
}

// ── Per-year progress meter ─────────────────────────────────────────────────────
function CatchUpProgress({
  orgId, onReconcile, onExport,
}: {
  orgId: string; onReconcile?: () => void; onExport: () => void;
}) {
  const progress = useCatchUpProgress(orgId);
  if (progress.isError) return <p className="error sm">{COPY.catchUp.progressLoadError}</p>;
  const years = progress.data ?? [];
  if (years.length === 0) return null;

  return (
    <section className="catchup-block">
      <h4 className="section-h">{COPY.catchUp.progressTitle}</h4>
      <ul className="catchup-years">
        {years.map((y) => {
          const status = yearStatus(y);
          const label = status === "done"
            ? COPY.catchUp.yearDone(y.year)
            : status === "in_progress"
              ? COPY.catchUp.yearInProgress(y.year)
              : COPY.catchUp.yearNotStarted(y.year);
          return (
            <li key={y.year} className={`catchup-year cy-${status}`}>
              <span className="cy-label">{label}</span>
              <span className="cy-detail muted sm">{COPY.catchUp.yearDetail(y.uncategorized, y.reconciled_sessions)}</span>
              <span className="cy-actions">
                {status !== "done" && onReconcile && (
                  <button className="ghost sm" onClick={onReconcile}>{COPY.catchUp.yearReconcileCta(y.year)}</button>
                )}
                {status === "done" && (
                  <button className="ghost sm" onClick={onExport}>{COPY.catchUp.yearExportCta(y.year)}</button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── small selects (mirrors ImportFlow) ──────────────────────────────────────────
function ColSelect({
  headers, value, onChange, allowNone, label,
}: {
  headers: string[]; value: number; onChange: (v: number) => void; allowNone?: boolean; label?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
      {allowNone && <option value={-1}>{COPY.importFlow.colSelectNone}</option>}
      {!allowNone && value < 0 && <option value={-1}>{COPY.importFlow.colSelectSelect}</option>}
      {headers.map((h, i) => <option key={i} value={i}>{h || COPY.importFlow.colSelectFallback(i + 1)}</option>)}
    </select>
  );
}

function AccountSelect({
  accounts, value, onChange, filterType, label,
}: {
  accounts: LedgerAccount[]; value: string; onChange: (v: string) => void; filterType?: LedgerAccount["type"]; label?: string;
}) {
  const opts = filterType ? accounts.filter((a) => a.type === filterType) : accounts;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label ?? COPY.common.accountAria}>
      <option value="">{COPY.common.selectAccount}</option>
      {opts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>)}
    </select>
  );
}
