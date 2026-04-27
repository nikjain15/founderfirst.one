/**
 * Penny site bubble — entry point.
 *
 * Self-mounting: import via <script defer src=".../bubble.js"> and on
 * DOMContentLoaded the bundle attaches a Shadow-DOM-isolated bubble to
 * <body>. The worker URL is read from:
 *   1. <script data-worker="…">
 *   2. window.PENNY_BUBBLE_URL
 *   3. The script's own origin (default — bubble.js was served by the worker)
 *
 * Sessions live in sessionStorage (per Penny demo settled decision 23 —
 * fresh session per tab).
 */
import { h, render } from "preact";
import htm from "htm";
import { useEffect, useRef, useState } from "preact/hooks";
import styles from "./styles.css";

const html = htm.bind(h);

const SESSION_KEY = "penny_bubble_session";
const HISTORY_KEY = "penny_bubble_history";
const STATE_KEY = "penny_bubble_state";

const CHIPS = [
  { label: "What is Penny?", prompt: "What is Penny and who is it for?" },
  { label: "How does it work?", prompt: "How does Penny actually do my books day-to-day?" },
  { label: "When can I use it?", prompt: "When does Penny launch and how do I get access?" },
];

const ONBOARDING_BUBBLES = [
  { headline: "👋 Hi — I'm Penny. The AI bookkeeper for business owners." },
  { headline: "Ask me anything — what would you like to know?" },
];

function getWorkerUrl() {
  if (typeof window !== "undefined" && window.PENNY_BUBBLE_URL) return window.PENNY_BUBBLE_URL;
  // Find the script tag that loaded us.
  const scripts = document.querySelectorAll("script[src]");
  for (const s of scripts) {
    if (s.src && /\/bubble\.js(?:\?|$)/.test(s.src)) {
      const explicit = s.getAttribute("data-worker");
      if (explicit) return explicit.replace(/\/$/, "");
      return new URL(s.src).origin;
    }
  }
  return ""; // last resort — same origin
}

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "p-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uuid();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function loadHistory() {
  try { return JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(h) { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }

function loadState() {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || "null") || {
    turn_count: 0, on_waitlist: false, soft_decline_seen: false,
    last_turn_had_cta: false, buying_signal: false,
  }; } catch { return { turn_count: 0, on_waitlist: false, soft_decline_seen: false, last_turn_had_cta: false, buying_signal: false }; }
}
function saveState(s) { sessionStorage.setItem(STATE_KEY, JSON.stringify(s)); }

function Pmark() {
  return html`<div class="penny-pmark" aria-hidden="true">P</div>`;
}

