/**
 * screens/cpa/App.jsx — CPA app shell.
 *
 * Owns routing, state hydration, and the top-level layout.
 * Routes (path-based, not hash-based):
 *   /penny/demo/cpa/accept/:token  → AuthGate (invite signup)
 *   /penny/demo/cpa/dashboard      → Dashboard (placeholder until Step 10)
 *   /penny/demo/cpa/client/:id     → ClientView (placeholder until Step 7)
 *
 * On first load with no CPA account in localStorage, hydrates from
 * cpa-fixture.json and lands on the dashboard (demo shortcut).
 *
 * Positioning contract:
 *   .cpa-app has position: relative — all overlays use position: absolute.
 *   #sheet-root-cpa is the portal target for all CPA sheets.
 *
 * Responsive:
 *   ≤767px  — single column, bottom tab bar (6 tabs)
 *   768px+  — left sidebar 240px, content flex-fills
 *   1024px+ — sidebar + content + optional 280px detail pane
 */

import React, { useState, useEffect, useCallback } from "react";
import AuthGate from "./AuthGate.jsx";
import ClientView from "./ClientView.jsx";

const STATE_KEY = "penny-demo-state-v5";
const FIXTURE_URL = `${window.PENNY_CONFIG?.baseUrl || "/"}config/cpa-fixture.json`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function readCpaState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.cpa) return parsed.cpa;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveCpaState(cpa) {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    const base = raw ? JSON.parse(raw) : {};
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...base, cpa }));
  } catch {
    // ignore
  }
}

// Extract the CPA sub-path after /cpa. Handles both clean paths
// (/penny/demo/cpa/dashboard) and Vite dev's literal file path
// (/penny/demo/cpa/index.html — treated as root).
function getCpaRoute() {
  // GitHub Pages can only serve /penny/demo/cpa/index.html — deep paths
  // like /cpa/accept/:token 404 and fall back to the founder app.
  // Invite links therefore use ?token= so the browser always loads this file.
  const params = new URLSearchParams(window.location.search);
  const token  = params.get("token");
  if (token) return `/accept/${token}`;

  const path = window.location.pathname;
  const m = path.match(/\/cpa(\/.*)?$/);
  let sub = m ? (m[1] || "/") : "/";
  if (sub === "/index.html") sub = "/";
  return sub;
}

// ── Inline SVG helpers ────────────────────────────────────────────────────────

function Svg({ size = 22, sw = 1.5, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

const ChevronDown = () => (
  <Svg size={14}><polyline points="4 6 11 13 18 6" /></Svg>
);

const LogOut = () => (
  <Svg size={16}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </Svg>
);

// Tab icons for bottom nav (mobile)
const WorkQueueIcon = () => (
  <Svg><rect x="3" y="3" width="7" height="7" /><rect x="12" y="3" width="7" height="7" /><rect x="3" y="12" width="7" height="7" /><rect x="12" y="12" width="7" height="7" /></Svg>
);
const BooksIcon = () => (
  <Svg><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></Svg>
);
const PLIcon = () => (
  <Svg><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Svg>
);
const CashFlowIcon = () => (
  <Svg><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></Svg>
);
const ChatIcon = () => (
  <Svg><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>
);
const RulesIcon = () => (
  <Svg><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></Svg>
);

const TAB_ITEMS = [
  { key: "work-queue",    label: "Work Queue",    Icon: WorkQueueIcon },
  { key: "books",         label: "Books",         Icon: BooksIcon },
  { key: "pl",            label: "P&L",           Icon: PLIcon },
  { key: "cash-flow",     label: "Cash Flow",     Icon: CashFlowIcon },
  { key: "chat",          label: "Chat",          Icon: ChatIcon },
  { key: "learned-rules", label: "Rules",         Icon: RulesIcon },
];

// ── Placeholder views ─────────────────────────────────────────────────────────

function PlaceholderContent({ label }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink-4)",
        fontSize: "var(--fs-body)",
        fontFamily: "var(--font-sans)",
        padding: 40,
        textAlign: "center",
      }}
    >
      {label}
    </div>
  );
}

