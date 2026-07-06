/**
 * InvoiceView (INVOICE-1, Slice 1 of docs/plans/INVOICING_REWORK.md) — a single
 * invoice rendered as a real document: header (business name, "INVOICE",
 * number, status), From / Bill-To, dates, a line-item table, subtotal/total,
 * and notes. This is the "you can't view them" gap Nik flagged 6 Jul.
 *
 * Read-only presentation over `get_invoice` (INVOICE-1 migration); every write
 * (send / record payment / void) still funnels through the same edge-fn calls
 * Invoicing.tsx already uses — this component only moves those actions onto
 * the document instead of a bare table row.
 *
 * Print / Save-as-PDF uses the browser's native print (window.print()) against
 * a `@media print` rule that isolates `.invoice-view` — no new PDF generator
 * (a server-rendered PDF can follow later per the plan; browser-print ships now).
 */
import { useState, type ReactNode } from "react";
import { useInvoice, sendInvoice, payInvoice, voidInvoice, type Invoice } from "./api";
import { useActiveOrg } from "../org/ActiveOrgProvider";
import { formatMoney, parseMoneyToMinor } from "./money";
import { formatQty } from "./invoiceMath";
import { COPY } from "../copy";

const I = COPY.invoicing;

export default function InvoiceView({
  orgId, invoiceId, canWrite, onBack, onChanged,
}: {
  orgId: string; invoiceId: string; canWrite: boolean;
  onBack: () => void; onChanged: () => void;
}) {
  const { activeOrg } = useActiveOrg();
  const invoice = useInvoice(orgId, invoiceId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [amt, setAmt] = useState("");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : I.genericError); }
    finally { setBusy(false); }
  };

  return (
    <div className="invoice-view-wrap">
      <div className="invoice-view-toolbar invoice-view-noprint">
        <button type="button" className="ghost sm" onClick={onBack}>{I.viewerBack}</button>
        <button type="button" className="ghost sm" onClick={() => window.print()}>{I.print}</button>
      </div>
      {err && <p className="error-text invoice-view-noprint" role="alert">{err}</p>}

      {invoice.isLoading ? (
        <p className="muted">{I.viewerLoading}</p>
      ) : !invoice.data ? (
        <p className="muted">{I.viewerNotFound}</p>
      ) : (
        <InvoiceDocument
          org={activeOrg} inv={invoice.data}
          actions={canWrite && (
            <div className="invoice-view-actions invoice-view-noprint">
              {inv_status_actions(invoice.data)}
            </div>
          )}
        />
      )}
    </div>
  );

  // Send / pay / void — same actions InvoiceRow offered, now on the document.
  function inv_status_actions(inv: Invoice) {
    const balance = inv.total_minor - inv.amount_paid_minor;
    const payable = inv.status === "sent" || inv.status === "partial";
    return (
      <>
        {inv.status === "draft" && (
          <button className="ghost sm" disabled={busy}
            onClick={() => run(() => sendInvoice(orgId, inv.id))}>{I.send}</button>
        )}
        {payable && (
          <button className="ghost sm" disabled={busy} onClick={() => setPaying((p) => !p)}>
            {I.recordPayment}
          </button>
        )}
        {payable && inv.amount_paid_minor === 0 && (
          <button className="ghost sm danger" disabled={busy}
            onClick={() => run(() => voidInvoice(orgId, inv.id))}>{I.void}</button>
        )}
        {paying && (
          <div className="inv-pay">
            <label>{I.paymentAmount}
              <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)}
                placeholder={formatMoney(balance, inv.currency)} />
            </label>
            <button className="primary sm" disabled={busy}
              onClick={() => {
                const minor = Math.min(parseMoneyToMinor(amt) ?? balance, balance);
                run(() => payInvoice(orgId, inv.id, minor)).then(() => { setPaying(false); setAmt(""); });
              }}>{I.applyPayment}</button>
            <button className="ghost sm" onClick={() => setPaying(false)}>{I.cancel}</button>
          </div>
        )}
      </>
    );
  }
}

function InvoiceDocument({
  org, inv, actions,
}: {
  org: { name: string } | null | undefined;
  inv: Invoice & { lines: { id: string; description: string; quantity_milli: number; unit_price_minor: number; amount_minor: number }[] };
  actions: ReactNode;
}) {
  const balance = inv.total_minor - inv.amount_paid_minor;
  return (
    <div className="invoice-view">
      <header className="invoice-view-head">
        <div className="invoice-view-from">
          <p className="invoice-view-business">{org?.name ?? ""}</p>
        </div>
        <div className="invoice-view-doc-id">
          <p className="invoice-view-doctitle">{I.docTitle}</p>
          <p className="invoice-view-number">{inv.number}</p>
          <span className={`inv-status inv-status-${inv.status}`}>{I.statusLabel(inv.status)}</span>
        </div>
      </header>

      <div className="invoice-view-parties">
        <div>
          <p className="eyebrow">{I.billTo}</p>
          <p className="invoice-view-customer">{inv.customer_name}</p>
          {inv.customer_email && <p className="muted sm">{inv.customer_email}</p>}
        </div>
        <div className="invoice-view-dates">
          <p className="muted sm">{I.issueDate}: {inv.issue_date}</p>
          <p className="muted sm">{I.colDue}: {inv.due_date}</p>
        </div>
      </div>

      <div className="table-wrap" tabIndex={0} role="region" aria-label={I.tableAria}>
        <table className="invoice-view-lines">
          <thead>
            <tr>
              <th>{I.lineDescription}</th>
              <th className="num">{I.colQty}</th>
              <th className="num">{I.colUnit}</th>
              <th className="num">{I.colAmount}</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="num">{formatQty(l.quantity_milli)}</td>
                <td className="num">{formatMoney(l.unit_price_minor, inv.currency)}</td>
                <td className="num">{formatMoney(l.amount_minor, inv.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="invoice-view-totals">
        <div className="invoice-view-total-row invoice-view-total-grand">
          <span>{I.total}</span>
          <span className="num">{formatMoney(inv.total_minor, inv.currency)}</span>
        </div>
        {inv.amount_paid_minor > 0 && (
          <>
            <div className="invoice-view-total-row">
              <span>{I.amountPaid}</span>
              <span className="num">{formatMoney(inv.amount_paid_minor, inv.currency)}</span>
            </div>
            <div className="invoice-view-total-row invoice-view-total-grand">
              <span>{I.balanceDue}</span>
              <span className="num">{formatMoney(balance, inv.currency)}</span>
            </div>
          </>
        )}
      </div>

      {inv.memo && (
        <div className="invoice-view-memo">
          <p className="eyebrow">{I.notes}</p>
          <p className="muted sm">{inv.memo}</p>
        </div>
      )}

      {actions}
    </div>
  );
}
