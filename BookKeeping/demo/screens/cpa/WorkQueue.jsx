/**
 * screens/cpa/WorkQueue.jsx — Tab 1: per-client work queue.
 *
 * Priority order:
 *  1. type "reclassification" | "cpa-added-txn" + status "pending" → var(--error) dot
 *  2. pendingAdds with no category → var(--amber) dot
 *  3. flags[txnId] not resolvedAt → var(--ink-3) dot
 *  4. type "penny-question" + status "pending" → var(--sage) dot
 *
 * Collapsible "Resolved" section below active items.
 * Auto-archive resolved items older than 7 days.
 */

import React, { useState } from "react";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

export default function WorkQueue({ clientId, clientData, approvals, cpaAccount }) {
  const [resolvedOpen, setResolvedOpen] = useState(false);

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
        (a.type === "reclassification" || a.type === "cpa-added-txn") &&
        a.status === "pending"
    )
    .map((a) => {
      let description;
      if (a.type === "reclassification") {
        description = `Reclassify: ${a.fromCategory} → ${a.toCategory}`;
        if (a.note) description += ` — ${a.note}`;
      } else {
        description = `Added: ${a.toCategory || "transaction"} — pending founder acknowledgment`;
        if (a.note) description += `. ${a.note}`;
      }
      return {
        key: a.id,
        dot: "var(--error)",
        description,
        age: ageStr(a.createdAt),
        cta: "View",
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
      age: ageStr(p.addedAt),
      cta: "Categorize",
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
      return {
        key: `flag-${txnId}`,
        dot: "var(--ink-3)",
        description: `${reasonLabel}${f.note ? ` — ${f.note}` : ""}`,
        age: ageStr(f.flaggedAt),
        cta: "Resolve",
        founderNote: null,
      };
    });

  // Priority 4: penny-question pending
  const p4 = clientApprovals
    .filter((a) => a.type === "penny-question" && a.status === "pending")
    .map((a) => ({
      key: a.id,
      dot: "var(--sage)",
      description: a.note || "Penny question — input needed",
      age: ageStr(a.createdAt),
      cta: "Answer",
      founderNote: null,
    }));

  const activeItems = [...p1, ...p2, ...p3, ...p4];

  // ── Resolved items (auto-archive after 7 days) ────────────────────────────
  const resolvedItems = clientApprovals
    .filter(
      (a) =>
        (a.status === "approved" || a.status === "rejected") &&
        a.resolvedAt &&
        now - a.createdAt < SEVEN_DAYS_MS
    )
    .map((a) => {
      let description;
      if (a.type === "reclassification") {
        description = `Reclassify: ${a.fromCategory} → ${a.toCategory}`;
      } else if (a.type === "cpa-added-txn") {
        description = `Added transaction (${a.toCategory || "—"})`;
      } else if (a.type === "year-access-request") {
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

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "24px var(--pad-screen)",
        fontFamily: "var(--font-sans)",
      }}
    >
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
              onCta={() => {}}
              founderNote={item.founderNote}
            />
          ))}
        </div>
      )}

      {/* Resolved section */}
      {resolvedItems.length > 0 && (
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
            Resolved ({resolvedItems.length})
          </button>

          {resolvedOpen && (
            <div style={{ marginTop: 12 }}>
              {resolvedItems.map((item) => (
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
