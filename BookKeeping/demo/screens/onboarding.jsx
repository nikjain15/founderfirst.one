/**
 * screens/onboarding.jsx — Penny demo, Screen 1.
 * 7-step onboarding. Every Penny utterance is generated live via ai.renderPenny.
 */

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import posthog from "posthog-js";
import { ENTITY_TYPES } from "../constants/variants.js";
import { ONBOARDING_COPY } from "../constants/copy.js";

const STEP_SEQUENCE = [
  "welcome", "entity", "industry", "payments", "expenses", "checkin", "bank", "pulling",
];

const STEP_INTENT = {
  welcome:       "onboarding.ready",
  entity:        "onboarding.entity",
  "entity-diag": "onboarding.entity",
  industry:      "onboarding.industry",
  payments:      "onboarding.payments",
  expenses:      "onboarding.expenses",
  checkin:       "onboarding.checkin",
  bank:          "onboarding.bank",
};

const STEP_CONTEXT_KEY = {
  welcome:       "welcome",
  entity:        "entity",
  "entity-diag": "entity-not-sure",
  industry:      "industry",
  payments:      "payment-methods",
  expenses:      "expenses",
  checkin:       "check-in",
  bank:          "bank",
};

const ENTITY_OPTIONS = [
  { id: ENTITY_TYPES.SOLE_PROP, label: "Sole proprietor", sub: "You and the business are the same thing, legally. Taxes go on your personal return." },
  { id: ENTITY_TYPES.LLC,       label: "LLC",             sub: "Keeps your personal assets separate. Taxes usually still go on your personal return." },
  { id: ENTITY_TYPES.S_CORP,    label: "S-Corp",           sub: "A corporation that pays you a salary. Often lowers your self-employment tax." },
  { id: "c-corp",               label: "C-Corp",           sub: "Has its own tax return, separate from yours. Less common for small businesses." },
  { id: "not-sure",             label: "Not sure",         sub: "Answer two quick questions and I'll work it out for you." },
];

const CHECKIN_OPTIONS = [
  { id: "mon-9",   label: "Monday at 9am",      sub: "Start the week ready"       },
  { id: "fri-4",   label: "Friday at 4pm",      sub: "Wrap up before the weekend" },
  { id: "daily-6", label: "Daily at 6pm",       sub: "Little and often"           },
  { id: "custom",  label: "Pick a custom time", sub: "You decide"                 },
];

const CUSTOM_DAYS  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CUSTOM_TIMES = ["7am", "8am", "9am", "10am", "12pm", "3pm", "5pm", "6pm", "7pm", "8pm"];

// Per-step Penny copy lives in constants/copy.js → ONBOARDING_COPY (SCAF-3).
// FALLBACK_COPY is a thin alias kept so the rest of this file reads naturally;
// the source of truth is the registry import above.
const FALLBACK_COPY = ONBOARDING_COPY;

// --- Entity SVG icons (professional, stroke-based, no emoji) -----------------

function EntityIcon({ id }) {
  const p = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" };
  if (id === "sole-prop") return (
    <svg {...p}><circle cx="10" cy="6" r="3"/><path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
  );
  if (id === "llc") return (
    <svg {...p}><path d="M2 18h16M5 18V10l5-5 5 5v8"/><rect x="8" y="13" width="4" height="5"/></svg>
  );
  if (id === "s-corp") return (
    <svg {...p}><rect x="2" y="2" width="16" height="16" rx="3"/><path d="M7 12c0 1.1 1.3 2 3 2s3-.9 3-2-1.3-2-3-2-3-.9-3-2 1.3-2 3-2 3 .9 3 2"/></svg>
  );
  if (id === "c-corp") return (
    <svg {...p}><circle cx="10" cy="10" r="8"/><path d="M13.5 10a3.5 3.5 0 11-3.5-3.5"/></svg>
  );
  // not-sure
  return (
    <svg {...p}><circle cx="10" cy="10" r="8"/><path d="M8 8a2 2 0 114 0c0 .8-.5 1.5-1.2 1.8L10 11v1.5"/><circle cx="10" cy="15" r=".8" fill="currentColor" stroke="none"/></svg>
  );
}

