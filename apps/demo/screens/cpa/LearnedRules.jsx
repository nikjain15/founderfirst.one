/**
 * screens/cpa/LearnedRules.jsx — Tab 6: per-client learned rules table.
 *
 * Shows only rows where active: true.
 * Delete → confirm sheet (portalled to #sheet-root-cpa) → deleteLearnedRule().
 * Empty state: "No rules yet. Corrections you approve will appear here."
 */

import React, { useState } from "react";
import { deleteLearnedRule } from "../../util/cpa-state.js";
import Sheet from "../../components/BottomSheet.jsx";
import { EMPTY_STATE_COPY } from "../../constants/ui-text.js";

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ── Confirm delete sheet (portalled) ─────────────────────────────────────────

function ConfirmDeleteSheet({ rule, onConfirm, onCancel }) {
  return (
    <Sheet open onClose={onCancel} portalTarget="#sheet-root-cpa" layout="custom" ariaLabel="Remove this rule?">
      <div style={{ padding: "4px 24px 32px", fontFamily: "var(--font-sans)" }}>
          <p
            style={{
              fontSize: 15,
              fontWeight: "var(--fw-semibold)",
              color: "var(--ink)",
              margin: "0 0 8px",
              letterSpacing: "var(--ls-tight)",
            }}
          >
            Remove this rule?
          </p>
          <p
            style={{
              fontSize: "var(--fs-data-row)",
              color: "var(--ink-3)",
              margin: "0 0 20px",
              lineHeight: 1.5,
            }}
          >
            Penny will stop applying it to future transactions.
            {rule && (
              <span style={{ display: "block", marginTop: 6, color: "var(--ink)", fontWeight: "var(--fw-medium)" }}>
                "{rule.pattern}" — {rule.fromCategory} → {rule.toCategory}
              </span>
            )}
          </p>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onConfirm}
              style={{
                flex: 1,
                padding: "13px",
                background: "var(--ink)",
                color: "var(--white)",
                border: "none",
                borderRadius: "var(--r-pill)",
                fontSize: 14,
                fontWeight: "var(--fw-semibold)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              Remove rule
            </button>
            <button
              onClick={onCancel}
              className="btn-ghost"
              style={{ flex: 1, padding: "13px", fontSize: 14 }}
            >
              Cancel
            </button>
          </div>
        </div>
    </Sheet>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LearnedRules({ clientId, clientData, onUpdateCpa }) {
  const [confirmRule, setConfirmRule] = useState(null);

  const rules = (clientData?.learnedRules || []).filter((r) => r.active);

  function handleDelete(rule) {
    setConfirmRule(rule);
  }

  function handleConfirmDelete() {
    if (!confirmRule || !onUpdateCpa) { setConfirmRule(null); return; }
    onUpdateCpa((prev) => deleteLearnedRule(prev, clientId, confirmRule.id));
    setConfirmRule(null);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", fontFamily: "var(--font-sans)", position: "relative" }}>

      {confirmRule && (
        <ConfirmDeleteSheet
          rule={confirmRule}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmRule(null)}
        />
      )}

      {rules.length === 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "60px 24px",
            textAlign: "center",
            color: "var(--ink-4)",
            fontSize: "var(--fs-body)",
          }}
        >
          {EMPTY_STATE_COPY.cpaLearnedRulesEmpty}
        </div>
      ) : (
        <>
          {/* Desktop/tablet table */}
          <div className="rules-table-wide">
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 100px 120px 80px",
                borderBottom: "1px solid var(--line)",
                background: "var(--paper)",
                padding: "0 20px",
              }}
            >
              {["Vendor / Pattern", "Original Category", "Corrected Category", "Date", "Suggested by", ""].map((h) => (
                <div key={h} className="eyebrow--col" style={{ padding: "8px 8px 8px 0" }}>
                  {h}
                </div>
              ))}
            </div>

            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 100px 120px 80px",
                  borderBottom: "1px solid var(--line-2)",
                  background: "var(--white)",
                  padding: "0 20px",
                  alignItems: "center",
                }}
              >
                <div style={{ padding: "11px 8px 11px 0", fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)", fontFamily: "monospace" }}>{rule.pattern}</div>
                <div style={{ padding: "11px 8px 11px 0", fontSize: "var(--fs-data-row)", color: "var(--ink-3)", fontWeight: "var(--fw-regular)" }}>{rule.fromCategory}</div>
                <div style={{ padding: "11px 8px 11px 0", fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)" }}>{rule.toCategory}</div>
                <div style={{ padding: "11px 8px 11px 0", fontSize: "var(--fs-data-row)", color: "var(--ink-3)", fontWeight: "var(--fw-regular)" }}>{formatDate(rule.approvedAt)}</div>
                <div style={{ padding: "11px 8px 11px 0", fontSize: "var(--fs-data-row)", color: "var(--ink-3)", fontWeight: "var(--fw-regular)", textTransform: "capitalize" }}>{rule.suggestedBy}</div>
                <div style={{ padding: "11px 0" }}>
                  <button
                    onClick={() => handleDelete(rule)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--error)",
                      fontSize: 12,
                      fontWeight: "var(--fw-medium)",
                      fontFamily: "var(--font-sans)",
                      padding: 0,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: stacked cards */}
          <div className="rules-cards-mobile">
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--line-2)",
                  background: "var(--white)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontFamily: "monospace", fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)" }}>{rule.pattern}</span>
                  <button
                    onClick={() => handleDelete(rule)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--error)", fontSize: 12, fontWeight: "var(--fw-medium)", fontFamily: "var(--font-sans)", padding: 0, flexShrink: 0 }}
                  >
                    Delete
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                  {rule.fromCategory} → {rule.toCategory}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                  {formatDate(rule.approvedAt)} · Suggested by {rule.suggestedBy}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
