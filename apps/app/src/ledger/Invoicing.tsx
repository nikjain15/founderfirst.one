/**
 * Invoicing + AR (W4.3) — nested under Connections ("Getting paid"), NOT a new
 * top-level tab (APP_PRINCIPLES §2 usability gate). Modular / opt-in: off by
 * default. Until the owner turns it on, this is a one-line enable prompt and
 * nothing else — no invoicing behavior, no nudges.
 *
 * Once on: create an invoice (customer + line items) → send (posts Dr AR / Cr
 * Revenue and emails the customer via the shared email infra) → record payments
 * (posts Dr Cash / Cr AR) → paid. AR aging shows who owes what; opt-in nudges
 * send gentle reminders at the config cadence (invoice_nudge_cadence_days from
 * platform_config — never hardcoded). Voids reverse the accrual (append-only).
 *
 * Every write funnels through the `invoicing` edge fn; this component never posts
 * to the ledger itself. Money is formatted only at the edge (money.ts).
 */
import { useState } from "react";
import {
  useInvoices, useArAging, useInvoicingSettings, useInvoicingRefresh, useOrgSettings, useCurrencies,
  useInvoiceLines,
  setInvoicingSettings, setInvoicingProfile, upsertInvoice, sendInvoice, payInvoice, voidInvoice, runInvoiceNudges,
  type Invoice, type InvoiceLineInput, type InvoiceLine, type InvoicingSettings,
} from "./api";
import { formatMoney, parseMoneyToMinor } from "./money";
import { invoiceTotalMinor, lineAmountMinor } from "./invoiceMath";
import { COPY } from "../copy";

const I = COPY.invoicing;
const V = COPY.invoicing.viewer;

type LineDraft = { description: string; qty: string; unitPrice: string };
const emptyLine = (): LineDraft => ({ description: "", qty: "1", unitPrice: "" });