// ── Top navigation bar ────────────────────────────────────────────────────────

function TopNav({ cpa, clients, activeClientId, onClientChange, onSignOut }) {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);

  const clientList = Object.entries(clients || {});
  const activeClient = clients?.[activeClientId];

  return (
    <header
      style={{
        height: 56,
        borderBottom: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 12,
        background: "var(--white)",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Penny wordmark */}
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 17,
          fontWeight: "var(--fw-bold)",
          letterSpacing: "var(--ls-tight)",
          color: "var(--ink)",
          marginRight: 4,
        }}
      >
        Penny
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: "var(--fw-semibold)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-4)",
          marginRight: "auto",
        }}
      >
        CPA
      </span>

      {/* Client switcher (hidden on mobile — handled by sidebar/nav) */}
      {clientList.length > 0 && (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setClientOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              border: "1.5px solid var(--line)",
              borderRadius: "var(--r-pill)",
              background: "var(--white)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: "var(--fw-medium)",
              color: "var(--ink)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {activeClient?.clientName?.split(" — ")[0] || "All clients"}
            <ChevronDown />
          </button>
          {clientOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "var(--white)",
                border: "1.5px solid var(--line)",
                borderRadius: "var(--r-card)",
                boxShadow: "var(--shadow-card-hero)",
                minWidth: 220,
                zIndex: 20,
                overflow: "hidden",
              }}
            >
              {clientList.map(([id, c]) => (
                <button
                  key={id}
                  onClick={() => { onClientChange(id); setClientOpen(false); }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 16px",
                    background: id === activeClientId ? "var(--paper)" : "var(--white)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: "var(--fw-regular)",
                    color: "var(--ink)",
                    fontFamily: "var(--font-sans)",
                    borderBottom: "1px solid var(--line-2)",
                  }}
                >
                  {c.clientName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CPA avatar button */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setAvatarOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            border: "1.5px solid var(--line)",
            borderRadius: "var(--r-pill)",
            background: "var(--white)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          {/* Monogram avatar — icon container: 8px radius per spec exception */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8, // radius-literal: icon container — DESIGN.md spec
              background: "var(--ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--white)",
              fontSize: 12,
              fontWeight: "var(--fw-bold)",
            }}
          >
            {(cpa?.name || "C").charAt(0).toUpperCase()}
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: "var(--fw-medium)",
              color: "var(--ink)",
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cpa?.name || "CPA"}
          </span>
          <ChevronDown />
        </button>

        {avatarOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              background: "var(--white)",
              border: "1.5px solid var(--line)",
              borderRadius: "var(--r-card)",
              boxShadow: "var(--shadow-card-hero)",
              minWidth: 180,
              zIndex: 20,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px 8px",
                borderBottom: "1px solid var(--line-2)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: "var(--fw-semibold)", color: "var(--ink)", fontFamily: "var(--font-sans)" }}>
                {cpa?.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-sans)", marginTop: 2 }}>
                {cpa?.licenseState} · License {cpa?.licenseNumber}
              </div>
            </div>
            <button
              onClick={onSignOut}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "10px 16px",
                background: "var(--white)",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--ink-3)",
                fontFamily: "var(--font-sans)",
                textAlign: "left",
              }}
            >
              <LogOut /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ── Bottom tab bar (mobile ≤767px) ────────────────────────────────────────────

