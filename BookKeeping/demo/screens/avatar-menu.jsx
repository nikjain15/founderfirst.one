/**
 * screens/avatar-menu.jsx — Avatar overlay: Profile / Memory / Preferences.
 *
 * Reached via ⋮ in the Penny thread header. Full-screen overlay at #/avatar.
 * No AI calls — static content editing.
 */

import React, { useState, useCallback, useMemo } from "react";
import { generateInvite, revokeInvite } from "../util/cpaState.js";

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

// --- Shared back header ------------------------------------------------------
function OverlayHeader({ title, onBack }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 12px", borderBottom: "1px solid var(--line-2)", flexShrink: 0 }}>
      <button
        type="button"
        onClick={onBack}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--ink-3)", display: "flex", alignItems: "center", minWidth: 44, minHeight: 44, justifyContent: "center" }}
        aria-label="Back"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="12 4 6 10 12 16"/>
        </svg>
      </button>
      <h1 style={{ margin: 0, fontSize: "var(--fs-screen-title)", fontWeight: "var(--fw-semibold)", letterSpacing: "var(--ls-tight)" }}>
        {title}
      </h1>
    </header>
  );
}

// --- Editable field row ------------------------------------------------------
function FieldRow({ label, value, onChange, type = "text", options = null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--line-2)", minHeight: "var(--tap-min)" }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: "0 0 2px", fontSize: 12, color: "var(--ink-4)", fontWeight: "var(--fw-medium)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</p>
        {editing ? (
          options ? (
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              autoFocus
              style={{ fontSize: 15, border: "none", background: "none", color: "var(--ink)", fontFamily: "var(--font-sans)", padding: 0, outline: "none", width: "100%" }}
            >
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
              autoFocus
              style={{ fontSize: 15, border: "none", background: "none", color: "var(--ink)", fontFamily: "var(--font-sans)", padding: 0, outline: "none", width: "100%" }}
            />
          )
        ) : (
          <p style={{ margin: 0, fontSize: 15, color: value ? "var(--ink)" : "var(--ink-4)" }}>
            {value || `Add ${label.toLowerCase()}`}
          </p>
        )}
      </div>
      {!editing && (
        <button
          type="button"
          onClick={() => { setDraft(value || ""); setEditing(true); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", fontSize: 13, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "flex-end" }}
        >
          Edit
        </button>
      )}
    </div>
  );
}

// --- Toggle row --------------------------------------------------------------
function ToggleRow({ label, sublabel, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--line-2)", minHeight: "var(--tap-min)" }}>
      <div style={{ flex: 1, paddingRight: 12 }}>
        <p style={{ margin: 0, fontSize: 15, color: "var(--ink)" }}>{label}</p>
        {sublabel && <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--ink-4)" }}>{sublabel}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer", flexShrink: 0,
          background: checked ? "var(--ink)" : "var(--line)",
          position: "relative", transition: "background 0.18s",
          minWidth: "unset", minHeight: "unset",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: checked ? 21 : 3,
          width: 20, height: 20, borderRadius: "50%", background: "var(--white)",
          transition: "left 0.18s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
        }} />
      </button>
    </div>
  );
}

