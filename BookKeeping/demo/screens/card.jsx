/**
 * screens/card.jsx — Universal approval card.
 *
 * Exports:
 *   export function ApprovalCard({ card, persona, ai, onConfirm, onSkip })
 *     — consumed inline by thread.jsx
 *   export default function CardScreen({ ai, state, navigate })
 *     — standalone route at #/card/:id for isolated testing
 *
 * Layout: Penny bubble (AI-generated) → card body → actions.
 * "Change" opens a category picker sheet.
 * Every action fires a brief toast.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { irsLineChip } from "../util/irsLookup.js";
import Sheet from "../components/Sheet.jsx";
import { CARD_VARIANTS, ENTITY_TYPES } from "../constants/variants.js";
import { CARD_FALLBACK_COPY, TOAST_COPY } from "../constants/copy.js";

// Maps category name to --cat-* token key
function catKey(category) {
  if (!category) return "tech";
  const c = category.toLowerCase();
  if (c.includes("software") || c.includes("saas") || c.includes("subscription") || c.includes("phone") || c.includes("tech")) return "tech";
  if (c.includes("meal") || c.includes("food") || c.includes("coffee") || c.includes("dining") || c.includes("restaurant")) return "food";
  if (c.includes("travel") || c.includes("transport") || c.includes("uber") || c.includes("lyft") || c.includes("flight")) return "travel";
  if (c.includes("office") || c.includes("suppli") || c.includes("utilities") || c.includes("utility") || c.includes("electric") || c.includes("internet")) return "office";
  if (c.includes("health") || c.includes("wellness") || c.includes("medical") || c.includes("insurance")) return "health";
  return "personal";
}

function CategorySvgShape({ type }) {
  if (type === "food") return (
    <>
      <path d="M2 4h7v4.5A2.5 2.5 0 016.5 11h-2A2.5 2.5 0 012 8.5V4z"/>
      <path d="M9 5.5h.5a1.5 1.5 0 010 3H9"/>
      <path d="M4 2.5V1.5M6.5 2.5V1.5"/>
    </>
  );
  if (type === "travel") return (
    <>
      <path d="M6 1a4 4 0 00-4 4c0 3 4 7 4 7s4-4 4-7a4 4 0 00-4-4z"/>
      <circle cx="6" cy="5" r="1.3"/>
    </>
  );
  if (type === "income") return (
    <>
      <rect x="1" y="4" width="10" height="7" rx="1"/>
      <path d="M4 4V3a2 2 0 014 0v1"/>
      <line x1="6" y1="6.5" x2="6" y2="9.5"/>
      <line x1="4.5" y1="8" x2="7.5" y2="8"/>
    </>
  );
  if (type === "office") return (
    <>
      <rect x="1" y="4" width="10" height="7" rx="1"/>
      <path d="M4 4V3a2 2 0 014 0v1"/>
    </>
  );
  if (type === "health") return (
    <>
      <line x1="6" y1="2" x2="6" y2="10"/>
      <line x1="2" y1="6" x2="10" y2="6"/>
    </>
  );
  if (type === "personal") return (
    <>
      <circle cx="6" cy="4" r="2"/>
      <path d="M2 11c0-2.2 1.8-4 4-4s4 1.8 4 4"/>
    </>
  );
  // tech / default: monitor
  return (
    <>
      <rect x="1" y="2" width="10" height="7" rx="1"/>
      <line x1="4" y1="9" x2="4" y2="11"/>
      <line x1="8" y1="9" x2="8" y2="11"/>
      <line x1="3" y1="11" x2="9" y2="11"/>
    </>
  );
}

// 11×11px icon with tint-bg container, used inside category pill
function CategoryIcon({ category, stroke, bg, type: typeProp }) {
  const type = typeProp || catKey(category);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 16, height: 16, borderRadius: 4, background: bg,
      marginRight: 5, flexShrink: 0, verticalAlign: "middle",
    }}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
        stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <CategorySvgShape type={type} />
      </svg>
    </span>
  );
}

const DEFAULT_CATEGORIES = [
  "Software", "Travel", "Business meals (50%)", "Office supplies", "Marketing",
  "Contractors", "Utilities", "Phone", "Commercial insurance", "Professional fees",
  "Equipment", "Rent", "Payroll", "Miscellaneous business expenses",
];

function fmt(amount) {
  const abs = Math.abs(amount);
  const hasDecimal = abs % 1 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasDecimal ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(abs);
}

function dateLabel(daysAgo) {
  if (daysAgo == null) return "";
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${daysAgo} days ago`;
}

function ConfidenceBar({ confidence }) {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const label = confidence >= 0.9
    ? CARD_FALLBACK_COPY.confidenceHigh
    : confidence >= 0.7
    ? CARD_FALLBACK_COPY.confidenceMedium
    : CARD_FALLBACK_COPY.confidenceLow;
  return (
    <div className="card-confidence">
      <div className="card-confidence-track">
        <div className="card-confidence-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="card-confidence-label">{label}</span>
    </div>
  );
}

function VendorIcon({ vendor }) {
  const letter = (vendor || "?")[0].toUpperCase();
  return <div className="card-vendor-icon" aria-hidden="true">{letter}</div>;
}

function Toast({ message, visible }) {
  return (
    <div className={`card-toast${visible ? " card-toast--visible" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}

function CategorySheet({ open, onClose, onSelect, currentCategory, industry }) {
  const [cats, setCats] = useState(DEFAULT_CATEGORIES);

  useEffect(() => {
    if (!industry) return;
    fetch(`${window.PENNY_CONFIG?.baseUrl || "/"}config/industries.json`)
      .then((r) => r.json())
      .then((json) => {
        const industryCats = json.industries?.[industry]?.expenseCategories;
        if (industryCats?.length) {
          const merged = [...new Set([...industryCats, ...DEFAULT_CATEGORIES])];
          setCats(merged);
        }
      })
      .catch(() => {});
  }, [industry]);

  return (
    <Sheet open={open} onClose={onClose} title={CARD_FALLBACK_COPY.categorySheetTitle}>
      <div className="sheet-list">
        {cats.map((cat) => (
          <button
            key={cat}
            className={`sheet-item${cat === currentCategory ? " sheet-item--active" : ""}`}
            onClick={() => onSelect(cat)}
            type="button"
          >
            <span className="sheet-item-label">{cat}</span>
            {cat === currentCategory && <span className="sheet-item-check">✓</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function CardPennyBubble({ msg, loading }) {
  return (
    <div className="penny-row card-penny-row">
      <div className="penny-row-avatar">
        <div className="p-mark p-mark-sm">P</div>
      </div>
      <div className="penny-bubble">
        <div className="bubble-label">PENNY</div>
        {loading || !msg ? (
          <div className="penny-bubble-loading">
            <div className="penny-bubble-skel" style={{ width: "88%" }} />
            <div className="penny-bubble-skel" style={{ width: "60%" }} />
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

export function ApprovalCard({ card, persona, ai, onConfirm, onSkip, onApprove, onReject, showIrsLines }) {
  const [pennyMsg,     setPennyMsg]     = useState(null);
  const [pennyLoading, setPennyLoading] = useState(true);
  const [category,     setCategory]     = useState(card.category_guess || null);
  const [sheetOpen,    setSheetOpen]    = useState(false);
  const [toast,        setToast]        = useState({ message: "", visible: false });
  const toastTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setPennyLoading(true);
    ai.renderPenny({
      intent: "card.approval",
      context: {
        entity:   persona?.entity   || ENTITY_TYPES.SOLE_PROP,
        industry: persona?.industry || "consulting",
        persona,
        card: {
          variant:          card.variant,
          vendor:           card.vendor          || null,
          amount:           card.amount,
          date:             dateLabel(card.daysAgo),
          confidence:       card.confidence      ?? null,
          category_guess:   category,
          from:             card.from            || null,
          to:               card.to              || null,
          rollingMedian:    card.rollingMedian   || null,
          priorConfirms:    card.priorConfirms   || null,
          currentCategory:  card.currentCategory || null,
          suggestedCategory: card.suggestedCategory || null,
          cpaName:          card.cpaName         || null,
          cpaNote:          card.cpaNote         || null,
        },
      },
    })
      .then((msg) => { if (!cancelled) { setPennyMsg(msg); setPennyLoading(false); } })
      .catch(() => {
        if (!cancelled) { setPennyMsg(fallbackMsg(card)); setPennyLoading(false); }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, category]);

  const showToast = useCallback((message) => {
    clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2400);
  }, []);

  const handleConfirm = useCallback(() => {
    posthog.capture("transaction_approved", {
      vendor: card.vendor,
      amount: card.amount,
      category: category,
      confidence: card.confidence,
      variant: card.variant,
    });
    showToast(TOAST_COPY.confirmed);
    setTimeout(() => onConfirm({ ...card, category_guess: category }), 300);
  }, [card, category, onConfirm, showToast]);

  const handleCategorySelect = useCallback((cat) => {
    if (cat !== category) {
      posthog.capture("transaction_category_changed", {
        vendor: card.vendor,
        previous_category: category,
        new_category: cat,
      });
    }
    setCategory(cat);
    setSheetOpen(false);
    showToast(TOAST_COPY.changedTo(cat));
  }, [card.vendor, category, showToast]);

  const handleSkip = useCallback(() => {
    posthog.capture("transaction_skipped", {
      vendor: card.vendor,
      amount: card.amount,
      category: category,
      variant: card.variant,
    });
    showToast(TOAST_COPY.savedForLater);
    setTimeout(() => onSkip?.(card), 800);
  }, [card, category, onSkip, showToast]);

  const handleRule = useCallback(() => {
    showToast(TOAST_COPY.ruleCreated(card.vendor, category));
    setTimeout(() => onConfirm({ ...card, category_guess: category, ruleCreated: true }), 800);
  }, [card, category, onConfirm, showToast]);

  const isCpaSuggestion = card.variant === CARD_VARIANTS.CPA_SUGGESTION;
  const isIncome  = card.variant === CARD_VARIANTS.INCOME || card.variant === CARD_VARIANTS.INCOME_CELEBRATION;
  const isOwnDraw = card.variant === CARD_VARIANTS.OWNERS_DRAW;
  const isRule    = card.variant === CARD_VARIANTS.RULE_PROPOSAL;
  const sign      = isIncome ? "+" : isOwnDraw ? "" : "-";

  // Category icon colors: income uses --income on --income-bg; expenses use --cat-* on matching tint
  const catStroke = isIncome ? "var(--income)" : `var(--cat-${catKey(category)})`;
  const catBg     = isIncome ? "var(--income-bg)" : `var(--cat-${catKey(category)}-bg)`;

  const primaryLabel   = pennyMsg?.ctaPrimary   || CARD_FALLBACK_COPY.defaultPrimaryCta;
  const secondaryLabel = pennyMsg?.ctaSecondary || CARD_FALLBACK_COPY.defaultSecondaryCta;

  // cpa-suggestion: approve / keep-as-is handlers
  const handleApprove = useCallback(() => {
    showToast(TOAST_COPY.cpaSuggestionApproved);
    setTimeout(() => onApprove?.(card), 300);
  }, [card, onApprove, showToast]);

  const handleKeepAsIs = useCallback(() => {
    showToast(TOAST_COPY.cpaSuggestionKeptAsIs);
    setTimeout(() => onReject?.(card), 300);
  }, [card, onReject, showToast]);

  if (isCpaSuggestion) {
    return (
      <div className="approval-card-wrap">
        <CardPennyBubble msg={pennyMsg} loading={pennyLoading} />

        {/* CPA note — verbatim, below bubble */}
        {card.cpaNote && (
          <div style={{
            margin: "8px 0 10px",
            padding: "10px 14px",
            background: "var(--paper)",
            borderRadius: "var(--r-card)",
            borderLeft: "3px solid var(--ink-3)",
          }}>
            <p style={{ margin: "0 0 2px", fontSize: 11, fontWeight: "var(--fw-semibold)",
              color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {card.cpaName || CARD_FALLBACK_COPY.cpaNoteAuthorFallback}'s note
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
              {card.cpaNote}
            </p>
          </div>
        )}

        <div className="approval-card approval-card--expense">
          <div className="card-vendor-row">
            <div className="card-vendor-row-left">
              <VendorIcon vendor={card.vendor || CARD_FALLBACK_COPY.cpaSuggestionGenericVendor} />
              <div className="card-vendor-info">
                <span className="card-vendor-name">{card.vendor || CARD_FALLBACK_COPY.cpaSuggestionVendorFallback}</span>
                {card.cpaName && (
                  <span className="card-vendor-date">Suggested by {card.cpaName}</span>
                )}
              </div>
            </div>
          </div>

          {/* Category comparison: current → suggested */}
          <div style={{ margin: "14px 0 16px" }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: "var(--fw-semibold)",
              color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {CARD_FALLBACK_COPY.cpaReclassEyebrow}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="card-category-pill" style={{ display: "inline-flex", alignItems: "center" }}>
                <CategoryIcon category={card.currentCategory} stroke={`var(--cat-${catKey(card.currentCategory)})`}
                  bg={`var(--cat-${catKey(card.currentCategory)}-bg)`} />
                {card.currentCategory}
              </span>
              <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="var(--ink-3)"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M5 11h12M13 7l4 4-4 4" />
              </svg>
              <span className="card-category-pill" style={{ display: "inline-flex", alignItems: "center",
                border: "1.5px solid var(--ink)", fontWeight: "var(--fw-semibold)" }}>
                <CategoryIcon category={card.suggestedCategory} stroke={`var(--cat-${catKey(card.suggestedCategory)})`}
                  bg={`var(--cat-${catKey(card.suggestedCategory)}-bg)`} />
                {card.suggestedCategory}
              </span>
            </div>
          </div>

          <div className="card-actions">
            <button className="btn btn-full" onClick={handleApprove} type="button">
              {CARD_FALLBACK_COPY.cpaSuggestionApprove}
            </button>
            <button className="btn btn-ghost btn-full" onClick={handleKeepAsIs} type="button">
              {CARD_FALLBACK_COPY.cpaSuggestionKeep}
            </button>
          </div>
        </div>

        <Toast message={toast.message} visible={toast.visible} />
      </div>
    );
  }

  return (
    <div className="approval-card-wrap">
      <CardPennyBubble msg={pennyMsg} loading={pennyLoading} />

      <div className={`approval-card${isIncome ? " approval-card--income" : ""}${!isIncome && !isOwnDraw ? " approval-card--expense" : ""}${isOwnDraw ? " approval-card--draw" : ""}`}>

        <div className="card-vendor-row">
          <div className="card-vendor-row-left">
            <VendorIcon vendor={card.vendor} />
            <div className="card-vendor-info">
              <span className="card-vendor-name">
                {card.vendor || (isOwnDraw ? CARD_FALLBACK_COPY.ownersDrawVendorFallback : CARD_FALLBACK_COPY.vendorFallback)}
              </span>
              {card.daysAgo != null && (
                <span className="card-vendor-date">{dateLabel(card.daysAgo)}</span>
              )}
            </div>
          </div>
          <div className="card-amount">{sign}{fmt(card.amount)}</div>
        </div>

        {category && !isOwnDraw && (
          <div className="card-category-row">
            <span className="card-category-pill" style={{ display: "inline-flex", alignItems: "center" }}>
              <CategoryIcon category={category} stroke={catStroke} bg={catBg} type={isIncome ? "income" : undefined} />
              {category}
            </span>
            {showIrsLines && !isIncome && (() => {
              const chip = irsLineChip(category, persona?.entity);
              return chip ? (
                <span style={{
                  display: "block", marginTop: 4,
                  fontFamily: "monospace", fontSize: 10,
                  color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase",
                }}>
                  {chip}
                </span>
              ) : null;
            })()}
          </div>
        )}

        {!isIncome && !isOwnDraw && <ConfidenceBar confidence={card.confidence} />}

        <div className="card-actions">
          <button className="btn btn-full" onClick={handleConfirm} type="button">
            {primaryLabel}
          </button>

          {isRule ? (
            <button className="btn btn-ghost btn-full" onClick={handleRule} type="button">
              {CARD_FALLBACK_COPY.ruleProposalCta}
            </button>
          ) : (
            <button className="btn btn-ghost btn-full" onClick={() => setSheetOpen(true)} type="button">
              {secondaryLabel}
            </button>
          )}

          {!isIncome && !isOwnDraw && (
            <button className="card-skip-btn" onClick={handleSkip} type="button">
              {CARD_FALLBACK_COPY.skipForNowCta}
            </button>
          )}
        </div>
      </div>

      <CategorySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSelect={handleCategorySelect}
        currentCategory={category}
        industry={persona?.industry}
      />

      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}

function fallbackMsg(card) {
  const isIncome = card.variant === CARD_VARIANTS.INCOME || card.variant === CARD_VARIANTS.INCOME_CELEBRATION;
  if (isIncome)                                  return CARD_FALLBACK_COPY.income(card.vendor, fmt(card.amount));
  if (card.variant === CARD_VARIANTS.OWNERS_DRAW) return CARD_FALLBACK_COPY.ownersDraw(fmt(card.amount));
  if (card.variant === CARD_VARIANTS.LOW_CONFIDENCE) return CARD_FALLBACK_COPY.lowConfidence(fmt(card.amount));
  return CARD_FALLBACK_COPY.expenseDefault(card.vendor, fmt(card.amount), card.category_guess);
}

export default function CardScreen({ ai, state, navigate }) {
  const card = {
    id: "preview", variant: CARD_VARIANTS.BASE_EXPENSE, vendor: "Notion",
    amount: 19, daysAgo: 1, confidence: 0.96, category_guess: "Software",
  };
  return (
    <div className="phone-content">
      <header className="onboarding-header">
        <button className="onboarding-back" onClick={() => navigate("#/penny")} type="button">←</button>
      </header>
      <ApprovalCard card={card} persona={state.persona} ai={ai} onConfirm={() => navigate("#/penny")} />
    </div>
  );
}
