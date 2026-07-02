/**
 * W3.2 · trust-tiered autonomy — tier assignment + budget accounting.
 *
 * These pin the two pure decisions the tiering rests on:
 *   1. assignTier — a learned rule / repeat vendor is HIGH by provenance; a raw
 *      confidence is banded by the CONFIG cutoffs (never a magic number).
 *   2. budgetDisposition — the ≤N-asks/week cap: income always defers to the
 *      digest, a low-confidence unknown interrupts only while budget remains,
 *      and changing the config budget changes the count with no code change.
 */
import { describe, expect, it } from "vitest";
import { assignTier, budgetDisposition, CONFIG_DEFAULTS, type BehaviorConfig } from "./config";

const cfg = CONFIG_DEFAULTS; // confidence_high 0.75, confidence_medium 0.45, asks_per_week 5

describe("assignTier (W3.2)", () => {
  it("a learned RULE is HIGH regardless of confidence", () => {
    expect(assignTier(0.1, "rule", cfg)).toBe("high");
    expect(assignTier(1, "rule", cfg)).toBe("high");
  });

  it("a repeat-VENDOR prior is HIGH by provenance", () => {
    expect(assignTier(0.2, "vendor_prior", cfg)).toBe("high");
  });

  it("a Penny pick bands by the config cutoffs", () => {
    expect(assignTier(0.9, "penny", cfg)).toBe("high");   // ≥ 0.75
    expect(assignTier(0.75, "penny", cfg)).toBe("high");  // boundary is inclusive
    expect(assignTier(0.6, "penny", cfg)).toBe("medium"); // ≥ 0.45, < 0.75
    expect(assignTier(0.45, "penny", cfg)).toBe("medium");
    expect(assignTier(0.3, "penny", cfg)).toBe("low");    // < 0.45
  });

  it("the cutoffs come from config — a stricter config re-bands the SAME score", () => {
    const strict: BehaviorConfig = { ...cfg, confidence_high: 0.95 };
    expect(assignTier(0.9, "penny", cfg)).toBe("high");
    expect(assignTier(0.9, "penny", strict)).toBe("medium"); // no code change, just config
  });
});

describe("budgetDisposition (≤5-asks/week)", () => {
  it("income never interrupts — it defers to the digest, not a card", () => {
    const d = budgetDisposition(0, cfg, { isIncome: true });
    expect(d.interrupt).toBe(false);
    expect(d.defer).toBe(true);
    expect(d.reason).toBe("income");
  });

  it("a low-confidence unknown interrupts while budget remains", () => {
    for (let spent = 0; spent < cfg.asks_per_week; spent++) {
      expect(budgetDisposition(spent, cfg).interrupt).toBe(true);
    }
  });

  it("once the week's budget is spent, further unknowns DEFER to the digest", () => {
    const d = budgetDisposition(cfg.asks_per_week, cfg);
    expect(d.interrupt).toBe(false);
    expect(d.defer).toBe(true);
    expect(d.reason).toBe("budget_spent");
  });

  it("owner asks/week never exceed the budget — a run of 20 unknowns caps at asks_per_week", () => {
    let asks = 0;
    for (let i = 0; i < 20; i++) {
      if (budgetDisposition(asks, cfg).interrupt) asks++;
    }
    expect(asks).toBe(cfg.asks_per_week); // exactly the cap, never more
  });

  it("changing the budget row changes the interruption count with no redeploy", () => {
    const bumped: BehaviorConfig = { ...cfg, asks_per_week: 8 };
    let asks = 0;
    for (let i = 0; i < 20; i++) {
      if (budgetDisposition(asks, bumped).interrupt) asks++;
    }
    expect(asks).toBe(8); // the config value drives it, not a constant
  });
});
