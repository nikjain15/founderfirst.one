/**
 * W3.5 receipt-matcher unit tests — the parse→match core: EXACT (same date +
 * amount) first, FUZZY (amount + date-window) second, vendor corroboration, the
 * confidence signal, and the "one receipt per entry" skip. Pure functions, no DB.
 * Scenario ids: W3.5-MATCH, W3.5-CONFIDENCE, W3.5-DEDUP.
 *
 * These assert the matcher's OWN signal only. The cutoffs that turn a confidence
 * into a tier live in platform_config (W3.2) and are applied by the edge fn — this
 * test deliberately does NOT hardcode a tier threshold.
 */
import { describe, expect, it } from "vitest";
import {
  dayDiff, matchConfidence, matchReceipt, receiptTier, vendorInMemo,
  type EntryCandidate, type ParsedReceipt,
} from "./receiptMatch";

// The tier cutoffs are DATA (platform_config seed / config.ts CONFIG_DEFAULTS).
// The test passes them in — it never hardcodes a threshold inline (grep gate).
const CUTOFFS = { confidence_high: 0.75, confidence_medium: 0.45 };

function entry(id: string, date: string, amountMinor: number, memo: string | null = null, has_receipt = false): EntryCandidate {
  return { entry_id: id, entry_date: date, amount_minor: amountMinor, memo, has_receipt };
}
function receipt(amount_minor: number | null, receipt_date: string | null, vendor: string | null = null): ParsedReceipt {
  return { vendor, amount_minor, receipt_date };
}

describe("dayDiff", () => {
  it("is calendar-day accurate and symmetric", () => {
    expect(dayDiff("2026-07-01", "2026-07-01")).toBe(0);
    expect(dayDiff("2026-07-01", "2026-07-04")).toBe(3);
    expect(dayDiff("2026-07-04", "2026-07-01")).toBe(3);
  });
});

describe("matchReceipt — W3.5-MATCH", () => {
  const candidates = [
    entry("e-exact", "2026-07-01", 4599),
    entry("e-near", "2026-07-03", 4599),
    entry("e-far", "2026-07-20", 4599),
    entry("e-other", "2026-07-01", 999),
  ];

  it("EXACT: a SINGLE same date + amount candidate matches (one unambiguous tie)", () => {
    const m = matchReceipt(receipt(-4599, "2026-07-01"), candidates);
    expect(m).not.toBeNull();
    expect(m!.entry_id).toBe("e-exact");
    expect(m!.kind).toBe("exact");
    expect(m!.dateDelta).toBe(0);
    expect(m!.exactTies).toBe(1); // unambiguous — exactly one candidate on that amount+date
  });

  it("AMBIGUOUS EXACT (W3.5-AMBIG): ≥2 candidates tie on amount+date → exactTies counts them", () => {
    // Two same-price purchases on the same day: the receipt cannot be attributed
    // to one over the other, so the matcher reports the tie for the tier pipeline.
    const tie = [
      entry("e-a", "2026-07-01", 4599, "COFFEE BAR"),
      entry("e-b", "2026-07-01", 4599, "LUNCH SPOT"),
    ];
    const m = matchReceipt(receipt(-4599, "2026-07-01", "Coffee Bar"), tie)!;
    expect(m.kind).toBe("exact");
    expect(m.exactTies).toBe(2); // ambiguous — the tier gate must downgrade to a confirm card
  });

  it("FUZZY: no same-date candidate → nearest within the window", () => {
    const m = matchReceipt(receipt(-4599, "2026-07-04"), candidates); // e-near is 1 day off
    expect(m!.entry_id).toBe("e-near");
    expect(m!.kind).toBe("fuzzy");
    expect(m!.dateDelta).toBe(1);
  });

  it("returns null when the only same-amount entry is outside the window", () => {
    const m = matchReceipt(receipt(-4599, "2026-08-01"), candidates);
    expect(m).toBeNull();
  });

  it("matches on amount magnitude regardless of receipt sign", () => {
    expect(matchReceipt(receipt(4599, "2026-07-01"), candidates)!.entry_id).toBe("e-exact");
    expect(matchReceipt(receipt(-4599, "2026-07-01"), candidates)!.entry_id).toBe("e-exact");
  });

  it("returns null with no amount or no date (unparseable receipt → queue)", () => {
    expect(matchReceipt(receipt(null, "2026-07-01"), candidates)).toBeNull();
    expect(matchReceipt(receipt(-4599, null), candidates)).toBeNull();
    expect(matchReceipt(receipt(0, "2026-07-01"), candidates)).toBeNull();
  });
});

