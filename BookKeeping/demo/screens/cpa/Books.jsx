/**
 * screens/cpa/Books.jsx — Tab 2: full general ledger with CPA overlays.
 *
 * Ledger data: fetched from /config/scenarios.json, keyed by client's scenarioKey.
 * Overlays: flags, pendingAdds, and approvals from state.cpa.clients[clientId].
 *
 * Column layout:
 *   ≥1024px: Date · Vendor · Category · IRS Line · Amount · Status · Actions
 *   768–1023px: Date · Vendor · Category+IRS (2-line) · Amount · Actions
 *   ≤767px: 2-line card — line1: vendor + amount, line2: category + date
 *
 * Row ID convention: txn-s{NN}-{MM} (1-based, zero-padded)
 * e.g. client-001 row 0 → txn-s01-01
 */

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { irsLineChip } from "../../util/irsLookup.js";
import {
  addTransactionAsCpa,
  flagTransaction,
  annotateTransaction,
  suggestReclassification,
} from "../../util/cpaState.js";

// Common expense categories for reclassification picker
const RECLASSIFY_CATEGORIES = [
  "Advertising & marketing",
  "Bank fees",
  "Business meals (50%)",
  "Commercial insurance",
  "Contract labor",
  "Equipment & tools",
  "Home office",
  "Inventory (COGS)",
  "Legal & professional fees",
  "Miscellaneous business expenses",
  "Office supplies",
  "Payroll",
  "Phone & internet",
  "Rent & lease",
  "Software & subscriptions",
  "Travel",
  "Vehicle depreciation & loan interest",
  "Vehicle fuel",
  "Wages",
];

const fmt = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(n));

