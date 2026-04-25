/**
 * screens/invoice.jsx — Invoice designer.
 *
 * Two-pane: left = detail fields, right = live preview (stacked on mobile).
 * No AI calls — invoice rendering is deterministic formatting.
 * D80: pixel-perfect, no shortcuts.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import Sheet from "../components/Sheet.jsx";
import Toast from "../components/Toast.jsx";
import { TOAST_COPY } from "../constants/copy.js";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function invoiceNumber() {
  return `INV-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}


// --- Line item row -----------------------------------------------------------
function LineItem({ item, idx, onChange, onRemove }) {
  const subtotal = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 72px 28px", gap: 8, alignItems: "center", marginBottom: 8 }}>
      <input
        type="text"
        placeholder="Description"
        value={item.description}
        onChange={(e) => onChange(idx, "description", e.target.value)}
        style={inputStyle()}
      />
      <input
        type="number"
        placeholder="Qty"
        value={item.qty}
        min={0}
        onChange={(e) => onChange(idx, "qty", e.target.value)}
        style={inputStyle({ textAlign: "right" })}
      />
      <input
        type="number"
        placeholder="Rate"
        value={item.rate}
        min={0}
        step="0.01"
        onChange={(e) => onChange(idx, "rate", e.target.value)}
        style={inputStyle({ textAlign: "right" })}
      />
      <button
        type="button"
        onClick={() => onRemove(idx)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", padding: 0, fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", minWidth: "unset", minHeight: "unset" }}
        aria-label="Remove line"
      >
        ×
      </button>
    </div>
  );
}

function inputStyle(extra = {}) {
  return {
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    color: "var(--ink)",
    border: "1.5px solid var(--line)",
    borderRadius: 8, // radius-literal: text input — no named token
    padding: "8px 10px",
    background: "var(--white)",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    ...extra,
  };
}

// --- Live invoice preview ----------------------------------------------------
function InvoicePreview({ data }) {
  const subtotal = data.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.rate) || 0), 0);
  const tax      = subtotal * (parseFloat(data.taxRate) || 0) / 100;
  const total    = subtotal + tax;

  return (
    <div style={{
      background: "var(--white)",
      border: "1.5px solid var(--line)",
      borderRadius: "var(--r-card)",
      padding: "24px 20px",
      fontSize: 13,
      lineHeight: 1.5,
      color: "var(--ink)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 17, fontWeight: "var(--fw-bold)", letterSpacing: "-0.02em" }}>
            {data.businessName || "Your Business"}
          </p>
          {data.businessAddress && <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)" }}>{data.businessAddress}</p>}
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: "var(--fw-semibold)", letterSpacing: "-0.01em" }}>INVOICE</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-4)" }}>{data.invoiceNumber}</p>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "var(--line)", margin: "0 0 16px" }} />

      {/* Billing block */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>Bill to</p>
          <p style={{ margin: 0, fontWeight: "var(--fw-medium)" }}>{data.client || "—"}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: "0 0 2px", fontSize: 12, color: "var(--ink-4)" }}>Date: {fmtDate(data.date) || "—"}</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ink-4)" }}>Due: {fmtDate(data.dueDate) || "—"}</p>
        </div>
      </div>

      {/* Line items */}
      <div style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "10px 0", marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 40px 60px 64px", gap: 6, marginBottom: 6 }}>
          {["Description", "Qty", "Rate", "Amount"].map((h) => (
            <p key={h} style={{ margin: 0, fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)" }}>{h}</p>
          ))}
        </div>
        {data.items.map((item, i) => {
          const amt = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 40px 60px 64px", gap: 6, padding: "4px 0" }}>
              <p style={{ margin: 0 }}>{item.description || "—"}</p>
              <p style={{ margin: 0, textAlign: "right" }}>{item.qty || "—"}</p>
              <p style={{ margin: 0, textAlign: "right" }}>{item.rate ? fmt(parseFloat(item.rate)) : "—"}</p>
              <p style={{ margin: 0, textAlign: "right" }}>{fmt(amt)}</p>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        <div style={{ display: "flex", gap: 24 }}>
          <span style={{ color: "var(--ink-3)" }}>Subtotal</span>
          <span>{fmt(subtotal)}</span>
        </div>
        {parseFloat(data.taxRate) > 0 && (
          <div style={{ display: "flex", gap: 24 }}>
            <span style={{ color: "var(--ink-3)" }}>Tax ({data.taxRate}%)</span>
            <span>{fmt(tax)}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 24, fontWeight: "var(--fw-bold)", fontSize: 15, marginTop: 4 }}>
          <span>Total due</span>
          <span>{fmt(total)}</span>
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-2)" }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)" }}>Notes</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>{data.notes}</p>
        </div>
      )}

      {/* Payment methods */}
      {data.paymentMethods?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)" }}>Payment accepted</p>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>{data.paymentMethods.join(" · ")}</p>
        </div>
      )}
    </div>
  );
}