function BottomTabBar({ active, onChange }) {
  return (
    <nav
      style={{
        display: "flex",
        borderTop: "1px solid var(--line)",
        background: "var(--white)",
        flexShrink: 0,
      }}
    >
      {TAB_ITEMS.map(({ key, label, Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 2px 10px",
              border: "none",
              background: "none",
              cursor: "pointer",
              color: isActive ? "var(--sage)" : "var(--ink-3)",
              fontFamily: "var(--font-sans)",
              gap: 3,
            }}
          >
            <Icon />
            <span style={{ fontSize: 9, fontWeight: "var(--fw-semibold)", letterSpacing: "0.04em" }}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ── Left sidebar (tablet/desktop ≥768px) ─────────────────────────────────────

function Sidebar({ cpa, clients, activeClientId, activeTab, onTabChange, onClientChange, onDashboard }) {
  const activeClient = clients?.[activeClientId];

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: "1px solid var(--line)",
        background: "var(--white)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {/* Back to all clients */}
      <button
        onClick={onDashboard}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "14px 16px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: "var(--fw-medium)",
          color: "var(--ink-3)",
          fontFamily: "var(--font-sans)",
          textAlign: "left",
          borderBottom: "1px solid var(--line-2)",
        }}
      >
        ← All clients
      </button>

      {/* Client info */}
      {activeClient && (
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--line-2)" }}>
          <div style={{ fontSize: 14, fontWeight: "var(--fw-semibold)", color: "var(--ink)", fontFamily: "var(--font-sans)", lineHeight: 1.3 }}>
            {activeClient.clientName?.split(" — ")[0]}
          </div>
          {activeClient.clientName?.includes(" — ") && (
            <div style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-sans)", marginTop: 2 }}>
              {activeClient.clientName.split(" — ")[1]}
            </div>
          )}
          {/* Entity badge */}
          <span
            style={{
              display: "inline-block",
              marginTop: 8,
              padding: "2px 8px",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-pill)",
              fontSize: 10,
              fontWeight: "var(--fw-semibold)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {activeClient.entity}
          </span>
        </div>
      )}

      {/* 6 nav items */}
      <nav style={{ flex: 1, padding: "8px 0" }}>
        {TAB_ITEMS.map(({ key, label, Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 16px",
                background: isActive ? "var(--paper)" : "none",
                border: "none",
                borderLeft: isActive ? "3px solid var(--ink)" : "3px solid transparent",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: isActive ? "var(--fw-semibold)" : "var(--fw-regular)",
                color: isActive ? "var(--ink)" : "var(--ink-3)",
                fontFamily: "var(--font-sans)",
                textAlign: "left",
              }}
            >
              <Icon />
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ── Dashboard placeholder ─────────────────────────────────────────────────────

function DashboardView({ cpa, clients, onClientChange }) {
  const clientList = Object.entries(clients || {});

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24, fontFamily: "var(--font-sans)" }}>
      <h1
        style={{
          fontSize: "var(--fs-screen-title)",
          fontWeight: "var(--fw-semibold)",
          letterSpacing: "var(--ls-tight)",
          color: "var(--ink)",
          margin: "0 0 4px",
        }}
      >
        Good morning, {cpa?.name?.split(" ")[0] || "there"}.
      </h1>
      <p style={{ fontSize: 14, color: "var(--ink-3)", margin: "0 0 28px" }}>
        {clientList.length} client{clientList.length !== 1 ? "s" : ""} connected.
      </p>

      {/* Client card grid — Steps 8–10 will replace this with full Dashboard.jsx */}
      <p className="eyebrow" style={{ margin: "0 0 12px" }}>Clients</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {clientList.map(([id, c]) => (
          <div
            key={id}
            onClick={() => onClientChange?.(id)}
            style={{
              background: "var(--white)",
              border: "1.5px solid var(--line)",
              borderRadius: "var(--r-card)",
              padding: 20,
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>
              {c.clientName?.split(" — ")[0]}
            </div>
            {c.clientName?.includes(" — ") && (
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                {c.clientName.split(" — ")[1]}
              </div>
            )}
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "2px 8px",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r-pill)",
                  fontSize: 10,
                  fontWeight: "var(--fw-semibold)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                }}
              >
                {c.entity}
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
                Tax readiness: {c.taxReadiness?.score ?? "—"}%
              </span>
              {c.taxReadiness?.lastComputedAt && (
                <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                  Updated {new Date(c.taxReadiness.lastComputedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Client view placeholder ───────────────────────────────────────────────────

function ClientViewShell({ clientId, clients, activeTab, onTabChange, onDashboard }) {
  const client = clients?.[clientId];

  return (
    <div style={{ flex: 1, display: "flex", overflowY: "auto" }}>
      <div style={{ flex: 1, padding: 24, fontFamily: "var(--font-sans)" }}>
        <button
          onClick={onDashboard}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            color: "var(--ink-3)",
            fontFamily: "var(--font-sans)",
            padding: 0,
            marginBottom: 16,
          }}
        >
          ← All clients
        </button>
        <h1
          style={{
            fontSize: "var(--fs-screen-title)",
            fontWeight: "var(--fw-semibold)",
            letterSpacing: "var(--ls-tight)",
            color: "var(--ink)",
            margin: "0 0 20px",
          }}
        >
          {client?.clientName?.split(" — ")[0] || clientId}
        </h1>
        <PlaceholderContent label={`${TAB_ITEMS.find(t => t.key === activeTab)?.label || "Content"} — coming in Step 7`} />
      </div>
    </div>
  );
}

// ── CPAApp — root component ───────────────────────────────────────────────────

export default function CPAApp() {
  const [cpaState, setCpaState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState(getCpaRoute());
  const [activeTab, setActiveTab] = useState("work-queue");

  // Derive active client from route
  const clientMatch = route.match(/^\/client\/(.+)$/);
  const activeClientId = clientMatch ? clientMatch[1] : null;

  // Handle popstate
  useEffect(() => {
    function onPop() { setRoute(getCpaRoute()); }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Load CPA state — from localStorage, or hydrate from fixture for demo
  useEffect(() => {
    const existing = readCpaState();

    // If arriving via an invite link (?token=), skip fixture hydration — the
    // invite token is already in the shared localStorage state (written by the
    // founder app). Just use what's there (or empty) and let AuthGate handle it.
    const params = new URLSearchParams(window.location.search);
    if (params.get("token")) {
      setCpaState(existing || { account: null, invites: [], clients: {}, approvals: {}, archives: {} });
      setLoading(false);
      return;
    }
    if (existing?.account) {
      setCpaState(existing);
      setLoading(false);
      return;
    }

    // Demo shortcut: hydrate from fixture
    fetch(`${window.PENNY_CONFIG?.baseUrl || "/"}config/cpa-fixture.json`)
      .then((r) => r.json())
      .then((fixture) => {
        const hydrated = {
          account:   fixture.account,
          invites:   fixture.invites  || [],
          clients:   fixture.clients  || {},
          approvals: fixture.approvals || {},
          archives:  fixture.archives  || {},
        };
        saveCpaState(hydrated);
        setCpaState(hydrated);
      })
      .catch(() => {
        setCpaState({ account: null, invites: [], clients: {}, approvals: {}, archives: {} });
      })
      .finally(() => setLoading(false));
  }, []);

  function navigate(path) {
    // Build full URL from the /cpa base
    const pathBase = window.location.pathname.match(/^(.*\/penny\/demo\/cpa)/)?.[1]
      || (window.location.pathname.includes("/cpa") ? window.location.pathname.split("/cpa")[0] + "/cpa" : "/cpa");
    const full = pathBase + path;
    window.history.pushState({}, "", full);
    setRoute(path);
  }

  function handleClientChange(id) {
    navigate(`/client/${id}`);
    setActiveTab("work-queue");
  }

  function handleDashboard() {
    navigate("/dashboard");
  }

  function handleSignOut() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const base = JSON.parse(raw);
        base.cpa = { account: null, invites: [], clients: {}, approvals: {}, archives: {} };
        localStorage.setItem(STATE_KEY, JSON.stringify(base));
      }
    } catch { /* ignore */ }
    navigate("/dashboard");
    setCpaState(null);
    setLoading(true);
    window.location.reload();
  }

  function handleAuthSuccess(newCpaState) {
    // If coming from an invite link, seed only the founder's matching client
    const params = new URLSearchParams(window.location.search);
    const sc  = params.get("sc")  ? decodeURIComponent(params.get("sc"))  : null;
    const fn  = params.get("fn")  ? decodeURIComponent(params.get("fn"))  : "";
    const biz = params.get("biz") ? decodeURIComponent(params.get("biz")) : "";

    if (sc) {
      fetch(`${window.PENNY_CONFIG?.baseUrl || "/"}config/cpa-fixture.json`)
        .then((r) => r.json())
        .then((fixture) => {
          const matchedEntry = Object.entries(fixture.clients || {}).find(
            ([, c]) => c.scenarioKey === sc
          );
          if (matchedEntry) {
            const [clientId, clientData] = matchedEntry;
            const clientName = [fn, biz].filter(Boolean).join(" — ") || clientData.clientName;
            const seededState = {
              ...newCpaState,
              clients: { [clientId]: { ...clientData, clientName } },
              approvals: Object.fromEntries(
                Object.entries(fixture.approvals || {}).filter(([, a]) => a.clientId === clientId)
              ),
            };
            saveCpaState(seededState);
            setCpaState(seededState);
          } else {
            saveCpaState(newCpaState);
            setCpaState(newCpaState);
          }
        })
        .catch(() => {
          saveCpaState(newCpaState);
          setCpaState(newCpaState);
        })
        .finally(() => navigate("/dashboard"));
    } else {
      saveCpaState(newCpaState);
      setCpaState(newCpaState);
      navigate("/dashboard");
    }
  }

  /** Accepts either a new cpaState object or an updater function (prev => next). */
  function updateCpaState(updaterOrValue) {
    setCpaState((prev) => {
      const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
      saveCpaState(next);
      return next;
    });
  }

  if (loading) {
    return (
      <div
        className="cpa-app"
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--paper)",
        }}
      />
    );
  }

  // Auth gate routes — no account required
  if (route.startsWith("/accept")) {
    return (
      <div className="cpa-app" style={{ minHeight: "100dvh" }}>
        <AuthGate onSuccess={handleAuthSuccess} />
        <div id="sheet-root-cpa" />
      </div>
    );
  }

  // If no account, redirect to accept (with no token → expired view)
  if (!cpaState?.account) {
    return (
      <div className="cpa-app" style={{ minHeight: "100dvh" }}>
        <AuthGate onSuccess={handleAuthSuccess} />
        <div id="sheet-root-cpa" />
      </div>
    );
  }

  const clients = cpaState.clients || {};
  const isDashboard = route === "/" || route === "/dashboard" || route.startsWith("/dashboard");
  const isClient = !!clientMatch;

  return (
    <div
      className="cpa-app"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans)",
        background: "var(--paper)",
      }}
    >
      <TopNav
        cpa={cpaState.account}
        clients={clients}
        activeClientId={activeClientId}
        onClientChange={handleClientChange}
        onSignOut={handleSignOut}
      />

      {/* Content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Sidebar — visible at 768px+ when in client view */}
        {isClient && (
          <div className="cpa-sidebar">
            <Sidebar
              cpa={cpaState.account}
              clients={clients}
              activeClientId={activeClientId}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onClientChange={handleClientChange}
              onDashboard={handleDashboard}
            />
          </div>
        )}

        {/* Main content */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {isDashboard && (
            <DashboardView cpa={cpaState.account} clients={clients} onClientChange={handleClientChange} />
          )}
          {isClient && (
            <ClientView
              clientId={activeClientId}
              clients={clients}
              approvals={cpaState.approvals || {}}
              activeTab={activeTab}
              cpaAccount={cpaState.account}
              onUpdateCpa={updateCpaState}
            />
          )}
        </main>
      </div>

      {/* Bottom tab bar — visible at ≤767px when in client view */}
      {isClient && (
        <div className="cpa-bottom-nav">
          <BottomTabBar active={activeTab} onChange={setActiveTab} />
        </div>
      )}

      {/* CPA sheet portal target */}
      <div id="sheet-root-cpa" />
    </div>
  );
}
