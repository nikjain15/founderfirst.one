/**
 * screens/cpa/WorkQueue.jsx — Tab 1: per-client work queue.
 *
 * Priority order (types from constants/variants.js → APPROVAL_TYPES):
 *  1. RECLASSIFICATION | CPA_ADDED_TXN + status pending → var(--error) dot
 *  2. pendingAdds with no category → var(--amber) dot
 *  3. flags[txnId] not resolvedAt → var(--ink-3) dot
 *  4. PENNY_QUESTION + status pending → var(--sage) dot
 *
 * Collapsible "Resolved" section below active items.
 * Auto-archive resolved items older than 7 days.
 *
 * Action sheets:
 *  View       → reclassification/cpa-added-txn detail — Retract or Close
 *  Categorize → category picker for uncategorized pendingAdds
 *  Resolve    → confirm mark flag as resolved
 *  Answer     → text input to dismiss a penny-question
 */

import React, { useState } from "react";
import Sheet from "../../components/BottomSheet.jsx";
import { rejectApproval } from "../../util/cpa-state.js";
import { APPROVAL_TYPES } from "../../constants/app-config.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const CATEGORIES = [
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
  }).format(n);

function ageStr(ms) {
  const diff = Date.now() - ms;
  const d = Math.floor(diff / (24 * 3600 * 1000));
  if (d > 0) return `${d}d`;
  const h = Math.floor(diff / 3600000);
  if (h > 0) return `${h}h`;
  return `${Math.max(1, Math.floor(diff / 60000))}m`;
}

/** Filled-circle SVG status dot — 12×12 viewBox, r=4. */
function StatusDot({ color }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{ flexShrink: 0, color }}
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="4" fill="currentColor" />
    </svg>
  );
}

