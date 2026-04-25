/**
 * screens/cpa/ProfitLoss.jsx — Tab 3: P&L Statement.
 *
 * Grouped by IRS form section via groupByIrsLine() from util/irsLookup.js.
 * Toggle: Monthly / Quarterly / Annual (all show same data in demo — demo only).
 * Footer: Preview tax form link → stub toast.
 * Export PDF + CSV — .btn-ghost, stub to toast.
 */

import React, { useState, useEffect, useRef } from "react";
import { groupByIrsLine } from "../../util/irsLookup.js";
import Toast from "../../components/Toast.jsx";
import { ENTITY_TYPES, INDUSTRY_KEYS, formLabelForEntity } from "../../constants/variants.js";
import { TOAST_COPY } from "../../constants/copy.js";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(n));

const PERIODS = ["Monthly", "Quarterly", "Annual"];

export default function ProfitLoss({ clientId, clientData }) {
  const [period, setPeriod] = useState("Annual");
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const toastKey = useRef(0);

  const entity = clientData?.entity || ENTITY_TYPES.SOLE_PROP;
  const formLabel = formLabelForEntity(entity);

  function showToast(msg) {
    toastKey.current++;
    setToast({ msg, key: toastKey.current });
  }

  useEffect(() => {
    const base = window.PENNY_CONFIG?.baseUrl || "/";
    fetch(`${base}config/scenarios.json`)
      .then((r) => r.json())
      .then((data) => {
        const scenarioKey = clientData?.scenarioKey ||
          `${clientData?.entity || ENTITY_TYPES.SOLE_PROP}.${clientData?.industry || INDUSTRY_KEYS.CONSULTING}`;
        const scenario = data.scenarios?.[scenarioKey] || data.scenarios?.[`${ENTITY_TYPES.SOLE_PROP}.${INDUSTRY_KEYS.CONSULTING}`];
        setLedger(scenario?.drilldown?.ledger || []);
      })
      .catch(() => setLedger([]))
      .finally(() => setLoading(false));
  }, [clientId, clientData]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontFamily: "var(--font-sans)", fontSize: "var(--fs-body)" }}>
        Loading…
      </div>
    );
  }

  const incomeRows = ledger.filter((r) => r.type === "income");
  const expenseRows = ledger.filter((r) => r.type === "expense");

  const totalRevenue = incomeRows.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = expenseRows.reduce((sum, r) => sum + r.amount, 0);
  const netIncome = totalRevenue - totalExpenses;

  // Group expenses by IRS line
  const grouped = groupByIrsLine(expenseRows, entity);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", fontFamily: "var(--font-sans)" }}>

      {toast && (
        <Toast key={toast.key} message={toast.msg} onDone={() => setToast(null)} bottom={24} />
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
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {/* Period toggle */}
        <div
          style={{
            display: "flex",
            border: "1.5px solid var(--line)",
            borderRadius: "var(--r-pill)",
            overflow: "hidden",
          }}
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "6px 14px",
                border: "none",
                background: period === p ? "var(--ink)" : "var(--white)",
                color: period === p ? "var(--white)" : "var(--ink-3)",
                fontSize: 12,
                fontWeight: "var(--fw-semibold)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                transition: "background 0.12s",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button className="btn-ghost" onClick={() => showToast(TOAST_COPY.cpaExportReadyDemo)} style={{ fontSize: 12, padding: "7px 14px" }}>
          Export PDF
        </button>
        <button className="btn-ghost" onClick={() => showToast(TOAST_COPY.cpaExportReadyDemo)} style={{ fontSize: 12, padding: "7px 14px" }}>
          Export CSV
        </button>
      </div>

      {/* P&L content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        <div style={{ maxWidth: 640 }}>

          {/* Revenue section */}
          <div style={{ marginBottom: 8 }}>
            <div className="eyebrow--col" style={{ marginBottom: 8 }}>Revenue</div>
            {incomeRows.map((row, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "5px 0",
                  borderBottom: "1px solid var(--line-2)",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)", flex: 1 }}>
                  {row.category || row.vendor}
                </span>
                <span style={{ fontSize: "var(--fs-data-row)", color: "var(--income)", fontWeight: "var(--fw-regular)", textAlign: "right" }}>
                  {fmt(row.amount)}
                </span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderTop: "1.5px solid var(--ink)",
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: "var(--fs-data-row)", fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>Total Revenue</span>
              <span style={{ fontSize: "var(--fs-data-row)", fontWeight: "var(--fw-semibold)", color: "var(--income)" }}>{fmt(totalRevenue)}</span>
            </div>
          </div>

          {/* Expenses section */}
          <div style={{ marginBottom: 8, marginTop: 24 }}>
            <div className="eyebrow--col" style={{ marginBottom: 8 }}>Expenses</div>
            {grouped.map((group) => (
              <div key={group.lineLabel} style={{ marginBottom: 12 }}>
                {/* IRS line header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "var(--fs-tiny)",
                      color: "var(--ink-3)",
                      letterSpacing: "var(--ls-chip)",
                      textTransform: "uppercase",
                    }}
                  >
                    {group.lineLabel}
                  </span>
                </div>
                {group.items.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      padding: "4px 0 4px 12px",
                      borderBottom: "1px solid var(--line-2)",
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)", flex: 1 }}>
                      {row.category}
                    </span>
                    <span style={{ fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-regular)", textAlign: "right" }}>
                      ({fmt(row.amount)})
                    </span>
                  </div>
                ))}
                {/* Line subtotal */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "5px 0 5px 12px",
                    borderBottom: "1px solid var(--line)",
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: "var(--fw-medium)" }}>
                    Subtotal
                  </span>
                  <span style={{ fontSize: "var(--fs-data-row)", color: "var(--ink)", fontWeight: "var(--fw-medium)", textAlign: "right" }}>
                    ({fmt(group.subtotal)})
                  </span>
                </div>
              </div>
            ))}

            {/* Total Expenses */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderTop: "1.5px solid var(--ink)",
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: "var(--fs-data-row)", fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>Total Expenses</span>
              <span style={{ fontSize: "var(--fs-data-row)", fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>({fmt(totalExpenses)})</span>
            </div>
          </div>

          {/* Net Income */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: "2px solid var(--ink)",
              marginTop: 8,
            }}
          >
            <span
              style={{
                fontSize: 15,
                fontWeight: "var(--fw-bold)",
                color: "var(--ink)",
                letterSpacing: "var(--ls-tight)",
              }}
            >
              Net Income
            </span>
            <span
              style={{
                fontSize: 15,
                fontWeight: "var(--fw-bold)",
                color: netIncome >= 0 ? "var(--income)" : "var(--error)",
                letterSpacing: "var(--ls-tight)",
              }}
            >
              {netIncome >= 0 ? fmt(netIncome) : `(${fmt(netIncome)})`}
            </span>
          </div>

          {/* Footer: preview form */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line-2)" }}>
            <button
              onClick={() => showToast(TOAST_COPY.cpaExportReadyDemo)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-3)",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              Preview {formLabelForEntity(entity)}
            </button>
            <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 8, fontFamily: "var(--font-sans)" }}>
              CPA review required before filing.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