// --- Industry SVG icons -------------------------------------------------------

function IndustryIcon({ id }) {
  const p = { width: 22, height: 22, viewBox: "0 0 22 22", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" };
  if (id === "consulting") return (
    <svg {...p}><rect x="3" y="7" width="16" height="11" rx="2"/><path d="M7.5 7V5.5A3.5 3.5 0 0111 2a3.5 3.5 0 013.5 3.5V7"/><line x1="3" y1="12" x2="19" y2="12"/></svg>
  );
  if (id === "creative") return (
    <svg {...p}><path d="M15.5 2.5l4 4L7 19H3v-4z"/><line x1="12" y1="5.5" x2="16.5" y2="10"/></svg>
  );
  if (id === "trades") return (
    <svg {...p}><path d="M14.5 2a5 5 0 00-5 7.5L3 16.5 5.5 19l7-6.5a5 5 0 007-7l-2.5 2.5-1.5-1.5 2.5-2.5A5 5 0 0014.5 2z"/></svg>
  );
  if (id === "retail") return (
    <svg {...p}><path d="M5 7h12l-1.5 11H6.5z"/><path d="M8 7V5.5A3 3 0 0111 2.5a3 3 0 013 3V7"/></svg>
  );
  if (id === "food-beverage") return (
    <svg {...p}><line x1="8" y1="3" x2="8" y2="10"/><path d="M6 3v5a2 2 0 004 0V3"/><line x1="14" y1="3" x2="14" y2="19"/><path d="M11 3h6a1 1 0 011 1v4a1 1 0 01-1 1h-6"/></svg>
  );
  if (id === "beauty-wellness") return (
    <svg {...p}><path d="M6 4l4 4M16 4l-4 4M10 8l1 1M11 9l5.5 9M11 9l-5.5 9"/><circle cx="11" cy="8" r="1.5"/></svg>
  );
  if (id === "professional-services") return (
    <svg {...p}><rect x="2" y="3" width="18" height="14" rx="2"/><line x1="7" y1="20" x2="15" y2="20"/><line x1="11" y1="17" x2="11" y2="20"/></svg>
  );
  if (id === "tech-software") return (
    <svg {...p}><polyline points="7 9 3 13 7 17"/><polyline points="15 9 19 13 15 17"/><line x1="13" y1="5" x2="9" y2="19"/></svg>
  );
  if (id === "healthcare") return (
    <svg {...p}><circle cx="11" cy="11" r="8"/><line x1="11" y1="7" x2="11" y2="15"/><line x1="7" y1="11" x2="15" y2="11"/></svg>
  );
  // other
  return (
    <svg {...p}><circle cx="6" cy="6" r="2"/><circle cx="16" cy="6" r="2"/><circle cx="6" cy="16" r="2"/><circle cx="16" cy="16" r="2"/></svg>
  );
}

// --- Entity diagnostic logic --------------------------------------------------

function resolveEntityFromDiag({ q1, q2 }) {
  if (q1 === "personal-return" && q2 === "just-me")
    return { entity: ENTITY_TYPES.SOLE_PROP,   reasons: ["You file on your personal return.", "Just you as the owner."], flag: null };
  if (q1 === "personal-return" && q2 === "me-and-others")
    return { entity: ENTITY_TYPES.PARTNERSHIP, reasons: ["You file on your personal return.", "More than one owner — usually a partnership."], flag: "Partnerships aren't in the MVP yet. I'll flag this for a CPA check." };
  if (q1 === "separate-return" && q2 === "just-me")
    return { entity: ENTITY_TYPES.S_CORP,      reasons: ["You file a separate business return.", "Just you as the owner."], flag: null };
  if (q1 === "separate-return" && q2 === "me-and-others")
    return { entity: ENTITY_TYPES.S_CORP,      reasons: ["You file a separate business return.", "Multiple owners — we'll sort the details with your CPA."], flag: null };
  return { entity: ENTITY_TYPES.SOLE_PROP, reasons: ["We'll start simple.", "You can change this anytime."], flag: "Let's confirm this with your CPA on your next sync." };
}

// --- Main component -----------------------------------------------------------

export default function OnboardingScreen({ ai, state, set, navigate }) {
  const [step,              setStep]              = useState(state.ob_step || "welcome");
  const [entity,            setEntity]            = useState(state.persona?.entity || null);
  const [industry,          setIndustry]          = useState(state.persona?.industry || null);
  const [otherLabel,        setOtherLabel]        = useState("");
  const [paymentMethods,    setPaymentMethods]    = useState(state.paymentMethods || []);
  const [expenseCategories, setExpenseCategories] = useState(state.expenseCategories || []);
  const [checkIn,           setCheckIn]           = useState(state.checkIn || null);
  const [customDay,         setCustomDay]         = useState(null);
  const [customTime,        setCustomTime]        = useState(null);
  const [bankConnected,     setBankConnected]     = useState(state.bankConnected || null);

  const [diagQ,       setDiagQ]       = useState("q1");
  const [diagAnswers, setDiagAnswers] = useState({ q1: null, q2: null });
  const diagResolution = useMemo(
    () => diagAnswers.q1 && diagAnswers.q2 ? resolveEntityFromDiag(diagAnswers) : null,
    [diagAnswers]
  );

  const [industries, setIndustries] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${window.PENNY_CONFIG?.baseUrl || "/"}config/industries.json`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setIndustries(json.industries || {}); })
      .catch(() => { if (!cancelled) setIndustries({}); });
    return () => { cancelled = true; };
  }, []);

  const [pennyMsg,     setPennyMsg]     = useState(null);
  const [pennyLoading, setPennyLoading] = useState(false);

  useEffect(() => {
    if (step === "entity-diag" && diagQ === "resolve") { setPennyMsg(null); setPennyLoading(false); return; }
    if (step === "pulling") {
      setPennyMsg(ONBOARDING_COPY.pulling);
      return;
    }
    const intent = STEP_INTENT[step];
    if (!intent) return;

    // Show fallback copy immediately so there's no blank/skeleton state.
    // AI response replaces it silently when ready — the wording is similar enough
    // that the update is subtle and doesn't confuse the user.
    setPennyMsg(FALLBACK_COPY[step] || null);
    setPennyLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, diagQ]);

  useEffect(() => { set({ ob_step: step }); /* eslint-disable-next-line */ }, [step]);

  const headlineRef = useRef(null);
  useEffect(() => { if (headlineRef.current) headlineRef.current.focus(); }, [step, diagQ]);

  useEffect(() => {
    if (checkIn === "custom" && customDay && customTime) {
      set({ customCheckin: { day: customDay, time: customTime } });
    }
  }, [customDay, customTime, checkIn, set]);

  const goNext = useCallback(() => {
    if (step === "welcome") return setStep("entity");
    if (step === "entity") {
      if (entity === "not-sure") { setDiagQ("q1"); return setStep("entity-diag"); }
      posthog.capture("entity_type_selected", { entity_type: entity });
      return setStep("industry");
    }
    if (step === "entity-diag") {
      if (diagQ === "q1" && diagAnswers.q1) return setDiagQ("q2");
      if (diagQ === "q2" && diagAnswers.q2) return setDiagQ("resolve");
      if (diagQ === "resolve") {
        if (diagResolution) {
          setEntity(diagResolution.entity);
          posthog.capture("entity_type_selected", { entity_type: diagResolution.entity, via_diagnostic: true });
        }
        return setStep("industry");
      }
    }
    if (step === "industry") {
      posthog.capture("industry_selected", { industry });
      return setStep("payments");
    }
    if (step === "payments")  return setStep("expenses");
    if (step === "expenses")  return setStep("checkin");
    if (step === "checkin")   return setStep("bank");
    if (step === "bank")      return setStep("pulling");
  }, [step, entity, industry, diagQ, diagAnswers, diagResolution]);

  const goBack = useCallback(() => {
    if (step === "entity")      return setStep("welcome");
    if (step === "entity-diag") {
      if (diagQ === "q1")      { setEntity(null); return setStep("entity"); }
      if (diagQ === "q2")      return setDiagQ("q1");
      if (diagQ === "resolve") return setDiagQ("q2");
    }
    if (step === "industry")  return setStep("entity");
    if (step === "payments")  return setStep("industry");
    if (step === "expenses")  return setStep("payments");
    if (step === "checkin")   return setStep("expenses");
    if (step === "bank")      return setStep("checkin");
  }, [step, diagQ]);

  useEffect(() => {
    if (bankConnected) {
      posthog.capture("bank_connected", { bank: bankConnected, context: "onboarding" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankConnected]);

  useEffect(() => {
    if (step !== "pulling") return;
    const finalEntity   = entity || ENTITY_TYPES.SOLE_PROP;
    const finalIndustry = industry || "other";

    // Pre-warm the two most expensive first-impression calls while the
    // pulling animation plays. Both results land in localStorage before
    // the user reaches the Penny thread, making the first render instant.
    const prewarmPersona = { name: "", firstName: "", business: "", entity: finalEntity, industry: finalIndustry };
    ai.renderPenny({ intent: "thread.greeting", context: { mode: "first-visit", persona: prewarmPersona, queueLength: 3, lastSeenHours: 0 } }).catch(() => {});
    // Fetch scenarios and pre-warm the first card if available.
    fetch(`${window.PENNY_CONFIG?.baseUrl || "/"}config/scenarios.json`)
      .then((r) => r.json())
      .then((json) => {
        const key = `${finalEntity}.${finalIndustry}`;
        const scenario = json.scenarios?.[key] || json.scenarios?.["sole-prop.consulting"];
        const firstCard = scenario?.cardQueue?.[0];
        if (firstCard) {
          ai.renderPenny({ intent: "card.approval", context: { entity: finalEntity, industry: finalIndustry, persona: prewarmPersona, card: firstCard } }).catch(() => {});
        }
      })
      .catch(() => {});
    const industryLabel =
      finalIndustry === "other" && otherLabel.trim()
        ? otherLabel.trim()
        : (industries && industries[finalIndustry]?.label) || "Business";
    const tid = setTimeout(() => {
      posthog.capture("onboarding_completed", {
        entity_type: finalEntity,
        industry: finalIndustry,
        payment_methods: paymentMethods,
        expense_categories: expenseCategories,
        bank_connected: !!bankConnected,
      });
      posthog.identify(posthog.get_distinct_id(), {
        entity_type: finalEntity,
        industry: finalIndustry,
      });
      set({
        onboardingComplete: true,
        ob_step: null,
        persona: { name: "", firstName: "", business: "", entity: finalEntity, industry: finalIndustry },
        paymentMethods,
        expenseCategories,
        checkIn,
        bankConnected,
        tab: "penny",
      });
      navigate("/penny");
    }, 3000);
    return () => clearTimeout(tid);
  }, [step, entity, industry, otherLabel, industries, paymentMethods, expenseCategories, checkIn, bankConnected, navigate, set]);

  const canProceed = useMemo(() => {
    if (step === "welcome")     return true;
    if (step === "entity")      return !!entity;
    if (step === "entity-diag") {
      if (diagQ === "q1")      return !!diagAnswers.q1;
      if (diagQ === "q2")      return !!diagAnswers.q2;
      if (diagQ === "resolve") return true;
    }
    if (step === "industry")  return !!industry;
    if (step === "payments")  return paymentMethods.length > 0;
    if (step === "expenses")  return expenseCategories.length > 0;
    if (step === "checkin")   return checkIn === "custom" ? (!!customDay && !!customTime) : !!checkIn;
    if (step === "bank")      return true;
    return false;
  }, [step, entity, diagQ, diagAnswers, industry, paymentMethods, expenseCategories, checkIn, customDay, customTime]);

  const showHeader = step !== "welcome" && step !== "pulling";
  const showCTA    = step !== "pulling";

  let ctaLabel = "Continue";
  if (step === "welcome")                            ctaLabel = "Let's go";
  if (step === "bank" && !bankConnected)             ctaLabel = "Skip for now";
  if (step === "entity-diag" && diagQ === "resolve") ctaLabel = "Yes, that's me";

  return (
    <div className="phone onboarding">
      <div className="phone-content onboarding-content">

        {showHeader && (
          <header className="onboarding-header">
            <button className="onboarding-back" onClick={goBack} aria-label="Go back" type="button">←</button>
          </header>
        )}

        {step === "welcome" ? (
          <WelcomeSpeech msg={pennyMsg} loading={pennyLoading} headlineRef={headlineRef} />
        ) : step !== "pulling" ? (
          <PennyRow msg={pennyMsg} loading={pennyLoading} headlineRef={headlineRef} />
        ) : null}

        <div className="onboarding-body">

          {step === "entity" && (
            <TileStack options={ENTITY_OPTIONS} value={entity} onChange={setEntity} multi={false}
              getKey={(o) => o.id}
              renderLabel={(o) => (
                <div className="entity-tile-inner">
                  <span className="entity-tile-icon"><EntityIcon id={o.id} /></span>
                  <div className="entity-tile-text">
                    <span className="tile-label">{o.label}</span>
                    <span className="tile-sub">{o.sub}</span>
                  </div>
                </div>
              )}
            />
          )}

          {step === "entity-diag" && (
            <EntityDiagnosticBody diagQ={diagQ} answers={diagAnswers} setAnswers={setDiagAnswers} resolution={diagResolution} />
          )}

          {step === "industry" && industries && (
            <IndustryGrid
              industries={industries}
              value={industry}
              onChange={setIndustry}
              otherLabel={otherLabel}
              onOtherLabel={setOtherLabel}
            />
          )}

          {step === "payments" && industries && (
            <TileGrid
              options={(industry && industries[industry]?.paymentMethods) || ["Stripe", "Venmo", "Bank transfer", "Check", "PayPal", "Cash"]}
              value={paymentMethods} onChange={setPaymentMethods} multi
            />
          )}

          {step === "expenses" && industries && (
            <TileGrid
              options={(industry && industries[industry]?.expenseCategories) || ["Software", "Travel", "Business meals (50%)", "Office", "Marketing", "Contractors"]}
              value={expenseCategories} onChange={setExpenseCategories} multi
            />
          )}

          {step === "checkin" && (
            <CheckinStep
              checkIn={checkIn} setCheckIn={setCheckIn}
              customDay={customDay} setCustomDay={setCustomDay}
              customTime={customTime} setCustomTime={setCustomTime}
            />
          )}

          {step === "bank" && industries && (
            <BankStep industry={industry} industries={industries} value={bankConnected} onChange={setBankConnected} />
          )}

          {step === "pulling" && <PullingBody />}

        </div>

        {showCTA && (
          <div className="onboarding-cta">
            <button className="btn btn-full" disabled={!canProceed} onClick={goNext} type="button">
              {ctaLabel}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// --- Welcome screen (no bubble box — clean hero) ------------------------------

const PREVIEW_ITEMS = [
  { label: "Bright Co", amount: "+$3,000", sub: "Client payment · Yesterday", dark: true  },
  { label: "Adobe CC",  amount: "-$55",    sub: "Software · Confirmed ✓",     dark: false },
  { label: "Notion",    amount: "-$19",    sub: "Software · Confirmed ✓",     dark: false },
];

function WelcomePreview() {
  return (
    <div className="ob-preview">
      {PREVIEW_ITEMS.map((item, i) => (
        <div key={item.label} className={`ob-preview-item${item.dark ? " ob-preview-item--dark" : ""}`}
          style={{ animationDelay: `${0.3 + i * 0.15}s` }}>
          <div className="ob-preview-dot">{item.label[0]}</div>
          <div className="ob-preview-text">
            <span className="ob-preview-label">{item.label}</span>
            <span className="ob-preview-sub">{item.sub}</span>
          </div>
          <span className="ob-preview-amount">{item.amount}</span>
        </div>
      ))}
      <p className="ob-preview-caption">Penny watches these automatically.</p>
    </div>
  );
}

function WelcomeSpeech({ msg, loading, headlineRef }) {
  const greeting = msg?.greeting || ONBOARDING_COPY.welcomeFallbackGreeting;
  const headline = msg?.headline || (loading ? "\u00A0" : FALLBACK_COPY.welcome.headline);
  const why      = msg?.why      || ONBOARDING_COPY.welcomeFallbackWhy;
  return (
    <div className="ob-welcome-wrap">
      <div className="p-mark p-mark-md">P</div>
      <p className="ob-welcome-greeting">{greeting}</p>
      <h2 className="ob-welcome-headline" ref={headlineRef} tabIndex={-1}>{headline}</h2>
      {!loading && <p className="ob-welcome-why">{why}</p>}
      {!loading && <WelcomePreview />}
    </div>
  );
}

// --- Penny row (avatar + bubble, all steps except welcome + pulling) ----------

function PennyRow({ msg, loading, headlineRef }) {
  const headline = msg?.headline;
  const why      = msg?.why;
  return (
    <div className="penny-row">
      <div className="penny-row-avatar">
        <div className="p-mark p-mark-sm">P</div>
      </div>
      <div className="penny-bubble">
        <div className="bubble-label">PENNY</div>
        {loading || !headline ? (
          <div className="penny-bubble-loading">
            <div className="penny-bubble-skel" style={{ width: "90%" }} />
            <div className="penny-bubble-skel" />
            <div className="penny-bubble-skel" />
          </div>
        ) : (
          <div className="bubble-msg">
            <p className="penny-bubble-headline" ref={headlineRef} tabIndex={-1}>{headline}</p>
            {why && <p className="penny-bubble-why">{why}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function PullingBody() {
  return (
    <div className="pulling-body">
      <div className="p-mark p-mark-lg" style={{ margin: "0 auto" }}>P</div>
      <div className="pulling-spinner" aria-hidden="true" />
      <p className="pulling-hint">{ONBOARDING_COPY.pullingHint}</p>
    </div>
  );
}

// --- Tile components ----------------------------------------------------------

function TileStack({ options, value, onChange, multi, getKey, renderLabel }) {
  const isSelected = (opt) => {
    const k = getKey(opt);
    return multi ? (Array.isArray(value) && value.includes(k)) : value === k;
  };
  const toggle = (opt) => {
    const k = getKey(opt);
    if (multi) {
      const next = Array.isArray(value) ? [...value] : [];
      const i = next.indexOf(k);
      if (i >= 0) next.splice(i, 1); else next.push(k);
      onChange(next);
    } else {
      onChange(k);
    }
  };
  return (
    <div className="tile-stack" role="group">
      {options.map((opt) => {
        const sel = isSelected(opt);
        return (
          <button key={getKey(opt)} className={"tile" + (sel ? " tile--selected" : "")}
            onClick={() => toggle(opt)} aria-pressed={sel} type="button">
            {renderLabel(opt)}
            {sel && <span className="tile-check" aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function TileGrid({ options, value, onChange, multi }) {
  const isSelected = (opt) => multi ? (Array.isArray(value) && value.includes(opt)) : value === opt;
  const toggle = (opt) => {
    if (multi) {
      const next = Array.isArray(value) ? [...value] : [];
      const i = next.indexOf(opt);
      if (i >= 0) next.splice(i, 1); else next.push(opt);
      onChange(next);
    } else {
      onChange(opt);
    }
  };
  return (
    <div className="tile-grid" role="group">
      {options.map((opt) => {
        const sel = isSelected(opt);
        return (
          <button key={opt} className={"tile tile--grid" + (sel ? " tile--selected" : "")}
            onClick={() => toggle(opt)} aria-pressed={sel} type="button">
            <span className="tile-label">{opt}</span>
            {sel && <span className="tile-check" aria-hidden="true">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function IndustryGrid({ industries, value, onChange, otherLabel, onOtherLabel }) {
  const keys = Object.keys(industries);
  const otherInputRef = useRef(null);
  useEffect(() => {
    if (value === "other" && otherInputRef.current) otherInputRef.current.focus();
  }, [value]);
  return (
    <div>
      <div className="tile-grid industry-grid" role="group">
        {keys.map((k) => {
          const sel = value === k;
          return (
            <button key={k} className={"tile tile--grid tile--industry" + (sel ? " tile--selected" : "")}
              onClick={() => onChange(k)} aria-pressed={sel} type="button">
              <span className="industry-tile-icon"><IndustryIcon id={k} /></span>
              <span className="tile-label">{industries[k].label}</span>
              {sel && <span className="tile-check" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
      {value === "other" && (
        <div className="other-industry-input-wrap">
          <input
            ref={otherInputRef}
            className="other-industry-input"
            type="text"
            placeholder="What do you do? e.g. Photography"
            value={otherLabel}
            onChange={(e) => onOtherLabel(e.target.value)}
            maxLength={80}
          />
        </div>
      )}
    </div>
  );
}

// --- Check-in step with fixed custom picker ----------------------------------

function CheckinStep({ checkIn, setCheckIn, customDay, setCustomDay, customTime, setCustomTime }) {
  return (
    <div className="tile-stack" role="group">
      {CHECKIN_OPTIONS.map((opt) => {
        const sel = checkIn === opt.id;
        return (
          <React.Fragment key={opt.id}>
            <button className={"tile" + (sel ? " tile--selected" : "")}
              onClick={() => setCheckIn(opt.id)} aria-pressed={sel} type="button">
              <span className="tile-label">{opt.label}</span>
              <span className="tile-sub">{opt.sub}</span>
              {sel && <span className="tile-check" aria-hidden="true">✓</span>}
            </button>
            {opt.id === "custom" && sel && (
              <div className="checkin-picker">
                <p className="checkin-picker-label">Day</p>
                <div className="checkin-days">
                  {CUSTOM_DAYS.map((d) => (
                    <button key={d} type="button"
                      className={"checkin-day-btn" + (customDay === d ? " checkin-day-btn--selected" : "")}
                      onClick={() => setCustomDay(d)}>
                      {d}
                    </button>
                  ))}
                </div>
                <p className="checkin-picker-label">Time</p>
                <div className="checkin-times">
                  {CUSTOM_TIMES.map((t) => (
                    <button key={t} type="button"
                      className={"checkin-time-btn" + (customTime === t ? " checkin-time-btn--selected" : "")}
                      onClick={() => setCustomTime(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// --- Entity diagnostic --------------------------------------------------------

function EntityDiagnosticBody({ diagQ, answers, setAnswers, resolution }) {
  if (diagQ === "q1") {
    return (
      <TileStack
        options={[
          { id: "personal-return", label: "On my personal return", sub: "Schedule C or Schedule E" },
          { id: "separate-return", label: "Files its own return",  sub: "Form 1120, 1120-S, or 1065" },
          { id: "not-sure",        label: "Not sure",              sub: "We'll confirm with your CPA" },
        ]}
        value={answers.q1}
        onChange={(v) => setAnswers((p) => ({ ...p, q1: v }))}
        multi={false} getKey={(o) => o.id}
        renderLabel={(o) => (<><span className="tile-label">{o.label}</span><span className="tile-sub">{o.sub}</span></>)}
      />
    );
  }
  if (diagQ === "q2") {
    return (
      <TileStack
        options={[
          { id: "just-me",       label: "Just me",       sub: "Single owner"       },
          { id: "me-and-others", label: "Me and others", sub: "Two or more owners" },
        ]}
        value={answers.q2}
        onChange={(v) => setAnswers((p) => ({ ...p, q2: v }))}
        multi={false} getKey={(o) => o.id}
        renderLabel={(o) => (<><span className="tile-label">{o.label}</span><span className="tile-sub">{o.sub}</span></>)}
      />
    );
  }
  if (!resolution) return null;
  const entityLabel = {
    "sole-prop": "Sole proprietor", "s-corp": "S-Corp",
    partnership: "Partnership", llc: "LLC", "c-corp": "C-Corp",
  }[resolution.entity] || resolution.entity;
  return (
    <div className="diag-resolve">
      <div className="card card-emphasis">
        <p className="eyebrow">Penny's read</p>
        <h3 className="diag-proposal">Sounds like you're probably a <strong>{entityLabel}</strong>.</h3>
        <ul className="diag-reasons">
          {resolution.reasons.map((r, i) => <li key={i}>· {r}</li>)}
        </ul>
        {resolution.flag && <p className="diag-flag">{resolution.flag}</p>}
      </div>
    </div>
  );
}

// --- Bank step ----------------------------------------------------------------

function BankStep({ industry, industries, value, onChange }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query,      setQuery]      = useState("");
  const tailoredBanks = (industry && industries[industry]?.banks) ||
    ["Chase Business", "Wells Fargo", "BofA Business", "Capital One", "Ally"];
  const BANK_POOL = ["Chase Business","Wells Fargo","BofA Business","Capital One","Ally","Mercury","Brex","Relay","Bluevine","Truist","PNC","Citi","US Bank","Regions","Huntington","Key Bank","Fifth Third","M&T","Square Banking","SVB (First Citizens)"];
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return BANK_POOL.filter((b) => b.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);
  return (
    <div className="bank-step">
      {!searchOpen && (
        <>
          <div className="tile-stack" role="group">
            {tailoredBanks.map((b) => {
              const sel = value === b;
              return (
                <button key={b} className={"tile" + (sel ? " tile--selected" : "")}
                  onClick={() => onChange(b)} aria-pressed={sel} type="button">
                  <span className="tile-label">{b}</span>
                  {sel && <span className="tile-check" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
          <button className="btn btn-ghost btn-full bank-search-toggle" onClick={() => setSearchOpen(true)} type="button">
            Search 10,000+ banks
          </button>
        </>
      )}
      {searchOpen && (
        <div className="bank-search">
          <input className="bank-search-input" type="text" placeholder="Search banks…"
            value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="bank-search-results">
            {searchResults.length === 0 && query.trim() && (
              <p className="bank-search-empty">Nothing yet — keep typing.</p>
            )}
            {searchResults.map((b) => {
              const sel = value === b;
              return (
                <button key={b} className={"tile" + (sel ? " tile--selected" : "")}
                  onClick={() => onChange(b)} aria-pressed={sel} type="button">
                  <span className="tile-label">{b}</span>
                  {sel && <span className="tile-check" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearchOpen(false); setQuery(""); }} type="button">
            ← Back to suggested
          </button>
        </div>
      )}
    </div>
  );
}