// --- Send sheet --------------------------------------------------------------
function SendSheet({ invoiceNumber, onClose, showToast }) {
  const [email, setEmail] = useState("");
  const [note,  setNote]  = useState("");

  const send = () => {
    if (!email.trim()) return;
    showToast(TOAST_COPY.invoiceSent(email.trim()));
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Send invoice">
      <div style={{ padding: "16px 20px 32px" }}>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ display: "block", fontSize: 12, color: "var(--ink-4)", marginBottom: 6, fontWeight: "var(--fw-medium)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Recipient email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            style={inputStyle()}
            autoFocus
          />
        </label>
        <label style={{ display: "block", marginBottom: 20 }}>
          <span style={{ display: "block", fontSize: 12, color: "var(--ink-4)", marginBottom: 6, fontWeight: "var(--fw-medium)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Message (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Hi, please find your invoice attached…"
            rows={3}
            style={{ ...inputStyle(), resize: "none", lineHeight: 1.5 }}
          />
        </label>
        <button className="btn btn-full" type="button" onClick={send} disabled={!email.trim()}>
          Send invoice
        </button>
      </div>
    </Sheet>
  );
}

// --- Recurring sheet ---------------------------------------------------------
const FREQ_OPTIONS = [
  { label: "Weekly",    days: 7 },
  { label: "Monthly",   days: 30 },
  { label: "Quarterly", days: 91 },
  { label: "Annually",  days: 365 },
];

function nextDates(startStr, days, count = 3) {
  const base = startStr ? new Date(startStr + "T00:00:00") : new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base.getTime() + days * (i + 1) * 86400000);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  });
}

function RecurringSheet({ onClose, showToast, invoiceData }) {
  const [freq,      setFreq]      = useState("Monthly");
  const [startDate, setStartDate] = useState(today());
  const [confirmed, setConfirmed] = useState(false);

  const freqDays = FREQ_OPTIONS.find(f => f.label === freq)?.days || 30;
  const upcoming = nextDates(startDate, freqDays);

  function handleConfirm() {
    setConfirmed(true);
    setTimeout(() => {
      showToast(TOAST_COPY.recurringScheduled(freq.toLowerCase()));
      onClose();
    }, 1200);
  }

  const clientLabel = invoiceData?.client || "client";
  const amount      = invoiceData?.items?.reduce((s, it) => s + (parseFloat(it.qty) || 1) * (parseFloat(it.rate) || 0), 0);
  const amountLabel = amount ? `$${amount.toLocaleString()}` : "invoice";

  return (
    <Sheet open onClose={onClose} title="Recurring invoice" subtitle={`Auto-send ${amountLabel} to ${clientLabel} on a schedule`} maxHeight="90%">
      <div style={{ padding: "16px 20px 32px" }}>

        {/* Frequency */}
        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>Frequency</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
          {FREQ_OPTIONS.map(({ label }) => (
            <button
              key={label}
              type="button"
              onClick={() => setFreq(label)}
              style={{
                padding: "11px 0", borderRadius: "var(--r-pill)",
                border: freq === label ? "1.5px solid var(--ink)" : "1px solid var(--line)",
                background: freq === label ? "var(--ink)" : "var(--white)",
                color: freq === label ? "var(--white)" : "var(--ink-2)",
                fontSize: 14, fontWeight: "var(--fw-medium)", cursor: "pointer",
                fontFamily: "var(--font-sans)", transition: "all 150ms",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Start date */}
        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>First send date</p>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            border: "1px solid var(--line)", borderRadius: "var(--r-card)",
            padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-sans)",
            color: "var(--ink)", background: "var(--white)", outline: "none",
            marginBottom: 20,
          }}
        />

        {/* Upcoming preview */}
        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>Upcoming sends</p>
        <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 20 }}>
          {upcoming.map((date, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "11px 14px",
              borderBottom: i < upcoming.length - 1 ? "1px solid var(--line-2)" : "none",
            }}>
              <span style={{ fontSize: 14, color: "var(--ink-2)" }}>Send #{i + 1}</span>
              <span style={{ fontSize: 14, fontWeight: "var(--fw-medium)" }}>{date}</span>
            </div>
          ))}
        </div>

        <button
          className="btn btn-full"
          type="button"
          disabled={confirmed}
          onClick={handleConfirm}
          style={{ background: confirmed ? "var(--ink-4)" : undefined }}
        >
          {confirmed ? "Scheduling…" : `Schedule ${freq.toLowerCase()} invoices`}
        </button>
      </div>
    </Sheet>
  );
}