function QueueRow({ dot, description, age, cta, onCta, founderNote }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "12px 0",
        borderBottom: "1px solid var(--line-2)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ paddingTop: 3 }}>
        <StatusDot color={dot} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--fs-data-row)",
            fontWeight: "var(--fw-regular)",
            color: "var(--ink)",
            lineHeight: 1.4,
          }}
        >
          {description}
        </div>
        {founderNote && (
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              marginTop: 3,
              fontStyle: "italic",
            }}
          >
            "{founderNote}"
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--ink-4)",
            fontWeight: "var(--fw-regular)",
          }}
        >
          {age}
        </span>
        {cta && (
          <button
            onClick={onCta}
            style={{
              padding: "5px 12px",
              background: "var(--ink)",
              color: "var(--white)",
              border: "none",
              borderRadius: "var(--r-pill)",
              fontSize: 12,
              fontWeight: "var(--fw-semibold)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              whiteSpace: "nowrap",
            }}
          >
            {cta}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Action sheet (portalled) ─────────────────────────────────────────────────

function ActionSheet({ item, clientData, onClose, onUpdateCpa, clientId }) {
  const [catInput, setCatInput] = useState("");
  const [answerInput, setAnswerInput] = useState("");

  function handleRetract() {
    if (!item.approvalId || !onUpdateCpa) { onClose(); return; }
    onUpdateCpa((prev) => rejectApproval(prev, item.approvalId, "Retracted by CPA."));
    onClose();
  }

  function handleResolveFlag() {
    if (!item.txnId || !onUpdateCpa) { onClose(); return; }
    onUpdateCpa((prev) => {
      const client = prev.clients?.[clientId];
      if (!client) return prev;
      const flag = client.flags?.[item.txnId];
      if (!flag) return prev;
      return {
        ...prev,
        clients: {
          ...prev.clients,
          [clientId]: {
            ...client,
            flags: {
              ...client.flags,
              [item.txnId]: { ...flag, resolvedAt: Date.now() },
            },
          },
        },
      };
    });
    onClose();
  }

  function handleCategorize() {
    const cat = catInput.trim();
    if (!cat || !item.pendingAddId || !onUpdateCpa) { onClose(); return; }
    onUpdateCpa((prev) => {
      const client = prev.clients?.[clientId];
      if (!client) return prev;
      return {
        ...prev,
        clients: {
          ...prev.clients,
          [clientId]: {
            ...client,
            pendingAdds: (client.pendingAdds || []).map((p) =>
              p.id === item.pendingAddId ? { ...p, category: cat } : p
            ),
          },
        },
      };
    });
    onClose();
  }

  function handleAnswerQuestion() {
    if (!item.approvalId || !onUpdateCpa) { onClose(); return; }
    // Dismiss the question by rejecting (marking as resolved from CPA side)
    onUpdateCpa((prev) => rejectApproval(prev, item.approvalId, answerInput.trim() || "Addressed."));
    onClose();
  }

  const sheetContent = (() => {
    if (item.ctaType === "view") {
      return (
        <>
          <p style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", color: "var(--ink)", margin: "0 0 8px", letterSpacing: "var(--ls-tight)" }}>
            {item.approvalType === APPROVAL_TYPES.RECLASSIFICATION ? "Reclassification pending" : "Added transaction pending"}
          </p>
          <p style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)", margin: "0 0 16px", lineHeight: 1.5 }}>
            {item.fullDescription}
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-4)", margin: "0 0 20px" }}>
            Waiting for founder to approve. You can retract this suggestion.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleRetract}
              style={{ flex: 1, padding: "13px", background: "none", color: "var(--error)", border: "1.5px solid var(--line)", borderRadius: "var(--r-pill)", fontSize: 14, fontWeight: "var(--fw-semibold)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
            >
              Retract
            </button>
            <button onClick={onClose} className="btn-ghost" style={{ flex: 1, padding: "13px", fontSize: 14 }}>
              Close
            </button>
          </div>
        </>
      );
    }

    if (item.ctaType === "resolve") {
      return (
        <>
          <p style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", color: "var(--ink)", margin: "0 0 8px", letterSpacing: "var(--ls-tight)" }}>
            Mark flag as resolved?
          </p>
          <p style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)", margin: "0 0 20px", lineHeight: 1.5 }}>
            {item.fullDescription}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleResolveFlag}
              style={{ flex: 1, padding: "13px", background: "var(--ink)", color: "var(--white)", border: "none", borderRadius: "var(--r-pill)", fontSize: 14, fontWeight: "var(--fw-semibold)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
            >
              Mark resolved
            </button>
            <button onClick={onClose} className="btn-ghost" style={{ flex: 1, padding: "13px", fontSize: 14 }}>
              Cancel
            </button>
          </div>
        </>
      );
    }

    if (item.ctaType === "categorize") {
      return (
        <>
          <p style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", color: "var(--ink)", margin: "0 0 4px", letterSpacing: "var(--ls-tight)" }}>
            Assign category
          </p>
          <p style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)", margin: "0 0 16px" }}>
            {item.fullDescription}
          </p>
          <select
            value={catInput}
            onChange={(e) => setCatInput(e.target.value)}
            style={{
              width: "100%",
              padding: "11px 14px",
              border: "1.5px solid var(--line)",
              borderRadius: "var(--r-pill)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
              color: catInput ? "var(--ink)" : "var(--ink-4)",
              background: "var(--white)",
              outline: "none",
              marginBottom: 16,
              boxSizing: "border-box",
            }}
          >
            <option value="">Select a category…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleCategorize}
              disabled={!catInput}
              style={{ flex: 1, padding: "13px", background: catInput ? "var(--ink)" : "var(--line)", color: catInput ? "var(--white)" : "var(--ink-4)", border: "none", borderRadius: "var(--r-pill)", fontSize: 14, fontWeight: "var(--fw-semibold)", cursor: catInput ? "pointer" : "default", fontFamily: "var(--font-sans)" }}
            >
              Save category
            </button>
            <button onClick={onClose} className="btn-ghost" style={{ flex: 1, padding: "13px", fontSize: 14 }}>
              Cancel
            </button>
          </div>
        </>
      );
    }

    if (item.ctaType === "answer") {
      return (
        <>
          <p style={{ fontSize: 15, fontWeight: "var(--fw-semibold)", color: "var(--ink)", margin: "0 0 4px", letterSpacing: "var(--ls-tight)" }}>
            Penny question
          </p>
          <p style={{ fontSize: "var(--fs-data-row)", color: "var(--ink-3)", margin: "0 0 16px", lineHeight: 1.5 }}>
            {item.fullDescription}
          </p>
          <textarea
            value={answerInput}
            onChange={(e) => setAnswerInput(e.target.value)}
            placeholder="Your answer…"
            rows={3}
            style={{
              width: "100%",
              padding: "11px 14px",
              border: "1.5px solid var(--line)",
              borderRadius: "12px",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
              color: "var(--ink)",
              background: "var(--white)",
              outline: "none",
              resize: "vertical",
              marginBottom: 16,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleAnswerQuestion}
              style={{ flex: 1, padding: "13px", background: "var(--ink)", color: "var(--white)", border: "none", borderRadius: "var(--r-pill)", fontSize: 14, fontWeight: "var(--fw-semibold)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
            >
              Submit answer
            </button>
            <button onClick={onClose} className="btn-ghost" style={{ flex: 1, padding: "13px", fontSize: 14 }}>
              Cancel
            </button>
          </div>
        </>
      );
    }

    return null;
  })();

  return (
    <Sheet open onClose={onClose} portalTarget="#sheet-root-cpa" layout="custom" ariaLabel="Work queue action">
      <div style={{ padding: "4px 24px 32px", fontFamily: "var(--font-sans)" }}>
        {sheetContent}
      </div>
    </Sheet>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WorkQueue({ clientId, clientData, approvals, cpaAccount, onUpdateCpa }) {
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState(null); // item object

  if (!clientData) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--ink-4)",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-body)",
        }}
      >
        No client data.
      </div>
    );
  }

  const now = Date.now();
  const clientApprovals = Object.values(approvals || {}).filter(
    (a) => a.clientId === clientId
  );
  const flags = clientData.flags || {};
  const pendingAdds = clientData.pendingAdds || [];

  // ── Active items ─────────────────────────────────────────────────────────

  // Priority 1: reclassification / cpa-added-txn pending
  const p1 = clientApprovals
    .filter(
      (a) =>
        (a.type === APPROVAL_TYPES.RECLASSIFICATION || a.type === APPROVAL_TYPES.CPA_ADDED_TXN) &&
        a.status === "pending"
    )
    .map((a) => {
      let description;
      let fullDescription;
      if (a.type === APPROVAL_TYPES.RECLASSIFICATION) {
        description = `Reclassify: ${a.fromCategory} → ${a.toCategory}`;
        fullDescription = description + (a.note ? ` — ${a.note}` : "");
        if (a.note) description += ` — ${a.note}`;
      } else {
        description = `Added: ${a.toCategory || "transaction"} — pending founder acknowledgment`;
        fullDescription = description + (a.note ? `. ${a.note}` : "");
        if (a.note) description += `. ${a.note}`;
      }
      return {
        key: a.id,
        dot: "var(--error)",
        description,
        fullDescription,
        age: ageStr(a.createdAt),
        cta: "View",
        ctaType: "view",
        approvalId: a.id,
        approvalType: a.type,
        founderNote: null,
      };
    });

  // Priority 2: pendingAdds with no category (uncategorized)
  const p2 = pendingAdds
    .filter((p) => !p.category && !p.acknowledgedAt && !p.rejectedAt)
    .map((p) => ({
      key: `uncategorized-${p.id}`,
      dot: "var(--amber)",
      description: `${p.vendor} — needs category (added ${fmt(p.amount)})`,
      fullDescription: `${p.vendor} — ${fmt(p.amount)} added without a category.`,
      age: ageStr(p.addedAt),
      cta: "Categorize",
      ctaType: "categorize",
      pendingAddId: p.id,
      founderNote: null,
    }));

  // Priority 3: flags not resolvedAt
  const p3 = Object.entries(flags)
    .filter(([, f]) => !f.resolvedAt)
    .map(([txnId, f]) => {
      const reasonLabel = {
        "needs-receipt": "Missing receipt",
        reclassify: "Needs reclassification",
        "confirm-with-client": "Confirm with client",
      }[f.reason] || f.reason;
      const description = `${reasonLabel}${f.note ? ` — ${f.note}` : ""}`;
      return {
        key: `flag-${txnId}`,
        dot: "var(--ink-3)",
        description,
        fullDescription: description,
        age: ageStr(f.flaggedAt),
        cta: "Resolve",
        ctaType: "resolve",
        txnId,
        founderNote: null,
      };
    });

  // Priority 4: penny-question pending
  const p4 = clientApprovals
    .filter((a) => a.type === APPROVAL_TYPES.PENNY_QUESTION && a.status === "pending")
    .map((a) => ({
      key: a.id,
      dot: "var(--sage)",
      description: a.note || "Penny question — input needed",
      fullDescription: a.note || "Penny question — input needed",
      age: ageStr(a.createdAt),
      cta: "Answer",
      ctaType: "answer",
      approvalId: a.id,
      founderNote: null,
    }));

  const activeItems = [...p1, ...p2, ...p3, ...p4];

  // ── Resolved items (auto-archive after 7 days) ───────────────────────────
  const resolvedItems = clientApprovals
    .filter(
      (a) =>
        (a.status === "approved" || a.status === "rejected") &&
        a.resolvedAt &&
        now - a.createdAt < SEVEN_DAYS_MS
    )
    .map((a) => {
      let description;
      if (a.type === APPROVAL_TYPES.RECLASSIFICATION) {
        description = `Reclassify: ${a.fromCategory} → ${a.toCategory}`;
      } else if (a.type === APPROVAL_TYPES.CPA_ADDED_TXN) {
        description = `Added transaction (${a.toCategory || "—"})`;
      } else if (a.type === APPROVAL_TYPES.YEAR_ACCESS_REQUEST) {
        description = `Year access request — ${a.note}`;
      } else {
        description = a.note || a.type;
      }
      const statusLabel = a.status === "approved" ? "Approved" : "Declined";
      return {
        key: a.id,
        dot: a.status === "approved" ? "var(--ink-3)" : "var(--error)",
        description: `${statusLabel}: ${description}`,
        age: ageStr(a.resolvedAt),
        cta: null,
        founderNote: a.founderNote,
      };
    });

  // Also show resolved flags in the resolved section
  const resolvedFlags = Object.entries(flags)
    .filter(([, f]) => f.resolvedAt)
    .map(([txnId, f]) => {
      const reasonLabel = {
        "needs-receipt": "Missing receipt",
        reclassify: "Needs reclassification",
        "confirm-with-client": "Confirm with client",
      }[f.reason] || f.reason;
      return {
        key: `resolved-flag-${txnId}`,
        dot: "var(--ink-3)",
        description: `Resolved: ${reasonLabel}${f.note ? ` — ${f.note}` : ""}`,
        age: ageStr(f.resolvedAt),
        cta: null,
        founderNote: null,
      };
    });

  const allResolved = [...resolvedItems, ...resolvedFlags];

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px var(--pad-screen)",
        fontFamily: "var(--font-sans)",
        position: "relative",
      }}
    >
      {/* Action sheet */}
      {activeSheet && (
        <ActionSheet
          item={activeSheet}
          clientData={clientData}
          clientId={clientId}
          onClose={() => setActiveSheet(null)}
          onUpdateCpa={onUpdateCpa}
        />
      )}

      {/* Active items */}
      {activeItems.length === 0 ? (
        <div
          style={{
            padding: "40px 0",
            textAlign: "center",
            color: "var(--ink-4)",
            fontSize: "var(--fs-body)",
          }}
        >
          No open items for this client.
        </div>
      ) : (
        <div>
          {activeItems.map((item) => (
            <QueueRow
              key={item.key}
              dot={item.dot}
              description={item.description}
              age={item.age}
              cta={item.cta}
              onCta={() => setActiveSheet(item)}
              founderNote={item.founderNote}
            />
          ))}
        </div>
      )}

      {/* Resolved section */}
      {allResolved.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <button
            onClick={() => setResolvedOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: "var(--ink-3)",
              fontSize: 12,
              fontWeight: "var(--fw-semibold)",
              fontFamily: "var(--font-sans)",
              letterSpacing: "var(--ls-eyebrow)",
              textTransform: "uppercase",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: resolvedOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
              }}
            >
              <polyline points="4 2 8 6 4 10" />
            </svg>
            Resolved ({allResolved.length})
          </button>

          {resolvedOpen && (
            <div style={{ marginTop: 12 }}>
              {allResolved.map((item) => (
                <QueueRow
                  key={item.key}
                  dot={item.dot}
                  description={item.description}
                  age={item.age}
                  cta={null}
                  founderNote={item.founderNote}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