describe("matchReceipt — W3.5-DEDUP (one receipt per entry)", () => {
  it("skips an entry that already carries a receipt, matching the next candidate", () => {
    const candidates = [
      entry("e-taken", "2026-07-01", 4599, null, /* has_receipt */ true),
      entry("e-open", "2026-07-02", 4599),
    ];
    const m = matchReceipt(receipt(-4599, "2026-07-01"), candidates);
    // e-taken is the exact-date match but is already taken → falls through to fuzzy e-open.
    expect(m!.entry_id).toBe("e-open");
    expect(m!.kind).toBe("fuzzy");
  });

  it("returns null when the only amount-match is already taken", () => {
    const candidates = [entry("e-taken", "2026-07-01", 4599, null, true)];
    expect(matchReceipt(receipt(-4599, "2026-07-01"), candidates)).toBeNull();
  });
});

describe("matchConfidence + vendorInMemo — W3.5-CONFIDENCE", () => {
  it("an exact match is maximally confident ONLY when the vendor corroborates", () => {
    const m = matchReceipt(receipt(-4599, "2026-07-01"), [entry("e", "2026-07-01", 4599)])!;
    // Amount+date alone is strong but not certain — an uncorroborated exact match
    // sits in the medium band (needs the vendor to auto-attach), corroborated = 1.0.
    expect(matchConfidence(m, false)).toBeLessThan(1);
    expect(matchConfidence(m, false)).toBeGreaterThanOrEqual(CUTOFFS.confidence_medium);
    expect(matchConfidence(m, false)).toBeLessThan(CUTOFFS.confidence_high);
    expect(matchConfidence(m, true)).toBe(1);
  });

  it("fuzzy confidence decays with date distance (nearer = surer)", () => {
    const near = matchReceipt(receipt(-4599, "2026-07-02"), [entry("e", "2026-07-01", 4599)])!;
    const far = matchReceipt(receipt(-4599, "2026-07-05"), [entry("e", "2026-07-01", 4599)])!;
    expect(matchConfidence(near, false)).toBeGreaterThan(matchConfidence(far, false));
    expect(matchConfidence(far, false)).toBeGreaterThanOrEqual(0.4);
    expect(matchConfidence(near, false)).toBeLessThan(1);
  });

  it("vendor corroboration nudges confidence up but never past 1", () => {
    const fuzzy = matchReceipt(receipt(-4599, "2026-07-03"), [entry("e", "2026-07-01", 4599)])!;
    expect(matchConfidence(fuzzy, true)).toBeGreaterThan(matchConfidence(fuzzy, false));
    const exact = matchReceipt(receipt(-4599, "2026-07-01"), [entry("e", "2026-07-01", 4599)])!;
    expect(matchConfidence(exact, true)).toBe(1);
  });

  it("vendorInMemo needs a real (≥3 char) case-insensitive hit", () => {
    expect(vendorInMemo("Staples", "STAPLES #123 PURCHASE")).toBe(true);
    expect(vendorInMemo("Staples", "Office Depot")).toBe(false);
    expect(vendorInMemo("Ab", "Ab store")).toBe(false); // too short to be a signal
    expect(vendorInMemo(null, "anything")).toBe(false);
  });
});

