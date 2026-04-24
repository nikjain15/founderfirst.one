/**
 * screens/cpa/AuthGate.jsx — CPA invite accept + license verification.
 *
 * Renders one of three views based on URL token validity:
 *   1. ExpiredInviteView  — token is bad, revoked, or expired
 *   2. SignupForm         — valid token → name/email/password/license fields
 *   3. (success)          — calls onSuccess(newCpaState) → App navigates to dashboard
 *
 * Token is read from window.location.pathname at /cpa/accept/:token.
 * Invite validation reads state.cpa.invites[] from localStorage, falling back
 * to cpa-fixture.json for the demo.
 *
 * Design rules:
 *   - Tokens only — no raw hex, fontWeight, borderRadius literals.
 *   - No position: fixed.
 *   - American English. No emoji (CPA context).
 *   - CPA license number: 6–12 alphanumeric characters.
 *   - CPA license state: validated 2-letter US code.
 */

import React, { useState, useEffect } from "react";
import { acceptInvite } from "../../util/cpaState.js";

// ── US state codes ────────────────────────────────────────────────────────────

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
  "DC",
];

const STATE_KEY = "penny-demo-state-v5";

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

const PMarkLogo = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="var(--ink)" />
    <text
      x="20"
      y="27"
      textAnchor="middle"
      fill="var(--white)"
      fontFamily="var(--font-sans)"
      fontSize="22"
      fontWeight="700"
    >
      P
    </text>
  </svg>
);

const AlertCircle = () => (
  <Svg size={44} sw={1.5} style={{ color: "var(--error)" }}>
    <circle cx="11" cy="11" r="9" />
    <line x1="11" y1="7" x2="11" y2="11" />
    <line x1="11" y1="15" x2="11.01" y2="15" />
  </Svg>
);

// ── Field component ───────────────────────────────────────────────────────────

