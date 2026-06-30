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
          <span className="muted">Bring your existing books in. Nothing posts until you confirm.</span>
        </div>
        <div className="import-choices">
          <button className="import-choice" onClick={() => setMode("csv")}>
            <span className="ic-title">Bank statement (CSV)</span>
            <span className="ic-sub">Upload a transactions export — map the columns and we'll post them.</span>
          </button>
          <button className="import-choice" onClick={() => setMode("opening")} disabled={live.length < 1}>
            <span className="ic-title">Opening balances</span>
            <span className="ic-sub">Start the books at a cutover date with each account's balance.</span>
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
    }).catch(() => setErr("Couldn't read that file."));
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
      const staged: StagedRow[] = rows.map((r) => ({
        row_num: r.row_num, raw: r.raw,
        txn_date: r.date, description: r.description, amount_minor: r.amount,
        account_id: contraId, status: r.valid ? "ready" : "error",
      }));
      await addImportRows(orgId, batch.id, staged);
      try {
        await commitImportBatch(orgId, batch.id);
        setDone(readyCount);
      } catch (e) {
        // commit failed → leave no orphan staging
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
          <h3>Imported {done} {done === 1 ? "transaction" : "transactions"}.</h3>
          <p className="muted">They're in. Penny will help you sort each one into the right category — review or adjust any of them anytime from the Journal.</p>
          <button onClick={onDone}>Back to the books</button>
        </div>
      </div>
    );
  }

  return (
    <div className="import-flow">
      <div className="panel-toolbar">
        <button className="ghost sm" onClick={onBack}>← Back</button>
        <span className="muted">{csv ? `${csv.rows.length} rows · ${filename}` : "Bank statement CSV"}</span>
      </div>

      {!csv ? (
        <label className="file-drop">
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
          <span>Choose a CSV file…</span>
        </label>
      ) : (
        <>
          <div className="ledger-form">
            <div className="form-row">
              <label><span>Date column</span>
                <ColSelect headers={csv.headers} value={dateCol} onChange={setDateCol} label="Date column" />
              </label>
              <label><span>Description column</span>
                <ColSelect headers={csv.headers} value={descCol} onChange={setDescCol} allowNone label="Description column" />
              </label>
              <label><span>Amount column</span>
                <ColSelect headers={csv.headers} value={amtCol} onChange={setAmtCol} label="Amount column" />
              </label>
            </div>
            <div className="form-row">
              <label><span>Positive amounts are</span>
                <select value={positiveIs} onChange={(e) => setPositiveIs(e.target.value as "in" | "out")}>
                  <option value="in">money in (deposits)</option>
                  <option value="out">money out (withdrawals)</option>
                </select>
              </label>
              <label><span>Date format</span>
                <select value={dateFmt} onChange={(e) => setDateFmt(e.target.value as DateFormat)}>
                  <option value="mdy">Month/Day/Year (US)</option>
                  <option value="dmy">Day/Month/Year (UK/EU)</option>
                </select>
              </label>
              <label className="grow"><span>Bank account</span>
                <AccountSelect accounts={accounts} value={bankId} onChange={setBankId} filterType="asset" />
              </label>
              <label className="grow"><span>Where should these go by default?</span>
                <AccountSelect accounts={accounts} value={contraId} onChange={setContraId} label="Default category for imported transactions" />
              </label>
            </div>
          </div>

          <div className="import-preview">
            <div className="ip-head"><span>Date</span><span>Description</span><span>Amount</span><span>OK</span></div>
            {rows.slice(0, 50).map((r) => (
              <div className={`ip-row${r.valid ? "" : " bad"}`} key={r.row_num}>
                <span>{r.date ?? "—"}</span>
                <span className="ip-desc">{r.description || "—"}</span>
                <span className="ip-amt">{r.amount != null ? formatMoney(r.amount) : "—"}</span>
                <span>{r.valid ? "✓" : "—"}</span>
              </div>
            ))}
            {rows.length > 50 && <p className="muted sm">…and {rows.length - 50} more</p>}
          </div>
          {err && <p className="error sm">{err}</p>}
          <div className="form-actions import-actions">
            <span className="muted sm">{readyCount} of {rows.length} rows ready</span>
            <button disabled={!canImport} onClick={doImport}>
              {busy ? "Importing…" : `Import ${readyCount} transactions`}
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
  const debit = rows.reduce((s, r, i) => s + (r.side === "D" ? parsed[i] : 0), 0);
  const credit = rows.reduce((s, r, i) => s + (r.side === "C" ? parsed[i] : 0), 0);
  const plug = debit - credit; // plugged to Opening Balance Equity
  const valid = rows.filter((r, i) => r.account_id && parsed[i] > 0);
  const canImport = valid.length > 0 && !busy;

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
      const staged: StagedRow[] = rows.map((r, i) => ({
        row_num: i + 1,
        description: "Opening balance",
        amount_minor: parsed[i],
        account_id: r.account_id || null,
        side: r.side,
        status: r.account_id && parsed[i] > 0 ? "ready" : "skipped",
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
          <h3>Opening balances saved.</h3>
          <p className="muted">Your starting balances are in as of {cutover}. Anything that didn't add up was set aside in an opening-balance account your accountant can review.</p>
          <button onClick={onDone}>Back to the books</button>
        </div>
      </div>
    );
  }

  return (
    <div className="import-flow">
      <div className="panel-toolbar">
        <button className="ghost sm" onClick={onBack}>← Back</button>
        <span className="muted">Opening balances at cutover</span>
      </div>
      <div className="ledger-form">
        <div className="form-row">
          <label><span>Cutover date</span>
            <input type="date" value={cutover} onChange={(e) => setCutover(e.target.value)} />
          </label>
        </div>
        <div className="lines-head ob-head"><span>Account</span><span>Dr/Cr</span><span>Balance</span><span /></div>
        {rows.map((r, i) => (
          <div className="line-row ob-row" key={i}>
            <AccountSelect accounts={accounts} value={r.account_id} onChange={(v) => update(i, { account_id: v })} label={`Row ${i + 1} account`} />
            <select value={r.side} onChange={(e) => update(i, { side: e.target.value as "D" | "C" })} aria-label={`Row ${i + 1} debit or credit`}>
              <option value="D">Debit</option><option value="C">Credit</option>
            </select>
            <input inputMode="decimal" value={r.amount} onChange={(e) => update(i, { amount: e.target.value })} placeholder="0.00" aria-label={`Row ${i + 1} balance`} />
            <button type="button" className="line-del" onClick={() => removeRow(i)} disabled={rows.length <= 1} aria-label={`Remove row ${i + 1}`}>×</button>
          </div>
        ))}
        <div className="entry-foot">
          <button type="button" className="ghost sm" onClick={addRow}>+ Add account</button>
          <span className="balance-indicator">
            Debits {formatMoney(debit)} · Credits {formatMoney(credit)}
            {plug !== 0 && ` · we'll balance ${formatMoney(Math.abs(plug))} into an opening-balance account`}
          </span>
        </div>
      </div>
      {err && <p className="error sm">{err}</p>}
      <div className="form-actions">
        <button disabled={!canImport} onClick={doImport}>{busy ? "Posting…" : "Import opening balances"}</button>
      </div>
    </div>
  );
}

// ── Connect QuickBooks / Xero ────────────────────────────────────────────────
const PROVIDERS: { id: ExternalProvider; label: string }[] = [
  { id: "qbo", label: "QuickBooks" },
  { id: "xero", label: "Xero" },
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
      setMsg("Approve access in the new tab, then come back and click Pull.");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function pull(provider: ExternalProvider, connectionId: string) {
    setBusy(connectionId); setErr(null); setMsg(null);
    try {
      const r = await importProvider(provider, orgId, connectionId);
      setMsg(`Pulled ${r.accounts} accounts and staged ${r.ready} transactions for review.`);
      onImported();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <div className="connect-software">
      <h3 className="section-h">Or connect your accounting software</h3>
      <p className="muted sm">Pull your chart of accounts and history straight from QuickBooks or Xero. Transactions arrive as a preview you confirm.</p>
      {conns.isError && (
        <p className="error sm" role="alert">
          Couldn’t check your connected software — reload to try again.
        </p>
      )}
      <div className="connect-row">
        {PROVIDERS.map((p) => (
          <button key={p.id} className="ghost sm" disabled={busy === p.id || connectedProviders.has(p.id)} onClick={() => connect(p.id)}>
            {connectedProviders.has(p.id) ? `${p.label} connected` : busy === p.id ? "Opening…" : `Connect ${p.label}`}
          </button>
        ))}
      </div>
      {active.length > 0 && (
        <ul className="conn-list">
          {active.map((c) => (
            <li key={c.id}>
              <span>{c.tenant_name ?? c.provider} <span className="status-pill s-open">{c.provider}</span></span>
              <button className="ghost sm" disabled={busy === c.id} onClick={() => pull(c.provider, c.id)}>
                {busy === c.id ? "Pulling…" : "Pull history"}
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
      {allowNone && <option value={-1}>— none —</option>}
      {!allowNone && value < 0 && <option value={-1}>Select…</option>}
      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
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
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label ?? "Account"}>
      <option value="">Select account…</option>
      {opts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>)}
    </select>
  );
}
