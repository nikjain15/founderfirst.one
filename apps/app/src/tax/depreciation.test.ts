/**
 * W1.3-C depreciation engine — golden-number unit tests (REG scenarios
 * W1.3C-MACRS, W1.3C-M1, W1.3C-DISPOSAL). MACRS percentages are DATA fixtures
 * (they come from the macrs_percentages seed table at runtime); these tests assert
 * the ENGINE reproduces the IRS-published schedule for known assets to the cent.
 */
import { describe, expect, it } from "vitest";
import {
  computeSchedule,
  taxDepreciationForYear,
  bookDepreciationForYear,
  m1BucketForDelta,
  disposalGainLoss,
  midQuarterKey,
  type AssetInput,
  type AssetClassData,
  type MacrsTable,
} from "./depreciation";

// IRS Pub 946 Table A-1 — 200%DB, half-year. DATA fixtures, mirroring the seed rows.
const MACRS_5YR_HY: MacrsTable = { 1: 20.0, 2: 32.0, 3: 19.2, 4: 11.52, 5: 11.52, 6: 5.76 };
const MACRS_7YR_HY: MacrsTable = {
  1: 14.29, 2: 24.49, 3: 17.49, 4: 12.49, 5: 8.93, 6: 8.92, 7: 8.93, 8: 4.46,
};
// IRS Pub 946 Table A-5 — 200%DB, mid-quarter Q4, 5-year.
const MACRS_5YR_MQ4: MacrsTable = { 1: 5.0, 2: 38.0, 3: 22.8, 4: 13.68, 5: 10.94, 6: 9.58 };

const CLASS_5YR: AssetClassData = {
  recovery_period: 5, macrs_method: "200DB", default_convention: "half_year",
  section_179_cap_minor: 125_000_00, bonus_pct: 40,
};
const CLASS_7YR: AssetClassData = { ...CLASS_5YR, recovery_period: 7 };

/** A plain $10,000 5-year asset, no §179, no bonus. */
const asset10k: AssetInput = {
  cost_minor: 1_000_000, salvage_minor: 0, in_service_month: 6,
  book_life_years: 5, book_convention: "half_year",
  section_179_elected_minor: 0, bonus_elected: false,
};

describe("W1.3C-MACRS — tax depreciation matches IRS published tables", () => {
  it("5-year 200DB half-year: 20/32/19.2/11.52/11.52/5.76 of $10,000", () => {
    const noBonus: AssetClassData = { ...CLASS_5YR, bonus_pct: null };
    const got = [1, 2, 3, 4, 5, 6].map((y) =>
      taxDepreciationForYear(asset10k, noBonus, MACRS_5YR_HY, y),
    );
    expect(got).toEqual([200_000, 320_000, 192_000, 115_200, 115_200, 57_600]);
    expect(got.reduce((a, b) => a + b, 0)).toBe(1_000_000); // fully recovers cost
  });

  it("7-year 200DB half-year on $14,000 fully recovers to the cent", () => {
    const a14k: AssetInput = { ...asset10k, cost_minor: 1_400_000, book_life_years: 7 };
    const noBonus: AssetClassData = { ...CLASS_7YR, bonus_pct: null };
    const got = [1, 2, 3, 4, 5, 6, 7, 8].map((y) =>
      taxDepreciationForYear(a14k, noBonus, MACRS_7YR_HY, y),
    );
    // 14.29% of $14,000 = $2,000.60 → floored to 200060 cents, etc.
    expect(got[0]).toBe(200_060);
    // per-year floor UNDER-recovers; computeSchedule's final-year true-up must
    // recover EXACTLY cost. Assert full recovery via the schedule (not the raw sum).
    const noB: AssetClassData = { ...CLASS_7YR, bonus_pct: null };
    const a14k2: AssetInput = { ...asset10k, cost_minor: 1_400_000, book_life_years: 7 };
    const sched7 = computeSchedule(a14k2, noB, MACRS_7YR_HY);
    expect(sched7[sched7.length - 1].tax_accumulated_minor).toBe(1_400_000);
  });

  it("non-round cost fully recovers to the cent (floor drift trued up over life)", () => {
    // $12,345.67 — per-year floor strands 2¢; the final-year sweep recovers exactly cost.
    const odd: AssetInput = { ...asset10k, cost_minor: 1_234_567 };
    const noBonus: AssetClassData = { ...CLASS_5YR, bonus_pct: null };
    const sched = computeSchedule(odd, noBonus, MACRS_5YR_HY);
    expect(sched[sched.length - 1].tax_accumulated_minor).toBe(1_234_567);
    expect(sched[sched.length - 1].book_accumulated_minor).toBe(1_234_567); // salvage 0
    // temporary difference nets to ZERO over life (crown-jewel invariant)
    expect(sched.reduce((a, s) => a + s.book_tax_delta_minor, 0)).toBe(0);
  });

  it("mid-quarter Q4 selects the Q4 table (5% year-1 vs 20% half-year)", () => {
    const q4asset: AssetInput = { ...asset10k, in_service_month: 11 }; // November → Q4
    expect(midQuarterKey(q4asset.in_service_month)).toBe("mid_quarter_q4");
    const y1 = taxDepreciationForYear(q4asset, CLASS_5YR, MACRS_5YR_MQ4, 1);
    // no bonus/179 here to isolate the convention: 5% of 10k = $500
    const noBonus: AssetClassData = { ...CLASS_5YR, bonus_pct: null };
    expect(taxDepreciationForYear(q4asset, noBonus, MACRS_5YR_MQ4, 1)).toBe(50_000);
    expect(y1).toBeGreaterThan(0);
  });

  it("§179 + bonus stack in year 1, then MACRS on the remainder", () => {
    // $10,000, elect $4,000 §179, then 40% bonus on the $6,000 remainder = $2,400,
    // MACRS on remaining $3,600: year-1 20% = $720. Year-1 total = 4000+2400+720.
    const elect: AssetInput = { ...asset10k, section_179_elected_minor: 400_000, bonus_elected: true };
    const y1 = taxDepreciationForYear(elect, CLASS_5YR, MACRS_5YR_HY, 1);
    expect(y1).toBe(400_000 + 240_000 + 72_000);
    // §179 cap clamps an over-election: elect $9,999,999 but cap is $12,500,000 (not binding here) —
    // clamp to cost instead.
    const over: AssetInput = { ...asset10k, section_179_elected_minor: 9_999_999, bonus_elected: false };
    expect(taxDepreciationForYear(over, { ...CLASS_5YR, bonus_pct: null }, MACRS_5YR_HY, 1)).toBe(1_000_000);
  });
});

