/**
 * Bills / AP — TRACKING ONLY (RV2-D1) — nested under Connections ("Paying
 * bills"), NOT a new top-level tab (APP_PRINCIPLES §2 usability gate). Modular /
 * opt-in: off by default. Until the owner turns it on, this is a one-line enable
 * prompt and nothing else.
 *
 * This is the money-OUT half of the cash picture, symmetric with Invoicing (the
 * money-IN half). It RECORDS what the org owes and RECORDS payments as
 * bookkeeping entries — it NEVER moves money. "Record payment" books a Dr AP /
 * Cr Cash entry; no funds are sent anywhere, ever.
 *
 * Once on: add a bill (vendor + line items) → enter (posts Dr Expense / Cr AP,
 * so it shows in AP aging) → record payments (posts Dr AP / Cr Cash) → paid. AP
 * aging shows what's owed and when. Voids reverse the accrual (append-only).
 *
 * Vendors are the EXISTING 1099 vendor store (useVendors) — one payee source, no
 * duplicate. Every write funnels through the `bill-pay` edge fn; this component
 * never posts to the ledger itself. Money is formatted only via money.ts.
 */
import { useState } from "react";
import {
  useBills, useApAging, useApSettings, useApRefresh, useVendors,
  setApSettings, upsertBill, enterBill, recordBillPayment, voidBill,
  type Bill, type BillLineInput, type Vendor,
} from "./api";
import { formatMoney, parseMoneyToMinor } from "./money";
import { clampPayment } from "./invoiceMath";
import { COPY } from "../copy";

const B = COPY.bills;

type LineDraft = { description: string; qty: string; unitPrice: string };
const emptyLine = (): LineDraft => ({ description: "", qty: "1", unitPrice: "" });

