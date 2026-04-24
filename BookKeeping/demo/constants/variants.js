/**
 * constants/variants.js — Central registry for every string literal that
 * names a concept in the demo.
 *
 * Exports five frozen enums (card variants, entity types, industry keys,
 * approval types, notification modes) plus six membership / routing helpers.
 *
 * Shipped as SCAF-2 of the bedrock refactor (24 April 2026). Rule:
 *   - Never hand-write one of these strings in a screen file. Import the enum.
 *   - Never add a new concept-level string without adding it here first.
 *
 * Short-label form names (e.g. "Sch C", "1120-S") still live in
 * util/irsLookup.js → shortFormLabelForEntity(), which renders the compact
 * IRS-line chip under expense categories. This module owns the *full*
 * labels ("Schedule C", "Form 1120-S", "Form 1065") used in page titles.
 */

// ── Card variants ────────────────────────────────────────────────────────────
// Every approval-card variant currently shipped or planned. `card.variant`
// in runtime state must be one of these values.
export const CARD_VARIANTS = Object.freeze({
  EXPENSE:            "expense",
  BASE_EXPENSE:       "base-expense",
  LOW_CONFIDENCE:     "low-confidence",
  INCOME:             "income",
  INCOME_CELEBRATION: "income-celebration",
  OWNERS_DRAW:        "owners-draw",
  RULE_PROPOSAL:      "rule-proposal",
  VARIABLE_RECURRING: "variable-recurring",
  CPA_SUGGESTION:     "cpa-suggestion",
});

// ── Entity types ─────────────────────────────────────────────────────────────
// Founder business-entity type. Drives IRS line routing, owner's-draw
// eligibility, and onboarding form choice.
export const ENTITY_TYPES = Object.freeze({
  SOLE_PROP:    "sole-prop",
  S_CORP:       "s-corp",
  LLC:          "llc",          // generic LLC — treated as SMLLC (Schedule C) by default
  LLC_SINGLE:   "llc-single",   // single-member LLC → Schedule C (disregarded entity)
  LLC_MULTI:    "llc-multi",    // multi-member LLC → Form 1065 + K-1
  PARTNERSHIP:  "partnership",  // non-LLC partnership → Form 1065 + K-1
});

// ── Industry keys ────────────────────────────────────────────────────────────
// Must match public/config/industries.json exactly. The coverage test in
// tests/variants.test.js guarantees they stay in sync.
export const INDUSTRY_KEYS = Object.freeze({
  CONSULTING:            "consulting",
  CREATIVE:              "creative",
  TRADES:                "trades",
  RETAIL:                "retail",
  FOOD_BEVERAGE:         "food-beverage",
  BEAUTY_WELLNESS:       "beauty-wellness",
  PROFESSIONAL_SERVICES: "professional-services",
  TECH_SOFTWARE:         "tech-software",
  HEALTHCARE:            "healthcare",
  OTHER:                 "other",
});

// ── Approval types ───────────────────────────────────────────────────────────
// Shape of state.cpa.approvals[].type. Used by CPA work queue, founder's
// Needs a look, and util/cpaState.js mutations.
export const APPROVAL_TYPES = Object.freeze({
  RECLASSIFICATION:    "reclassification",
  CPA_ADDED_TXN:       "cpa-added-txn",
  PENNY_QUESTION:      "penny-question",
  YEAR_ACCESS_REQUEST: "year-access-request",
});

// ── Notification modes ───────────────────────────────────────────────────────
// state.preferences.notifyCpaActivity. Stored value must be one of these.
export const NOTIFICATION_MODES = Object.freeze({
  REAL_TIME:    "real-time",
  DAILY_DIGEST: "daily-digest",
  OFF:          "off",
});

// ── Internal membership sets ─────────────────────────────────────────────────
const VARIANT_VALUES     = new Set(Object.values(CARD_VARIANTS));
const ENTITY_VALUES      = new Set(Object.values(ENTITY_TYPES));
const INDUSTRY_VALUES    = new Set(Object.values(INDUSTRY_KEYS));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true iff `v` is one of the known CARD_VARIANTS values. */
export function isKnownVariant(v) {
  return typeof v === "string" && VARIANT_VALUES.has(v);
}

/** Returns true iff `e` is one of the known ENTITY_TYPES values. */
export function isKnownEntity(e) {
  return typeof e === "string" && ENTITY_VALUES.has(e);
}

/** Returns true iff `k` is one of the known INDUSTRY_KEYS values. */
export function isKnownIndustry(k) {
  return typeof k === "string" && INDUSTRY_VALUES.has(k);
}

/**
 * Returns true for S-Corp or any LLC flavour — the set of entities where
 * an owner's-draw card variant is legal. Sole-prop and partnership are
 * intentionally excluded: sole-prop owner withdrawals are not tax events;
 * partnership distributions use a different card treatment.
 */
export function isSCorpOrLlc(entity) {
  return (
    entity === ENTITY_TYPES.S_CORP ||
    entity === ENTITY_TYPES.LLC ||
    entity === ENTITY_TYPES.LLC_SINGLE ||
    entity === ENTITY_TYPES.LLC_MULTI
  );
}

/** Returns true iff `entity` is any LLC flavour. */
export function isLlc(entity) {
  return (
    entity === ENTITY_TYPES.LLC ||
    entity === ENTITY_TYPES.LLC_SINGLE ||
    entity === ENTITY_TYPES.LLC_MULTI
  );
}

/**
 * Returns the full tax-form label for an entity type — used in page titles
 * and preview headings ("Form 1120-S preview", "Schedule C preview").
 *
 * For the compact IRS-line chip under a category ("Sch C · Line 24b"),
 * use shortFormLabelForEntity() from util/irsLookup.js instead.
 *
 * Routing:
 *   sole-prop, llc-single, llc  → "Schedule C"
 *   s-corp                      → "Form 1120-S"
 *   llc-multi, partnership      → "Form 1065"
 *   anything else (defensive)   → "Schedule C"
 */
export function formLabelForEntity(entity) {
  if (entity === ENTITY_TYPES.S_CORP)       return "Form 1120-S";
  if (entity === ENTITY_TYPES.LLC_MULTI)    return "Form 1065";
  if (entity === ENTITY_TYPES.PARTNERSHIP)  return "Form 1065";
  return "Schedule C";
}