export default function Invoicing({ orgId, canWrite, orgName }: { orgId: string; canWrite: boolean; orgName?: string }) {
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const settings = useInvoicingSettings(orgId);
  const orgSettings = useOrgSettings(orgId);
  const invoices = useInvoices(orgId);
  const aging = useArAging(orgId);
  const refresh = useInvoicingRefresh(orgId);
  const multiCurrency = orgSettings.data?.multi_currency_enabled ?? false;
  const homeCurrency = orgSettings.data?.home_currency ?? "USD";

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const enabled = settings.data?.enabled ?? false;
  const nudgesOn = settings.data?.nudges_enabled ?? false;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : I.genericError); }
    finally { setBusy(false); }
  };

  // ── opt-in gate: off by default ──────────────────────────────────────────
  if (settings.isLoading) return <p className="muted">{I.loading}</p>;
  if (!enabled) {
    return (
      <div className="invoicing invoicing-optin">
        <p className="muted">{I.optInLead}</p>
        {canWrite && (
          <button className="primary" disabled={busy}
            onClick={() => run(() => setInvoicingSettings(orgId, { enabled: true }))}>
            {I.enableCta}
          </button>
        )}
        {err && <p className="error-text" role="alert">{err}</p>}
      </div>
    );
  }

  return (
    <div className="invoicing">
      {err && <p className="error-text" role="alert">{err}</p>}

      {/* AR aging — who owes what, at a glance */}
      <AgingStrip buckets={aging.data ?? []} />

      {/* Business details — the From/branding block on every invoice */}
      {canWrite && <ProfilePanel orgId={orgId} settings={settings.data ?? null} onSaved={refresh} />}

      {/* Reminders opt-in + manual send */}
      {canWrite && (
        <div className="invoicing-nudges">
          <label className="invoicing-nudge-toggle">
            <input type="checkbox" checked={nudgesOn} disabled={busy}
              onChange={(e) => run(() => setInvoicingSettings(orgId, { nudges_enabled: e.target.checked }))} />
            {I.nudgesLabel}
          </label>
          {nudgesOn && (
            <button className="ghost sm" disabled={busy}
              onClick={() => run(async () => {
                const r = await runInvoiceNudges(orgId);
                setErr(I.nudgesSent((r as { nudged: number }).nudged));
              })}>
              {I.sendRemindersNow}
            </button>
          )}
        </div>
      )}

      {/* Create */}
      {canWrite && !creating && (
        <button className="primary" onClick={() => setCreating(true)}>{I.newInvoice}</button>
      )}
      {creating && (
        <InvoiceForm busy={busy} multiCurrency={multiCurrency} homeCurrency={homeCurrency}
          orgName={orgName} profile={settings.data ?? null}
          onCancel={() => setCreating(false)}
          onSave={(input) => run(async () => { await upsertInvoice({ org_id: orgId, ...input }); setCreating(false); })} />
      )}

      {/* List */}
      {invoices.isLoading ? <p className="muted">{I.loading}</p>
        : (invoices.data ?? []).length === 0 ? <p className="muted">{I.empty}</p>
        : (
          // PENNY-UX-5 — scrollable region must be keyboard-reachable (axe: scrollable-region-focusable)
          <div className="table-wrap" tabIndex={0} role="region" aria-label={I.tableAria}>
            <table className="invoices-table">
              <thead>
                <tr>
                  <th>{I.colNumber}</th><th>{I.colCustomer}</th><th>{I.colDue}</th>
                  <th className="num">{I.colTotal}</th><th className="num">{I.colBalance}</th>
                  <th>{I.colStatus}</th><th aria-label={I.colActions} />
                </tr>
              </thead>
              <tbody>
                {(invoices.data ?? []).map((inv) => (
                  <InvoiceRow key={inv.id} orgId={orgId} inv={inv} canWrite={canWrite} busy={busy} run={run}
                    onView={() => setViewing(inv)} />
                ))}
              </tbody>
            </table>
          </div>
        )}

      {viewing && (
        <InvoiceView orgId={orgId} orgName={orgName} profile={settings.data ?? null}
          invoice={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function AgingStrip({ buckets }: { buckets: { bucket: string; balance_minor: number; invoice_count: number }[] }) {
  const total = buckets.reduce((s, b) => s + b.balance_minor, 0);
  if (total === 0) return <p className="muted">{I.noOutstanding}</p>;
  return (
    <div className="ar-aging">
      <span className="ar-aging-title">{I.owedTitle(formatMoney(total))}</span>
      <div className="ar-aging-buckets">
        {buckets.filter((b) => b.balance_minor > 0).map((b) => (
          <span key={b.bucket} className={`ar-bucket ar-bucket-${b.bucket.replace(/\W/g, "")}`}>
            <span className="ar-bucket-label">{I.bucketLabel(b.bucket)}</span>
            <span className="ar-bucket-amt">{formatMoney(b.balance_minor)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function InvoiceRow({
  orgId, inv, canWrite, busy, run, onView,
}: {
  orgId: string; inv: Invoice; canWrite: boolean; busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>; onView: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const [amt, setAmt] = useState("");
  const balance = inv.total_minor - inv.amount_paid_minor;
  const payable = inv.status === "sent" || inv.status === "partial";
  return (
    <>
      <tr>
        <td>{inv.number}</td>
        <td>{inv.customer_name}</td>
        <td>{inv.due_date}</td>
        <td className="num">{formatMoney(inv.total_minor, inv.currency)}</td>
        <td className="num">{formatMoney(balance, inv.currency)}</td>
        <td><span className={`inv-status inv-status-${inv.status}`}>{I.statusLabel(inv.status)}</span></td>
        <td className="inv-actions">
          <button className="ghost sm" onClick={onView}>{I.view}</button>
          {canWrite && inv.status === "draft" && (
            <button className="ghost sm" disabled={busy}
              onClick={() => run(() => sendInvoice(orgId, inv.id))}>{I.send}</button>
          )}
          {canWrite && payable && (
            <button className="ghost sm" disabled={busy} onClick={() => setPaying((p) => !p)}>{I.recordPayment}</button>
          )}
          {canWrite && payable && inv.amount_paid_minor === 0 && (
            <button className="ghost sm danger" disabled={busy}
              onClick={() => run(() => voidInvoice(orgId, inv.id))}>{I.void}</button>
          )}
        </td>
      </tr>
      {paying && (() => {
        // Client-side cap: the server RPC rejects over-balance payments, but give
        // immediate feedback here. Entered amount is clamped to the remaining
        // balance on Apply; a note shows when the entry exceeds it.
        const entered = parseMoneyToMinor(amt);
        const overpaying = entered != null && entered > balance;
        return (
        <tr className="inv-pay-row">
          <td colSpan={7}>
            <div className="inv-pay">
              <label>{I.paymentAmount}
                <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)}
                  placeholder={formatMoney(balance, inv.currency)} />
              </label>
              <button className="primary sm" disabled={busy}
                onClick={() => {
                  // Clamp to the balance so we never post an overpayment.
                  const minor = Math.min(parseMoneyToMinor(amt) ?? balance, balance);
                  run(() => payInvoice(orgId, inv.id, minor)).then(() => { setPaying(false); setAmt(""); });
                }}>{I.applyPayment}</button>
              <button className="ghost sm" onClick={() => setPaying(false)}>{I.cancel}</button>
            </div>
            {overpaying && (
              <p className="inv-pay-note muted">{I.overpayment(formatMoney(balance, inv.currency))}</p>
            )}
          </td>
        </tr>
        );
      })()}
    </>
  );
}

// ── Professional builder (Slice 2) — a document-style editor: grouped
// Bill-To + dates, a real line-item table (live per-line amount), memo/terms,
// and a Preview toggle that renders the exact Slice-1/B document from the
// current draft (no save required to see it).
function InvoiceForm({
  busy, multiCurrency, homeCurrency, orgName, profile, onCancel, onSave,
}: {
  busy: boolean; multiCurrency: boolean; homeCurrency: string;
  orgName?: string; profile: InvoicingSettings | null;
  onCancel: () => void;
  onSave: (input: {
    customer_name: string; customer_email?: string | null;
    issue_date?: string | null; due_date?: string | null; currency?: string | null;
    memo?: string | null; lines: InvoiceLineInput[];
  }) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [email, setEmail] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [due, setDue] = useState("");
  const [currency, setCurrency] = useState(homeCurrency);
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [previewing, setPreviewing] = useState(false);
  const currencies = useCurrencies();

  const parsed: InvoiceLineInput[] = lines
    .map((l) => ({
      description: l.description.trim(),
      quantity_milli: Math.round((parseFloat(l.qty || "1") || 1) * 1000),
      unit_price_minor: parseMoneyToMinor(l.unitPrice) ?? 0,
    }))
    .filter((l) => l.description && l.unit_price_minor > 0);
  const total = invoiceTotalMinor(parsed);
  const valid = Boolean(customer.trim() && parsed.length > 0);

  const save = () => onSave({
    customer_name: customer.trim(),
    customer_email: email.trim() || null,
    issue_date: issueDate || null,
    due_date: due || null,
    currency: multiCurrency ? currency : null,
    memo: memo.trim() || null,
    lines: parsed,
  });

  if (previewing) {
    return (
      <div className="invoice-form invoice-form-preview">
        <div className="invoice-doc-toolbar">
          <button className="ghost sm" onClick={() => setPreviewing(false)}>{I.backToEdit}</button>
        </div>
        <InvoiceDocumentBody
          orgName={orgName} profile={profile} number={I.draftNumber}
          customerName={customer.trim() || I.previewCustomerPlaceholder}
          customerEmail={email.trim() || null}
          issueDate={issueDate || I.previewToday} dueDate={due || I.previewNoDueDate}
          lines={parsed.map((l, i) => ({
            id: String(i),
            description: l.description,
            qty: ((l.quantity_milli ?? 1000) / 1000).toString(),
            unitPriceMinor: l.unit_price_minor,
            amountMinor: lineAmountMinor(l.quantity_milli ?? 1000, l.unit_price_minor),
          }))}
          cur={currency} totalMinor={total} paidMinor={0} memo={memo.trim() || null}
        />
        <div className="invoice-form-foot">
          <span className="invoice-form-actions">
            <button className="ghost" onClick={onCancel}>{I.cancel}</button>
            <button className="primary" disabled={!valid || busy} onClick={save}>{I.saveDraft}</button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="invoice-form">
      <div className="invoice-form-head">
        <div className="invoice-form-billto">
          <span className="invoice-doc-collabel muted sm">{V.billTo}</span>
          <label>{I.customerName}
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </label>
          <label>{I.customerEmail}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
        <div className="invoice-form-dates">
          <label>{I.issueDate}
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </label>
          <label>{I.dueDate}
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          {multiCurrency && (
            <label>{I.currency}
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {(currencies.data ?? [{ code: homeCurrency, name: homeCurrency, minor_unit: 2 }]).map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="table-wrap" tabIndex={0} role="region" aria-label={I.linesTableAria}>
        <table className="invoice-form-lines-table">
          <thead>
            <tr>
              <th>{I.lineDescription}</th>
              <th className="num">{I.lineQty}</th>
              <th className="num">{I.linePrice}</th>
              <th className="num">{V.colAmount}</th>
              <th aria-label={I.removeLine} />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const qtyMilli = Math.round((parseFloat(l.qty || "1") || 1) * 1000);
              const priceMinor = parseMoneyToMinor(l.unitPrice) ?? 0;
              const amount = lineAmountMinor(qtyMilli, priceMinor);
              return (
                <tr key={i}>
                  <td>
                    <input className="il-desc" placeholder={I.lineDescription} value={l.description}
                      onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                  </td>
                  <td className="num">
                    <input className="il-qty" inputMode="decimal" value={l.qty}
                      onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                  </td>
                  <td className="num">
                    <input className="il-price" inputMode="decimal" placeholder={I.linePrice} value={l.unitPrice}
                      onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))} />
                  </td>
                  <td className="num invoice-form-line-amount">{formatMoney(amount, currency)}</td>
                  <td>
                    {lines.length > 1 && (
                      <button className="ghost sm" aria-label={I.removeLine}
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button className="ghost sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>{I.addLine}</button>

      <label className="invoice-form-memo">{I.memo}
        <textarea value={memo} placeholder={I.memoPlaceholder} rows={2}
          onChange={(e) => setMemo(e.target.value)} />
      </label>

      <div className="invoice-form-foot">
        <span className="invoice-form-total">{I.totalPrefix} {formatMoney(total, currency)}</span>
        <span className="invoice-form-actions">
          <button className="ghost sm" disabled={!valid} onClick={() => setPreviewing(true)}>{I.preview}</button>
          <button className="ghost" onClick={onCancel}>{I.cancel}</button>
          <button className="primary" disabled={!valid || busy} onClick={save}>{I.saveDraft}</button>
        </span>
      </div>
    </div>
  );
}

// ── Business profile (Slice C) — the From/branding block, edited inline ───────
function ProfilePanel({
  orgId, settings, onSaved,
}: {
  orgId: string; settings: InvoicingSettings | null; onSaved: () => void;
}) {
  const P = COPY.invoicing.profile;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(settings?.business_name ?? "");
  const [address, setAddress] = useState(settings?.business_address ?? "");
  const [email, setEmail] = useState(settings?.business_email ?? "");
  const [terms, setTerms] = useState(settings?.payment_terms ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!open) {
    return (
      <div className="invoicing-profile-collapsed">
        <button className="ghost sm" onClick={() => setOpen(true)}>{P.edit}</button>
      </div>
    );
  }
  return (
    <div className="invoicing-profile">
      <h3 className="section-h">{P.heading}</h3>
      <p className="muted sm">{P.lead}</p>
      <label>{P.name}
        <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
      </label>
      <label>{P.address}
        <input value={address} onChange={(e) => { setAddress(e.target.value); setSaved(false); }} />
      </label>
      <label>{P.email}
        <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false); }} />
      </label>
      <label>{P.terms}
        <input value={terms} placeholder={P.termsPlaceholder}
          onChange={(e) => { setTerms(e.target.value); setSaved(false); }} />
      </label>
      <div className="invoicing-profile-actions">
        <button className="ghost" onClick={() => setOpen(false)}>{I.cancel}</button>
        <button className="primary" disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await setInvoicingProfile(orgId, {
                business_name: name.trim() || null, business_address: address.trim() || null,
                business_email: email.trim() || null, payment_terms: terms.trim() || null,
              });
              setSaved(true); onSaved();
            } finally { setBusy(false); }
          }}>{busy ? P.saving : P.save}</button>
        {saved && <span className="muted sm">{P.saved}</span>}
      </div>
    </div>
  );
}

// ── Invoice document viewer (Slice B) — a real, printable invoice ─────────────
// A professional document: business (From) · Bill-to · number/dates · line-item
// table · totals · notes. Read-only; the row keeps send/pay/void. Print → the
// browser dialog (Save as PDF). Lines are client-readable under RLS.
function InvoiceView({
  orgId, orgName, profile, invoice, onClose,
}: {
  orgId: string; orgName?: string; profile: InvoicingSettings | null;
  invoice: Invoice; onClose: () => void;
}) {
  const lines = useInvoiceLines(orgId, invoice.id);
  const docLines = (lines.data ?? []).map((l: InvoiceLine) => ({
    id: l.id, description: l.description,
    qty: (l.quantity_milli / 1000).toString(),
    unitPriceMinor: l.unit_price_minor, amountMinor: l.amount_minor,
  }));

  return (
    <div className="invoice-doc-overlay" role="dialog" aria-modal="true" aria-label={`${V.docLabel} ${invoice.number}`}>
      <div className="invoice-doc-panel">
        <div className="invoice-doc-toolbar">
          <button className="ghost sm" onClick={onClose}>{V.close}</button>
          <button className="ghost sm" onClick={() => window.print()}>{V.print}</button>
        </div>
        <InvoiceDocumentBody
          orgName={orgName} profile={profile} number={invoice.number} status={invoice.status}
          customerName={invoice.customer_name} customerEmail={invoice.customer_email}
          issueDate={invoice.issue_date} dueDate={invoice.due_date}
          lines={docLines} linesLoading={lines.isLoading} cur={invoice.currency}
          totalMinor={invoice.total_minor} paidMinor={invoice.amount_paid_minor} memo={invoice.memo}
        />
      </div>
    </div>
  );
}

// ── Shared document body (Slice 2) — the same markup renders a SAVED invoice
// (InvoiceView, fed from the fetched lines) and a LIVE unsaved draft (the
// InvoiceForm preview toggle, fed from local state) — one visual source of
// truth for what "the invoice" looks like, never two documents to keep in sync.
type DocLine = { id: string; description: string; qty: string; unitPriceMinor: number; amountMinor: number };

function InvoiceDocumentBody({
  orgName, profile, number, status, customerName, customerEmail, issueDate, dueDate,
  lines, linesLoading, cur, totalMinor, paidMinor, memo,
}: {
  orgName?: string; profile: InvoicingSettings | null; number: string; status?: Invoice["status"];
  customerName: string; customerEmail?: string | null; issueDate: string; dueDate: string;
  lines: DocLine[]; linesLoading?: boolean; cur: string; totalMinor: number; paidMinor: number;
  memo?: string | null;
}) {
  const balance = totalMinor - paidMinor;
  return (
    <article className="invoice-doc">
      <header className="invoice-doc-head">
        <div className="invoice-doc-from">
          <span className="invoice-doc-biz">{profile?.business_name || orgName || V.from}</span>
          {profile?.business_address && <span className="muted sm">{profile.business_address}</span>}
          {profile?.business_email && <span className="muted sm">{profile.business_email}</span>}
        </div>
        <div className="invoice-doc-meta">
          <span className="invoice-doc-label">{V.docLabel}</span>
          <span className="invoice-doc-number">{number}</span>
          {status && <span className={`inv-status inv-status-${status}`}>{I.statusLabel(status)}</span>}
        </div>
      </header>

      <div className="invoice-doc-parties">
        <div className="invoice-doc-billto">
          <span className="invoice-doc-collabel muted sm">{V.billTo}</span>
          <span className="invoice-doc-cust">{customerName}</span>
          <span className="muted sm">{customerEmail || V.noEmail}</span>
        </div>
        <div className="invoice-doc-dates">
          <span><span className="muted sm">{V.issued} </span>{issueDate}</span>
          <span><span className="muted sm">{V.due} </span>{dueDate}</span>
        </div>
      </div>

      {linesLoading ? (
        <p className="muted">{V.loadingLines}</p>
      ) : lines.length === 0 ? (
        <p className="muted">{V.noLines}</p>
      ) : (
        <table className="invoice-doc-lines">
          <thead>
            <tr>
              <th>{V.colDescription}</th>
              <th className="num">{V.colQty}</th>
              <th className="num">{V.colUnit}</th>
              <th className="num">{V.colAmount}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{formatMoney(l.unitPriceMinor, cur)}</td>
                <td className="num">{formatMoney(l.amountMinor, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="invoice-doc-totals">
        <div className="invoice-doc-total-row"><span>{V.total}</span><span className="num">{formatMoney(totalMinor, cur)}</span></div>
        {paidMinor > 0 && (
          <div className="invoice-doc-total-row"><span>{V.paid}</span><span className="num">{formatMoney(paidMinor, cur)}</span></div>
        )}
        <div className="invoice-doc-total-row invoice-doc-balance"><span>{V.balanceDue}</span><span className="num">{formatMoney(balance, cur)}</span></div>
      </div>

      {memo && (
        <div className="invoice-doc-notes">
          <span className="invoice-doc-collabel muted sm">{V.notes}</span>
          <p>{memo}</p>
        </div>
      )}
      {profile?.payment_terms && (
        <div className="invoice-doc-notes">
          <span className="invoice-doc-collabel muted sm">{V.terms}</span>
          <p>{profile.payment_terms}</p>
        </div>
      )}
    </article>
  );
}