function App({ workerUrl }) {
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState(() => {
    const h = loadHistory();
    return h.length ? h : ONBOARDING_BUBBLES.map((b) => ({ ...b, from: "penny" }));
  });
  const [state, setState] = useState(loadState);
  const [showChips, setShowChips] = useState(() => loadHistory().length === 0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingCta, setPendingCta] = useState(null);
  const [ctaEmail, setCtaEmail] = useState("");
  const [ctaSubmitting, setCtaSubmitting] = useState(false);
  const [ctaConfirmed, setCtaConfirmed] = useState(false);
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { saveHistory(bubbles); }, [bubbles]);
  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [bubbles, sending, pendingCta]);
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  async function send(text) {
    if (!text || sending) return;
    setShowChips(false);
    const userBubble = { headline: text, from: "user" };
    const nextBubbles = [...bubbles, userBubble];
    setBubbles(nextBubbles);
    setDraft("");
    setSending(true);

    const history = nextBubbles
      .filter((b) => b.from)
      .slice(-12)
      .map((b) => ({ role: b.from === "user" ? "user" : "assistant", content: b.headline }));

    try {
      const res = await fetch(`${workerUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
          turnIndex: state.turn_count,
          message: text,
          history: history.slice(0, -1), // last item is the current message; sent separately
          sessionState: state,
          userAgent: navigator.userAgent,
          referrer: document.referrer,
          pageUrl: location.href,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) throw new Error(data.error || "bad_response");

      const replyBubbles = data.reply.bubbles.map((b) => ({ headline: b.headline, tone: b.tone, from: "penny" }));
      setBubbles((prev) => [...prev, ...replyBubbles]);
      setState(data.sessionState || state);
      if (data.reply.cta) setPendingCta(data.reply.cta);
    } catch {
      setBubbles((prev) => [...prev, {
        headline: "Give me just a moment — I'm catching up.",
        from: "penny",
      }, {
        headline: "Try your question again in a few seconds.",
        from: "penny",
      }]);
    } finally {
      setSending(false);
    }
  }

  async function submitCta() {
    if (!ctaEmail || ctaSubmitting) return;
    setCtaSubmitting(true);
    try {
      const res = await fetch(`${workerUrl}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
          email: ctaEmail,
          source: "waitlist",
          userAgent: navigator.userAgent,
          referrer: document.referrer,
          pageUrl: location.href,
        }),
      });
      if (!res.ok) throw new Error("bad");
      setCtaConfirmed(true);
      setState((s) => ({ ...s, on_waitlist: true }));
      setPendingCta(null);
      setBubbles((prev) => [...prev, {
        headline: "You're in 🎉 I'll be in touch when early access opens.",
        from: "penny",
      }]);
    } catch {
      setBubbles((prev) => [...prev, {
        headline: "Couldn't save that just now — try once more in a moment.",
        from: "penny",
      }]);
      setPendingCta(null);
    } finally {
      setCtaSubmitting(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft.trim());
    }
  }

  if (!open) {
    return html`
      <button
        class="penny-launcher"
        aria-label="Open Penny"
        onClick=${() => setOpen(true)}
      >P</button>
    `;
  }

  return html`
    <div class="penny-panel" role="dialog" aria-label="Chat with Penny">
      <div class="penny-header">
        <${Pmark} />
        <div class="penny-meta">
          <div class="penny-name">Penny</div>
          <div class="penny-status">online</div>
        </div>
        <button class="penny-close" aria-label="Close" onClick=${() => setOpen(false)}>×</button>
      </div>
      <div class="penny-privacy">Conversations are saved to help Penny get better.</div>

      <div class="penny-thread" ref=${threadRef}>
        ${bubbles.map((b, i) => html`
          <div key=${i} class="penny-bubble ${b.from === "user" ? "from-user" : "from-penny"}">
            ${b.headline}
          </div>
        `)}
        ${sending && html`
          <div class="penny-typing" aria-label="Penny is typing">
            <span></span><span></span><span></span>
          </div>
        `}
        ${pendingCta && !ctaConfirmed && html`
          <div class="penny-cta-card">
            <div class="penny-cta-label">${pendingCta.label}</div>
            <div class="penny-cta-row">
              <input
                class="penny-cta-input"
                type="email"
                placeholder="you@yourbusiness.com"
                value=${ctaEmail}
                onInput=${(e) => setCtaEmail(e.target.value)}
                onKeyDown=${(e) => e.key === "Enter" && submitCta()}
                disabled=${ctaSubmitting}
              />
              <button
                class="penny-cta-submit"
                onClick=${submitCta}
                disabled=${!ctaEmail || ctaSubmitting}
              >${ctaSubmitting ? "Saving…" : "Save my spot"}</button>
            </div>
          </div>
        `}
      </div>

      ${showChips && html`
        <div class="penny-chips">
          ${CHIPS.map((c) => html`
            <button class="penny-chip" onClick=${() => send(c.prompt)}>${c.label}</button>
          `)}
        </div>
      `}

      <div class="penny-footer">
        <textarea
          ref=${inputRef}
          class="penny-input"
          placeholder="Ask Penny anything…"
          rows=${1}
          value=${draft}
          onInput=${(e) => setDraft(e.target.value)}
          onKeyDown=${onKey}
          disabled=${sending}
        ></textarea>
        <button
          class="penny-send"
          aria-label="Send"
          disabled=${!draft.trim() || sending}
          onClick=${() => send(draft.trim())}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function mount() {
  if (document.getElementById("penny-bubble-host")) return; // idempotent
  const host = document.createElement("div");
  host.id = "penny-bubble-host";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  const root = document.createElement("div");
  root.className = "penny-root";
  shadow.appendChild(root);

  render(h(App, { workerUrl: getWorkerUrl() }), root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}

if (typeof window !== "undefined") {
  window.PennyBubble = { mount };
}