function Field({ label, error, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: "var(--fw-semibold)",
          color: "var(--ink-3)",
          letterSpacing: "0.04em",
          fontFamily: "var(--font-sans)",
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <span
          style={{
            fontSize: 12,
            color: "var(--error)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "11px 14px",
  border: "1.5px solid var(--line)",
  borderRadius: "var(--r-pill)",
  fontSize: 15,
  fontWeight: "var(--fw-regular)",
  color: "var(--ink)",
  background: "var(--white)",
  fontFamily: "var(--font-sans)",
  outline: "none",
  boxSizing: "border-box",
};

const inputErrorStyle = {
  ...inputStyle,
  borderColor: "var(--error)",
};

// ── ExpiredInviteView ─────────────────────────────────────────────────────────

function ExpiredInviteView() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        background: "var(--paper)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <PMarkLogo />
      <div style={{ marginTop: 24 }}>
        <AlertCircle />
      </div>
      <h1
        style={{
          marginTop: 16,
          fontSize: "var(--fs-h3)",
          fontWeight: "var(--fw-semibold)",
          letterSpacing: "var(--ls-tighter)",
          color: "var(--ink)",
          textAlign: "center",
          maxWidth: 360,
        }}
      >
        This invite has expired or been revoked.
      </h1>
      <p
        style={{
          marginTop: 12,
          fontSize: "var(--fs-body)",
          fontWeight: "var(--fw-regular)",
          color: "var(--ink-3)",
          textAlign: "center",
          maxWidth: 360,
          lineHeight: 1.55,
        }}
      >
        Ask your client to send a new one.
      </p>
    </div>
  );
}

// ── SignupForm ────────────────────────────────────────────────────────────────

function SignupForm({ token, invite, onSuccess }) {
  const [fields, setFields] = useState({
    name:          "",
    email:         "",
    password:      "",
    licenseNumber: "",
    licenseState:  "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState("");

  function set(key, val) {
    setFields((f) => ({ ...f, [key]: val }));
    setErrors((e) => ({ ...e, [key]: "" }));
    setGlobalError("");
  }

  function validate() {
    const e = {};
    if (!fields.name.trim()) e.name = "Full name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
      e.email = "Enter a valid email address.";
    if (fields.password.length < 8)
      e.password = "Password must be at least 8 characters.";
    if (!/^[A-Za-z0-9]{6,12}$/.test(fields.licenseNumber))
      e.licenseNumber = "License number must be 6–12 alphanumeric characters.";
    if (!US_STATES.includes(fields.licenseState.toUpperCase()))
      e.licenseState = "Enter a valid 2-letter US state code.";
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    setGlobalError("");

    // Read current cpa state from localStorage
    let cpa = { account: null, invites: [], clients: {}, approvals: {}, archives: {} };
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.cpa) cpa = parsed.cpa;
      }
    } catch { /* ignore */ }

    // acceptInvite is synchronous — pure state transformer
    const { newCpa, error } = acceptInvite(cpa, token, {
      name:          fields.name.trim(),
      email:         fields.email.trim().toLowerCase(),
      password:      fields.password,
      licenseNumber: fields.licenseNumber.trim().toUpperCase(),
      licenseState:  fields.licenseState.trim().toUpperCase(),
    });

    if (error) {
      setGlobalError(error);
      setSubmitting(false);
      return;
    }

    // Persist and hand off to App
    try {
      const raw = localStorage.getItem(STATE_KEY);
      const base = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STATE_KEY, JSON.stringify({ ...base, cpa: newCpa }));
    } catch { /* ignore */ }

    onSuccess(newCpa);
  }

  const clientName = invite?.cpaName || "your client";

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "48px 24px 40px",
        background: "var(--paper)",
        fontFamily: "var(--font-sans)",
        overflowY: "auto",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <PMarkLogo />

        <h1
          style={{
            marginTop: 20,
            fontSize: "var(--fs-h3)",
            fontWeight: "var(--fw-semibold)",
            letterSpacing: "var(--ls-tighter)",
            color: "var(--ink)",
          }}
        >
          Create your CPA account
        </h1>
        <p
          style={{
            marginTop: 6,
            fontSize: 14,
            color: "var(--ink-3)",
            lineHeight: 1.5,
          }}
        >
          You were invited to access books for {clientName}.
          This account is free.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 18 }}
          noValidate
        >
          <Field label="Full name" error={errors.name}>
            <input
              type="text"
              value={fields.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Priya Sharma"
              autoComplete="name"
              style={errors.name ? inputErrorStyle : inputStyle}
            />
          </Field>

          <Field label="Email" error={errors.email}>
            <input
              type="email"
              value={fields.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="you@yourfirm.com"
              autoComplete="email"
              style={errors.email ? inputErrorStyle : inputStyle}
            />
          </Field>

          <Field label="Password" error={errors.password}>
            <input
              type="password"
              value={fields.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              style={errors.password ? inputErrorStyle : inputStyle}
            />
          </Field>

          {/* CPA credentials row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 12 }}>
            <Field label="CPA license number" error={errors.licenseNumber}>
              <input
                type="text"
                value={fields.licenseNumber}
                onChange={(e) => set("licenseNumber", e.target.value)}
                placeholder="CA-112233"
                autoComplete="off"
                maxLength={12}
                style={errors.licenseNumber ? inputErrorStyle : inputStyle}
              />
            </Field>
            <Field label="State" error={errors.licenseState}>
              <input
                type="text"
                value={fields.licenseState}
                onChange={(e) => set("licenseState", e.target.value.toUpperCase())}
                placeholder="CA"
                autoComplete="off"
                maxLength={2}
                style={{
                  ...(errors.licenseState ? inputErrorStyle : inputStyle),
                  textAlign: "center",
                  textTransform: "uppercase",
                }}
              />
            </Field>
          </div>

          {globalError && (
            <p
              style={{
                fontSize: 13,
                color: "var(--error)",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {globalError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 4,
              width: "100%",
              padding: "14px 24px",
              background: submitting ? "var(--ink-3)" : "var(--ink)",
              color: "var(--white)",
              border: "none",
              borderRadius: "var(--r-pill)",
              fontSize: 15,
              fontWeight: "var(--fw-semibold)",
              fontFamily: "var(--font-sans)",
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p
          style={{
            marginTop: 20,
            fontSize: 12,
            color: "var(--ink-4)",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          No credit card required. Your license number is used for
          verification only and is never shared with your clients.
        </p>
      </div>
    </div>
  );
}

// ── AuthGate — root component ─────────────────────────────────────────────────

export default function AuthGate({ onSuccess }) {
  const [view, setView]   = useState("loading");
  const [invite, setInvite] = useState(null);
  const [token, setToken]   = useState(null);

  useEffect(() => {
    // Extract :token from /cpa/accept/:token
    const pathParts = window.location.pathname.split("/");
    const idx = pathParts.findIndex((p) => p === "accept");
    const tok = idx !== -1 ? pathParts[idx + 1] : null;
    setToken(tok || "");

    if (!tok) {
      setView("expired");
      return;
    }

    // Read state.cpa from localStorage (may be hydrated from fixture by App.jsx)
    let cpa = null;
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        cpa = parsed?.cpa;
      }
    } catch { /* ignore */ }

    if (!cpa?.invites?.length) {
      setView("expired");
      return;
    }

    const found = cpa.invites.find((inv) => inv.token === tok);
    if (!found) {
      setView("expired");
      return;
    }

    const now = Date.now();
    if (
      found.status === "revoked" ||
      found.status === "expired" ||
      found.status === "accepted" ||
      now > found.expiresAt
    ) {
      setView("expired");
      return;
    }

    setInvite(found);
    setView("signup");
  }, []);

  if (view === "loading") {
    return (
      <div
        style={{
          minHeight: "100dvh",
          background: "var(--paper)",
        }}
      />
    );
  }

  if (view === "expired") return <ExpiredInviteView />;

  return <SignupForm token={token} invite={invite} onSuccess={onSuccess} />;
}
