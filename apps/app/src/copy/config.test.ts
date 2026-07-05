/**
 * Behavior config (card CENTRAL-1) — thresholds are DATA, not magic numbers.
 * These prove that (a) the baked fallback matches the documented defaults and
 * (b) changing a config row changes behavior: the confidence band a score falls
 * into moves when the cutoffs move.
 */
import { describe, expect, it } from "vitest";
import { CONFIG_DEFAULTS, confBand, type BehaviorConfig } from "./config";

describe("behavior config defaults", () => {
  it("carries the documented trust-tier knobs", () => {
    expect(CONFIG_DEFAULTS).toEqual({
      confidence_high: 0.75,
      confidence_medium: 0.45,
      auto_propose_limit: 8,
      asks_per_week: 5,
      digest_cadence_days: 7,
      invoice_nudge_cadence_days: 7,
      close_sla_days: 10,
    });
  });
});

describe("confBand — reads cutoffs from config, not hard-coded numbers", () => {
  it("bands with the default cutoffs", () => {
    expect(confBand(0.9, CONFIG_DEFAULTS)).toBe("hi");
    expect(confBand(0.6, CONFIG_DEFAULTS)).toBe("mid");
    expect(confBand(0.2, CONFIG_DEFAULTS)).toBe("lo");
    // boundaries are inclusive at/above the cutoff
    expect(confBand(0.75, CONFIG_DEFAULTS)).toBe("hi");
    expect(confBand(0.45, CONFIG_DEFAULTS)).toBe("mid");
  });

  it("CHANGING A CONFIG ROW CHANGES BEHAVIOR: a stricter cutoff re-bands a score", () => {
    const strict: BehaviorConfig = { ...CONFIG_DEFAULTS, confidence_high: 0.95 };
    // 0.9 is "hi" under defaults, but "mid" once the high cutoff is raised to 0.95.
    expect(confBand(0.9, CONFIG_DEFAULTS)).toBe("hi");
    expect(confBand(0.9, strict)).toBe("mid");
  });

  it("a looser medium cutoff promotes a low score to medium", () => {
    const loose: BehaviorConfig = { ...CONFIG_DEFAULTS, confidence_medium: 0.1 };
    expect(confBand(0.2, CONFIG_DEFAULTS)).toBe("lo");
    expect(confBand(0.2, loose)).toBe("mid");
  });
});