// --- Main invoice screen -----------------------------------------------------
export default function InvoiceScreen({ state, set, navigate, onSaveDraft }) {
  const { persona } = state;

  const [invoiceData, setInvoiceData] = useState(() =>
    state.invoiceDraft || {
      invoiceNumber: invoiceNumber(),
      businessName:  persona?.business || "",
      businessAddress: "",
      client:        "",
      date:          today(),
      dueDate:       addDays(today(), 30),
      items:         [{ description: "", qty: "1", rate: "" }],
      taxRate:       "",
      notes:         "Payment due within 30 days.",
      paymentMethods: ["Bank transfer", "Check"],
    }
  );

  const [showSend,      setShowSend]      = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [toast,         setToast]         = useState(null);
  const [showPreview,   setShowPreview]   = useState(false);

  const showToast = useCallback((msg) => { setToast(msg); }, []);

  const update = (key, val) => setInvoiceData((prev) => ({ ...prev, [key]: val }));

  const updateItem = (idx, field, val) => {
    setInvoiceData((prev) => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: val };
      return { ...prev, items };
    });
  };

  const addItem = () =>
    setInvoiceData((prev) => ({ ...prev, items: [...prev.items, { description: "", qty: "1", rate: "" }] }));

  const removeItem = (idx) =>
    setInvoiceData((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  function handleDownloadPDF() {
    const data = invoiceData;
    const subtotal = data.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.rate) || 0), 0);
    const tax      = subtotal * (parseFloat(data.taxRate) || 0) / 100;
    const total    = subtotal + tax;
    const fmtD = (n) => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", minimumFractionDigits:2 }).format(n || 0);
    const fmtDt = (s) => { if (!s) return "—"; const d = new Date(s + "T12:00:00"); return d.toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" }); };

    const rows = data.items.map(item => {
      const amt = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
      return `<tr><td>${item.description || "—"}</td><td style="text-align:right">${item.qty || "—"}</td><td style="text-align:right">${item.rate ? fmtD(parseFloat(item.rate)) : "—"}</td><td style="text-align:right">${fmtD(amt)}</td></tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${data.invoiceNumber}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; font-size: 13px; color: #0a0a0a; margin: 0; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .biz { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
  .biz-addr { font-size: 12px; color: #666; margin-top: 4px; }
  .inv-label { font-size: 15px; font-weight: 600; text-align: right; }
  .inv-num { font-size: 12px; color: #888; text-align: right; }
  hr { border: none; border-top: 1px solid #e0e0dc; margin: 16px 0; }
  .billing { display: flex; justify-content: space-between; margin-bottom: 24px; }
  .eyebrow { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #888; margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #888; border-top: 1px solid #e0e0dc; border-bottom: 1px solid #e0e0dc; padding: 8px 0; text-align: left; }
  th:not(:first-child) { text-align: right; }
  td { padding: 6px 0; border-bottom: 1px solid #f0f0ec; }
  .totals { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .total-row { display: flex; gap: 32px; font-size: 13px; }
  .total-bold { font-weight: 700; font-size: 15px; margin-top: 4px; }
  .notes { margin-top: 20px; padding-top: 16px; border-top: 1px solid #e0e0dc; font-size: 12px; color: #666; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div class="header">
  <div>
    <div class="biz">${data.businessName || "Your Business"}</div>
    ${data.businessAddress ? `<div class="biz-addr">${data.businessAddress}</div>` : ""}
  </div>
  <div>
    <div class="inv-label">INVOICE</div>
    <div class="inv-num">${data.invoiceNumber}</div>
  </div>
</div>
<hr>
<div class="billing">
  <div>
    <p class="eyebrow">Bill to</p>
    <div style="font-weight:500">${data.client || "—"}</div>
  </div>
  <div style="text-align:right">
    <div style="color:#888;font-size:12px">Date: ${fmtDt(data.date)}</div>
    <div style="color:#888;font-size:12px">Due: ${fmtDt(data.dueDate)}</div>
  </div>
</div>
<table>
  <thead><tr><th>Description</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">
  <div class="total-row"><span style="color:#888">Subtotal</span><span>${fmtD(subtotal)}</span></div>
  ${parseFloat(data.taxRate) > 0 ? `<div class="total-row"><span style="color:#888">Tax (${data.taxRate}%)</span><span>${fmtD(tax)}</span></div>` : ""}
  <div class="total-row total-bold"><span>Total due</span><span>${fmtD(total)}</span></div>
</div>
${data.notes ? `<div class="notes"><p class="eyebrow" style="margin-bottom:4px">Notes</p>${data.notes}</div>` : ""}
${data.paymentMethods?.length ? `<div class="notes"><p class="eyebrow" style="margin-bottom:4px">Payment accepted</p>${data.paymentMethods.join(" · ")}</div>` : ""}
</body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:absolute;width:0;height:0;border:none;visibility:hidden";
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 300);
  }

  const PAYMENT_OPTIONS = ["Bank transfer", "Check", "ACH", "Credit card", "Venmo", "Zelle", "PayPal", "Cash"];

  const togglePayment = (method) => {
    const current = invoiceData.paymentMethods || [];
    if (current.includes(method)) {
      update("paymentMethods", current.filter((m) => m !== method));
    } else {
      update("paymentMethods", [...current, method]);
    }
  };

  const subtotal = invoiceData.items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.rate) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--white)", position: "relative" }}>

      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px", borderBottom: "1px solid var(--line-2)", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => navigate("#/books")}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--ink-3)", display: "flex", alignItems: "center", minWidth: 44, minHeight: 44, justifyContent: "center" }}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="12 4 6 10 12 16"/>
          </svg>
        </button>
        <h1 style={{ margin: 0, fontSize: "var(--fs-screen-title)", fontWeight: "var(--fw-semibold)", letterSpacing: "var(--ls-tight)" }}>
          New invoice
        </h1>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          style={{
            background: showPreview ? "var(--ink)" : "var(--paper)",
            color: showPreview ? "var(--white)" : "var(--ink-3)",
            border: `1.5px solid ${showPreview ? "var(--ink)" : "var(--line)"}`,
            borderRadius: "var(--r-pill)",
            cursor: "pointer", fontSize: 13, fontFamily: "var(--font-sans)",
            padding: "6px 14px", minWidth: "unset", minHeight: "unset",
            fontWeight: "var(--fw-medium)", transition: "all 120ms",
          }}
        >
          {showPreview ? "Edit" : "Preview"}
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

        {showPreview ? (
          <InvoicePreview data={invoiceData} />
        ) : (
          <>
            {/* Business + invoice meta */}
            <p className="eyebrow" style={{ marginBottom: 8 }}>Your details</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              <input type="text" placeholder="Business name" value={invoiceData.businessName} onChange={(e) => update("businessName", e.target.value)} style={inputStyle()} />
              <input type="text" placeholder="Business address (optional)" value={invoiceData.businessAddress} onChange={(e) => update("businessAddress", e.target.value)} style={inputStyle()} />
            </div>

            {/* Client */}
            <p className="eyebrow" style={{ marginBottom: 8 }}>Client</p>
            <div style={{ marginBottom: 20 }}>
              <input type="text" placeholder="Client name or company" value={invoiceData.client} onChange={(e) => update("client", e.target.value)} style={inputStyle()} />
            </div>

            {/* Dates */}
            <p className="eyebrow" style={{ marginBottom: 8 }}>Dates</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--ink-4)" }}>Invoice date</p>
                <input type="date" value={invoiceData.date} onChange={(e) => update("date", e.target.value)} style={inputStyle()} />
              </div>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--ink-4)" }}>Due date</p>
                <input type="date" value={invoiceData.dueDate} onChange={(e) => update("dueDate", e.target.value)} style={inputStyle()} />
              </div>
            </div>

            {/* Line items */}
            <p className="eyebrow" style={{ marginBottom: 8 }}>Line items</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 56px 72px 28px", gap: 8, marginBottom: 6 }}>
              {["Description", "Qty", "Rate", ""].map((h, i) => (
                <p key={i} style={{ margin: 0, fontSize: 11, color: "var(--ink-4)", fontWeight: "var(--fw-medium)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i > 0 && i < 3 ? "right" : "left" }}>{h}</p>
              ))}
            </div>
            {invoiceData.items.map((item, i) => (
              <LineItem key={i} item={item} idx={i} onChange={updateItem} onRemove={removeItem} />
            ))}
            <button
              type="button"
              onClick={addItem}
              style={{ background: "none", border: "1.5px dashed var(--line)", borderRadius: 8 /* radius-literal: dashed add-line button — no named token */, width: "100%", padding: "10px", cursor: "pointer", fontSize: 14, color: "var(--ink-3)", fontFamily: "var(--font-sans)", marginBottom: 20, minHeight: "var(--tap-min)" }}
            >
              + Add line
            </button>

            {/* Tax rate */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "14px 0", borderTop: "1px solid var(--line-2)", borderBottom: "1px solid var(--line-2)" }}>
              <span style={{ fontSize: 14, color: "var(--ink-3)" }}>Tax rate (%)</span>
              <input
                type="number"
                placeholder="0"
                value={invoiceData.taxRate}
                onChange={(e) => update("taxRate", e.target.value)}
                style={{ ...inputStyle({ textAlign: "right" }), width: 72 }}
                min={0}
                max={100}
              />
            </div>

            {/* Subtotal display */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginBottom: 20, fontSize: 15, fontWeight: "var(--fw-semibold)" }}>
              <span style={{ color: "var(--ink-3)", fontWeight: "var(--fw-regular)" }}>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>

            {/* Notes */}
            <p className="eyebrow" style={{ marginBottom: 8 }}>Notes / payment terms</p>
            <textarea
              value={invoiceData.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Payment due within 30 days…"
              rows={3}
              style={{ ...inputStyle(), resize: "none", lineHeight: 1.5, marginBottom: 20 }}
            />

            {/* Payment methods */}
            <p className="eyebrow" style={{ marginBottom: 10 }}>Payment accepted</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
              {PAYMENT_OPTIONS.map((m) => {
                const active = (invoiceData.paymentMethods || []).includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => togglePayment(m)}
                    style={{
                      padding: "10px 14px",
                      border: `1.5px solid ${active ? "var(--ink)" : "var(--line)"}`,
                      borderRadius: 8, // radius-literal: payment-method button — no named token
                      background: active ? "var(--paper)" : "var(--white)",
                      cursor: "pointer",
                      fontFamily: "var(--font-sans)",
                      fontSize: 13,
                      color: active ? "var(--ink)" : "var(--ink-3)",
                      fontWeight: active ? "var(--fw-medium)" : "var(--fw-regular)",
                      textAlign: "left",
                      minHeight: "unset",
                      minWidth: "unset",
                    }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: showPreview ? 20 : 0 }}>
          <button className="btn btn-full" type="button" onClick={() => setShowSend(true)}>
            Send invoice
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" type="button" style={{ flex: 1 }} onClick={() => {
              set({ invoiceDraft: invoiceData });
              showToast(TOAST_COPY.draftSaved);
            }}>
              Save draft
            </button>
            <button className="btn btn-ghost" type="button" style={{ flex: 1 }} onClick={handleDownloadPDF}>
              Download PDF
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowRecurring(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--ink-3)", fontFamily: "var(--font-sans)", padding: "8px 0", minHeight: "var(--tap-min)" }}
          >
            Set up recurring invoice
          </button>
        </div>

        <div style={{ height: 20 }} />
      </div>

      {showSend && <SendSheet invoiceNumber={invoiceData.invoiceNumber} onClose={() => setShowSend(false)} showToast={showToast} />}
      {showRecurring && <RecurringSheet onClose={() => setShowRecurring(false)} showToast={showToast} invoiceData={invoiceData} />}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
