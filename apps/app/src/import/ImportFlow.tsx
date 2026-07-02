/**
 * History import (ARCHITECTURE.md §6.4). A guided, previewable, reversible flow:
 *   Bank CSV   → upload → map columns → pick bank + contra → preview → commit
 *   Opening balances → cutover date + per-account balances → preview → commit
 *
 * CSV is parsed in the browser; only normalized rows go to the `imports` edge fn,
 * which stages then commits them through the verified ledger write-path. Nothing
 * touches the ledger until "Import" — before that it's discardable staging.
 */
import { useMemo, useState } from "react";
import {
  addImportRows, commitImportBatch, connectProvider, createImportBatch, discardImportBatch,
  importProvider, useConnections, type ExternalProvider, type StagedRow,
} from "../ledger/api";
import { parseAmountCell, parseCsv, parseDateCell, type DateFormat, type ParsedCsv } from "./csv";
import { formatMoney } from "../ledger/money";
import type { LedgerAccount } from "../ledger/types";
import { COPY } from "../copy";

type Mode = "choose" | "csv" | "opening";
// Local date (en-CA → YYYY-MM-DD), not UTC — avoids a day-off near midnight/month-end.
const today = () => new Date().toLocaleDateString("en-CA");

export default function ImportFlow({
  orgId, accounts, onDone,
}: {
  orgId: string; accounts: LedgerAccount[]; onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const live = accounts.filter((a) => !a.is_archived);

  if (mode === "choose") {
    return (
      <div className="import-flow">
        <div className="panel-toolbar">
          <span className="muted">{COPY.importFlow.intro}</span>
        </div>
        <div className="import-choices">
          <button className="import-choice" onClick={() => setMode("csv")}>
            <span className="ic-title">{COPY.importFlow.bankCsvTitle}</span>
            <span className="ic-sub">{COPY.importFlow.bankCsvSub}</span>
          </button>
          <button className="import-choice" onClick={() => setMode("opening")} disabled={live.length < 1}>
            <span className="ic-title">{COPY.importFlow.openingTitle}</span>
            <span className="ic-sub">{COPY.importFlow.openingSub}</span>
          </button>
        </div>
        <ConnectSoftware orgId={orgId} onImported={onDone} />
      </div>
    );
  }
  if (mode === "csv") return <CsvImport orgId={orgId} accounts={live} onBack={() => setMode("choose")} onDone={onDone} />;
  return <OpeningBalances orgId={orgId} accounts={live} onBack={() => setMode("choose")} onDone={onDone} />;
}

// ── Bank CSV ──────────────────────────────────────────────────────────────────
function CsvImport({
  orgId, accounts, onBack, onDone,
}: {
  orgId: string; accounts: LedgerAccount[]; onBack: () => void; onDone: () => void;
}) {
  const [filename, setFilename] = useState("");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [dateCol, setDateCol] = useState<number>(-1);
  const [descCol, setDescCol] = useState<number>(-1);
  const [amtCol, setAmtCol] = useState<number>(-1);
  const [positiveIs, setPositiveIs] = useState<"in" | "out">("in");
  const [dateFmt, setDateFmt] = useState<DateFormat>("mdy");
  const [bankId, setBankId] = useState("");
  const [contraId, setContraId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    setErr(null);
    f.text().then((t) => {
      const parsed = parseCsv(t);
      setCsv(parsed);
      // best-effort auto-map by header name
      const find = (re: RegExp) => parsed.headers.findIndex((h) => re.test(h.toLowerCase()));
      setDateCol(find(/date/));
      setDescCol(find(/desc|payee|name|memo|detail/));
      setAmtCol(find(/amount|amt|debit|value/));
    }).catch(() => setErr(COPY.importFlow.readFileError));
  }

  // normalized preview rows
  const rows = useMemo(() => {
    if (!csv || dateCol < 0 || amtCol < 0) return [];
    return csv.rows.map((r, i) => {
      const date = parseDateCell(r[dateCol] ?? "", dateFmt);
      let amount = parseAmountCell(r[amtCol] ?? "");
      if (amount != null && positiveIs === "out") amount = -amount;
      const description = descCol >= 0 ? (r[descCol] ?? "").trim() : "";
      const valid = Boolean(date) && amount != null && amount !== 0;
      return { row_num: i + 1, raw: Object.fromEntries(csv.headers.map((h, j) => [h, r[j] ?? ""])), date, description, amount, valid };
    });
  }, [csv, dateCol, descCol, amtCol, positiveIs, dateFmt]);

  const readyCount = rows.filter((r) => r.valid).length;
  const canImport = Boolean(bankId && contraId && readyCount > 0 && !busy);

  async function doImport() {
    setBusy(true); setErr(null);
    try {
      const { result: batch } = await createImportBatch({
        org_id: orgId, source: "bank_statement", filename: filename || null, bank_account_id: bankId,
      });
      // Once the batch exists, discard it on ANY downstream failure (staging OR
      // commit) so a rejected add_rows can't leave an orphan draft batch behind.
      try {
        const staged: StagedRow[] = rows.map((r) => ({
          row_num: r.row_num, raw: r.raw,
          txn_date: r.date, description: r.description, amount_minor: r.amount,
          account_id: contraId, status: r.valid ? "ready" : "error",
        }));
        await addImportRows(orgId, batch.id, staged);
        await commitImportBatch(orgId, batch.id);
        setDone(readyCount);
      } catch (e) {
        await discardImportBatch(orgId, batch.id).catch(() => {});
        throw e;
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done != null) {
    return (
      <div className="import-flow">
        <div className="import-done">
          <h3>{COPY.importFlow.doneTitle(done)}</h3>
          <p className="muted">{COPY.importFlow.doneBody}</p>
          <button onClick={onDone}>{COPY.importFlow.backToBooks}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="import-flow">
      <div className="panel-toolbar">
        <button className="ghost sm" onClick={onBack}>{COPY.common.back}</button>
        <span className="muted">{csv ? COPY.importFlow.csvSummary(csv.rows.length, filename) : COPY.importFlow.csvHeader}</span>
      </div>

      {!csv ? (
        <label className="file-drop">
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
          <span>{COPY.importFlow.chooseCsv}</span>
        </label>
      ) : (
        <>
          <div className="ledger-form">
            <div className="form-row">
              <label><span>{COPY.importFlow.dateColumn}</span>
                <ColSelect headers={csv.headers} value={dateCol} onChange={setDateCol} label={COPY.importFlow.dateColumn} />
              </label>
              <label><span>{COPY.importFlow.descriptionColumn}</span>
                <ColSelect headers={csv.headers} value={descCol} onChange={setDescCol} allowNone label={COPY.importFlow.descriptionColumn} />
              </label>
              <label><span>{COPY.importFlow.amountColumn}</span>
                <ColSelect headers={csv.headers} value={amtCol} onChange={setAmtCol} label={COPY.importFlow.amountColumn} />
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
              <label className="grow"><span>{COPY.importFlow.bankAccount}</span>
                <AccountSelect accounts={accounts} value={bankId} onChange={setBankId} filterType="asset" />
              </label>
              <label className="grow"><span>{COPY.importFlow.defaultCategory}</span>
                <AccountSelect accounts={accounts} value={contraId} onChange={setContraId} label={COPY.importFlow.defaultCategoryAria} />
              </label>
            </div>
          </div>

          <div className="import-preview">
            <div className="ip-head"><span>{COPY.importFlow.colDate}</span><span>{COPY.importFlow.colDescription}</span><span>{COPY.importFlow.colAmount}</span><span>{COPY.importFlow.colOk}</span></div>
            {rows.slice(0, 50).map((r) => (
              <div className={`ip-row${r.valid ? "" : " bad"}`} key={r.row_num}>
                <span>{r.date ?? COPY.common.emDash}</span>
                <span className="ip-desc">{r.description || COPY.common.emDash}</span>
                <span className="ip-amt">{r.amount != null ? formatMoney(r.amount) : COPY.common.emDash}</span>
                <span>{r.valid ? "✓" : COPY.common.emDash}</span>
              </div>
            ))}
            {rows.length > 50 && <p className="muted sm">{COPY.importFlow.andMore(rows.length - 50)}</p>}
          </div>
          {err && <p className="error sm">{err}</p>}
          <div className="form-actions import-actions">
            <span className="muted sm">{COPY.importFlow.rowsReady(readyCount, rows.length)}</span>
            <button disabled={!canImport} onClick={doImport}>
              {busy ? COPY.importFlow.importing : COPY.importFlow.importN(readyCount)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Opening balances ──────────────────────────────────────────────────────────
interface ObRow { account_id: string; amount: string; side: "D" | "C"; }

function OpeningBalances({
  orgId, accounts, onBack, onDone,
}: {
  orgId: string; accounts: LedgerAccount[]; onBack: () => void; onDone: () => void;
}) {
  const [cutover, setCutover] = useState(today());
  const [rows, setRows] = useState<ObRow[]>([{ account_id: "", amount: "", side: "D" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const parsed = rows.map((r) => parseAmountCell(r.amount) ?? 0);
  // Classify each row so the preview matches exactly what will post, and so a row
  // the user half-filled is never silently dropped (OBTEST P0): an entered balance
  // with no account would otherwise vanish into the OBE plug — books "balanced" but
  // wrong, with no error shown.
  //   complete = account picked AND a positive balance  → posts
  //   blank    = neither account nor a positive balance → an empty add-row, ignored
  //   partial  = exactly one of the two (or a non-positive amount on a real row)
  const rowState = (i: number): "complete" | "blank" | "partial" => {
    const hasAcct = Boolean(rows[i].account_id);
    const hasAmt = parsed[i] > 0;
    if (hasAcct && hasAmt) return "complete";
    if (!hasAcct && !hasAmt) return "blank";
    return "partial";
  };
  const completeIdx = rows.map((_, i) => i).filter((i) => rowState(i) === "complete");
  const partialIdx = rows.map((_, i) => i).filter((i) => rowState(i) === "partial");
  // Totals + plug over the rows that will ACTUALLY post (complete only).
  const debit = completeIdx.reduce((s, i) => s + (rows[i].side === "D" ? parsed[i] : 0), 0);
  const credit = completeIdx.reduce((s, i) => s + (rows[i].side === "C" ? parsed[i] : 0), 0);
  const plug = debit - credit; // plugged to Opening Balance Equity
  const partialMsg = partialIdx.length
    ? COPY.importFlow.obPartial(partialIdx.map((i) => i + 1).join(", "), partialIdx.length > 1)
    : null;
  // Block while any row is half-filled so nothing is dropped behind the user's back.
  const canImport = completeIdx.length > 0 && partialIdx.length === 0 && !busy;

  const update = (i: number, patch: Partial<ObRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { account_id: "", amount: "", side: "D" }]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  async function doImport() {
    setBusy(true); setErr(null);
    try {
      const { result: batch } = await createImportBatch({
        org_id: orgId, source: "opening_balances", cutover_date: cutover,
      });
      // Stage ONLY complete rows as ready. canImport already guarantees there are no
      // partial rows, so nothing the user entered is dropped silently; blank add-rows
      // carry no balance and are simply not sent.
      const staged: StagedRow[] = completeIdx.map((i, n) => ({
        row_num: n + 1,
        description: COPY.importFlow.obDescription,
        amount_minor: parsed[i],
        account_id: rows[i].account_id,
        side: rows[i].side,
        status: "ready",
      }));
      await addImportRows(orgId, batch.id, staged);
      try { await commitImportBatch(orgId, batch.id); setDone(true); }
      catch (e) { await discardImportBatch(orgId, batch.id).catch(() => {}); throw e; }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="import-flow">
        <div className="import-done">
          <h3>{COPY.importFlow.obDoneTitle}</h3>
          <p className="muted">{COPY.importFlow.obDoneBody(cutover)}</p>
          <button onClick={onDone}>{COPY.importFlow.backToBooks}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="import-flow">
      <div className="panel-toolbar">
        <button className="ghost sm" onClick={onBack}>{COPY.common.back}</button>
        <span className="muted">{COPY.importFlow.openingHeader}</span>
      </div>
      <div className="ledger-form">
        <div className="form-row">
          <label><span>{COPY.importFlow.cutoverDate}</span>
            <input type="date" value={cutover} onChange={(e) => setCutover(e.target.value)} />
          </label>
        </div>
        <div className="lines-head ob-head"><span>{COPY.journal.colAccount}</span><span>{COPY.journal.colDrCr}</span><span>{COPY.importFlow.obColBalance}</span><span /></div>
        {rows.map((r, i) => (
          <div className={`line-row ob-row${rowState(i) === "partial" ? " bad" : ""}`} key={i}>
            <AccountSelect accounts={accounts} value={r.account_id} onChange={(v) => update(i, { account_id: v })} label={COPY.importFlow.rowAccountAria(i + 1)} />
            <select value={r.side} onChange={(e) => update(i, { side: e.target.value as "D" | "C" })} aria-label={COPY.importFlow.rowDrCrAria(i + 1)}>
              <option value="D">{COPY.journal.debit}</option><option value="C">{COPY.journal.credit}</option>
            </select>
            <input inputMode="decimal" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} placeholder={COPY.journal.amountPlaceholder} aria-label={COPY.importFlow.rowBalanceAria(i + 1)} />
            <button type="button" className="line-del" onClick={() => removeRow(i)} disabled={rows.length <= 1} aria-label={COPY.importFlow.removeRowAria(i + 1)}>×</button>
          </div>
        ))}
        <div className="entry-foot">
          <button type="button" className="ghost sm" onClick={addRow}>{COPY.importFlow.addAccount}</button>
          <span className="balance-indicator">
            {COPY.importFlow.obBalanceIndicator(formatMoney(debit), formatMoney(credit))}
            {plug !== 0 && COPY.importFlow.obPlug(formatMoney(Math.abs(plug)))}
          </span>
        </div>
      </div>
      {partialMsg && <p className="error sm">{partialMsg}</p>}
      {err && <p className="error sm">{err}</p>}
      <div className="form-actions">
        <button disabled={!canImport} onClick={doImport}>{busy ? COPY.importFlow.obPosting : COPY.importFlow.obImport}</button>
      </div>
    </div>
  );
}

// ── Connect QuickBooks / Xero ────────────────────────────────────────────────
const PROVIDERS: { id: ExternalProvider; label: string }[] = [
  { id: "qbo", label: COPY.providers.qbo },
  { id: "xero", label: COPY.providers.xero },
];

function ConnectSoftware({ orgId, onImported }: { orgId: string; onImported: () => void }) {
  const conns = useConnections(orgId);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const active = (conns.data ?? []).filter((c) => c.status === "active");
  const connectedProviders = new Set(active.map((c) => c.provider));

  async function connect(provider: ExternalProvider) {
    setBusy(provider); setErr(null);
    try {
      const { authorize_url } = await connectProvider(provider, orgId);
      window.open(authorize_url, "_blank", "noopener,noreferrer");
      setMsg(COPY.importFlow.approveInTab);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function pull(provider: ExternalProvider, connectionId: string) {
    setBusy(connectionId); setErr(null); setMsg(null);
    try {
      const r = await importProvider(provider, orgId, connectionId);
      setMsg(COPY.importFlow.pulledSummary(r.accounts, r.ready));
      onImported();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div className="connect-software">
      <h3 className="section-h">{COPY.importFlow.connectHeading}</h3>
      <p className="muted sm">{COPY.importFlow.connectLead}</p>
      {conns.isError && (
        <p className="error sm" role="alert">{COPY.importFlow.connectCheckError}</p>
      )}
      <div className="connect-row">
        {PROVIDERS.map((p) => (
          <button key={p.id} className="ghost sm" disabled={busy === p.id || connectedProviders.has(p.id)} onClick={() => connect(p.id)}>
            {connectedProviders.has(p.id) ? COPY.importFlow.providerConnected(p.label) : busy === p.id ? COPY.importFlow.opening : COPY.importFlow.connectProvider(p.label)}
          </button>
        ))}
      </div>
      {active.length > 0 && (
        <ul className="conn-list">
          {active.map((c) => (
            <li key={c.id}>
              <span>{c.tenant_name ?? c.provider} <span className="status-pill s-open">{c.provider}</span></span>
              <button className="ghost sm" disabled={busy === c.id} onClick={() => pull(c.provider, c.id)}>
                {busy === c.id ? COPY.importFlow.pulling : COPY.importFlow.pullHistory}
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="muted sm">{msg}</p>}
      {err && <p className="error sm">{err}</p>}
    </div>
  );
}

// ── small selects ─────────────────────────────────────────────────────────────
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