// --- Your CPA row (inline expand) --------------------------------------------
function YourCpaRow({ state, set, showToast }) {
  const [expanded, setExpanded] = useState(false);
  const [email,    setEmail]    = useState("");
  const [copied,   setCopied]   = useState(false);

  const cpa = state.cpa || {};

  const activeInvite = useMemo(() => (cpa.invites || []).find(
    (inv) => inv.status === "pending" && inv.expiresAt > Date.now()
  ), [cpa.invites]);

  const hasAccount = !!cpa.account;

  const statusLabel = useMemo(() => {
    if (hasAccount) return cpa.account.name;
    if (activeInvite) {
      const daysLeft = Math.max(1, Math.ceil((activeInvite.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
      return `Pending (${daysLeft}d left)`;
    }
    return "Not connected";
  }, [hasAccount, cpa.account, activeInvite]);

  const baseUrl = window.PENNY_CONFIG?.baseUrl || "/";
  const link = activeInvite
    ? `${window.location.origin}${baseUrl}cpa/accept/${activeInvite.token}`
    : null;

  function handleGenerate() {
    const trimmed = email.trim();
    if (!trimmed) return;
    const { newCpa } = generateInvite(cpa, "founder-client", trimmed, state.persona?.cpaName || null);
    set({ cpa: newCpa });
    showToast("Invite link created.");
    setEmail("");
  }

  function handleRevoke() {
    if (!activeInvite) return;
    const newCpa = revokeInvite(cpa, activeInvite.id);
    set({ cpa: newCpa });
    showToast("Invite revoked.");
  }

  function handleCopy() {
    if (!link) return;
    navigator.clipboard?.writeText(link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ borderBottom: "1px solid var(--line-2)" }}>
      {/* Row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "14px 20px",
          background: "none", border: "none", cursor: "pointer",
          fontFamily: "var(--font-sans)", textAlign: "left",
          minHeight: "var(--tap-min)",
        }}
      >
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 2px", fontSize: 12, color: "var(--ink-4)", fontWeight: "var(--fw-medium)",
            letterSpacing: "0.05em", textTransform: "uppercase" }}>Your CPA</p>
          <p style={{ margin: 0, fontSize: 15, color: hasAccount ? "var(--ink)" : "var(--ink-3)" }}>
            {statusLabel}
          </p>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, marginLeft: 8, color: "var(--ink-3)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.18s" }}>
          <polyline points="6 4 10 8 6 12"/>
        </svg>
      </button>

      {/* Inline expand */}
      {expanded && (
        <div style={{ padding: "0 20px 16px" }}>
          {hasAccount ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
              {cpa.account.name} has live access to your books.
            </p>
          ) : activeInvite ? (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
                Invite link expires in {Math.max(1, Math.ceil((activeInvite.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))} days.
              </p>
              <div style={{
                background: "var(--paper)", borderRadius: "var(--r-card)",
                padding: "8px 10px", marginBottom: 10,
                border: "1px solid var(--line)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <p style={{ margin: 0, fontSize: 11, color: "var(--ink-3)", flex: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  fontFamily: "monospace" }}>
                  {link}
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    background: copied ? "var(--ink)" : "var(--white)",
                    color: copied ? "var(--white)" : "var(--ink)",
                    border: "1.5px solid var(--ink)", borderRadius: "var(--r-pill)",
                    padding: "4px 10px", fontSize: 11, fontWeight: "var(--fw-semibold)",
                    cursor: "pointer", fontFamily: "var(--font-sans)",
                    flexShrink: 0, minWidth: "unset", minHeight: "unset",
                    transition: "background 0.2s, color 0.2s",
                  }}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <button type="button" className="btn btn-ghost btn-full" onClick={handleRevoke}
                style={{ fontSize: 13 }}>
                Revoke invite
              </button>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
                Invite your CPA to access your live books. Link expires in 7 days.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleGenerate(); }}
                placeholder="CPA email address"
                style={{
                  width: "100%", boxSizing: "border-box",
                  border: "1px solid var(--line)", borderRadius: "var(--r-card)",
                  padding: "9px 12px", fontSize: 14, fontFamily: "var(--font-sans)",
                  color: "var(--ink)", background: "var(--white)",
                  outline: "none", marginBottom: 10,
                }}
              />
              <button
                type="button"
                className="btn btn-full"
                onClick={handleGenerate}
                disabled={!email.trim()}
                style={{ opacity: email.trim() ? 1 : 0.45, fontSize: 14 }}
              >
                Generate invite link
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- Profile sub-screen ------------------------------------------------------
function ProfileScreen({ state, set, onBack, showToast }) {
  const { persona } = state;
  const [showEntitySheet, setShowEntitySheet] = useState(false);
  const [pendingEntity,   setPendingEntity]   = useState(null);

  const update = useCallback((key, val) => {
    set({ persona: { ...persona, [key]: val } });
  }, [persona, set]);

  const requestEntityChange = useCallback((val) => {
    if (val === persona?.entity) return;
    setPendingEntity(val);
    setShowEntitySheet(true);
  }, [persona?.entity]);

  const confirmEntityChange = useCallback(() => {
    update("entity", pendingEntity);
    setShowEntitySheet(false);
    showToast("Entity type updated.");
  }, [pendingEntity, update, showToast]);

  const ENTITY_OPTIONS = [
    { value: "sole-prop",  label: "Sole proprietor" },
    { value: "s-corp",     label: "S-Corp" },
    { value: "llc",        label: "LLC" },
    { value: "partnership",label: "Partnership" },
  ];
  const INDUSTRY_OPTIONS = [
    { value: "consulting",   label: "Consulting" },
    { value: "design",       label: "Design & creative" },
    { value: "photography",  label: "Photography" },
    { value: "writing",      label: "Writing & content" },
    { value: "coaching",     label: "Coaching" },
    { value: "legal",        label: "Legal" },
    { value: "accounting",   label: "Accounting" },
    { value: "tech",         label: "Tech & software" },
    { value: "trades",       label: "Trades & services" },
    { value: "retail",       label: "Retail & e-commerce" },
  ];

  const entityLabel = ENTITY_OPTIONS.find((o) => o.value === persona?.entity)?.label || persona?.entity || "";
  const industryLabel = INDUSTRY_OPTIONS.find((o) => o.value === persona?.industry)?.label || persona?.industry || "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <OverlayHeader title="Profile" onBack={onBack} />
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div className="card" style={{ margin: "20px 20px 0", padding: 0, overflow: "hidden" }}>
          <FieldRow label="First name"     value={persona?.firstName || persona?.name || ""} onChange={(v) => update("firstName", v)} />
          <FieldRow label="Last name"      value={persona?.lastName || ""}                   onChange={(v) => update("lastName", v)} />
          <FieldRow label="Business name"  value={persona?.business || ""}                   onChange={(v) => update("business", v)} />
          <FieldRow label="Entity type"    value={entityLabel}  onChange={requestEntityChange} options={ENTITY_OPTIONS} />
          <FieldRow label="Industry"       value={industryLabel} onChange={(v) => update("industry", v)} options={INDUSTRY_OPTIONS} />
          <FieldRow label="Primary bank"   value={persona?.bank || ""}                       onChange={(v) => update("bank", v)} />
        </div>

        <p className="eyebrow" style={{ padding: "20px 20px 8px" }}>CPA contact</p>
        <div className="card" style={{ margin: "0 20px", padding: 0, overflow: "hidden" }}>
          <FieldRow label="CPA name"  value={persona?.cpaName || ""}  onChange={(v) => update("cpaName", v)} />
          <FieldRow label="CPA email" value={persona?.cpaEmail || ""} onChange={(v) => update("cpaEmail", v)} type="email" />
        </div>

        <p className="eyebrow" style={{ padding: "20px 20px 8px" }}>Live access</p>
        <div className="card" style={{ margin: "0 20px", padding: 0, overflow: "hidden" }}>
          <YourCpaRow state={state} set={set} showToast={showToast} />
        </div>
      </div>

      {/* Entity change confirm sheet */}
      {showEntitySheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setShowEntitySheet(false)} />
          <div className="sheet" style={{ padding: "0 20px 24px" }}>
            <div className="sheet-handle" />
            <p style={{ fontSize: 16, fontWeight: "var(--fw-semibold)", lineHeight: 1.4, margin: "4px 0 12px", color: "var(--ink)" }}>
              Changing entity type
            </p>
            <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55, margin: "0 0 20px" }}>
              Changing entity type updates how Penny tracks your books. If you're making this change with the IRS too, you'll need to file the right form (Form 2553 for S-Corp election, for example). I'll handle the books; your CPA handles the IRS side.
            </p>
            <button className="btn btn-full" type="button" onClick={confirmEntityChange}>
              I got it — update Penny
            </button>
            <button className="btn btn-ghost btn-full" type="button" onClick={() => setShowEntitySheet(false)} style={{ marginTop: 10 }}>
              Never mind
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// --- Memory sub-screen -------------------------------------------------------
const SEED_MEMORY = [
  { id: "m1", text: "Adobe Creative Cloud → Software" },
  { id: "m2", text: "Notion → Software" },
  { id: "m3", text: "Bright Co → client, usually pays in 14 days" },
  { id: "m4", text: "Con Edison → Utilities" },
  { id: "m5", text: "Always categorize Gusto as Payroll software" },
];

function MemoryScreen({ onBack, showToast }) {
  const [memories, setMemories] = useState(SEED_MEMORY);

  const forget = (id) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    showToast("Forgotten.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <OverlayHeader title="Memory" onBack={onBack} />
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        <p style={{ fontSize: 14, color: "var(--ink-3)", margin: "0 0 16px", lineHeight: 1.5 }}>
          Things Penny has learned. Tap "Forget" to remove any rule.
        </p>
        {memories.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--ink-4)", textAlign: "center", marginTop: 40 }}>Nothing here yet.</p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {memories.map((m, i) => (
              <div
                key={m.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: i < memories.length - 1 ? "1px solid var(--line-2)" : "none",
                  minHeight: "var(--tap-min)",
                }}
              >
                <span style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.45, flex: 1 }}>{m.text}</span>
                <button
                  type="button"
                  onClick={() => forget(m.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)", fontSize: 13, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "flex-end" }}
                >
                  Forget
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Preferences sub-screen --------------------------------------------------
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIMES = ["7am", "8am", "9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm"];

function PreferencesScreen({ state, set, onBack }) {
  const prefs = state.preferences || {};

  const update = (key, val) => set({ preferences: { ...prefs, [key]: val } });

  const checkinDay  = prefs.checkinDay  || "Mon";
  const checkinTime = prefs.checkinTime || "8am";
  const notifType   = prefs.notifType   || "Daily digest";
  const faceId      = prefs.faceId      ?? false;
  const aiTraining  = prefs.aiTraining  ?? false;
  const showIrsLines = prefs.showIrsLines ?? false;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <OverlayHeader title="Preferences" onBack={onBack} />
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* Check-in time */}
        <p className="eyebrow" style={{ padding: "20px 20px 8px" }}>Check-in time</p>
        <div style={{ padding: "0 20px" }}>
          <div className="checkin-picker">
            <p className="checkin-picker-label">Day</p>
            <div className="checkin-days">
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`checkin-day-btn${checkinDay === d ? " checkin-day-btn--selected" : ""}`}
                  onClick={() => update("checkinDay", d)}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="checkin-picker-label">Time</p>
            <div className="checkin-times">
              {TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`checkin-time-btn${checkinTime === t ? " checkin-time-btn--selected" : ""}`}
                  onClick={() => update("checkinTime", t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <p className="eyebrow" style={{ padding: "20px 20px 8px" }}>Notifications</p>
        <div className="card" style={{ margin: "0 20px", padding: 0, overflow: "hidden" }}>
          {["Real-time", "Daily digest"].map((opt, i) => (
            <button
              key={opt}
              type="button"
              onClick={() => update("notifType", opt)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 20px", background: "none", border: "none",
                borderBottom: i === 0 ? "1px solid var(--line-2)" : "none",
                cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left",
                minHeight: "var(--tap-min)",
              }}
            >
              <span style={{ fontSize: 15, color: "var(--ink)" }}>{opt}</span>
              {notifType === opt && (
                <span style={{ fontSize: 14, fontWeight: "var(--fw-semibold)", color: "var(--ink)" }}>✓</span>
              )}
            </button>
          ))}
        </div>

        {/* CPA activity */}
        <p className="eyebrow" style={{ padding: "20px 20px 8px" }}>CPA activity</p>
        <div className="card" style={{ margin: "0 20px", padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px" }}>
            <p style={{ margin: "0 0 10px", fontSize: 15, color: "var(--ink)" }}>Notify me when my CPA acts</p>
            <div style={{ display: "flex", border: "1.5px solid var(--line)", borderRadius: "var(--r-pill)", overflow: "hidden" }}>
              {(["real-time", "daily-digest", "off"]).map((opt) => {
                const label = opt === "real-time" ? "Real-time" : opt === "daily-digest" ? "Daily digest" : "Off";
                const active = (prefs.notifyCpaActivity || "real-time") === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => update("notifyCpaActivity", opt)}
                    style={{
                      flex: 1, padding: "8px 4px",
                      background: active ? "var(--ink)" : "var(--white)",
                      color: active ? "var(--white)" : "var(--ink-3)",
                      border: "none", cursor: "pointer",
                      fontFamily: "var(--font-sans)",
                      fontSize: 12, fontWeight: active ? "var(--fw-semibold)" : "var(--fw-regular)",
                      minWidth: "unset", minHeight: "unset",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tax display */}
        <p className="eyebrow" style={{ padding: "20px 20px 8px" }}>Tax display</p>
        <div className="card" style={{ margin: "0 20px", padding: 0, overflow: "hidden" }}>
          <ToggleRow
            label="Show IRS line on cards"
            sublabel="Shows the Schedule C / 1120-S / 1065 line next to each category."
            checked={showIrsLines}
            onChange={(v) => update("showIrsLines", v)}
          />
        </div>

        {/* Security + AI */}
        <p className="eyebrow" style={{ padding: "20px 20px 8px" }}>Security & privacy</p>
        <div className="card" style={{ margin: "0 20px", padding: 0, overflow: "hidden" }}>
          <ToggleRow
            label="Face ID / passcode lock"
            sublabel="Locks Penny after 5 minutes."
            checked={faceId}
            onChange={(v) => update("faceId", v)}
          />
          <ToggleRow
            label="AI training on my data"
            sublabel="Off by default. Explicit opt-in only."
            checked={aiTraining}
            onChange={(v) => update("aiTraining", v)}
          />
        </div>

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}

// --- Root avatar menu --------------------------------------------------------
export default function AvatarMenuScreen({ state, set, navigate }) {
  const [sub,   setSub]   = useState(null); // null | "profile" | "memory" | "preferences"
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const back = () => setSub(null);

  if (sub === "profile")     return <><ProfileScreen     state={state} set={set} onBack={back} showToast={showToast} />{toast && <Toast msg={toast} />}</>;
  if (sub === "memory")      return <><MemoryScreen      onBack={back} showToast={showToast} />{toast && <Toast msg={toast} />}</>;
  if (sub === "preferences") return <><PreferencesScreen state={state} set={set} onBack={back} />{toast && <Toast msg={toast} />}</>;

  const MENU_ITEMS = [
    { key: "profile",     label: "Profile",     sub: "Manage your name, business, and CPA details." },
    { key: "memory",      label: "Memory",      sub: "What Penny has learned about you." },
    { key: "preferences", label: "Preferences", sub: "Notifications, check-in time, and security." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--white)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 12px", borderBottom: "1px solid var(--line-2)" }}>
        <button
          type="button"
          onClick={() => navigate("#/penny")}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--ink-3)", display: "flex", alignItems: "center", minWidth: 44, minHeight: 44, justifyContent: "center" }}
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="5" y1="5" x2="15" y2="15"/>
            <line x1="15" y1="5" x2="5" y2="15"/>
          </svg>
        </button>
        <h1 style={{ margin: 0, fontSize: "var(--fs-screen-title)", fontWeight: "var(--fw-semibold)", letterSpacing: "var(--ls-tight)" }}>
          {state.persona?.firstName || state.persona?.name || "Your account"}
        </h1>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {MENU_ITEMS.map((item, i) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSub(item.key)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px", background: "none", border: "none",
                borderBottom: i < MENU_ITEMS.length - 1 ? "1px solid var(--line-2)" : "none",
                cursor: "pointer", fontFamily: "var(--font-sans)", textAlign: "left",
                minHeight: "var(--tap-min)",
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: "var(--fw-medium)", color: "var(--ink)" }}>{item.label}</p>
                <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--ink-4)" }}>{item.sub}</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 8 }}>
                <polyline points="6 4 10 8 6 12"/>
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ padding: "20px 20px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
        <button className="btn btn-ghost btn-full" type="button" onClick={() => navigate("#/add")}>
          Export my data
        </button>
        <button
          type="button"
          onClick={() => {
            set({ onboardingComplete: false, persona: null });
            navigate("#/");
          }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--ink-4)", minHeight: "var(--tap-min)", fontFamily: "var(--font-sans)" }}
        >
          Reset demo
        </button>
      </div>

      {toast && <Toast msg={toast} />}
    </div>
  );
}
