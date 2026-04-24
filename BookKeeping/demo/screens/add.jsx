/**
 * screens/add.jsx — Add tab (Tab 2).
 *
 * Three sections: quick capture · connected accounts · data actions.
 * Only real AI call: capture.parse (for "Just tell me" free-text).
 * All other capture modes stub a realistic approval card for the demo.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ApprovalCard } from "./card.jsx";
import posthog from "posthog-js";
import CanonicalSheet from "../components/Sheet.jsx";
import FullScreenOverlay from "../components/FullScreenOverlay.jsx";

// ── SVG icon factory ──────────────────────────────────────────────────────────

function Svg({ size = 22, sw = 1.5, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  );
}

const CameraIcon   = () => <Svg><path d="M1 7.5C1 6.4 1.9 5.5 3 5.5h1.5l1.5-2h8l1.5 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7.5z"/><circle cx="11" cy="11" r="3"/></Svg>;
const MessageIcon  = () => <Svg><path d="M2 3h18v12H13l-3 3-3-3H2V3z"/><line x1="6" y1="8" x2="16" y2="8"/><line x1="6" y1="12" x2="12" y2="12"/></Svg>;
const MicIcon      = () => <Svg><rect x="8" y="1" width="6" height="11" rx="3"/><path d="M3 10a8 8 0 0 0 16 0"/><line x1="11" y1="18" x2="11" y2="21"/><line x1="8" y1="21" x2="14" y2="21"/></Svg>;
const UploadIcon   = () => <Svg><path d="M4 16v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/><polyline points="15 8 11 4 7 8"/><line x1="11" y1="4" x2="11" y2="15"/></Svg>;
const ImportIcon   = () => <Svg size={20}><path d="M4 16v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/><polyline points="7 10 11 14 15 10"/><line x1="11" y1="4" x2="11" y2="14"/></Svg>;
const ExportIconSvg = () => <Svg size={20}><path d="M4 16v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/><polyline points="15 8 11 4 7 8"/><line x1="11" y1="4" x2="11" y2="15"/></Svg>;
const MailIcon     = () => <Svg size={20}><rect x="2" y="4" width="18" height="14" rx="2"/><polyline points="2 7 11 13 20 7"/></Svg>;
const PlusCircle   = () => <Svg size={20}><circle cx="11" cy="11" r="9"/><line x1="11" y1="7" x2="11" y2="15"/><line x1="7" y1="11" x2="15" y2="11"/></Svg>;
const ChevronRight = () => <Svg size={16} sw={1.5}><polyline points="8 4 16 11 8 18"/></Svg>;
const CheckCircle  = () => <Svg size={20}><circle cx="11" cy="11" r="9"/><polyline points="7 11 10 14 15 8"/></Svg>;
const CloseIcon    = () => <Svg size={18} sw={1.5}><line x1="5" y1="5" x2="17" y2="17"/><line x1="17" y1="5" x2="5" y2="17"/></Svg>;

// Email provider badges — neutral ink-on-paper, no accent colors
const GmailBadge = () => (
  <div style={{ width:36,height:36,borderRadius:10,background:"var(--paper)",border:"1.5px solid var(--line)",
    display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:"var(--fw-bold)",
    color:"var(--ink-2)",flexShrink:0,letterSpacing:"-0.02em" }}>G</div>
);
const OutlookBadge = () => (
  <div style={{ width:36,height:36,borderRadius:10,background:"var(--paper)",border:"1.5px solid var(--line)",
    display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:"var(--fw-bold)",
    color:"var(--ink-2)",flexShrink:0 }}>O</div>
);

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ size = 18, color = "var(--ink-3)" }) {
  return (
    <>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        style={{ animation:"spin 0.8s linear infinite",display:"block" }}>
        <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2.5"
          strokeDasharray="40 20" strokeLinecap="round"/>
      </svg>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ── Provider / email catalogues ───────────────────────────────────────────────

const ALL_PROVIDERS = [
  { id:"chase",   name:"Chase",           type:"bank",    initial:"C" },
  { id:"boa",     name:"Bank of America", type:"bank",    initial:"B" },
  { id:"mercury", name:"Mercury",         type:"bank",    initial:"M" },
  { id:"wells",   name:"Wells Fargo",     type:"bank",    initial:"W" },
  { id:"stripe",  name:"Stripe",          type:"payment", initial:"S" },
  { id:"venmo",   name:"Venmo",           type:"payment", initial:"V" },
  { id:"paypal",  name:"PayPal",          type:"payment", initial:"P" },
  { id:"gusto",   name:"Gusto",           type:"payroll", initial:"G" },
  { id:"onpay",   name:"OnPay",           type:"payroll", initial:"O" },
  { id:"qbo",     name:"QuickBooks",      type:"export",  initial:"Q" },
];

const EMAIL_PROVIDERS = [
  { id:"gmail",   name:"Gmail",   sub:"Connect your Google account",    badge:<GmailBadge /> },
  { id:"outlook", name:"Outlook", sub:"Connect your Microsoft account", badge:<OutlookBadge /> },
];

// Industry-specific hints for photo and voice capture — fed to capture.parse so
// each persona gets a contextually plausible card rather than a fixed stub.
const PHOTO_HINTS = {
  consulting:           "coffee with a client",
  creative:             "design software renewal",
  trades:               "hardware store supplies",
  retail:               "inventory purchase",
  "food-beverage":      "restaurant supply delivery",
  "beauty-wellness":    "salon product supplies",
  "professional-services": "office supplies",
  "tech-software":      "SaaS subscription",
  healthcare:           "medical office supplies",
  other:                "business expense receipt",
};

const VOICE_HINTS = {
  consulting:           "had lunch with a client, paid around $60",
  creative:             "bought supplies for a project, about $45",
  trades:               "picked up materials from the hardware store, $85",
  retail:               "restocked some inventory, spent about $120",
  "food-beverage":      "delivery from a supplier, around $200",
  "beauty-wellness":    "stocked up on products, about $75",
  "professional-services": "office supplies run, around $50",
  "tech-software":      "renewed a software subscription, $29 a month",
  healthcare:           "medical supplies order, about $90",
  other:                "business expense, around $50",
};

function buildCardFromParsed(parsed, prefix) {
  const p = parsed || {};
  return {
    id: `${prefix}-${Date.now()}`,
    variant: "base-expense",
    vendor: p.vendor || "Receipt",
    amount: p.amount ?? 0,
    category_guess: p.category_guess || "Business expense",
    confidence: p.confidence ?? 0.88,
    daysAgo: 0,
  };
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position:"absolute",bottom:80,left:"50%",transform:"translateX(-50%)",
      background:"var(--ink)",color:"var(--white)",fontSize:13,fontWeight:"var(--fw-medium)",
      padding:"10px 18px",borderRadius:999,whiteSpace:"nowrap",
      zIndex:300,boxShadow:"0 4px 16px rgba(10,10,10,0.18)",pointerEvents:"none" }}>
      {message}
    </div>
  );
}

// ── Sheet scaffold ────────────────────────────────────────────────────────────
// Thin wrapper over the canonical <Sheet> (components/Sheet.jsx). Adds the
// add-tab-specific close-button header pattern. Every sub-sheet in this file
// (ProviderSheet, ExportSheet, ImportSheet, ManageSheet, ConnectEmailSheet)
// composes this wrapper instead of rolling its own backdrop/portal.

function Sheet({ onClose, title, children }) {
  return (
    <CanonicalSheet open onClose={onClose} maxHeight="82%" layout="custom" ariaLabel={title}>
      {/* Header with close button — add-tab convention */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px 16px" }}>
        <span style={{ fontSize:15,fontWeight:"var(--fw-semibold)",color:"var(--ink)" }}>{title}</span>
        <button onClick={onClose}
          style={{ background:"none",border:"none",color:"var(--ink-3)",padding:4,minWidth:0,minHeight:0,cursor:"pointer" }}
          aria-label="Close"><CloseIcon /></button>
      </div>
      <div style={{ overflowY:"auto",flex:1,paddingBottom:40 }}>{children}</div>
    </CanonicalSheet>
  );
}