describe("receiptTier — the auto-attach vs confirm-card decision (W3.2 bands)", () => {
  it("HIGH: a SINGLE exact match auto-attaches only when the vendor corroborates", () => {
    // W3.5-VENDOR: exact amount+date + a corroborating vendor ⇒ genuinely sure ⇒ auto-attach.
    const cand = [entry("e", "2026-07-01", 4599, "STAPLES #44")];
    const parsed = receipt(-4599, "2026-07-01", "Staples");
    const m = matchReceipt(parsed, cand)!;
    const corr = vendorInMemo(parsed.vendor, cand[0].memo); // true
    expect(receiptTier(m, matchConfidence(m, corr), CUTOFFS, { vendorCorroborated: corr })).toBe("high");
  });

  it("CONFIRM (W3.5-VENDOR-MISMATCH): exact amount+date but the vendor does NOT corroborate → not HIGH", () => {
    // Amount+date line up, but the parsed vendor is nowhere in the memo — Penny is
    // not sure enough to silently attach. It must become a confirm card, not HIGH.
    const cand = [entry("e", "2026-07-01", 4599, "OFFICE DEPOT #12")];
    const parsed = receipt(-4599, "2026-07-01", "Staples");
    const m = matchReceipt(parsed, cand)!;
    const corr = vendorInMemo(parsed.vendor, cand[0].memo); // false
    expect(corr).toBe(false);
    const tier = receiptTier(m, matchConfidence(m, corr), CUTOFFS, { vendorCorroborated: corr });
    expect(tier).not.toBe("high");
    expect(tier).toBe("medium"); // confirm card in Review
  });

  it("CONFIRM (W3.5-AMBIG): ≥2 exact ties can never auto-attach, even if a vendor corroborates", () => {
    // Two same-amount+date candidates: ambiguous ⇒ the owner must pick ⇒ LOW confirm,
    // never a silent attach to the first — regardless of vendor corroboration.
    const tie = [
      entry("e-a", "2026-07-01", 4599, "STAPLES #44"),
      entry("e-b", "2026-07-01", 4599, "STAPLES #91"),
    ];
    const parsed = receipt(-4599, "2026-07-01", "Staples");
    const m = matchReceipt(parsed, tie)!;
    expect(m.exactTies).toBe(2);
    // Even asserting corroboration true, ambiguity forces a confirm card.
    expect(receiptTier(m, matchConfidence(m, true), CUTOFFS, { vendorCorroborated: true })).toBe("low");
  });

  it("LOW: a several-days-off fuzzy match yields a confirm card, not an auto-attach", () => {
    const m = matchReceipt(receipt(-4599, "2026-07-05"), [entry("e", "2026-07-01", 4599)])!; // 4 days off
    const conf = matchConfidence(m, false); // ~0.37 → below confidence_medium
    expect(conf).toBeLessThan(CUTOFFS.confidence_medium);
    expect(receiptTier(m, conf, CUTOFFS)).toBe("low");
  });

  it("respects a stricter org override without any code change (cutoffs are DATA)", () => {
    const m = matchReceipt(receipt(-4599, "2026-07-02"), [entry("e", "2026-07-01", 4599)])!; // 1 day off
    const conf = matchConfidence(m, true); // corroborated, ~0.83
    // Default cutoffs → HIGH; a stricter org (high=0.9) → MEDIUM. Same input, config-driven.
    expect(receiptTier(m, conf, CUTOFFS)).toBe("high");
    expect(receiptTier(m, conf, { confidence_high: 0.9, confidence_medium: 0.5 })).toBe("medium");
  });
});

describe("parse→match→tier end-to-end (the flow the edge fn runs)", () => {
  it("a clean photo parse of $45.99 on 2026-07-01 auto-attaches to its transaction", () => {
    // Simulates: parseReceipt → { vendor:'Staples', amount_minor:-4599, date } then match + tier.
    const parsed = receipt(-4599, "2026-07-01", "Staples");
    const candidates = [entry("txn-1", "2026-07-01", 4599, "STAPLES #44 CARD PURCHASE")];
    const m = matchReceipt(parsed, candidates)!;
    expect(m.entry_id).toBe("txn-1");
    expect(m.exactTies).toBe(1); // unambiguous
    const corr = vendorInMemo(parsed.vendor, candidates[0].memo);
    const conf = matchConfidence(m, corr);
    expect(conf).toBe(1); // exact date + amount + corroborating vendor
    expect(receiptTier(m, conf, CUTOFFS, { vendorCorroborated: corr })).toBe("high"); // → the auto-attach path
  });

  it("a receipt with no same-amount transaction produces no match → the unmatched queue", () => {
    const parsed = receipt(-9999, "2026-07-01", "Nowhere");
    const candidates = [entry("txn-1", "2026-07-01", 4599, "STAPLES")];
    expect(matchReceipt(parsed, candidates)).toBeNull(); // → lands in the queue (no tier)
  });
});