describe("W1.3C-MACRS — straight-line book schedule", () => {
  it("$10,000 over 5 years half-year: 1000/2000×4/1000", () => {
    const got = [1, 2, 3, 4, 5, 6].map((y) => bookDepreciationForYear(asset10k, y));
    expect(got).toEqual([100_000, 200_000, 200_000, 200_000, 200_000, 100_000]);
    expect(got.reduce((a, b) => a + b, 0)).toBe(1_000_000);
  });

  it("honors salvage (depreciable base = cost - salvage)", () => {
    const withSalvage: AssetInput = { ...asset10k, salvage_minor: 200_000 };
    const got = [1, 2, 3, 4, 5, 6].map((y) => bookDepreciationForYear(withSalvage, y));
    expect(got.reduce((a, b) => a + b, 0)).toBe(800_000);
  });
});

describe("W1.3C-M1 — book-vs-tax delta drives the M-1 bucket", () => {
  it("MACRS front-loads vs straight-line → year-1 tax > book → deduction_on_return_not_books", () => {
    const noBonus: AssetClassData = { ...CLASS_5YR, bonus_pct: null };
    const sched = computeSchedule(asset10k, noBonus, MACRS_5YR_HY);
    const y1 = sched[0];
    expect(y1.tax_minor).toBe(200_000); // MACRS 20%
    expect(y1.book_minor).toBe(100_000); // SL half-year
    expect(y1.book_tax_delta_minor).toBe(100_000);
    expect(m1BucketForDelta(y1.book_tax_delta_minor)).toBe("deduction_on_return_not_books");
  });

  it("temporary difference reverses — cumulative book == cumulative tax at end of life", () => {
    const noBonus: AssetClassData = { ...CLASS_5YR, bonus_pct: null };
    const sched = computeSchedule(asset10k, noBonus, MACRS_5YR_HY);
    const last = sched[sched.length - 1];
    // both methods fully recover the same $10,000 cost (salvage 0) — the timing
    // difference is temporary and nets to zero over the asset's life.
    expect(last.tax_accumulated_minor).toBe(1_000_000);
    expect(last.book_accumulated_minor).toBe(1_000_000);
    const netDelta = sched.reduce((a, s) => a + s.book_tax_delta_minor, 0);
    expect(netDelta).toBe(0);
  });

  it("a later year where book > tax drafts expense_on_books_not_return", () => {
    const noBonus: AssetClassData = { ...CLASS_5YR, bonus_pct: null };
    const sched = computeSchedule(asset10k, noBonus, MACRS_5YR_HY);
    // by year 4 straight-line ($2,000) exceeds MACRS ($1,152)
    const y4 = sched.find((s) => s.year_index === 4)!;
    expect(y4.book_minor).toBeGreaterThan(y4.tax_minor);
    expect(m1BucketForDelta(y4.book_tax_delta_minor)).toBe("expense_on_books_not_return");
  });
});

describe("W1.3C-DISPOSAL — gain/loss on disposal", () => {
  it("proceeds above net book value = gain", () => {
    // cost 10k, book accumulated 6k → basis 4k; sold for 5k → 1k gain
    const { book_basis_minor, gain_loss_minor } = disposalGainLoss(1_000_000, 600_000, 500_000);
    expect(book_basis_minor).toBe(400_000);
    expect(gain_loss_minor).toBe(100_000);
  });

  it("proceeds below net book value = loss (negative)", () => {
    const { gain_loss_minor } = disposalGainLoss(1_000_000, 200_000, 500_000);
    expect(gain_loss_minor).toBe(-300_000); // basis 800k, proceeds 500k
  });
});
