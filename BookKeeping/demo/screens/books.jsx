/**
 * screens/books.jsx — My Books (Tab 3).
 *
 * Four zones: stat cards · Needs a look · Coming up · drill-downs.
 * Ask Penny bar at the bottom submits books.qa and renders the answer inline.
 * Drill-downs: P&L · Expenses by category · Income by client · Full ledger.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { ApprovalCard } from "./card.jsx";
import { groupByIrsLine, formLabelForEntity } from "../util/irsLookup.js";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);


// ── Send to CPA sheet ─────────────────────────────────────────────────────────

function SendToCPASheet({ persona, ledger, ddData, onClose, showToast }) {
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const cpaName  = persona?.cpaName  || "";
  const cpaEmail = persona?.cpaEmail || "";

  const month = ledger?.month || "This month";
  const net   = ledger ? fmt(ledger.takehome) : "—";

  const pl = ddData?.pl;
  const totalIncome   = pl ? pl.incomeLines.reduce((s, l) => s + l.amount, 0) : null;
  const totalExpenses = pl ? pl.expenseLines.reduce((s, l) => s + l.amount, 0) : null;

  function handleSend() {
    setSent(true);
    setTimeout(() => {
      onClose();
      showToast(`Books sent to ${cpaName || cpaEmail || "your CPA"} ✓`);
    }, 1400);
  }

  const root = document.getElementById("sheet-root") || document.querySelector(".phone") || document.body;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: "92%", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px 10px 20px",
          borderBottom: "1px solid var(--line-2)", flexShrink: 0,
        }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: "var(--fw-semibold)" }}>Send to CPA</p>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{
              background: "none", border: "none", color: "var(--ink-3)",
              cursor: "pointer", padding: 4, minWidth: "unset", minHeight: "unset",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px" }}>

          {/* To field */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>To</p>
            <div className="card" style={{ padding: "12px 16px" }}>
              {cpaEmail ? (
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: "var(--fw-medium)" }}>{cpaName || cpaEmail}</p>
                  {cpaName && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-4)" }}>{cpaEmail}</p>}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: "var(--ink-4)" }}>
                  No CPA email saved — add one in Profile settings.
                </p>
              )}
            </div>
          </div>

          {/* P&L preview */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>Summary · {month}</p>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {[
                { label: "Total income",   value: totalIncome   != null ? fmt(totalIncome)   : "—", color: "var(--ink)" },
                { label: "Total expenses", value: totalExpenses != null ? `(${fmt(totalExpenses)})` : "—", color: "var(--ink-3)" },
                { label: "Net",            value: net,  color: "var(--ink)", bold: true },
              ].map((row, i, arr) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--line-2)" : "none",
                }}>
                  <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: row.bold ? "var(--fw-semibold)" : "var(--fw-medium)", color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Optional note */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: "var(--fw-semibold)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)" }}>Note (optional)</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything you'd like to flag for your CPA…"
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                border: "1px solid var(--line)", borderRadius: "var(--r-card)",
                padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-sans)",
                color: "var(--ink)", background: "var(--white)", resize: "none",
                outline: "none", lineHeight: 1.5,
              }}
            />
          </div>
        </div>

        {/* Send button */}
        <div style={{ padding: "12px 20px 32px", borderTop: "1px solid var(--line-2)", flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleSend}
            disabled={!cpaEmail || sent}
            style={{
              width: "100%", padding: "14px 0",
              background: sent ? "var(--ink-4)" : "var(--ink)",
              color: "var(--white)", border: "none",
              borderRadius: "var(--r-pill)", fontSize: 15,
              fontWeight: "var(--fw-semibold)", cursor: cpaEmail && !sent ? "pointer" : "default",
              fontFamily: "var(--font-sans)",
              transition: "background 300ms",
            }}
          >
            {sent ? "Sending…" : `Send to ${cpaName || "CPA"}`}
          </button>
          {!cpaEmail && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-4)", textAlign: "center" }}>
              Add a CPA email in Profile to enable sending.
            </p>
          )}
        </div>
      </div>
    </div>,
    root
  );
}

const DRILLDOWNS = [
  { slug: "pl",       label: "P&L this month" },
  { slug: "expenses", label: "Expenses by category" },
  { slug: "income",   label: "Income by client" },
  { slug: "ledger",   label: "Full ledger" },
];

// ── SVG helpers ───────────────────────────────────────────────────────────────

const Svg = ({ size = 16, sw = 1.5, children, ...rest }) => (
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none"
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
    {...rest}>
    {children}
  </svg>
);

const ChevronRight = () => (
  <Svg>
    <polyline points="6 4 10 8 6 12" />
  </Svg>
);

const XIcon = () => (
  <Svg size={18} sw={1.5}>
    <line x1="4" y1="4" x2="14" y2="14" />
    <line x1="14" y1="4" x2="4" y2="14" />
  </Svg>
);

const MicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="1" width="6" height="11" rx="3" />
    <path d="M3 10a8 8 0 0 0 16 0" />
    <line x1="11" y1="18" x2="11" y2="21" />
    <line x1="8" y1="21" x2="14" y2="21" />
  </svg>
);

const SendIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="14" x2="8" y2="3" />
    <polyline points="4 7 8 3 12 7" />
  </svg>
);

const VOICE_PROMPTS = [
  "How am I doing this month?",
  "What's my biggest expense category?",
  "Am I on track to hit last month's income?",
  "Any unusual spending I should know about?",
];

function VoiceAskModal({ onDone, onClose }) {
  const [step, setStep] = useState("recording");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (step !== "recording") return;
    const tick = setInterval(() => setSeconds(s => s + 1), 1000);
    const auto = setTimeout(() => { clearInterval(tick); setStep("processing"); }, 3000);
    return () => { clearInterval(tick); clearTimeout(auto); };
  }, [step]);

  useEffect(() => {
    if (step !== "processing") return;
    const t = setTimeout(() => {
      const q = VOICE_PROMPTS[Math.floor(Math.random() * VOICE_PROMPTS.length)];
      onDone(q);
    }, 800);
    return () => clearTimeout(t);
  }, [step, onDone]);

  const BARS = [6,18,32,14,40,22,8,36,12,28,44,10,30,16,42,20,6,38,24,10];

  return (
    <div style={{
      position: "absolute", inset: 0, background: "rgba(10,10,10,0.92)",
      zIndex: 300, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 28,
    }}>
      <button onClick={onClose} style={{
        position: "absolute", top: 20, right: 20, background: "none", border: "none",
        color: "rgba(255,255,255,0.4)", cursor: "pointer", minWidth: 0, minHeight: 0,
        fontSize: 22, lineHeight: 1,
      }}>✕</button>

      <div style={{ position: "relative", width: 72, height: 72 }}>
        {step === "recording" && [0, 1].map(i => (
          <div key={i} style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,0.18)",
            animation: "pulseRing 1.8s ease-out infinite",
            animationDelay: `${i * 0.6}s`,
          }} />
        ))}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: step === "recording" ? "var(--white)" : "rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 300ms",
        }}>
          {step === "recording"
            ? <MicIcon style={{ color: "var(--ink)", width: 28, height: 28 }} />
            : <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="9" strokeDasharray="56" strokeDashoffset="14" style={{ animation: "spin 0.8s linear infinite", transformOrigin: "center" }} /></svg>
          }
        </div>
      </div>

      {step === "recording" && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48 }}>
          {BARS.map((h, i) => (
            <div key={i} style={{
              width: 3, borderRadius: 2,
              background: "rgba(255,255,255,0.7)",
              height: `${h}%`,
              animation: `voiceBar ${0.4 + (i % 5) * 0.09}s ease-in-out infinite alternate`,
              animationDelay: `${(i * 0.07) % 0.4}s`,
            }} />
          ))}
        </div>
      )}

      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: 0 }}>
        {step === "recording" ? `Listening… (${seconds}s)` : "Got it — asking Penny…"}
      </p>

      <style>{`
        @keyframes pulseRing { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(1.6);opacity:0} }
        @keyframes voiceBar  { from{transform:scaleY(0.15)} to{transform:scaleY(1)} }
        @keyframes spin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// Type icons for Coming Up items
function UpcomingIcon({ type }) {
  if (type === "tax") return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="18" height="17" rx="2" />
      <line x1="16" y1="1" x2="16" y2="5" />
      <line x1="6" y1="1" x2="6" y2="5" />
      <line x1="2" y1="9" x2="20" y2="9" />
      <path d="M8 14l2 2 4-4" />
    </svg>
  );
  if (type === "invoice") return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2V4a2 2 0 0 0-2-2z" />
      <line x1="8" y1="9" x2="14" y2="9" />
      <line x1="8" y1="13" x2="12" y2="13" />
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.5 15a9 9 0 1 0 .5-5.6" />
    </svg>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

// ── Penny answer bubble ───────────────────────────────────────────────────────

function BooksBubble({ msg, loading }) {
  if (!loading && !msg) return null;
  return (
    <div className="penny-row" style={{ marginTop: 16 }}>
      <div className="penny-row-avatar">
        <div className="p-mark p-mark-sm">P</div>
      </div>
      <div className="penny-bubble">
        <div className="bubble-label">PENNY</div>
        {loading ? (
          <div className="penny-bubble-loading">
            <div className="penny-bubble-skel" style={{ width: "80%" }} />
            <div className="penny-bubble-skel" style={{ width: "55%" }} />
          </div>
        ) : (
          <div className="bubble-msg">
            <p className="penny-bubble-headline">{msg.headline}</p>
            {msg.why && <p className="penny-bubble-why">{msg.why}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Flagged transaction sheet ─────────────────────────────────────────────────

function FlaggedSheet({ card, persona, ai, onClose, onAction }) {
  const root = document.getElementById("sheet-root") || document.querySelector(".phone") || document.body;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ padding: "16px 20px 32px", maxHeight: "85%", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <p className="sheet-title" style={{ padding: "0 0 12px", borderBottom: "1px solid var(--line-2)", marginBottom: 16 }}>
          Review transaction
        </p>
        <ApprovalCard card={card} persona={persona} ai={ai}
          onConfirm={(c) => onAction(c)}
          onSkip={(c) => onAction(c)} />
      </div>
    </div>,
    root
  );
}

// ── Drill-down views ──────────────────────────────────────────────────────────

// P&L view — income lines, expense lines, net
function PLView({ data }) {
  if (!data) return (
    <p style={{ padding: "24px 0", color: "var(--ink-4)", fontSize: 14 }}>No data available.</p>
  );

  const totalIncome   = data.incomeLines.reduce((s, l) => s + l.amount, 0);
  const totalExpenses = data.expenseLines.reduce((s, l) => s + l.amount, 0);
  const net           = totalIncome - totalExpenses;

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Income */}
      <p className="eyebrow" style={{ marginBottom: 10 }}>Income</p>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        {data.incomeLines.map((line, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 20px",
            borderBottom: i < data.incomeLines.length - 1 ? "1px solid var(--line-2)" : "none",
          }}>
            <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{line.label}</span>
            <span style={{ fontSize: 14, fontWeight: "var(--fw-medium)" }}>{fmt(line.amount)}</span>
          </div>
        ))}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 20px", background: "var(--paper)", borderTop: "1px solid var(--line)",
        }}>
          <span style={{ fontSize: 14, fontWeight: "var(--fw-semibold)" }}>Total income</span>
          <span style={{ fontSize: 16, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)" }}>
            {fmt(totalIncome)}
          </span>
        </div>
      </div>

      {/* Expenses */}
      <p className="eyebrow" style={{ marginBottom: 10 }}>Expenses</p>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        {data.expenseLines.map((line, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 20px",
            borderBottom: i < data.expenseLines.length - 1 ? "1px solid var(--line-2)" : "none",
          }}>
            <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{line.label}</span>
            <span style={{ fontSize: 14, color: "var(--ink-3)" }}>({fmt(line.amount)})</span>
          </div>
        ))}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 20px", background: "var(--paper)", borderTop: "1px solid var(--line)",
        }}>
          <span style={{ fontSize: 14, fontWeight: "var(--fw-semibold)" }}>Total expenses</span>
          <span style={{ fontSize: 16, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)", color: "var(--ink-3)" }}>
            ({fmt(totalExpenses)})
          </span>
        </div>
      </div>

      {/* Net */}
      <div className="card card-emphasis" style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "18px 20px",
      }}>
        <span style={{ fontSize: 15, fontWeight: "var(--fw-semibold)" }}>Net</span>
        <span style={{ fontSize: 24, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)" }}>
          {fmt(net)}
        </span>
      </div>
    </div>
  );
}

// Expenses by category — proportion bars
function ExpensesView({ data }) {
  if (!data || !data.length) return (
    <p style={{ padding: "24px 0", color: "var(--ink-4)", fontSize: 14 }}>No data available.</p>
  );

  const total = data.reduce((s, c) => s + c.amount, 0);
  const max   = Math.max(...data.map((c) => c.amount));

  return (
    <div style={{ paddingTop: 20 }}>
      <p style={{ margin: "0 0 16px" }}>
        <span style={{ fontSize: 22, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)" }}>
          {fmt(total)}
        </span>
        <span style={{ fontSize: 14, color: "var(--ink-4)", marginLeft: 6 }}>
          this month
        </span>
      </p>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {data.map((cat, i) => (
          <div key={i} style={{
            padding: "14px 20px",
            borderBottom: i < data.length - 1 ? "1px solid var(--line-2)" : "none",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
              <span style={{ fontSize: 14, fontWeight: "var(--fw-medium)" }}>{cat.category}</span>
              <span style={{ fontSize: 14, fontWeight: "var(--fw-semibold)" }}>{fmt(cat.amount)}</span>
            </div>
            {/* Proportion bar */}
            <div style={{ height: 4, background: "var(--line)", borderRadius: 2, overflow: "hidden", marginBottom: 5 }}>
              <div style={{
                height: "100%", background: "var(--ink-2)", borderRadius: 2,
                width: `${(cat.amount / max) * 100}%`,
                transition: "width 0.4s var(--ease-out)",
              }} />
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)" }}>
              {cat.count} transaction{cat.count !== 1 ? "s" : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Income by client — sorted by amount, with % badge
function IncomeView({ data }) {
  if (!data || !data.length) return (
    <p style={{ padding: "24px 0", color: "var(--ink-4)", fontSize: 14 }}>No data available.</p>
  );

  const total  = data.reduce((s, c) => s + c.amount, 0);
  const sorted = [...data].sort((a, b) => b.amount - a.amount);

  return (
    <div style={{ paddingTop: 20 }}>
      <p style={{ margin: "0 0 16px" }}>
        <span style={{ fontSize: 22, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)" }}>
          {fmt(total)}
        </span>
        <span style={{ fontSize: 14, color: "var(--ink-4)", marginLeft: 6 }}>
          this month
        </span>
      </p>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {sorted.map((client, i) => {
          const pct = Math.round((client.amount / total) * 100);
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px",
              borderBottom: i < sorted.length - 1 ? "1px solid var(--line-2)" : "none",
            }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: "var(--fw-medium)" }}>
                  {client.client}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)" }}>
                  {client.invoices} invoice{client.invoices !== 1 ? "s" : ""}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: "var(--fw-medium)", color: "var(--ink-3)",
                  background: "var(--paper)", padding: "2px 8px",
                  borderRadius: "var(--r-pill)", border: "1px solid var(--line)",
                }}>
                  {pct}%
                </span>
                <span style={{ fontSize: 14, fontWeight: "var(--fw-semibold)", minWidth: 62, textAlign: "right" }}>
                  {fmt(client.amount)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Full ledger — flat list, most recent first
function LedgerView({ data }) {
  if (!data || !data.length) return (
    <p style={{ padding: "24px 0", color: "var(--ink-4)", fontSize: 14 }}>No transactions found.</p>
  );

  return (
    <div style={{ paddingTop: 20 }}>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--ink-4)" }}>
        {data.length} transactions
      </p>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {data.map((txn, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: i < data.length - 1 ? "1px solid var(--line-2)" : "none",
          }}>
            {/* Left: vendor + category */}
            <div style={{ flex: 1, marginRight: 14 }}>
              <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: "var(--fw-medium)", lineHeight: 1.3 }}>
                {txn.vendor}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)" }}>
                {txn.category}
              </p>
            </div>
            {/* Right: amount + date */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{
                margin: "0 0 2px", fontSize: 14, fontWeight: "var(--fw-medium)",
                color: txn.type === "income" ? "var(--ink)" : "var(--ink-2)",
              }}>
                {txn.type === "income" ? "+" : "\u2212"}{fmt(txn.amount)}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)" }}>
                {txn.date}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Drill-down sheet wrapper ──────────────────────────────────────────────────

const DD_LABELS = {
  pl:       (month) => `P&L \u00b7 ${month}`,
  expenses: (month) => `Expenses \u00b7 ${month}`,
  income:   (month) => `Income \u00b7 ${month}`,
  ledger:   (month) => `All transactions \u00b7 ${month}`,
};

// ── Tax Summary sheet ─────────────────────────────────────────────────────────

function TaxSheet({ ledger, ddData, onClose }) {
  const pl           = ddData?.pl;
  const expenses     = ddData?.expenses || [];
  const totalIncome  = pl ? pl.incomeLines.reduce((s, l) => s + l.amount, 0) : (ledger?.monthIncome || 0);
  const totalExp     = pl ? pl.expenseLines.reduce((s, l) => s + l.amount, 0) : (ledger?.monthExpenses || 0);
  const netProfit    = totalIncome - totalExp;

  // Rough self-employment tax estimate: 15.3% SE tax + ~22% federal income bracket
  const seTax        = Math.max(0, Math.round(netProfit * 0.153));
  const fedIncome    = Math.max(0, Math.round(netProfit * 0.22));
  const totalEst     = seTax + fedIncome;
  const quarterly    = Math.round(totalEst / 4);

  // Deductible categories (business expenses)
  const deductible   = expenses.slice(0, 5);

  const root = document.getElementById("sheet-root") || document.querySelector(".phone") || document.body;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: "92%", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px 10px 20px",
          borderBottom: "1px solid var(--line-2)", flexShrink: 0,
        }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: "var(--fw-semibold)" }}>Tax summary</p>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{
              background: "none", border: "none", color: "var(--ink-3)",
              cursor: "pointer", padding: 4, minWidth: "unset", minHeight: "unset",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <XIcon />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 32px" }}>

          {/* Q2 due date banner */}
          <div style={{
            background: "var(--amber)", borderRadius: "var(--r-card)", padding: "12px 16px",
            marginBottom: 20, display: "flex", alignItems: "center", gap: 10,
          }}>
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none" stroke="var(--white)"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="18" height="17" rx="2"/>
              <line x1="16" y1="1" x2="16" y2="5"/>
              <line x1="6" y1="1" x2="6" y2="5"/>
              <line x1="2" y1="9" x2="20" y2="9"/>
            </svg>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: "var(--fw-semibold)", color: "var(--white)" }}>
                Q2 estimated tax due Jun 15
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.8)" }}>
                Set aside {fmt(quarterly)} from your next payment
              </p>
            </div>
          </div>

          {/* Estimate breakdown */}
          <p className="eyebrow" style={{ marginBottom: 10 }}>Estimated annual tax</p>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
            {[
              { label: "Net profit (YTD est.)", value: fmt(netProfit * 12), sub: "annualized from this month" },
              { label: "Self-employment tax (15.3%)", value: fmt(seTax * 12), sub: "Social Security + Medicare" },
              { label: "Federal income tax (~22%)", value: fmt(fedIncome * 12), sub: "estimated bracket" },
            ].map((row, i, arr) => (
              <div key={i} style={{
                padding: "13px 16px",
                borderBottom: i < arr.length - 1 ? "1px solid var(--line-2)" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{row.label}</span>
                  <span style={{ fontSize: 14, fontWeight: "var(--fw-semibold)" }}>{row.value}</span>
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--ink-4)" }}>{row.sub}</p>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 16px", background: "var(--paper)", borderTop: "1px solid var(--line)",
            }}>
              <span style={{ fontSize: 14, fontWeight: "var(--fw-semibold)" }}>Quarterly payment</span>
              <span style={{ fontSize: 18, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)" }}>
                {fmt(quarterly)}
              </span>
            </div>
          </div>

          {/* Deductible expenses */}
          {deductible.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginBottom: 10 }}>Top deductible expenses</p>
              <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
                {deductible.map((cat, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px",
                    borderBottom: i < deductible.length - 1 ? "1px solid var(--line-2)" : "none",
                  }}>
                    <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{cat.category}</span>
                    <span style={{ fontSize: 14, fontWeight: "var(--fw-medium)" }}>{fmt(cat.amount)}</span>
                  </div>
                ))}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "13px 16px", borderTop: "1px solid var(--line)", background: "var(--paper)",
                }}>
                  <span style={{ fontSize: 13, fontWeight: "var(--fw-semibold)" }}>Total deductions</span>
                  <span style={{ fontSize: 14, fontWeight: "var(--fw-semibold)" }}>
                    {fmt(deductible.reduce((s, c) => s + c.amount, 0))}
                  </span>
                </div>
              </div>
            </>
          )}

          <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)", lineHeight: 1.5 }}>
            Estimates only. Consult your CPA for exact figures.
          </p>
        </div>
      </div>
    </div>,
    root
  );
}

function TaxFormPreviewSheet({ expenses, entity, month, onClose }) {
  const groups = groupByIrsLine(expenses || [], entity);
  const formLabel = formLabelForEntity(entity);
  const title = entity === "s-corp" ? "Form 1120-S preview"
               : entity === "partnership" ? "Form 1065 preview"
               : "Schedule C preview";
  const total = (expenses || []).reduce((s, e) => s + e.amount, 0);

  const root = document.getElementById("sheet-root") || document.querySelector(".phone") || document.body;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: "92%", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px 10px 20px",
          borderBottom: "1px solid var(--line-2)", flexShrink: 0,
        }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: "var(--fw-semibold)" }}>{title}</p>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{
              background: "none", border: "none", color: "var(--ink-3)",
              cursor: "pointer", padding: 4, minWidth: "unset", minHeight: "unset",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <XIcon />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 8px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--ink-4)" }}>
            {month} · {formLabel} expense lines
          </p>
          <p style={{ margin: "0 0 20px", fontSize: 22, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)" }}>
            {fmt(total)} <span style={{ fontSize: 13, fontWeight: "var(--fw-medium)", color: "var(--ink-4)" }}>total expenses</span>
          </p>

          {groups.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--ink-4)" }}>No expense data available.</p>
          ) : (
            groups.map((group, gi) => (
              <div key={group.lineLabel} style={{ marginBottom: 16 }}>
                <p style={{
                  margin: "0 0 8px", fontSize: 10, fontWeight: "var(--fw-semibold)",
                  letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)",
                }}>
                  {group.lineLabel}
                </p>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {group.items.map((item, ii) => (
                    <div key={ii} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "11px 16px",
                      borderBottom: ii < group.items.length - 1 ? "1px solid var(--line-2)" : "none",
                    }}>
                      <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{item.category}</span>
                      <span style={{ fontSize: 14, color: "var(--ink-3)" }}>({fmt(item.amount)})</span>
                    </div>
                  ))}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 16px", background: "var(--paper)", borderTop: "1px solid var(--line)",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>Line subtotal</span>
                    <span style={{ fontSize: 14, fontWeight: "var(--fw-semibold)", color: "var(--ink-3)" }}>
                      ({fmt(group.subtotal)})
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}

          <p style={{
            margin: "16px 0 24px", fontSize: 12, color: "var(--ink-3)",
            lineHeight: 1.55, background: "var(--paper)", borderRadius: "var(--r-card)",
            padding: "12px 14px",
          }}>
            Preview — CPA review required before filing.
          </p>
        </div>
      </div>
    </div>,
    root
  );
}

function DrilldownSheet({ slug, dd, month, onClose }) {
  const title = (DD_LABELS[slug] || (() => "Detail"))(month);

  const root = document.getElementById("sheet-root") || document.querySelector(".phone") || document.body;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ maxHeight: "92%", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px 10px 20px",
          borderBottom: "1px solid var(--line-2)", flexShrink: 0,
        }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: "var(--fw-semibold)" }}>
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none", color: "var(--ink-3)",
              cursor: "pointer", padding: 4,
              minWidth: "unset", minHeight: "unset",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <XIcon />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 32px" }}>
          {slug === "pl"       && <PLView       data={dd} />}
          {slug === "expenses" && <ExpensesView data={dd} />}
          {slug === "income"   && <IncomeView   data={dd} />}
          {slug === "ledger"   && <LedgerView   data={dd} />}
        </div>
      </div>
    </div>,
    root
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function BooksScreen({ ai, state, set, navigate, scenario }) {
  const { persona } = state;

  const [ledger,    setLedger]    = useState(null);
  const [flagged,   setFlagged]   = useState([]);
  const [upcoming,  setUpcoming]  = useState([]);
  const [ddData,    setDdData]    = useState(null);   // drilldown bundle from scenario
  const [toast,     setToast]     = useState(null);
  const [sheetCard, setSheetCard] = useState(null);
  const handleFlaggedAction = useCallback((card) => {
    setFlagged((prev) => prev.filter((c) => c.id !== card.id));
    setSheetCard(null);
  }, []);
  const [drilldown,    setDrilldown]    = useState(null);  // "pl"|"expenses"|"income"|"ledger"|null
  const [cpaSheeet,    setCpaSheet]     = useState(false);
  const [taxSheet,     setTaxSheet]     = useState(false);
  const [formPreview,  setFormPreview]  = useState(false);

  // Ask Penny
  const [askVal,     setAskVal]     = useState("");
  const [askFocused, setAskFocused] = useState(false);
  const [askLoading, setAskLoading] = useState(false);
  const [answerMsg,  setAnswerMsg]  = useState(null);
  const [voiceOpen,  setVoiceOpen]  = useState(false);
  const bottomRef                   = useRef(null);

  useEffect(() => {
    if (!persona) return;
    if (scenario === null) return; // still loading
    setLedger(scenario.ledgerSummary || null);
    const queue = (scenario.cardQueue || []).slice(-3).map((c, i) => ({ ...c, id: `flag-${i}` }));
    setFlagged(queue);
    setUpcoming(scenario.upcoming || []);
    setDdData(scenario.drilldown || null);
  }, [persona, scenario]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const handleDrilldown = useCallback((slug) => {
    if (!ddData || !ddData[slug]) {
      showToast("Detail data still loading.");
      return;
    }
    setDrilldown(slug);
  }, [ddData, showToast]);

  const submitAsk = useCallback((overrideQ) => {
    const q = (typeof overrideQ === "string" ? overrideQ : askVal).trim();
    if (!q || askLoading) return;
    setAskLoading(true);
    setAnswerMsg(null);
    ai.renderPenny({
      intent: "books.qa",
      context: { question: q, ledgerSummary: ledger, persona },
    })
      .then((msg) => { setAnswerMsg(msg); setAskLoading(false); })
      .catch(() => {
        setAnswerMsg({ headline: "I don't have that detail handy right now.", why: "Try again in a moment." });
        setAskLoading(false);
      });
    setAskVal("");
  }, [askVal, askLoading, ledger, persona, ai]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [answerMsg]);

  // Derived stat values
  const netVsLast   = ledger?.netVsLastMonth;
  const netSubcopy  = netVsLast != null ? `▲ ${fmt(netVsLast)} vs last month` : (ledger ? `After ${fmt(ledger.monthExpenses)} in expenses` : "this month");
  const booksValue  = flagged.length === 0 ? "Clean" : String(flagged.length);
  const booksSubcopy = flagged.length === 0 ? "all clear" : "needs your eye";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 16px" }}>

        {/* Header */}
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 0 14px", borderBottom: "1px solid var(--line-2)",
        }}>
          <h1 style={{ margin: 0, fontSize: "var(--fs-screen-title)", fontWeight: "var(--fw-semibold)", letterSpacing: "var(--ls-tight)" }}>
            My Books
          </h1>
          <button
            type="button"
            onClick={() => setCpaSheet(true)}
            style={{
              background: "none", border: "1px solid var(--line)",
              borderRadius: "var(--r-pill)", padding: "5px 12px",
              fontSize: 12, fontWeight: "var(--fw-medium)", color: "var(--ink-2)",
              cursor: "pointer", fontFamily: "var(--font-sans)",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h12a1 1 0 011 1v6a1 1 0 01-1 1H5l-3 3V4a1 1 0 011-1z"/>
            </svg>
            Send to CPA
          </button>
        </header>

        {/* Zone 1 — Stat cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>

          {/* Net — full-width dark hero card (primary financial signal) */}
          <div style={{
            background: "var(--ink)", borderRadius: 16, padding: "18px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <p style={{
                margin: "0 0 6px", fontSize: 10, fontWeight: "var(--fw-semibold)",
                letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)",
              }}>Net this month</p>
              <p style={{ margin: 0, fontSize: 38, fontWeight: "var(--fw-bold)", letterSpacing: "-0.03em", lineHeight: 1, color: "var(--white)" }}>
                {ledger ? fmt(ledger.takehome) : "—"}
              </p>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: netVsLast != null ? "rgba(26,158,106,0.9)" : "rgba(255,255,255,0.45)", textAlign: "right", maxWidth: 90, lineHeight: 1.5 }}>
              {netSubcopy}
            </p>
          </div>

          {/* Runway + Books — 2-column row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {/* Cash Runway */}
            <div className="card" style={{ padding: "14px 16px" }}>
              <p style={{
                margin: "0 0 5px", fontSize: 10, fontWeight: "var(--fw-semibold)",
                letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)",
              }}>Runway</p>
              <p style={{ margin: "0 0 3px", fontSize: 22, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)", lineHeight: 1 }}>
                {ledger ? ledger.runwayDays : "—"}
                <span style={{ fontSize: 12, fontWeight: "var(--fw-medium)", marginLeft: 4, color: "var(--ink-4)" }}>days</span>
              </p>
              <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)", lineHeight: 1.3 }}>
                at current spend
              </p>
            </div>

            {/* Books status */}
            <div className="card" style={{ padding: "14px 16px" }}>
              <p style={{
                margin: "0 0 5px", fontSize: 10, fontWeight: "var(--fw-semibold)",
                letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)",
              }}>Books</p>
              <p style={{ margin: "0 0 3px", fontSize: 22, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)", lineHeight: 1 }}>
                {flagged.length > 0 ? (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: "var(--amber)", color: "var(--white)",
                    borderRadius: "var(--r-pill)", padding: "2px 10px",
                    fontSize: 18, fontWeight: "var(--fw-bold)", letterSpacing: "var(--ls-tighter)",
                  }}>{booksValue}</span>
                ) : booksValue}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: flagged.length > 0 ? "var(--amber)" : "var(--ink-4)", lineHeight: 1.3 }}>
                {booksSubcopy}
              </p>
            </div>
          </div>

        </div>

        {/* Zone 2 — Needs a look */}
        <section style={{ marginTop: 24 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Needs a look</p>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {flagged.length === 0 ? (
              <p style={{ margin: 0, padding: "16px 20px", fontSize: 14, color: "var(--ink-3)" }}>
                All caught up ✓
              </p>
            ) : (
              flagged.map((card, i) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSheetCard(card)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    justifyContent: "space-between", padding: "14px 20px",
                    background: "none", border: "none",
                    borderBottom: i < flagged.length - 1 ? "1px solid var(--line-2)" : "none",
                    cursor: "pointer", fontFamily: "var(--font-sans)",
                    textAlign: "left", minHeight: "var(--tap-min)",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: "var(--fw-medium)", color: "var(--ink)" }}>
                    {card.vendor || "Transaction"}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, color: (card.variant === "income" || card.variant === "income-celebration") ? "var(--income)" : "var(--ink-3)" }}>
                      {card.amount != null ? fmt(card.amount) : ""}
                    </span>
                    <ChevronRight />
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Zone 3 — Coming up */}
        <section style={{ marginTop: 24 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Coming up</p>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {upcoming.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "13px 20px",
                  borderBottom: i < upcoming.length - 1 ? "1px solid var(--line-2)" : "none",
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8, background: "var(--paper)",
                  border: "1px solid var(--line)", display: "flex", alignItems: "center",
                  justifyContent: "center", color: "var(--ink-3)", flexShrink: 0,
                }}>
                  <UpcomingIcon type={item.type} />
                </div>
                <span style={{ flex: 1, fontSize: 14, color: "var(--ink)" }}>{item.label}</span>
                <span style={{ fontSize: 13, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{item.date}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Zone 3b — Tax */}
        <section style={{ marginTop: 24 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Tax</p>
          <button
            type="button"
            onClick={() => setTaxSheet(true)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "var(--white)", border: "1px solid var(--line)",
              borderRadius: "var(--r-card)", padding: "14px 16px",
              cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: "var(--paper)",
                border: "1px solid var(--line)", display: "flex", alignItems: "center",
                justifyContent: "center", color: "var(--amber)", flexShrink: 0,
              }}>
                <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="18" height="17" rx="2"/>
                  <line x1="16" y1="1" x2="16" y2="5"/>
                  <line x1="6" y1="1" x2="6" y2="5"/>
                  <line x1="2" y1="9" x2="20" y2="9"/>
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: "var(--fw-medium)", color: "var(--ink)" }}>
                  Q2 estimated tax due
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--amber)" }}>Jun 15 · tap to see breakdown</p>
              </div>
            </div>
            <ChevronRight />
          </button>
        </section>

        {/* Zone 4 — Drill-downs */}
        <section style={{ marginTop: 24 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>Explore</p>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {DRILLDOWNS.map((d, i) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => handleDrilldown(d.slug)}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between", padding: "15px 20px",
                  background: "none", border: "none",
                  borderBottom: "1px solid var(--line-2)",
                  cursor: "pointer", fontFamily: "var(--font-sans)",
                  textAlign: "left", minHeight: "var(--tap-min)",
                }}
              >
                <span style={{ fontSize: 15, color: "var(--ink)" }}>{d.label}</span>
                <ChevronRight />
              </button>
            ))}
            {/* Tax form preview row — label adapts to persona entity */}
            <button
              type="button"
              onClick={() => setFormPreview(true)}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "space-between", padding: "15px 20px",
                background: "none", border: "none", borderBottom: "none",
                cursor: "pointer", fontFamily: "var(--font-sans)",
                textAlign: "left", minHeight: "var(--tap-min)",
              }}
            >
              <span style={{ fontSize: 15, color: "var(--ink)" }}>
                {persona?.entity === "s-corp" ? "Form 1120-S preview"
                 : persona?.entity === "partnership" ? "Form 1065 preview"
                 : "Schedule C preview"}
              </span>
              <ChevronRight />
            </button>
          </div>
        </section>

        {/* Zone 5 — Invoices */}
        <section style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p className="eyebrow" style={{ margin: 0 }}>Invoices</p>
          </div>
          <button
            onClick={() => navigate("/invoice")}
            style={{
              width: "100%", background: "var(--white)", border: "1.5px dashed var(--line-2)",
              borderRadius: "var(--r-card)", padding: "16px 20px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 12, textAlign: "left",
            }}
          >
            <span style={{
              width: 36, height: 36, borderRadius: 8, background: "var(--paper)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="1" width="12" height="14" rx="2"/>
                <line x1="5" y1="5" x2="11" y2="5"/>
                <line x1="5" y1="8" x2="11" y2="8"/>
                <line x1="5" y1="11" x2="8" y2="11"/>
              </svg>
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>New invoice</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>Create, send, or schedule recurring</p>
            </div>
          </button>
        </section>

        {/* Ask Penny answer bubble */}
        <BooksBubble msg={answerMsg} loading={askLoading} />
        <div ref={bottomRef} style={{ height: 8 }} />

      </div>{/* end scrollable body */}

      {/* Ask Penny bar — flex item, never position:fixed */}
      <div style={{ borderTop: "1px solid var(--line-2)", padding: "8px 0", background: "var(--white)", flexShrink: 0 }}>
        <div className={`ask-bar${askFocused ? " ask-bar--focused" : ""}`}>
          {/* Chat bubble icon */}
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--ink-4)", flexShrink: 0 }}>
            <path d="M2 3h14a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0116 13H6l-4 4V4.5A1.5 1.5 0 012 3z" />
          </svg>
          <input
            className="ask-bar-text"
            type="text"
            placeholder="Ask Penny anything…"
            value={askVal}
            onChange={(e) => setAskVal(e.target.value)}
            onFocus={() => setAskFocused(true)}
            onBlur={() => setAskFocused(false)}
            onKeyDown={(e) => { if (e.key === "Enter") submitAsk(); }}
            style={{ fontSize: 14 }}
          />
          {askVal.trim() ? (
            <button className="ask-bar-btn" type="button" onClick={submitAsk} aria-label="Ask"
              style={{ minWidth: "unset", minHeight: "unset", width: 32, height: 32 }}>
              <SendIcon />
            </button>
          ) : (
            <button type="button"
              onClick={() => setVoiceOpen(true)}
              style={{
                background: "none", border: "none", color: "var(--ink-4)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 4, minWidth: "unset", minHeight: "unset", flexShrink: 0,
              }}
              aria-label="Ask by voice">
              <MicIcon />
            </button>
          )}
        </div>
      </div>

      {/* Voice ask modal */}
      {voiceOpen && (
        <VoiceAskModal
          onDone={(q) => { setVoiceOpen(false); submitAsk(q); }}
          onClose={() => setVoiceOpen(false)}
        />
      )}

      {/* Flagged transaction sheet */}
      {sheetCard && (
        <FlaggedSheet card={sheetCard} persona={persona} ai={ai}
          onClose={() => setSheetCard(null)}
          onAction={handleFlaggedAction} />
      )}

      {/* Drill-down sheet */}
      {drilldown && ddData && ddData[drilldown] && (
        <DrilldownSheet
          slug={drilldown}
          dd={ddData[drilldown]}
          month={ledger?.month || "This month"}
          onClose={() => setDrilldown(null)}
        />
      )}

      {/* Tax summary sheet */}
      {taxSheet && (
        <TaxSheet ledger={ledger} ddData={ddData} onClose={() => setTaxSheet(false)} />
      )}

      {/* Tax form preview sheet */}
      {formPreview && (
        <TaxFormPreviewSheet
          expenses={ddData?.expenses || []}
          entity={persona?.entity}
          month={ledger?.month || "This month"}
          onClose={() => setFormPreview(false)}
        />
      )}

      {/* Send to CPA sheet */}
      {cpaSheeet && (
        <SendToCPASheet
          persona={persona}
          ledger={ledger}
          ddData={ddData}
          onClose={() => setCpaSheet(false)}
          showToast={showToast}
        />
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}