/** Derive stable row ID from clientId + 0-based index. */
function rowId(clientId, index) {
  const n = parseInt(clientId.replace("client-", ""), 10);
  return `txn-s${String(n).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--ink)",
        color: "var(--white)",
        padding: "10px 20px",
        borderRadius: "var(--r-pill)",
        fontSize: 13,
        fontWeight: "var(--fw-medium)",
        fontFamily: "var(--font-sans)",
        whiteSpace: "nowrap",
        zIndex: 300,
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}

// ── Add-transaction sheet (portalled to #sheet-root-cpa) ─────────────────────

function AddTxnSheet({ clientId, clientData, cpaAccount, onClose, onAdd }) {
  const [date, setDate] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");

  const portal = document.getElementById("sheet-root-cpa") || document.body;

  function handleSubmit(e) {
    e.preventDefault();
    if (!vendor.trim() || !amount || !category.trim()) return;
    onAdd({ date: date || new Date().toISOString().slice(0, 10), vendor: vendor.trim(), amount: parseFloat(amount), category: category.trim() });
    onClose();
  }

  return createPortal(
    <div
      className="sheet-backdrop"
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(10,10,10,0.18)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 200,
        pointerEvents: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--white)",
          borderRadius: "var(--r-sheet) var(--r-sheet) 0 0",
          width: "100%",
          maxWidth: 560,
          padding: "0 0 32px",
          maxHeight: "70%",
          overflowY: "auto",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }} />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px 16px",
            borderBottom: "1px solid var(--line-2)",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", color: "var(--ink)", fontFamily: "var(--font-sans)" }}>
            Add transaction
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 20, padding: "0 4px", fontFamily: "var(--font-sans)" }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Date", id: "date", type: "date", value: date, onChange: setDate, required: false },
            { label: "Vendor", id: "vendor", type: "text", value: vendor, onChange: setVendor, required: true, placeholder: "e.g. Amazon Business" },
            { label: "Amount ($)", id: "amount", type: "number", value: amount, onChange: setAmount, required: true, placeholder: "0" },
            { label: "Category", id: "category", type: "text", value: category, onChange: setCategory, required: true, placeholder: "e.g. Office supplies" },
          ].map(({ label, id, type, value, onChange, required, placeholder }) => (
            <div key={id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                htmlFor={id}
                style={{ fontSize: 11, fontWeight: "var(--fw-semibold)", color: "var(--ink-3)", letterSpacing: "var(--ls-eyebrow)", textTransform: "uppercase", fontFamily: "var(--font-sans)" }}
              >
                {label}
              </label>
              <input
                id={id}
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required={required}
                placeholder={placeholder}
                style={{
                  padding: "10px 14px",
                  border: "1.5px solid var(--line)",
                  borderRadius: "var(--r-card)",
                  fontSize: 15,
                  fontFamily: "var(--font-sans)",
                  color: "var(--ink)",
                  background: "var(--white)",
                  outline: "none",
                }}
              />
            </div>
          ))}

          <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-sans)" }}>
            Receipt upload — demo only. Transaction will be tagged "Added by CPA" and require founder acknowledgment.
          </div>

          <button
            type="submit"
            style={{
              padding: "14px",
              background: "var(--ink)",
              color: "var(--white)",
              border: "none",
              borderRadius: "var(--r-pill)",
              fontSize: 15,
              fontWeight: "var(--fw-semibold)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              marginTop: 4,
            }}
          >
            Add transaction
          </button>
        </form>
      </div>
    </div>,
    portal
  );
}

// ── Row action menu sheet ─────────────────────────────────────────────────────
// Three options: Flag · Annotate · Suggest reclassification
function RowMenuSheet({ row, onClose, onFlag, onAnnotate, onSuggest }) {
  const portal = document.getElementById("sheet-root-cpa") || document.body;
  const options = [
    { label: "Flag", sub: "Mark for follow-up with a reason", action: "flag" },
    { label: "Annotate", sub: "Add a private note to this row", action: "annotate" },
    { label: "Suggest reclassification", sub: "Propose a different category to the founder", action: "suggest" },
  ];

  return createPortal(
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(10,10,10,0.18)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, pointerEvents: "auto" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", borderRadius: "var(--r-sheet) var(--r-sheet) 0 0", width: "100%", maxWidth: 560, paddingBottom: 24, fontFamily: "var(--font-sans)" }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }} />
        </div>
        <div style={{ padding: "0 20px 12px", borderBottom: "1px solid var(--line-2)" }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "var(--ls-eyebrow)", textTransform: "uppercase", color: "var(--ink-4)" }}>
            {row.vendor}
          </p>
        </div>
        {options.map((opt) => (
          <button
            key={opt.action}
            onClick={() => { onClose(); setTimeout(() => { if (opt.action === "flag") onFlag(); else if (opt.action === "annotate") onAnnotate(); else onSuggest(); }, 80); }}
            style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "14px 20px", background: "none", border: "none", borderBottom: "1px solid var(--line-2)", cursor: "pointer", textAlign: "left", minHeight: "var(--tap-min)" }}
          >
            <span style={{ fontSize: 15, fontWeight: "var(--fw-medium)", color: "var(--ink)" }}>{opt.label}</span>
            <span style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>{opt.sub}</span>
          </button>
        ))}
      </div>
    </div>,
    portal
  );
}

// ── Flag sheet ────────────────────────────────────────────────────────────────
const FLAG_REASONS = [
  { value: "needs-receipt",       label: "Needs receipt" },
  { value: "reclassify",          label: "Needs reclassification" },
  { value: "confirm-with-client", label: "Confirm with client" },
];

function FlagSheet({ row, onClose, onSubmit }) {
  const [reason, setReason] = useState("needs-receipt");
  const [note, setNote] = useState("");
  const portal = document.getElementById("sheet-root-cpa") || document.body;

  return createPortal(
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(10,10,10,0.18)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, pointerEvents: "auto" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", borderRadius: "var(--r-sheet) var(--r-sheet) 0 0", width: "100%", maxWidth: 560, padding: "0 0 32px", maxHeight: "70%", overflowY: "auto", fontFamily: "var(--font-sans)" }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 14px", borderBottom: "1px solid var(--line-2)" }}>
          <span style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>Flag transaction</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 20, padding: "0 4px" }}>×</button>
        </div>
        <div style={{ padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <p className="eyebrow" style={{ margin: "0 0 10px" }}>Reason</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {FLAG_REASONS.map((r) => (
                <label key={r.value} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", borderRadius: "var(--r-card)", border: `1.5px solid ${reason === r.value ? "var(--ink)" : "var(--line)"}`, background: reason === r.value ? "var(--paper)" : "var(--white)" }}>
                  <input type="radio" name="flag-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} style={{ accentColor: "var(--ink)" }} />
                  <span style={{ fontSize: 14, color: "var(--ink)", fontWeight: reason === r.value ? "var(--fw-semibold)" : "var(--fw-regular)" }}>{r.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow" style={{ margin: "0 0 8px" }}>Note (optional)</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for the founder…"
              rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1.5px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 14, fontFamily: "var(--font-sans)", color: "var(--ink)", resize: "none", outline: "none", background: "var(--white)" }}
            />
          </div>
          <button
            onClick={() => { onSubmit(reason, note.trim()); onClose(); }}
            style={{ padding: 14, background: "var(--ink)", color: "var(--white)", border: "none", borderRadius: "var(--r-pill)", fontSize: 15, fontWeight: "var(--fw-semibold)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
          >
            Flag transaction
          </button>
        </div>
      </div>
    </div>,
    portal
  );
}

// ── Annotate sheet ────────────────────────────────────────────────────────────
function AnnotateSheet({ row, existingAnnotations, onClose, onSubmit }) {
  const [text, setText] = useState("");
  const portal = document.getElementById("sheet-root-cpa") || document.body;

  return createPortal(
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(10,10,10,0.18)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, pointerEvents: "auto" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", borderRadius: "var(--r-sheet) var(--r-sheet) 0 0", width: "100%", maxWidth: 560, padding: "0 0 32px", maxHeight: "70%", overflowY: "auto", fontFamily: "var(--font-sans)" }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 14px", borderBottom: "1px solid var(--line-2)" }}>
          <span style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>Add note</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 20, padding: "0 4px" }}>×</button>
        </div>
        <div style={{ padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 16 }}>
          {existingAnnotations?.length > 0 && (
            <div>
              <p className="eyebrow" style={{ margin: "0 0 8px" }}>Existing notes</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {existingAnnotations.map((a) => (
                  <div key={a.id} style={{ padding: "8px 12px", background: "var(--paper)", borderRadius: "var(--r-card)", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                    {a.text}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="eyebrow" style={{ margin: "0 0 8px" }}>New note</p>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Your note about this transaction…"
              rows={4}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1.5px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 14, fontFamily: "var(--font-sans)", color: "var(--ink)", resize: "none", outline: "none", background: "var(--white)" }}
            />
          </div>
          <button
            onClick={() => { if (text.trim()) { onSubmit(text.trim()); onClose(); } }}
            disabled={!text.trim()}
            style={{ padding: 14, background: "var(--ink)", color: "var(--white)", border: "none", borderRadius: "var(--r-pill)", fontSize: 15, fontWeight: "var(--fw-semibold)", cursor: text.trim() ? "pointer" : "default", fontFamily: "var(--font-sans)", opacity: text.trim() ? 1 : 0.45 }}
          >
            Save note
          </button>
        </div>
      </div>
    </div>,
    portal
  );
}

// ── Suggest reclassification sheet ────────────────────────────────────────────
function SuggestReclassSheet({ row, onClose, onSubmit }) {
  const [toCategory, setToCategory] = useState("");
  const [note, setNote] = useState("");
  const portal = document.getElementById("sheet-root-cpa") || document.body;

  return createPortal(
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(10,10,10,0.18)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, pointerEvents: "auto" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--white)", borderRadius: "var(--r-sheet) var(--r-sheet) 0 0", width: "100%", maxWidth: 560, padding: "0 0 32px", maxHeight: "70%", overflowY: "auto", fontFamily: "var(--font-sans)" }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 14px", borderBottom: "1px solid var(--line-2)" }}>
          <span style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>Suggest reclassification</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 20, padding: "0 4px" }}>×</button>
        </div>
        <div style={{ padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "10px 14px", background: "var(--paper)", borderRadius: "var(--r-card)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)", fontWeight: "var(--fw-medium)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Current</p>
              <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--ink)" }}>{row.category || "Uncategorized"}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-4)" }}>
              <polyline points="6 4 10 8 6 12"/>
            </svg>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)", fontWeight: "var(--fw-medium)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Suggested</p>
              <p style={{ margin: "2px 0 0", fontSize: 14, color: toCategory ? "var(--ink)" : "var(--ink-4)" }}>{toCategory || "Select below"}</p>
            </div>
          </div>
          <div>
            <p className="eyebrow" style={{ margin: "0 0 8px" }}>New category</p>
            <select
              value={toCategory}
              onChange={(e) => setToCategory(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", border: "1.5px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 14, fontFamily: "var(--font-sans)", color: "var(--ink)", background: "var(--white)", outline: "none", appearance: "none" }}
            >
              <option value="">Select a category…</option>
              {RECLASSIFY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="eyebrow" style={{ margin: "0 0 8px" }}>Note for founder (optional)</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain why this category is more accurate…"
              rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", border: "1.5px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 14, fontFamily: "var(--font-sans)", color: "var(--ink)", resize: "none", outline: "none", background: "var(--white)" }}
            />
          </div>
          <button
            onClick={() => { if (toCategory) { onSubmit(row.category || "", toCategory, note.trim()); onClose(); } }}
            disabled={!toCategory}
            style={{ padding: 14, background: "var(--ink)", color: "var(--white)", border: "none", borderRadius: "var(--r-pill)", fontSize: 15, fontWeight: "var(--fw-semibold)", cursor: toCategory ? "pointer" : "default", fontFamily: "var(--font-sans)", opacity: toCategory ? 1 : 0.45 }}
          >
            Send to founder for approval
          </button>
        </div>
      </div>
    </div>,
    portal
  );
}

// ── IRS chip display ──────────────────────────────────────────────────────────

function IrsChip({ category, entity }) {
  const chip = irsLineChip(category, entity);
  if (!chip) return null;
  return (
    <span
      style={{
        fontFamily: "monospace",
        fontSize: "var(--fs-tiny)",
        color: "var(--ink-3)",
        letterSpacing: "var(--ls-chip)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {chip}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function Badge({ text }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: "var(--fw-semibold)",
        color: "var(--amber)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Books({ clientId, clientData, approvals, cpaAccount, onUpdateCpa }) {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastKey = useRef(0);

  // Row overlay state: which row + which sheet
  const [activeRow, setActiveRow] = useState(null);       // row object
  const [overlaySheet, setOverlaySheet] = useState(null); // "menu"|"flag"|"annotate"|"suggest"

  function showToast(msg) {
    toastKey.current++;
    setToast({ msg, key: toastKey.current });
  }

  const entity = clientData?.entity || "sole-prop";

  // Load ledger from scenarios.json
  useEffect(() => {
    const base = window.PENNY_CONFIG?.baseUrl || "/";
    fetch(`${base}config/scenarios.json`)
      .then((r) => r.json())
      .then((data) => {
        const scenarioKey = clientData?.scenarioKey || clientData?.industry
          ? `${clientData.entity || "sole-prop"}.${clientData.industry}`
          : "sole-prop.consulting";
        const scenario = data.scenarios?.[scenarioKey] || data.scenarios?.["sole-prop.consulting"];
        const rows = (scenario?.drilldown?.ledger || []).map((row, i) => ({
          ...row,
          id: rowId(clientId, i),
        }));
        setLedger(rows);
      })
      .catch(() => setLedger([]))
      .finally(() => setLoading(false));
  }, [clientId, clientData]);

  // Combine ledger rows + pendingAdds
  const pendingAdds = (clientData?.pendingAdds || []).filter(
    (p) => !p.acknowledgedAt && !p.rejectedAt
  );

  const pendingAddRows = pendingAdds.map((p) => ({
    id: p.id,
    date: p.date,
    vendor: p.vendor,
    category: p.category,
    amount: p.amount,
    type: p.amount >= 0 ? "expense" : "income",
    isCpaAdded: true,
  }));

  const flags = clientData?.flags || {};
  const clientApprovals = Object.values(approvals || {}).filter(
    (a) => a.clientId === clientId
  );

  function isFlagged(id) {
    return flags[id] && !flags[id].resolvedAt;
  }

  function approvalStatus(id) {
    const a = clientApprovals.find(
      (ap) => ap.transactionId === id && ap.status === "pending"
    );
    return a ? "pending" : null;
  }

  const allRows = [...ledger, ...pendingAddRows];

  // Filtering
  const filteredRows = allRows.filter((row) => {
    if (filterCategory && !row.category?.toLowerCase().includes(filterCategory.toLowerCase()))
      return false;
    if (filterStatus === "flagged" && !isFlagged(row.id)) return false;
    if (filterStatus === "pending" && approvalStatus(row.id) !== "pending") return false;
    if (filterStatus === "cpa-added" && !row.isCpaAdded) return false;
    return true;
  });

  function handleAdd(txnFields) {
    if (!onUpdateCpa || !clientData) return;
    onUpdateCpa((prev) => {
      const result = addTransactionAsCpa(prev, clientId, txnFields, null);
      return result.newCpa;
    });
    showToast("Transaction added — pending founder acknowledgment.");
  }

  function handleFlag(reason, note) {
    if (!onUpdateCpa || !activeRow) return;
    onUpdateCpa((prev) => flagTransaction(prev, clientId, activeRow.id, reason, note));
    showToast("Transaction flagged.");
  }

  function handleAnnotate(text) {
    if (!onUpdateCpa || !activeRow) return;
    onUpdateCpa((prev) => annotateTransaction(prev, clientId, activeRow.id, text));
    showToast("Note saved.");
  }

  function handleSuggest(fromCategory, toCategory, note) {
    if (!onUpdateCpa || !activeRow) return;
    onUpdateCpa((prev) => {
      const { newCpa } = suggestReclassification(prev, clientId, activeRow.id, fromCategory, toCategory, note);
      return newCpa;
    });
    showToast("Suggestion sent to founder for approval.");
  }

  function openMenu(row) {
    setActiveRow(row);
    setOverlaySheet("menu");
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontFamily: "var(--font-sans)", fontSize: "var(--fs-body)" }}>
        Loading ledger…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", fontFamily: "var(--font-sans)" }}>

      {/* Toast */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.msg}
          onDone={() => setToast(null)}
        />
      )}

      {/* Add-txn sheet */}
      {addOpen && (
        <AddTxnSheet
          clientId={clientId}
          clientData={clientData}
          cpaAccount={cpaAccount}
          onClose={() => setAddOpen(false)}
          onAdd={handleAdd}
        />
      )}

      {/* Row overlay sheets */}
      {overlaySheet === "menu" && activeRow && (
        <RowMenuSheet
          row={activeRow}
          onClose={() => setOverlaySheet(null)}
          onFlag={() => setOverlaySheet("flag")}
          onAnnotate={() => setOverlaySheet("annotate")}
          onSuggest={() => setOverlaySheet("suggest")}
        />
      )}
      {overlaySheet === "flag" && activeRow && (
        <FlagSheet
          row={activeRow}
          onClose={() => { setOverlaySheet(null); setActiveRow(null); }}
          onSubmit={handleFlag}
        />
      )}
      {overlaySheet === "annotate" && activeRow && (
        <AnnotateSheet
          row={activeRow}
          existingAnnotations={clientData?.annotations?.[activeRow.id] || []}
          onClose={() => { setOverlaySheet(null); setActiveRow(null); }}
          onSubmit={handleAnnotate}
        />
      )}
      {overlaySheet === "suggest" && activeRow && (
        <SuggestReclassSheet
          row={activeRow}
          onClose={() => { setOverlaySheet(null); setActiveRow(null); }}
          onSubmit={handleSuggest}
        />
      )}

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 20px",
          borderBottom: "1px solid var(--line)",
          background: "var(--white)",
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        {/* Filter: category */}
        <input
          type="text"
          placeholder="Filter by category…"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{
            padding: "7px 12px",
            border: "1.5px solid var(--line)",
            borderRadius: "var(--r-pill)",
            fontSize: 13,
            fontFamily: "var(--font-sans)",
            color: "var(--ink)",
            background: "var(--white)",
            outline: "none",
            width: 180,
          }}
        />

        {/* Filter: status */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: "7px 12px",
            border: "1.5px solid var(--line)",
            borderRadius: "var(--r-pill)",
            fontSize: 13,
            fontFamily: "var(--font-sans)",
            color: "var(--ink)",
            background: "var(--white)",
            outline: "none",
          }}
        >
          <option value="all">All</option>
          <option value="flagged">Flagged</option>
          <option value="pending">Pending approval</option>
          <option value="cpa-added">Added by CPA</option>
        </select>

        <div style={{ flex: 1 }} />

        {/* Export buttons */}
        <button
          className="btn-ghost"
          onClick={() => showToast("PDF export coming soon.")}
          style={{ fontSize: 12, padding: "7px 14px" }}
        >
          Export PDF
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            const header = ["Date", "Vendor", "Category", "IRS Line", "Amount", "Status"];
            const escCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
            const csvRows = [
              header.join(","),
              ...filteredRows.map((row) => [
                row.date || "",
                row.vendor || "",
                row.category || "",
                row.irsLine || "",
                row.amount ?? "",
                row.isCpaAdded ? "CPA-added" : isFlagged(row.id) ? "Flagged" : approvalStatus(row.id) === "pending" ? "Pending" : "Cleared",
              ].map(escCsv).join(",")),
            ];
            const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ledger-${clientData?.clientName?.replace(/\s+/g, "-") || "export"}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast("CSV downloaded.");
          }}
          style={{ fontSize: 12, padding: "7px 14px" }}
        >
          Export CSV
        </button>

        {/* Add transaction */}
        <button
          onClick={() => setAddOpen(true)}
          style={{
            padding: "7px 16px",
            background: "var(--ink)",
            color: "var(--white)",
            border: "none",
            borderRadius: "var(--r-pill)",
            fontSize: 12,
            fontWeight: "var(--fw-semibold)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          + Add transaction
        </button>
      </div>

      {/* Table — responsive via CSS classes */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ≥1024px: full 7-column table */}
        <div className="books-table-desktop">
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 1fr 120px 80px 100px 48px",
              gap: 0,
              borderBottom: "1px solid var(--line)",
              background: "var(--paper)",
              padding: "0 20px",
            }}
          >
            {["Date", "Vendor", "Category", "IRS Line", "Amount", "Status", ""].map((h) => (
              <div
                key={h}
                className="eyebrow--col"
                style={{ padding: "8px 8px 8px 0" }}
              >
                {h}
              </div>
            ))}
          </div>

          {filteredRows.map((row) => {
            const flagged = isFlagged(row.id);
            const pending = approvalStatus(row.id) === "pending";
            const chipText = irsLineChip(row.category, entity);
            const isIncome = row.type === "income";

            return (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr 1fr 120px 80px 100px 48px",
                  gap: 0,
                  borderBottom: "1px solid var(--line-2)",
                  borderLeft: flagged ? "3px solid var(--error)" : "3px solid transparent",
                  background: "var(--white)",
                  padding: "0 20px",
                  alignItems: "center",
                }}
              >
                <div style={{ padding: "10px 8px 10px 0", fontSize: "var(--fs-data-row)", color: "var(--ink-3)", fontWeight: "var(--fw-regular)" }}>{row.date}</div>
                <div style={{ padding: "10px 8px 10px 0", fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.vendor}</div>
                <div style={{ padding: "10px 8px 10px 0", fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)" }}>{row.category}</div>
                <div style={{ padding: "10px 8px 10px 0" }}>
                  {chipText && (
                    <span style={{ fontFamily: "monospace", fontSize: "var(--fs-tiny)", color: "var(--ink-3)", letterSpacing: "var(--ls-chip)", textTransform: "uppercase" }}>
                      {chipText}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    padding: "10px 8px 10px 0",
                    fontSize: "var(--fs-data-row)",
                    fontWeight: "var(--fw-regular)",
                    color: isIncome ? "var(--income)" : "var(--ink)",
                    textAlign: "right",
                  }}
                >
                  {isIncome ? "+" : "−"}{fmt(row.amount)}
                </div>
                <div style={{ padding: "10px 8px 10px 0" }}>
                  {row.isCpaAdded && <Badge text="Added by CPA" />}
                  {pending && !row.isCpaAdded && <Badge text="Pending" />}
                </div>
                <div style={{ padding: "10px 0", textAlign: "center" }}>
                  <button
                    onClick={() => openMenu(row)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--ink-3)",
                      fontSize: 16,
                      padding: "2px 6px",
                      fontFamily: "var(--font-sans)",
                    }}
                    title="More actions"
                  >
                    ⋯
                  </button>
                </div>
              </div>
            );
          })}

          {filteredRows.length === 0 && (
            <div style={{ padding: "40px 20px", color: "var(--ink-4)", fontSize: "var(--fs-body)", textAlign: "center" }}>
              No transactions match the current filter.
            </div>
          )}
        </div>

        {/* 768–1023px: medium layout (IRS under category) */}
        <div className="books-table-tablet">
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 1fr 80px 40px",
              gap: 0,
              borderBottom: "1px solid var(--line)",
              background: "var(--paper)",
              padding: "0 20px",
            }}
          >
            {["Date", "Vendor", "Category", "Amount", ""].map((h) => (
              <div key={h} className="eyebrow--col" style={{ padding: "8px 8px 8px 0" }}>
                {h}
              </div>
            ))}
          </div>

          {filteredRows.map((row) => {
            const flagged = isFlagged(row.id);
            const pending = approvalStatus(row.id) === "pending";
            const chipText = irsLineChip(row.category, entity);
            const isIncome = row.type === "income";

            return (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr 1fr 80px 40px",
                  gap: 0,
                  borderBottom: "1px solid var(--line-2)",
                  borderLeft: flagged ? "3px solid var(--error)" : "3px solid transparent",
                  background: "var(--white)",
                  padding: "0 20px",
                  alignItems: "center",
                }}
              >
                <div style={{ padding: "10px 8px 10px 0", fontSize: "var(--fs-data-row)", color: "var(--ink-3)", fontWeight: "var(--fw-regular)" }}>{row.date}</div>
                <div style={{ padding: "10px 8px 10px 0", fontSize: "var(--fs-data-row)", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.vendor}</div>
                <div style={{ padding: "10px 8px 10px 0" }}>
                  <div style={{ fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)" }}>{row.category}</div>
                  {chipText && (
                    <div style={{ fontFamily: "monospace", fontSize: "var(--fs-tiny)", color: "var(--ink-3)", letterSpacing: "var(--ls-chip)", textTransform: "uppercase", marginTop: 2 }}>
                      {chipText}
                    </div>
                  )}
                  {row.isCpaAdded && <Badge text="Added by CPA" />}
                  {pending && !row.isCpaAdded && <Badge text="Pending" />}
                </div>
                <div
                  style={{
                    padding: "10px 8px 10px 0",
                    fontSize: "var(--fs-data-row)",
                    fontWeight: "var(--fw-regular)",
                    color: isIncome ? "var(--income)" : "var(--ink)",
                    textAlign: "right",
                  }}
                >
                  {isIncome ? "+" : "−"}{fmt(row.amount)}
                </div>
                <div style={{ padding: "10px 0", textAlign: "center" }}>
                  <button
                    onClick={() => showToast("Coming in Step 8.")}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 16, padding: "2px 4px", fontFamily: "var(--font-sans)" }}
                  >
                    ⋯
                  </button>
                </div>
              </div>
            );
          })}

          {filteredRows.length === 0 && (
            <div style={{ padding: "40px 20px", color: "var(--ink-4)", fontSize: "var(--fs-body)", textAlign: "center" }}>
              No transactions match the current filter.
            </div>
          )}
        </div>

        {/* ≤767px: 2-line card layout */}
        <div className="books-cards-mobile">
          {filteredRows.map((row) => {
            const flagged = isFlagged(row.id);
            const pending = approvalStatus(row.id) === "pending";
            const chipText = irsLineChip(row.category, entity);
            const isIncome = row.type === "income";

            return (
              <div
                key={row.id}
                style={{
                  borderBottom: "1px solid var(--line-2)",
                  borderLeft: flagged ? "3px solid var(--error)" : "3px solid transparent",
                  background: "var(--white)",
                  padding: "12px 20px 12px 16px",
                }}
              >
                {/* Line 1: vendor + amount */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.vendor}
                  </span>
                  <span style={{ fontSize: "var(--fs-data-row)", fontWeight: "var(--fw-regular)", color: isIncome ? "var(--income)" : "var(--ink)", flexShrink: 0 }}>
                    {isIncome ? "+" : "−"}{fmt(row.amount)}
                  </span>
                </div>
                {/* Line 2: category + date */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: "var(--fw-regular)" }}>{row.category}</span>
                  {chipText && (
                    <span style={{ fontFamily: "monospace", fontSize: "var(--fs-tiny)", color: "var(--ink-3)", letterSpacing: "var(--ls-chip)", textTransform: "uppercase" }}>
                      {chipText}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{row.date}</span>
                  {row.isCpaAdded && <Badge text="Added by CPA" />}
                  {pending && !row.isCpaAdded && <Badge text="Pending" />}
                </div>
              </div>
            );
          })}

          {filteredRows.length === 0 && (
            <div style={{ padding: "40px 20px", color: "var(--ink-4)", fontSize: "var(--fs-body)", textAlign: "center" }}>
              No transactions match the current filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