// ── Provider sheet (bank / payment / payroll) ─────────────────────────────────

function ProviderSheet({ connections, onConnect, onClose }) {
  const [query,      setQuery]      = useState("");
  const [connecting, setConnecting] = useState(null);
  const [connected,  setConnected]  = useState(null);

  const filtered = query.trim()
    ? ALL_PROVIDERS.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.type.includes(query.toLowerCase()))
    : ALL_PROVIDERS;

  function handlePick(p) {
    if (connections.find(c => c.id === p.id)) { onConnect(p, "already"); return; }
    setConnecting(p.id);
    setTimeout(() => {
      setConnecting(null);
      setConnected(p.id);
      setTimeout(() => onConnect(p, "new"), 900);
    }, 1600);
  }

  return (
    <Sheet onClose={onClose} title="Add a connection">
      <div style={{ padding:"0 20px 12px" }}>
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search banks, payments, payroll…"
          style={{ width:"100%",padding:"10px 14px",border:"1.5px solid var(--line)",
            borderRadius:"var(--r-pill)",background:"var(--paper)",fontSize:15,
            color:"var(--ink)",outline:"none" }} />
      </div>
      <div style={{ padding:"0 20px" }}>
        {filtered.map(p => {
          const isConnecting = connecting === p.id;
          const isConnected  = connected  === p.id;
          const alreadyDone  = connections.find(c => c.id === p.id);
          return (
            <button key={p.id} onClick={() => handlePick(p)} disabled={!!connecting}
              style={{ display:"flex",alignItems:"center",gap:12,width:"100%",
                background:"none",border:"none",borderBottom:"1px solid var(--line-2)",
                padding:"12px 0",textAlign:"left",minHeight:0,cursor:"pointer",
                opacity: connecting && !isConnecting ? 0.4 : 1,transition:"opacity 200ms" }}>
              <div style={{ width:36,height:36,borderRadius:10,background:"var(--paper)",
                border:"1px solid var(--line)",display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:14,fontWeight:"var(--fw-bold)",color:"var(--ink-2)",flexShrink:0 }}>
                {p.initial}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>{p.name}</div>
                <div style={{ fontSize:12,color:"var(--ink-4)",textTransform:"capitalize" }}>
                  {isConnecting ? "Connecting…"
                    : isConnected  ? "Connected"
                    : alreadyDone  ? "Already connected"
                    : p.type}
                </div>
              </div>
              <div style={{ color: isConnected ? "var(--ink)" : "var(--ink-4)",display:"flex" }}>
                {isConnecting ? <Spinner /> : isConnected ? <CheckCircle /> : <ChevronRight />}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p style={{ fontSize:14,color:"var(--ink-4)",padding:"16px 0" }}>No providers matched.</p>
        )}
      </div>
    </Sheet>
  );
}

// ── Export sheet (pick → generating → ready + download) ───────────────────────

function ExportSheet({ onClose, persona }) {
  const [step,      setStep]      = useState("pick");
  const [format,    setFormat]    = useState(null);
  const [shareEmail, setShareEmail] = useState(persona?.cpaEmail || "");
  const [shareNote,  setShareNote]  = useState("");
  const [sharing,    setSharing]    = useState(false);
  const [shared,     setShared]     = useState(false);

  const formats = [
    { id:"csv", label:"CSV spreadsheet",  sub:"Opens in Excel or Google Sheets", ext:"csv",  mime:"text/csv" },
    { id:"qbo", label:"QuickBooks (QBO)", sub:"Import directly into QuickBooks",  ext:"qbo",  mime:"application/octet-stream" },
    { id:"pdf", label:"PDF report",       sub:"Clean summary for your records",   ext:"pdf",  mime:"application/pdf" },
  ];

  function pick(f) {
    setFormat(f);
    setStep("generating");
    setTimeout(() => setStep("ready"), 1800);
  }

  function download() {
    posthog.capture("data_exported", { format: format.id });
    const content = `Penny export — ${format.label}\nGenerated: ${new Date().toLocaleDateString()}\n\n(Demo data — not real transactions)`;
    const blob = new Blob([content], { type: format.mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `penny-export.${format.ext}`; a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  function handleShare() {
    if (!shareEmail.trim()) return;
    setSharing(true);
    setTimeout(() => { setSharing(false); setShared(true); }, 1400);
  }

  return (
    <Sheet onClose={onClose} title="Export your books">
      <div style={{ padding:"0 20px" }}>
        {step === "pick" && (
          <>
            {formats.map(f => (
              <button key={f.id} onClick={() => pick(f)}
                style={{ display:"flex",alignItems:"center",justifyContent:"space-between",
                  width:"100%",background:"var(--paper)",border:"1px solid var(--line)",
                  borderRadius:"var(--r-card)",padding:"14px 16px",marginBottom:10,
                  textAlign:"left",cursor:"pointer",minHeight:0 }}>
                <div>
                  <div style={{ fontSize:15,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>{f.label}</div>
                  <div style={{ fontSize:12,color:"var(--ink-4)",marginTop:2 }}>{f.sub}</div>
                </div>
                <div style={{ color:"var(--ink-4)" }}><ChevronRight /></div>
              </button>
            ))}

            {/* Share with CPA */}
            <div style={{ marginTop:8, borderTop:"1px solid var(--line-2)", paddingTop:16 }}>
              <p style={{ margin:"0 0 10px", fontSize:11, fontWeight:"var(--fw-semibold)", letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--ink-4)" }}>Share with CPA</p>
              {shared ? (
                <div style={{ display:"flex",alignItems:"center",gap:10,background:"var(--paper)",border:"1px solid var(--line)",borderRadius:"var(--r-card)",padding:"14px 16px" }}>
                  <CheckCircle />
                  <div>
                    <div style={{ fontSize:14,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>Sent to {shareEmail}</div>
                    <div style={{ fontSize:12,color:"var(--ink-4)",marginTop:2 }}>Your CPA will receive the export link</div>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="cpa@example.com"
                    style={{
                      width:"100%",boxSizing:"border-box",
                      border:"1px solid var(--line)",borderRadius:"var(--r-card)",
                      padding:"10px 12px",fontSize:14,fontFamily:"var(--font-sans)",
                      color:"var(--ink)",background:"var(--white)",outline:"none",marginBottom:8,
                    }}
                  />
                  <input
                    type="text"
                    value={shareNote}
                    onChange={(e) => setShareNote(e.target.value)}
                    placeholder="Add a note (optional)"
                    style={{
                      width:"100%",boxSizing:"border-box",
                      border:"1px solid var(--line)",borderRadius:"var(--r-card)",
                      padding:"10px 12px",fontSize:14,fontFamily:"var(--font-sans)",
                      color:"var(--ink)",background:"var(--white)",outline:"none",marginBottom:10,
                    }}
                  />
                  <button
                    onClick={handleShare}
                    disabled={!shareEmail.trim() || sharing}
                    style={{
                      width:"100%",padding:"12px 0",
                      background: shareEmail.trim() && !sharing ? "var(--ink)" : "var(--line)",
                      color: shareEmail.trim() && !sharing ? "var(--white)" : "var(--ink-4)",
                      border:"none",borderRadius:"var(--r-pill)",fontSize:14,
                      fontWeight:"var(--fw-semibold)",cursor: shareEmail.trim() && !sharing ? "pointer" : "default",
                      fontFamily:"var(--font-sans)", transition:"background 200ms",
                    }}
                  >
                    {sharing ? "Sending…" : "Send export link"}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {step === "generating" && (
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"32px 0 16px" }}>
            <Spinner size={28} color="var(--ink)" />
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:15,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>Generating {format.label}…</div>
              <div style={{ fontSize:13,color:"var(--ink-4)",marginTop:4 }}>Pulling your transactions</div>
            </div>
          </div>
        )}

        {step === "ready" && (
          <div style={{ padding:"8px 0 16px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:12,
              background:"var(--paper)",borderRadius:"var(--r-card)",padding:"14px 16px",marginBottom:16 }}>
              <div style={{ color:"var(--ink)" }}><CheckCircle /></div>
              <div>
                <div style={{ fontSize:15,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>{format.label} ready</div>
                <div style={{ fontSize:12,color:"var(--ink-4)",marginTop:2 }}>Your export is ready to download</div>
              </div>
            </div>
            <button className="btn btn-full" onClick={download} style={{ fontSize:15 }}>
              Download {format.ext.toUpperCase()}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ── Import sheet (pick → processing → done + confirm) ────────────────────────

function ImportSheet({ onImport, onClose }) {
  const [step,     setStep]    = useState("pick");
  const [dragging, setDragging] = useState(false);
  const fileRef                 = useRef(null);
  const count                   = 42;

  function processFile() { setStep("processing"); setTimeout(() => setStep("done"), 2000); }

  function handleDrop(e) {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) processFile();
  }

  return (
    <Sheet onClose={onClose} title="Import your old books">
      <div style={{ padding:"0 20px" }}>
        {step === "pick" && (
          <>
            <div onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)} onDrop={handleDrop}
              onClick={()=>fileRef.current?.click()}
              style={{ border:`2px dashed ${dragging?"var(--ink)":"var(--line)"}`,
                borderRadius:"var(--r-card-emph)",padding:"32px 20px",display:"flex",flexDirection:"column",
                alignItems:"center",gap:12,background:dragging?"var(--paper)":"var(--white)",
                cursor:"pointer",transition:"border-color 150ms,background 150ms",marginBottom:16 }}>
              <div style={{ color:"var(--ink-3)" }}><ImportIcon /></div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:15,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>Drop a file here</div>
                <div style={{ fontSize:13,color:"var(--ink-4)",marginTop:4 }}>CSV or PDF — we'll figure out the columns</div>
              </div>
              <div style={{ fontSize:13,color:"var(--ink-3)" }}>or</div>
              <button className="btn btn-ghost btn-sm"
                onClick={e=>{e.stopPropagation();fileRef.current?.click();}}
                style={{ minWidth:0 }}>Browse files</button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.pdf,.xlsx"
              style={{ display:"none" }} onChange={processFile} />
            <p style={{ fontSize:12,color:"var(--ink-4)",margin:0,textAlign:"center" }}>
              Supports CSV, PDF statements, and XLSX spreadsheets
            </p>
          </>
        )}

        {step === "processing" && (
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"32px 0 16px" }}>
            <Spinner size={28} color="var(--ink)" />
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:15,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>Analyzing your file…</div>
              <div style={{ fontSize:13,color:"var(--ink-4)",marginTop:4 }}>Matching categories and dates</div>
            </div>
          </div>
        )}

        {step === "done" && (
          <div style={{ padding:"8px 0 16px" }}>
            <div style={{ background:"var(--paper)",borderRadius:"var(--r-card)",padding:"16px",marginBottom:16,
              display:"flex",flexDirection:"column",gap:8 }}>
              {[["Transactions found",count],["Auto-categorized","39"],["Needs your review","3"]].map(([k,v])=>(
                <div key={k} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:13,color:"var(--ink-4)" }}>{k}</span>
                  <span style={{ fontSize:15,fontWeight:"var(--fw-semibold)",color:"var(--ink)" }}>{v}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize:13,color:"var(--ink-4)",margin:"0 0 16px" }}>
              The 3 that need review will appear in your Penny thread.
            </p>
            <button className="btn btn-full" onClick={()=>{onImport(count);onClose();}} style={{ fontSize:15 }}>
              Import {count} transactions
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ── Manage connected account sheet ───────────────────────────────────────────

function ManageSheet({ conn, onDisconnect, onClose }) {
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  function handleDisconnect() {
    if (!confirming) { setConfirming(true); return; }
    setDisconnecting(true);
    setTimeout(() => { onDisconnect(conn.id); onClose(); }, 1200);
  }

  return (
    <Sheet onClose={onClose} title={conn.name}>
      <div style={{ padding:"0 20px 8px" }}>
        {/* Account info card */}
        <div style={{ background:"var(--paper)",borderRadius:"var(--r-card)",padding:"16px",marginBottom:20,
          display:"flex",alignItems:"center",gap:12 }}>
          <div style={{ width:44,height:44,borderRadius:12,background:"var(--white)",
            border:"1.5px solid var(--line)",display:"flex",alignItems:"center",
            justifyContent:"center",fontSize:17,fontWeight:"var(--fw-bold)",color:"var(--ink-2)",flexShrink:0 }}>
            {conn.initial}
          </div>
          <div>
            <div style={{ fontSize:15,fontWeight:"var(--fw-semibold)",color:"var(--ink)" }}>{conn.name}</div>
            <div style={{ fontSize:12,color:"var(--ink-4)",marginTop:2,textTransform:"capitalize" }}>
              {conn.type} · Last sync: {conn.syncLabel}
            </div>
          </div>
          <div style={{ marginLeft:"auto",color:"var(--ink)" }}><CheckCircle /></div>
        </div>

        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"13px 0",borderTop:"1px solid var(--line-2)",borderBottom:"1px solid var(--line-2)",
          marginBottom:20 }}>
          <span style={{ fontSize:14,color:"var(--ink-2)" }}>Sync status</span>
          <span style={{ fontSize:14,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>Active</span>
        </div>

        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          style={{ width:"100%",padding:"13px",border:`1.5px solid ${confirming?"var(--ink)":"var(--line)"}`,
            borderRadius:"var(--r-card)",background: confirming ? "var(--ink)" : "var(--white)",
            color: confirming ? "var(--white)" : "var(--ink-3)",
            fontSize:14,fontWeight:"var(--fw-medium)",fontFamily:"var(--font-sans)",
            cursor:"pointer",minHeight:0,transition:"all 150ms" }}>
          {disconnecting ? "Disconnecting…" : confirming ? "Tap again to confirm" : `Disconnect ${conn.name}`}
        </button>
        {confirming && !disconnecting && (
          <button onClick={() => setConfirming(false)}
            style={{ width:"100%",marginTop:10,padding:"12px",border:"none",background:"none",
              fontSize:14,color:"var(--ink-4)",fontFamily:"var(--font-sans)",cursor:"pointer",minHeight:0 }}>
            Never mind
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ── Connect email sheet ───────────────────────────────────────────────────────

function ConnectEmailSheet({ emailConnections, onConnect, onClose }) {
  const [connecting, setConnecting] = useState(null);
  const [connected,  setConnected]  = useState(null);

  function handlePick(p) {
    if (emailConnections.find(c => c.id === p.id)) return;
    setConnecting(p.id);
    setTimeout(() => {
      setConnecting(null);
      setConnected(p.id);
      setTimeout(() => onConnect(p), 800);
    }, 1800);
  }

  return (
    <Sheet onClose={onClose} title="Connect your email">
      <div style={{ padding:"0 20px 8px" }}>
        <p style={{ fontSize:13,color:"var(--ink-4)",margin:"0 0 16px" }}>
          Penny watches your inbox for receipts and invoices. She never reads personal emails.
        </p>
        {EMAIL_PROVIDERS.map(p => {
          const isConnecting  = connecting === p.id;
          const isConnected   = connected  === p.id;
          const alreadyLinked = emailConnections.find(c => c.id === p.id);
          return (
            <button key={p.id} onClick={()=>handlePick(p)}
              disabled={!!connecting || !!alreadyLinked}
              style={{ display:"flex",alignItems:"center",gap:14,width:"100%",
                background: alreadyLinked||isConnected ? "var(--paper)" : "var(--white)",
                border:"1.5px solid var(--line)",borderRadius:"var(--r-card-emph)",padding:"14px 16px",
                marginBottom:10,textAlign:"left",
                cursor: alreadyLinked ? "default" : "pointer",minHeight:0,
                opacity: connecting&&!isConnecting ? 0.4 : 1,transition:"opacity 200ms" }}>
              {p.badge}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>{p.name}</div>
                <div style={{ fontSize:12,color:"var(--ink-4)",marginTop:2 }}>
                  {isConnecting ? "Connecting…"
                    : alreadyLinked||isConnected ? "Connected — watching for receipts"
                    : p.sub}
                </div>
              </div>
              <div style={{ color: alreadyLinked||isConnected ? "var(--ink)" : "var(--ink-4)",display:"flex" }}>
                {isConnecting ? <Spinner /> : alreadyLinked||isConnected ? <CheckCircle /> : <ChevronRight />}
              </div>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// ── Voice recording modal ─────────────────────────────────────────────────────

function VoiceModal({ ai, persona, onResult, onClose }) {
  const [step,    setStep]    = useState("recording");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (step !== "recording") return;
    const tick  = setInterval(() => setSeconds(s => s + 1), 1000);
    const auto  = setTimeout(() => { clearInterval(tick); finalize(); }, 4000);
    return () => { clearInterval(tick); clearTimeout(auto); };
  }, [step]);

  async function finalize() {
    setStep("processing");
    const hint = VOICE_HINTS[persona?.industry] || "business expense, around $50";
    try {
      const msg = await ai.renderPenny({
        intent: "capture.parse",
        context: {
          text: hint,
          today: new Date().toISOString().slice(0, 10),
          entity: persona?.entity || "sole-prop",
          industry: persona?.industry || "consulting",
          persona: { name: persona?.firstName || "there", business: persona?.business || "" },
        },
      });
      onResult(buildCardFromParsed(msg.parsed, "voice"));
    } catch {
      onResult(buildCardFromParsed(null, "voice"));
    }
  }

  // Waveform — seeded heights so bars look organic but are stable across renders
  const BARS = [6,18,32,14,40,22,8,36,12,28,44,10,30,16,42,20,6,38,24,10,46,18,34,8,26,44,14,30];

  return (
    <FullScreenOverlay open onClose={onClose} ariaLabel="Recording voice note">
      {/* Close */}
      <button onClick={onClose}
        style={{ position:"absolute",top:20,right:20,background:"none",border:"none",
          color:"rgba(255,255,255,0.4)",cursor:"pointer",minWidth:0,minHeight:0 }}>
        <CloseIcon />
      </button>

      {/* Mic circle */}
      <div style={{ position:"relative",width:72,height:72 }}>
        {step === "recording" && [0,1].map(i => (
          <div key={i} style={{ position:"absolute",inset:0,borderRadius:"50%",
            border:"1.5px solid rgba(255,255,255,0.18)",
            animation:`pulseRing 1.8s ease-out infinite`,
            animationDelay:`${i * 0.6}s` }} />
        ))}
        <div style={{ position:"absolute",inset:0,borderRadius:"50%",
          background: step === "recording" ? "var(--white)" : "rgba(255,255,255,0.12)",
          display:"flex",alignItems:"center",justifyContent:"center",
          transition:"background 300ms" }}>
          {step === "recording"
            ? <Svg size={28} stroke="var(--ink)" sw={1.5}><rect x="8" y="1" width="6" height="11" rx="3"/><path d="M3 10a8 8 0 0 0 16 0"/><line x1="11" y1="18" x2="11" y2="21"/><line x1="8" y1="21" x2="14" y2="21"/></Svg>
            : <Spinner size={22} color="rgba(255,255,255,0.7)" />}
        </div>
      </div>

      {/* Waveform — only during recording */}
      {step === "recording" && (
        <div style={{ display:"flex",alignItems:"center",gap:3,height:52 }}>
          {BARS.map((h, i) => (
            <div key={i} style={{
              width: 3,
              height: `${h}px`,
              borderRadius: 99,
              background: "rgba(255,255,255,0.8)",
              animation: `voiceBar ${0.4 + (i % 5) * 0.09}s ease-in-out infinite alternate`,
              animationDelay: `${(i * 0.06) % 0.8}s`,
            }} />
          ))}
        </div>
      )}

      {/* Label */}
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:16,fontWeight:"var(--fw-semibold)",color:"var(--white)",letterSpacing:"-0.01em" }}>
          {step === "recording" ? "Listening…" : "Got it — reading now…"}
        </div>
        {step === "recording" && (
          <div style={{ fontSize:13,color:"rgba(255,255,255,0.4)",marginTop:6 }}>
            Speak naturally · {seconds}s
          </div>
        )}
      </div>

      {step === "recording" && (
        <button onClick={finalize}
          style={{ background:"rgba(255,255,255,0.1)",border:"1.5px solid rgba(255,255,255,0.2)",
            borderRadius:"var(--r-pill)",padding:"10px 28px",color:"rgba(255,255,255,0.85)",
            fontSize:14,fontWeight:"var(--fw-medium)",cursor:"pointer",minHeight:0,
            letterSpacing:"-0.01em" }}>
          Done
        </button>
      )}

      <style>{`
        @keyframes pulseRing { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(2.2);opacity:0} }
        @keyframes voiceBar  { from{transform:scaleY(0.15)} to{transform:scaleY(1)} }
      `}</style>
    </FullScreenOverlay>
  );
}

// ── Photo processing overlay ──────────────────────────────────────────────────

function PhotoOverlay({ ai, persona, onResult }) {
  useEffect(() => {
    const hint = PHOTO_HINTS[persona?.industry] || "business expense receipt";
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const msg = await ai.renderPenny({
          intent: "capture.parse",
          context: {
            text: hint,
            today: new Date().toISOString().slice(0, 10),
            entity: persona?.entity || "sole-prop",
            industry: persona?.industry || "consulting",
            persona: { name: persona?.firstName || "there", business: persona?.business || "" },
          },
        });
        if (!cancelled) onResult(buildCardFromParsed(msg.parsed, "photo"));
      } catch {
        if (!cancelled) onResult(buildCardFromParsed(null, "photo"));
      }
    }, 1600);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);
  return (
    <FullScreenOverlay open scrim="rgba(10,10,10,0.72)" ariaLabel="Reading your receipt">
      <Spinner size={32} color="var(--white)" />
      <div style={{ fontSize:16,fontWeight:"var(--fw-medium)",color:"var(--white)" }}>Reading your receipt…</div>
      <div style={{ fontSize:13,color:"rgba(255,255,255,0.55)" }}>This takes just a moment</div>
    </FullScreenOverlay>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AddScreen({ ai, state, set }) {
  const { persona }      = state;
  const connections      = state.connections      || [];
  const emailConnections = state.emailConnections || [];

  const [toast,       setToast]      = useState(null);
  const [sheet,       setSheet]      = useState(null); // "providers"|"export"|"import"|"email"|"manage"
  const [manageConn,  setManageConn] = useState(null); // connection being managed
  const [modal,       setModal]      = useState(null); // "voice"|"photo"
  const [justTellMe,  setJustTellMe] = useState(false);
  const [tellText,    setTellText]   = useState("");
  const [parsing,     setParsing]    = useState(false);
  const [captureCard, setCaptureCard] = useState(null);

  const photoInputRef = useRef(null);
  const showToast     = useCallback(msg => setToast(msg), []);

  // ── Capture handlers ───────────────────────────────────────────────────────

  function handlePhotoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    posthog.capture("receipt_captured_photo");
    setJustTellMe(false);
    setCaptureCard(null);
    setModal("photo");
  }

  function handleVoice() {
    posthog.capture("receipt_captured_voice");
    setJustTellMe(false);
    setCaptureCard(null);
    setModal("voice");
  }

  function handleCaptureResult(card) {
    setModal(null);
    setCaptureCard({ ...card, id: `${card.id}-${Date.now()}` });
  }

  // ── "Just tell me" ────────────────────────────────────────────────────────

  async function handleParse() {
    const text = tellText.trim();
    if (!text) return;
    posthog.capture("receipt_captured_text", { text_length: text.length });
    setParsing(true);
    setCaptureCard(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const msg = await ai.renderPenny({
        intent: "capture.parse",
        context: {
          text, today,
          entity: persona?.entity || "sole-prop",
          industry: persona?.industry || "consulting",
          persona: { name: persona?.firstName || "there", business: persona?.business || "" },
        },
      });
      const p = msg.parsed || {};
      setCaptureCard({
        id: `capture-${Date.now()}`,
        variant: "base-expense",
        vendor: p.vendor || text,
        amount: p.amount ?? 0,
        category_guess: p.category_guess || "Uncategorized",
        confidence: p.confidence ?? 0.7,
        daysAgo: 0,
      });
    } catch {
      showToast("Couldn't parse that. Try again in a moment.");
    } finally {
      setParsing(false);
    }
  }

  function handleCardConfirm() {
    setCaptureCard(null); setTellText(""); setJustTellMe(false);
    showToast("Logged. I'll add it to your books.");
  }

  function handleCardSkip() {
    setCaptureCard(null); setJustTellMe(false); setTellText("");
    showToast("Saved for later. I'll bring it back.");
  }

  // ── Connections ───────────────────────────────────────────────────────────

  function handleConnectProvider(p, reason) {
    setSheet(null);
    if (reason === "already") { showToast(`${p.name} is already connected.`); return; }
    posthog.capture("account_connected", { provider: p.name, provider_type: p.type });
    set({ connections: [...connections,
      { id:p.id, name:p.name, type:p.type, initial:p.initial, syncLabel:"Just now" }] });
    showToast(`${p.name} connected.`);
  }

  function handleDisconnect(connId) {
    posthog.capture("account_disconnected", { provider_id: connId });
    set({ connections: connections.filter(c => c.id !== connId) });
    showToast("Account disconnected.");
  }

  function handleConnectEmail(p) {
    setSheet(null);
    posthog.capture("email_connected", { provider: p.name });
    set({ emailConnections: [...emailConnections,
      { id:p.id, name:p.name }] });
    showToast(`${p.name} connected — watching for receipts.`);
  }

  function handleImport(count) {
    posthog.capture("data_imported", { transaction_count: count });
    showToast(`${count} transactions imported. Check your Penny thread.`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ position:"relative",flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>

      {/* Fullscreen modals */}
      {modal === "photo" && <PhotoOverlay ai={ai} persona={persona} onResult={handleCaptureResult} />}
      {modal === "voice" && <VoiceModal  ai={ai} persona={persona} onResult={handleCaptureResult} onClose={() => setModal(null)} />}

      {/* Scrollable content */}
      <div style={{ flex:1,overflowY:"auto",padding:"20px 20px 24px" }}>

        <h2 style={{ fontSize:"var(--fs-screen-title)",fontWeight:"var(--fw-semibold)",color:"var(--ink)",margin:"0 0 24px",letterSpacing:"var(--ls-tight)" }}>
          Add
        </h2>

        {/* ── Quick capture ──────────────────────────────────────────────── */}
        <section style={{ marginBottom:28 }}>
          <p className="eyebrow" style={{ margin:"0 0 12px" }}>Quick capture</p>

          {/* "Just tell me" hero tile — full width, primary action */}
          <CaptureTile icon={<MessageIcon />} label="Just tell me"
            sub="Describe a transaction in plain English"
            hero active={justTellMe}
            onClick={() => { setJustTellMe(v=>!v); setCaptureCard(null); setTellText(""); }} />

          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:8 }}>
            <CaptureTile icon={<CameraIcon />} label="Photo"
              onClick={() => photoInputRef.current?.click()} />
            <CaptureTile icon={<MicIcon />}    label="Voice note" onClick={handleVoice} />
            <CaptureTile icon={<UploadIcon />} label="Upload"     onClick={() => setSheet("import")} />
          </div>

          <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
            style={{ display:"none" }} onChange={handlePhotoFile} />

          {/* Just tell me input */}
          {justTellMe && !captureCard && (
            <div style={{ marginTop:14,background:"var(--paper)",borderRadius:"var(--r-card-emph)",
              border:"1px solid var(--line)",padding:"14px 16px",
              animation:"slideUp 180ms var(--ease-out) both" }}>
              <p style={{ fontSize:13,color:"var(--ink-3)",margin:"0 0 10px" }}>
                Describe a transaction in plain English.
              </p>
              <textarea autoFocus value={tellText} rows={2}
                onChange={e => setTellText(e.target.value)}
                onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleParse();} }}
                placeholder="e.g. lunch with a client, $60"
                style={{ width:"100%",resize:"none",border:"1.5px solid var(--line)",
                  borderRadius:10,padding:"10px 12px",fontSize:15,background:"var(--white)",
                  color:"var(--ink)",outline:"none",lineHeight:1.5 }} />
              <div style={{ display:"flex",gap:8,marginTop:10 }}>
                <button className="btn btn-full" onClick={handleParse}
                  disabled={parsing || !tellText.trim()}
                  style={{ flex:1,fontSize:14,padding:"11px 0" }}>
                  {parsing ? "Reading…" : "Log it"}
                </button>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { setJustTellMe(false); setTellText(""); }}
                  style={{ minWidth:0,padding:"11px 14px" }}>
                  <CloseIcon />
                </button>
              </div>
            </div>
          )}

          {/* Approval card from any capture mode */}
          {captureCard && (
            <div style={{ marginTop:14 }}>
              <ApprovalCard card={captureCard} persona={persona} ai={ai}
                onConfirm={handleCardConfirm} onSkip={handleCardSkip} />
            </div>
          )}
        </section>

        {/* ── Connected accounts ──────────────────────────────────────────── */}
        <section style={{ marginBottom:28 }}>
          <p className="eyebrow" style={{ margin:"0 0 12px" }}>Connected accounts</p>

          <button onClick={() => setSheet("providers")}
            style={{ display:"flex",alignItems:"center",gap:12,width:"100%",
              background:"var(--white)",border:"1.5px solid var(--ink)",borderRadius:"var(--r-card)",
              padding:"13px 16px",marginBottom: connections.length ? 10 : 0,
              textAlign:"left",cursor:"pointer",color:"var(--ink)",minHeight:0 }}>
            <PlusCircle />
            <span style={{ fontSize:15,fontWeight:"var(--fw-semibold)",letterSpacing:"-0.01em" }}>Add a new connection</span>
          </button>

          {connections.length > 0 && (
            <div style={{ background:"var(--white)",border:"1px solid var(--line)",borderRadius:"var(--r-card)",overflow:"hidden" }}>
              {connections.map((conn, i) => (
                <div key={conn.id} style={{ display:"flex",alignItems:"center",gap:12,
                  padding:"13px 16px",
                  borderBottom: i < connections.length-1 ? "1px solid var(--line-2)" : "none" }}>
                  <div style={{ width:36,height:36,borderRadius:10,background:"var(--paper)",
                    border:"1px solid var(--line)",display:"flex",alignItems:"center",
                    justifyContent:"center",fontSize:14,fontWeight:"var(--fw-bold)",
                    color:"var(--ink-2)",flexShrink:0 }}>{conn.initial}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:15,fontWeight:"var(--fw-medium)",color:"var(--ink)" }}>{conn.name}</div>
                    <div style={{ fontSize:12,color:"var(--ink-4)" }}>Last sync: {conn.syncLabel}</div>
                  </div>
                  <button onClick={() => { setManageConn(conn); setSheet("manage"); }}
                    style={{ background:"none",border:"none",fontSize:13,fontWeight:"var(--fw-medium)",
                      color:"var(--ink-3)",padding:"4px 0",minWidth:0,minHeight:0,cursor:"pointer" }}>
                    Manage
                  </button>
                </div>
              ))}
            </div>
          )}
          {connections.length === 0 && (
            <p style={{ fontSize:13,color:"var(--ink-4)",margin:"8px 0 0" }}>
              Connect a bank or payment account and Penny will start watching your money.
            </p>
          )}
        </section>

        {/* ── Data actions ────────────────────────────────────────────────── */}
        <section style={{ paddingBottom: 8 }}>
          <p className="eyebrow" style={{ margin:"0 0 12px" }}>Data actions</p>

          <div style={{ background:"var(--white)",border:"1px solid var(--line)",borderRadius:"var(--r-card)",overflow:"hidden" }}>
            <DataActionRow icon={<ImportIcon />} label="Import your old books"
              sub="CSV, PDF, or spreadsheet — we'll figure out the columns"
              onClick={() => setSheet("import")} />
            <DataActionRow icon={<ExportIconSvg />} label="Export"
              sub="CSV, QuickBooks, or PDF"
              onClick={() => setSheet("export")} />
            <DataActionRow icon={<MailIcon />} label="Connect your email"
              sub={emailConnections.length > 0
                ? emailConnections.map(c => c.name).join(" & ") + " connected — watching for receipts"
                : "Gmail or Outlook — Penny watches for receipts"}
              onClick={() => setSheet("email")}
              isLast
              trailingNode={emailConnections.length > 0
                ? <div style={{ color:"var(--ink)" }}><CheckCircle /></div>
                : null}
            />
          </div>
        </section>
      </div>

      {/* Bottom sheets */}
      {sheet === "providers" && (
        <ProviderSheet connections={connections} onConnect={handleConnectProvider} onClose={() => setSheet(null)} />
      )}
      {sheet === "export"  && <ExportSheet onClose={() => setSheet(null)} persona={persona} />}
      {sheet === "import"  && <ImportSheet onImport={handleImport} onClose={() => setSheet(null)} />}
      {sheet === "email"   && (
        <ConnectEmailSheet emailConnections={emailConnections}
          onConnect={handleConnectEmail} onClose={() => setSheet(null)} />
      )}
      {sheet === "manage" && manageConn && (
        <ManageSheet conn={manageConn}
          onDisconnect={handleDisconnect}
          onClose={() => { setSheet(null); setManageConn(null); }} />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      <style>{`
        @keyframes slideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CaptureTile({ icon, label, sub, onClick, active, hero }) {
  if (hero) {
    return (
      <button onClick={onClick} style={{
        display:"flex",alignItems:"center",gap:14,width:"100%",
        background: active ? "var(--ink)" : "var(--white)",
        border:`1.5px solid ${active ? "var(--ink)" : "var(--ink)"}`,
        borderRadius:"var(--r-card-emph)",padding:"16px 18px",cursor:"pointer",
        minWidth:"unset",minHeight:"unset",
        color: active ? "var(--white)" : "var(--ink)",
        transition:"background 120ms,color 120ms",
        textAlign:"left",
      }}>
        <div style={{ flexShrink:0, opacity: active ? 1 : 0.75 }}>{icon}</div>
        <div>
          <div style={{ fontSize:15,fontWeight:"var(--fw-semibold)",letterSpacing:"-0.01em",lineHeight:1.3 }}>{label}</div>
          {sub && <div style={{ fontSize:12,marginTop:2,
            color: active ? "rgba(255,255,255,0.65)" : "var(--ink-4)",lineHeight:1.4 }}>{sub}</div>}
        </div>
      </button>
    );
  }
  return (
    <button onClick={onClick} style={{
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      gap:7,background:"var(--paper)",
      border:"1px solid var(--line)",
      borderRadius:"var(--r-card)",padding:"14px 4px",cursor:"pointer",
      minWidth:"unset",minHeight:"unset",height:76,
      color:"var(--ink-2)",
      transition:"background 120ms,color 120ms",
    }}>
      {icon}
      <span style={{ fontSize:11,fontWeight:"var(--fw-medium)",textAlign:"center",lineHeight:1.2 }}>{label}</span>
    </button>
  );
}

function DataActionRow({ icon, label, sub, onClick, isLast, trailingNode }) {
  return (
    <button onClick={onClick} style={{
      display:"flex",alignItems:"center",gap:14,width:"100%",
      background:"none",border:"none",
      borderBottom: !isLast ? "1px solid var(--line-2)" : "none",
      padding:"15px 16px",textAlign:"left",cursor:"pointer",minHeight:0,
    }}>
      <div style={{ width:36,height:36,borderRadius:10,background:"var(--paper)",
        border:"1.5px solid var(--line)",display:"flex",alignItems:"center",
        justifyContent:"center",color:"var(--ink)",flexShrink:0 }}>{icon}</div>
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ fontSize:15,fontWeight:"var(--fw-semibold)",color:"var(--ink)",letterSpacing:"-0.01em" }}>{label}</div>
        <div style={{ fontSize:12,color:"var(--ink-4)",marginTop:2,lineHeight:1.4 }}>{sub}</div>
      </div>
      <div style={{ color:"var(--ink-3)",flexShrink:0 }}>
        {trailingNode || <ChevronRight />}
      </div>
    </button>
  );
}
