/**
 * tests/variants.test.js — unit tests for constants/variants.js.
 *
 * Three jobs:
 *   1. Confirm every exported enum is frozen.
 *   2. Exercise every helper across valid + invalid inputs.
 *   3. Coverage: every industry key in public/config/industries.json is in
 *      INDUSTRY_KEYS, and every distinct entity prefix in
 *      public/config/scenarios.json is in ENTITY_TYPES.
 *
 * Run with `npm test`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_VARIANTS,
  ENTITY_TYPES,
  INDUSTRY_KEYS,
  APPROVAL_TYPES,
  NOTIFICATION_MODES,
  isKnownVariant,
  isKnownEntity,
  isKnownIndustry,
  isSCorpOrLlc,
  isLlc,
  formLabelForEntity,
} from "../constants/variants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const industriesJson = JSON.parse(
  readFileSync(resolve(__dirname, "../public/config/industries.json"), "utf-8")
);
const scenariosJson = JSON.parse(
  readFileSync(resolve(__dirname, "../public/config/scenarios.json"), "utf-8")
);

// ── Freeze checks ────────────────────────────────────────────────────────────

describe("variants — freeze", () => {
  it("freezes CARD_VARIANTS", () => {
    expect(Object.isFrozen(CARD_VARIANTS)).toBe(true);
  });
  it("freezes ENTITY_TYPES", () => {
    expect(Object.isFrozen(ENTITY_TYPES)).toBe(true);
  });
  it("freezes INDUSTRY_KEYS", () => {
    expect(Object.isFrozen(INDUSTRY_KEYS)).toBe(true);
  });
  it("freezes APPROVAL_TYPES", () => {
    expect(Object.isFrozen(APPROVAL_TYPES)).toBe(true);
  });
  it("freezes NOTIFICATION_MODES", () => {
    expect(Object.isFrozen(NOTIFICATION_MODES)).toBe(true);
  });
});

// ── Membership helpers ───────────────────────────────────────────────────────

describe("isKnownVariant", () => {
  it("accepts every value of CARD_VARIANTS", () => {
    for (const v of Object.values(CARD_VARIANTS)) {
      expect(isKnownVariant(v)).toBe(true);
    }
  });
  it("rejects unknown strings, empty, null, undefined, non-strings", () => {
    expect(isKnownVariant("not-a-variant")).toBe(false);
    expect(isKnownVariant("")).toBe(false);
    expect(isKnownVariant(null)).toBe(false);
    expect(isKnownVariant(undefined)).toBe(false);
    expect(isKnownVariant(42)).toBe(false);
    expect(isKnownVariant({})).toBe(false);
  });
});

describe("isKnownEntity", () => {
  it("accepts every value of ENTITY_TYPES", () => {
    for (const e of Object.values(ENTITY_TYPES)) {
      expect(isKnownEntity(e)).toBe(true);
    }
  });
  it("rejects unknown strings, empty, null, undefined, non-strings", () => {
    expect(isKnownEntity("c-corp")).toBe(false);
    expect(isKnownEntity("")).toBe(false);
    expect(isKnownEntity(null)).toBe(false);
    expect(isKnownEntity(undefined)).toBe(false);
    expect(isKnownEntity(0)).toBe(false);
  });
});

describe("isKnownIndustry", () => {
  it("accepts every value of INDUSTRY_KEYS", () => {
    for (const k of Object.values(INDUSTRY_KEYS)) {
      expect(isKnownIndustry(k)).toBe(true);
    }
  });
  it("rejects unknown strings, empty, null, undefined, non-strings", () => {
    expect(isKnownIndustry("real-estate")).toBe(false);
    expect(isKnownIndustry("")).toBe(false);
    expect(isKnownIndustry(null)).toBe(false);
    expect(isKnownIndustry(undefined)).toBe(false);
  });
});

// ── Routing helpers ──────────────────────────────────────────────────────────

describe("isSCorpOrLlc", () => {
  it("is true for s-corp and every LLC flavour", () => {
    expect(isSCorpOrLlc(ENTITY_TYPES.S_CORP)).toBe(true);
    expect(isSCorpOrLlc(ENTITY_TYPES.LLC)).toBe(true);
    expect(isSCorpOrLlc(ENTITY_TYPES.LLC_SINGLE)).toBe(true);
    expect(isSCorpOrLlc(ENTITY_TYPES.LLC_MULTI)).toBe(true);
  });
  it("is false for sole-prop, partnership, and invalid input", () => {
    expect(isSCorpOrLlc(ENTITY_TYPES.SOLE_PROP)).toBe(false);
    expect(isSCorpOrLlc(ENTITY_TYPES.PARTNERSHIP)).toBe(false);
    expect(isSCorpOrLlc("c-corp")).toBe(false);
    expect(isSCorpOrLlc(null)).toBe(false);
    expect(isSCorpOrLlc(undefined)).toBe(false);
  });
});

describe("isLlc", () => {
  it("is true for every LLC flavour", () => {
    expect(isLlc(ENTITY_TYPES.LLC)).toBe(true);
    expect(isLlc(ENTITY_TYPES.LLC_SINGLE)).toBe(true);
    expect(isLlc(ENTITY_TYPES.LLC_MULTI)).toBe(true);
  });
  it("is false for everything else", () => {
    expect(isLlc(ENTITY_TYPES.SOLE_PROP)).toBe(false);
    expect(isLlc(ENTITY_TYPES.S_CORP)).toBe(false);
    expect(isLlc(ENTITY_TYPES.PARTNERSHIP)).toBe(false);
    expect(isLlc(null)).toBe(false);
    expect(isLlc(undefined)).toBe(false);
  });
});

describe("formLabelForEntity", () => {
  it("returns Schedule C for sole-prop, llc-single, llc", () => {
    expect(formLabelForEntity(ENTITY_TYPES.SOLE_PROP)).toBe("Schedule C");
    expect(formLabelForEntity(ENTITY_TYPES.LLC_SINGLE)).toBe("Schedule C");
    expect(formLabelForEntity(ENTITY_TYPES.LLC)).toBe("Schedule C");
  });
  it("returns Form 1120-S for s-corp", () => {
    expect(formLabelForEntity(ENTITY_TYPES.S_CORP)).toBe("Form 1120-S");
  });
  it("returns Form 1065 for llc-multi and partnership", () => {
    expect(formLabelForEntity(ENTITY_TYPES.LLC_MULTI)).toBe("Form 1065");
    expect(formLabelForEntity(ENTITY_TYPES.PARTNERSHIP)).toBe("Form 1065");
  });
  it("defaults to Schedule C for unknown / falsy input", () => {
    expect(formLabelForEntity("c-corp")).toBe("Schedule C");
    expect(formLabelForEntity(null)).toBe("Schedule C");
    expect(formLabelForEntity(undefined)).toBe("Schedule C");
    expect(formLabelForEntity("")).toBe("Schedule C");
  });
});

// ── Coverage checks — enum must contain every live data key ───────────────

describe("coverage — INDUSTRY_KEYS vs industries.json", () => {
  it("contains every industry key shipped in industries.json", () => {
    const keys = Object.keys(industriesJson?.industries || {});
    expect(keys.length).toBeGreaterThan(0);
    const enumValues = new Set(Object.values(INDUSTRY_KEYS));
    for (const key of keys) {
      expect(enumValues.has(key)).toBe(true);
    }
  });
});

describe("coverage — ENTITY_TYPES vs scenarios.json", () => {
  it("contains every entity prefix used in scenarios.json keys", () => {
    const scenarioKeys = Object.keys(scenariosJson?.scenarios || {});
    expect(scenarioKeys.length).toBeGreaterThan(0);
    const prefixes = new Set(scenarioKeys.map((k) => k.split(".")[0]));
    const enumValues = new Set(Object.values(ENTITY_TYPES));
    for (const prefix of prefixes) {
      expect(enumValues.has(prefix)).toBe(true);
    }
  });
});
