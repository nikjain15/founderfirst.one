/**
 * screens/thread.jsx — Penny conversation thread (Tab 1).
 *
 * Layout: header → scrollable message list → ask bar → tab bar (rendered by App).
 * Cards are rendered inline as placeholders until card.jsx is complete.
 * Greeting and idle messages come from ai.renderPenny — never hard-coded.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { ApprovalCard } from "./card.jsx";

const fmt = (n) => {
  if (n == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
};

export default function ThreadScreen({ ai, state, set, navigate, scenario }) {
  const { persona } = state;

  // --- First-time intro state --------------------------------------------------
  const introComplete = !!(persona?.firstName && persona?.business);
  const [introDone, setIntroDone] = useState(introComplete);

  // When intro finishes (persona updated), flip introDone so main thread renders
  useEffect(() => {
    if (persona?.firstName && persona?.business) setIntroDone(true);
  }, [persona?.firstName, persona?.business]);

  // --- Intro conversation input state (lives here so ask bar works) -----------
  const [introInput,   setIntroInput]   = useState("");
  const [introStep,    setIntroStep]    = useState(
    !persona?.firstName ? "name" : !persona?.business ? "business" : "done"
  );
  const [introHistory, setIntroHistory] = useState([]);
  const [introLoading, setIntroLoading] = useState(false);

  const submitIntro = useCallback(() => {
    const val = introInput.trim();
    if (!val) return;
    if (introStep === "name") {
      set({ persona: { ...persona, firstName: val, name: val } });
      setIntroHistory((p) => [...p,
        { headline: "What's your name?", why: "So Penny can speak to you directly.", isUser: false },
        { text: val, isUser: true },
      ]);
      setIntroInput("");
      setIntroLoading(true);
      setTimeout(() => {
        setIntroLoading(false);
        setIntroHistory((p) => [...p, { headline: `Nice to meet you, ${val}! What's your business called?`, why: "So Penny speaks to you, not just anyone.", isUser: false }]);
        setIntroStep("business");
      }, 700);
    } else if (introStep === "business") {
      set({ persona: { ...persona, business: val } });
      setIntroHistory((p) => [...p, { text: val, isUser: true }]);
      setIntroInput("");
      setIntroLoading(true);
      setTimeout(() => {
        setIntroLoading(false);
        setIntroStep("done");
      }, 500);
    }
  }, [introInput, introStep, persona, set]);

  // --- Scenario / card queue ---
  const [cardQueue,    setCardQueue]    = useState(null); // null = loading
  const [confirmedIds, setConfirmedIds] = useState([]); // ids of confirmed cards
  const [activeIdx,    setActiveIdx]    = useState(0);   // which card is "current"

  useEffect(() => {
    if (!persona) { setCardQueue([]); return; }
    if (scenario === null) return; // still loading
    const queue = (scenario.cardQueue || []).map((c, i) => ({ ...c, id: `card-${i}` }));
    setCardQueue(queue);
  }, [persona, scenario]);

  // --- Greeting bubble ---
  const [greetingMsg,     setGreetingMsg]     = useState(null);
  const [greetingLoading, setGreetingLoading] = useState(true);

  useEffect(() => {
    if (!persona) return;
    let cancelled = false;
    setGreetingLoading(true);
    const queueLength = cardQueue?.length ?? 0;
    ai.renderPenny({
      intent: "thread.greeting",
      context: {
        mode: state.returningUser ? "returning-welcome" : "first-time-greeting",
        persona,
        queueLength,
        lastSeenHours: state.lastSeenHours || 0,
      },
    })
      .then((msg) => { if (!cancelled) { setGreetingMsg(msg); setGreetingLoading(false); } })
      .catch(() => {
        if (!cancelled) {
          setGreetingMsg({
            headline: `Hi${persona.firstName ? `, ${persona.firstName}` : ""}. Here's what I'm seeing.`,
            why: "I pulled in the last 30 days.",
            tone: "fyi",
          });
          setGreetingLoading(false);
        }
      });
    return () => { cancelled = true; };
  // Re-run only when cardQueue first resolves (so queueLength is accurate).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona, cardQueue !== null]);

  // --- Idle bubble (shown when queue is exhausted) ---
  const [idleMsg,     setIdleMsg]     = useState(null);
  const [idleLoading, setIdleLoading] = useState(false);

  const queueDone = cardQueue !== null && activeIdx >= cardQueue.length;

  useEffect(() => {
    if (!queueDone) return;
    let cancelled = false;
    setIdleLoading(true);
    ai.renderPenny({ intent: "thread.idle", context: { mode: "queue-empty" } })
      .then((msg) => { if (!cancelled) { setIdleMsg(msg); setIdleLoading(false); } })
      .catch(() => {
        if (!cancelled) {
          setIdleMsg({ headline: "That's it for now. I'll keep watching.", tone: "fyi" });
          setIdleLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [queueDone]);

  // --- Confirm a card ---
  const confirmCard = useCallback((card) => {
    setConfirmedIds((prev) => [...prev, card.id]);
    setActiveIdx((prev) => prev + 1);
  }, []);

  // --- Ask bar state ---
  const [askFocused, setAskFocused] = useState(false);
  const [askVal,     setAskVal]     = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [qaHistory,  setQaHistory]  = useState([]); // [{question, answer}]

  // --- Auto-scroll to bottom on new content ---
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [greetingMsg, activeIdx, idleMsg, qaHistory, askLoading]);

  const submitAsk = useCallback(() => {
    const q = askVal.trim();
    if (!q || askLoading) return;
    const recentCards = (cardQueue || []).slice(0, activeIdx + 1).map((c) => ({
      vendor: c.vendor, amount: c.amount, type: c.type,
      category: c.suggestedCategory, date: c.date,
    }));
    setAskLoading(true);
    setAskVal("");
    const question = q;
    ai.renderPenny({
      intent: "thread.qa",
      context: { question, persona, recentCards },
    })
      .then((msg) => {
        setQaHistory((prev) => [...prev, { question, answer: msg }]);
        setAskLoading(false);
      })
      .catch(() => {
        setQaHistory((prev) => [...prev, {
          question,
          answer: { headline: "I couldn't get that right now.", why: "Try again in a moment.", tone: "fyi" },
        }]);
        setAskLoading(false);
      });
  }, [askVal, askLoading, cardQueue, activeIdx, persona, ai]);

  const visibleCards = cardQueue?.slice(0, activeIdx + 1) || [];
  const showingIntro = !introDone && introStep !== "done";

  // Auto-focus ask bar when intro is active
  const askInputRef = useRef(null);
  useEffect(() => {
    if (showingIntro) setTimeout(() => askInputRef.current?.focus(), 300);
  }, [showingIntro, introStep]);

  return (
    <div className="phone-content thread-screen">

      {/* Header */}
      <header className="thread-header">
        <div className="thread-header-left">
          <div className="p-mark p-mark-sm p-mark--online">P</div>
          <div className="thread-header-meta">
            <span className="thread-header-name">Penny</span>
            <span className="thread-header-status">online · watching your accounts</span>
          </div>
        </div>
        <button className="thread-menu-btn" onClick={() => navigate("#/avatar")} aria-label="Open menu" type="button">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="10" cy="4"  r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none"/>
            <circle cx="10" cy="16" r="1.2" fill="currentColor" stroke="none"/>
          </svg>
        </button>
      </header>

      {/* Message list */}
      <div className="thread-list">

        {showingIntro ? (
          <>
            {/* First-time intro — Penny asks name then business conversationally */}
            {introStep === "name" && introHistory.length === 0 && (
              <PennyBubble msg={{ headline: "What's your name?", why: "So Penny can speak to you directly." }} loading={false} />
            )}
            {introHistory.map((m, i) =>
              m.isUser
                ? <div key={i} className="user-bubble intro-user-bubble">{m.text}</div>
                : <PennyBubble key={i} msg={{ headline: m.headline, why: m.why }} loading={false} />
            )}
            {introLoading && <PennyBubble msg={null} loading={true} />}
            <div ref={bottomRef} />
          </>
        ) : (
          <div className="thread-main-enter">
            {/* Normal thread — greeting + cards */}
            <PennyBubble msg={greetingMsg} loading={greetingLoading} />

            {cardQueue === null && (
              <div className="thread-loading-cards">
                <div className="penny-bubble-skel" style={{ width: "60%" }} />
              </div>
            )}

            {visibleCards.map((card, i) => {
              const isConfirmed = confirmedIds.includes(card.id);
              const isActive    = i === activeIdx && !isConfirmed;
              if (isConfirmed) return <ConfirmedSlug key={card.id} card={card} />;
              if (isActive) return (
                <ApprovalCard
                  key={card.id}
                  card={card}
                  persona={persona}
                  ai={ai}
                  onConfirm={() => confirmCard(card)}
                  onSkip={() => confirmCard(card)}
                  showIrsLines={state.preferences?.showIrsLines ?? false}
                />
              );
              return null;
            })}

            {queueDone && <PennyBubble msg={idleMsg} loading={idleLoading} />}

            {/* Q&A history — questions asked via the ask bar */}
            {qaHistory.map((item, i) => (
              <React.Fragment key={i}>
                <div className="user-bubble intro-user-bubble">{item.question}</div>
                <PennyBubble msg={item.answer} loading={false} />
              </React.Fragment>
            ))}
            {askLoading && (
              <PennyBubble msg={null} loading={true} />
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Ask bar — doubles as intro reply input */}
      <div className={`thread-ask-bar${askFocused ? " thread-ask-bar--focused" : ""}`}>
        <div className="thread-ask-inner">
        <svg className="thread-ask-icon" width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h14a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0116 13H6l-4 4V4.5A1.5 1.5 0 012 3z"/>
        </svg>
        {showingIntro ? (
          <input
            ref={askInputRef}
            className="thread-ask-input"
            type="text"
            placeholder={introStep === "name" ? "Your first name…" : "Your business name…"}
            value={introInput}
            onChange={(e) => setIntroInput(e.target.value)}
            onFocus={() => setAskFocused(true)}
            onBlur={() => setAskFocused(false)}
            onKeyDown={(e) => { if (e.key === "Enter") submitIntro(); }}
            autoComplete="off"
          />
        ) : (
          <input
            className="thread-ask-input"
            type="text"
            placeholder="Ask Penny anything…"
            value={askVal}
            onChange={(e) => setAskVal(e.target.value)}
            onFocus={() => setAskFocused(true)}
            onBlur={() => setAskFocused(false)}
            onKeyDown={(e) => { if (e.key === "Enter") submitAsk(); }}
            disabled={askLoading}
            autoComplete="off"
          />
        )}
        {!showingIntro && askVal.trim() && !askLoading && (
          <button
            className="intro-send-btn"
            onClick={submitAsk}
            type="button"
            aria-label="Ask"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="14" x2="8" y2="3"/>
              <polyline points="4 7 8 3 12 7"/>
            </svg>
          </button>
        )}
        {showingIntro && introInput.trim() && (
          <button
            className="intro-send-btn"
            onClick={submitIntro}
            type="button"
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="14" x2="8" y2="3"/>
              <polyline points="4 7 8 3 12 7"/>
            </svg>
          </button>
        )}
        </div>
      </div>

    </div>
  );
}

// --- Penny bubble (greeting + idle) ------------------------------------------

function PennyBubble({ msg, loading }) {
  if (!loading && !msg) return null;
  return (
    <div className="penny-row">
      <div className="penny-row-avatar">
        <div className="p-mark p-mark-sm">P</div>
      </div>
      <div className="penny-bubble thread-bubble">
        <div className="bubble-label">PENNY</div>
        {loading || !msg ? (
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


// --- Confirmed slug (collapsed card) -----------------------------------------

function ConfirmedSlug({ card }) {
  const isIncome = card.variant === "income" || card.variant === "income-celebration";
  const isOwnDraw = card.variant === "owners-draw";
  const sign     = isIncome ? "+" : isOwnDraw ? "" : "-";
  return (
    <div className="confirmed-slug">
      <span className="confirmed-slug-vendor">{card.vendor || "Transaction"}</span>
      <span className="confirmed-slug-amount">{sign}{fmt(card.amount)}</span>
      <span className="confirmed-slug-check">✓</span>
    </div>
  );
}