export default function Bills({ orgId, canWrite }: { orgId: string; canWrite: boolean }) {
  const settings = useApSettings(orgId);
  const bills = useBills(orgId);
  const aging = useApAging(orgId);
  const vendors = useVendors(orgId);
  const refresh = useApRefresh(orgId);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const enabled = settings.data?.enabled ?? false;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : B.genericError); }
    finally { setBusy(false); }
  };

  // ── opt-in gate: off by default ──────────────────────────────────────────
  if (settings.isLoading) return <p className="muted">{B.loading}</p>;
  if (!enabled) {
    return (
      <div className="bills bills-optin">
        <p className="muted">{B.optInLead}</p>
        {canWrite && (
          <button className="primary" disabled={busy}
            onClick={() => run(() => setApSettings(orgId, { enabled: true }))}>
            {B.enableCta}
          </button>
        )}
        {err && <p className="error-text" role="alert">{err}</p>}
      </div>
    );
  }

  return (
    <div className="bills">
      {err && <p className="error-text" role="alert">{err}</p>}

      {/* AP aging — what's owed, at a glance */}
      <AgingStrip buckets={aging.data ?? []} />

      {/* Create */}
      {canWrite && !creating && (
        <button className="primary" onClick={() => setCreating(true)}>{B.newBill}</button>
      )}
      {creating && (
        <BillForm busy={busy} vendors={vendors.data ?? []}
          onCancel={() => setCreating(false)}
          onSave={(input) => run(async () => { await upsertBill({ org_id: orgId, ...input }); setCreating(false); })} />
      )}

      {/* List */}
      {bills.isLoading ? <p className="muted">{B.loading}</p>
        : (bills.data ?? []).length === 0 ? <p className="muted">{B.empty}</p>
        : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label={B.tableAria}>
            <table className="bills-table">
              <thead>
                <tr>
                  <th>{B.colNumber}</th><th>{B.colVendor}</th><th>{B.colDue}</th>
                  <th className="num">{B.colTotal}</th><th className="num">{B.colBalance}</th>
                  <th>{B.colStatus}</th><th aria-label={B.colActions} />
                </tr>
              </thead>
              <tbody>
                {(bills.data ?? []).map((bill) => (
                  <BillRow key={bill.id} orgId={orgId} bill={bill} canWrite={canWrite} busy={busy} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function AgingStrip({ buckets }: { buckets: { bucket: string; balance_minor: number; bill_count: number }[] }) {
  const total = buckets.reduce((s, b) => s + b.balance_minor, 0);
  if (total === 0) return <p className="muted">{B.noOutstanding}</p>;
  return (
    <div className="ap-aging">
      <span className="ap-aging-title">{B.owedTitle(formatMoney(total))}</span>
      <span className="ap-aging-basis muted">{B.agedByDueDate}</span>
      <div className="ap-aging-buckets">
        {buckets.filter((b) => b.balance_minor > 0).map((b) => (
          <span key={b.bucket} className={`ap-bucket ap-bucket-${b.bucket.replace(/\W/g, "")}`}>
            <span className="ap-bucket-label">{B.bucketLabel(b.bucket)}</span>
            <span className="ap-bucket-amt">{formatMoney(b.balance_minor)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function BillRow({
  orgId, bill, canWrite, busy, run,
}: {
  orgId: string; bill: Bill; canWrite: boolean; busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [paying, setPaying] = useState(false);
  const [amt, setAmt] = useState("");
  const balance = bill.total_minor - bill.amount_paid_minor;
  const payable = bill.status === "open" || bill.status === "partial";
  const vendorName = bill.vendor_name_cache ?? "—";
  return (
    <>
      <tr>
        <td>{bill.number}</td>
        <td>{vendorName}</td>
        <td>{bill.due_date}</td>
        <td className="num">{formatMoney(bill.total_minor, bill.currency)}</td>
        <td className="num">{formatMoney(balance, bill.currency)}</td>
        <td><span className={`bill-status bill-status-${bill.status}`}>{B.statusLabel(bill.status)}</span></td>
        <td className="bill-actions">
          {canWrite && bill.status === "draft" && (
            <button className="ghost sm" disabled={busy || !bill.vendor_id}
              title={bill.vendor_id ? undefined : B.needVendorToEnter}
              onClick={() => run(() => enterBill(orgId, bill.id))}>{B.enter}</button>
          )}
          {canWrite && payable && (
            <button className="ghost sm" disabled={busy} onClick={() => setPaying((p) => !p)}>{B.recordPayment}</button>
          )}
          {canWrite && payable && bill.amount_paid_minor === 0 && (
            <button className="ghost sm danger" disabled={busy}
              onClick={() => run(() => voidBill(orgId, bill.id))}>{B.void}</button>
          )}
        </td>
      </tr>
      {paying && (() => {
        // Client-side cap: the server RPC rejects over-balance payments, but give
        // immediate feedback here. Entered amount is clamped to the remaining
        // balance on Record; a note shows when the entry exceeds it.
        const entered = parseMoneyToMinor(amt);
        const overpaying = entered != null && entered > balance;
        return (
        <tr className="bill-pay-row">
          <td colSpan={7}>
            <div className="bill-pay">
              <label>{B.paymentAmount}
                <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)}
                  placeholder={formatMoney(balance, bill.currency)} />
              </label>
              <button className="primary sm" disabled={busy}
                onClick={() => {
                  // Clamp to the balance so we never record an overpayment.
                  const minor = clampPayment(parseMoneyToMinor(amt), balance);
                  run(() => recordBillPayment(orgId, bill.id, minor)).then(() => { setPaying(false); setAmt(""); });
                }}>{B.applyPayment}</button>
              <button className="ghost sm" onClick={() => setPaying(false)}>{B.cancel}</button>
            </div>
            <p className="bill-pay-note muted">{B.paymentNote}</p>
            {overpaying && (
              <p className="bill-pay-note muted">{B.overpayment(formatMoney(balance, bill.currency))}</p>
            )}
          </td>
        </tr>
        );
      })()}
    </>
  );
}

function BillForm({
  busy, vendors, onCancel, onSave,
}: {
  busy: boolean; vendors: Vendor[]; onCancel: () => void;
  onSave: (input: {
    vendor_id?: string | null; due_date?: string | null; lines: BillLineInput[];
  }) => void;
}) {
  const [vendorId, setVendorId] = useState("");
  const [due, setDue] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const parsed: BillLineInput[] = lines
    .map((l) => ({
      description: l.description.trim(),
      quantity_milli: Math.round((parseFloat(l.qty || "1") || 1) * 1000),
      unit_price_minor: parseMoneyToMinor(l.unitPrice) ?? 0,
    }))
    .filter((l) => l.description && l.unit_price_minor > 0);
  const total = parsed.reduce((s, l) => s + Math.round((l.quantity_milli! * l.unit_price_minor) / 1000), 0);
  const valid = parsed.length > 0;

  return (
    <div className="bill-form">
      <div className="bill-form-head">
        <label>{B.vendorLabel}
          {vendors.length === 0 ? (
            <span className="muted">{B.noVendorHint}</span>
          ) : (
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">{B.vendorPlaceholder}</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
        </label>
        <label>{B.dueDate}
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <div className="bill-form-lines">
        {lines.map((l, i) => (
          <div className="bill-line" key={i}>
            <input className="bl-desc" placeholder={B.lineDescription} value={l.description}
              onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
            <input className="bl-qty" inputMode="decimal" placeholder={B.lineQty} value={l.qty}
              onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
            <input className="bl-price" inputMode="decimal" placeholder={B.linePrice} value={l.unitPrice}
              onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))} />
            {lines.length > 1 && (
              <button className="ghost sm" aria-label={B.removeLine}
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>
            )}
          </div>
        ))}
        <button className="ghost sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>{B.addLine}</button>
      </div>
      <div className="bill-form-foot">
        <span className="bill-form-total">{B.totalPrefix} {formatMoney(total)}</span>
        <span className="bill-form-actions">
          <button className="ghost" onClick={onCancel}>{B.cancel}</button>
          <button className="primary" disabled={!valid || busy}
            onClick={() => onSave({
              vendor_id: vendorId || null,
              due_date: due || null,
              lines: parsed,
            })}>{B.saveDraft}</button>
        </span>
      </div>
    </div>
  );
}
