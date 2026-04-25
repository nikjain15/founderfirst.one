/**
 * screens/cpa/CashFlow.jsx — Tab 4: Cash Flow Statement (GAAP indirect method).
 *
 * Sections: Operating · Investing · Financing.
 * Toggle: Monthly / Quarterly / Annual (demo: all show same data).
 * Export PDF + CSV — .btn-ghost, stub to toast.
 *
 * Bucket mapping via util/cashFlow.js:categorizeCashFlow().
 */

import React, { useState, useEffect, useRef } from "react";
import { categorizeCashFlow } from "../../util/cashFlow.js";
import Toast from "../../components/Toast.jsx";
import { TOAST_COPY } from "../../constants/copy.js";
import { DEFAULT_SCENARIO_KEY, scenarioKeyFor } from "../../constants/variants.js";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(n));

const PERIODS = ["Monthly", "Quarterly", "Annual"];

function CashSection({ title, items, net }) {
  if (items.length === 0 && net === 0) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="eyebrow--col" style={{ marginBottom: 8 }}>{title}</div>
      {items.map((item, i) => (
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
            {item.label}
          </span>
          <span
            style={{
              fontSize: "var(--fs-data-row)",
              color: item.value >= 0 ? "var(--income)" : "var(--ink)",
              fontWeight: "var(--fw-regular)",
              textAlign: "right",
            }}
          >
            {item.value >= 0 ? fmt(item.value) : `(${fmt(item.value)})`}
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
        <span style={{ fontSize: "var(--fs-data-row)", fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>
          Net cash from {title.toLowerCase()}
        </span>
        <span
          style={{
            fontSize: "var(--fs-data-row)",
            fontWeight: "var(--fw-semibold)",
            color: net >= 0 ? "var(--income)" : "var(--error)",
          }}
        >
          {net >= 0 ? fmt(net) : `(${fmt(net)})`}
        </span>
      </div>
    </div>
  );
}

export default function CashFlow({ clientId, clientData }) {
  const [period, setPeriod] = useState("Annual");
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const toastKey = useRef(0);

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
          scenarioKeyFor(clientData?.entity, clientData?.industry);
        const scenario = data.scenarios?.[scenarioKey] || data.scenarios?.[DEFAULT_SCENARIO_KEY];
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

  // Bucket each ledger row
  const operating = [];
  const investing = [];
  const financing = [];

  for (const row of ledger) {
    const bucket = row.type === "income" ? "operating" : categorizeCashFlow(row.category);
    const value = row.type === "income" ? row.amount : -row.amount;
    const item = { label: row.category || row.vendor, value };
    if (bucket === "operating") operating.push(item);
    else if (bucket === "investing") investing.push(item);
    else financing.push(item);
  }

  const netOperating = operating.reduce((s, i) => s + i.value, 0);
  const netInvesting = investing.reduce((s, i) => s + i.value, 0);
  const netFinancing = financing.reduce((s, i) => s + i.value, 0);
  const netChange = netOperating + netInvesting + netFinancing;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", fontFamily: "var(--font-sans)" }}>

      {toast && <Toast key={toast.key} message={toast.msg} onDone={() => setToast(null)} bottom={24} />}

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

      {/* Cash Flow content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px" }}>
        <div style={{ maxWidth: 560 }}>

          <CashSection title="Operating Activities" items={operating} net={netOperating} />
          <CashSection title="Investing Activities" items={investing} net={netInvesting} />
          <CashSection title="Financing Activities" items={financing} net={netFinancing} />

          {/* Net change in cash */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: "2px solid var(--ink)",
              marginTop: 8,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: "var(--fw-bold)", color: "var(--ink)", letterSpacing: "var(--ls-tight)" }}>
              Net change in cash
            </span>
            <span
              style={{
                fontSize: 15,
                fontWeight: "var(--fw-bold)",
                color: netChange >= 0 ? "var(--income)" : "var(--error)",
                letterSpacing: "var(--ls-tight)",
              }}
            >
              {netChange >= 0 ? fmt(netChange) : `(${fmt(netChange)})`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
