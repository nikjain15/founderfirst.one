/**
 * screens/cpa/Chat.jsx — Tab 5: CPA chat with Penny.
 *
 * Uses books.qa intent with viewer_role: "cpa" so ai-client.js appends
 * cpa-chat.md on top of penny-system.md. Tone: terse, accounting-aware,
 * leads with number/answer, no celebration emoji.
 *
 * Chat history stored in state.cpa.clients[clientId].chatHistory[].
 * On CPA access revocation: chatHistory is DELETED, not archived (decision OQ-5).
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import { createClient } from "../../ai-client.js";
import Toast from "../../components/Toast.jsx";
import { EMPTY_STATE_COPY, TOAST_COPY, ERROR_COPY } from "../../constants/ui-text.js";

// ── Chat bubble ───────────────────────────────────────────────────────────────
function Bubble({ role, text, loading }) {
  const isCpa = role === "cpa";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isCpa ? "flex-end" : "flex-start",
        padding: "0 20px",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          maxWidth: "72%",
          padding: "10px 14px",
          borderRadius: isCpa
            ? "var(--r-bubble-user)"
            : "var(--r-bubble-penny)",
          background: isCpa ? "var(--ink)" : "var(--paper)",
          color: isCpa ? "var(--white)" : "var(--ink)",
          fontSize: "var(--fs-body)",
          fontFamily: "var(--font-sans)",
          lineHeight: 1.5,
          fontWeight: "var(--fw-regular)",
        }}
      >
        {loading ? (
          <span style={{ color: isCpa ? "rgba(255,255,255,0.5)" : "var(--ink-4)" }}>
            {ERROR_COPY.cpaChatThinking}
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Chat({ clientId, clientData, cpaAccount, onUpdateCpa }) {
  const ai        = useMemo(() => createClient(window.PENNY_CONFIG || {}), []);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState(null);
  const toastKey              = useRef(0);
  const bottomRef             = useRef(null);

  // Chat history lives in state.cpa.clients[clientId].chatHistory
  const chatHistory = clientData?.chatHistory || [];

  function showToast(msg) {
    toastKey.current++;
    setToast({ msg, key: toastKey.current });
  }

  // Scroll to bottom when history grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory.length, loading]);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setLoading(true);

    // Append user message to history immediately
    const userMsg = { role: "cpa", text: q, ts: Date.now() };
    onUpdateCpa?.((prev) => {
      const client = prev.clients?.[clientId];
      if (!client) return prev;
      return {
        ...prev,
        clients: {
          ...prev.clients,
          [clientId]: {
            ...client,
            chatHistory: [...(client.chatHistory || []), userMsg],
          },
        },
      };
    });

    try {
      const response = await ai.renderPenny({
        intent: "books.qa",
        context: {
          viewer_role: "cpa",
          entity: clientData?.entity || "sole-prop",
          industry: clientData?.industry || "consulting",
          persona: { name: clientData?.clientName || "the client", business: clientData?.clientName || "" },
          question: q,
          ledgerSummary: clientData?.taxReadiness || {},
        },
      });

      const pennyMsg = {
        role: "penny",
        text: response?.headline || response?.answer || response?.why || ERROR_COPY.cpaPennyNoData,
        ts: Date.now(),
      };

      onUpdateCpa?.((prev) => {
        const client = prev.clients?.[clientId];
        if (!client) return prev;
        return {
          ...prev,
          clients: {
            ...prev.clients,
            [clientId]: {
              ...client,
              chatHistory: [...(client.chatHistory || []), pennyMsg],
            },
          },
        };
      });
    } catch {
      showToast(TOAST_COPY.cpaPennyUnavailable);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        fontFamily: "var(--font-sans)",
      }}
    >
      {toast && (
        <Toast key={toast.key} message={toast.msg} onDone={() => setToast(null)} bottom={24} />
      )}

      {/* Header eyebrow */}
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--line)",
          background: "var(--white)",
          flexShrink: 0,
        }}
      >
        <p className="eyebrow" style={{ margin: 0 }}>
          Ask Penny about {clientData?.clientName || "this client"}'s books
        </p>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          paddingTop: 16,
          paddingBottom: 8,
        }}
      >
        {chatHistory.length === 0 && !loading && (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--ink-4)",
              fontSize: "var(--fs-body)",
            }}
          >
            {EMPTY_STATE_COPY.cpaChatEmptyHint}
          </div>
        )}

        {chatHistory.map((msg, i) => (
          <Bubble key={i} role={msg.role} text={msg.text} />
        ))}

        {loading && <Bubble role="penny" text="" loading />}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--line)",
          background: "var(--white)",
          flexShrink: 0,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          placeholder="Ask Penny anything about these books…"
          style={{
            flex: 1,
            padding: "10px 14px",
            border: "1.5px solid var(--line)",
            borderRadius: "var(--r-pill)",
            fontSize: "var(--fs-body)",
            fontFamily: "var(--font-sans)",
            color: "var(--ink)",
            background: "var(--white)",
            outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            padding: "10px 18px",
            background: input.trim() && !loading ? "var(--ink)" : "var(--line)",
            color: input.trim() && !loading ? "var(--white)" : "var(--ink-4)",
            border: "none",
            borderRadius: "var(--r-pill)",
            fontSize: 14,
            fontWeight: "var(--fw-semibold)",
            cursor: input.trim() && !loading ? "pointer" : "default",
            fontFamily: "var(--font-sans)",
            transition: "background 0.15s",
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
