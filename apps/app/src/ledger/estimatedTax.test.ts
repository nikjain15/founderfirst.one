/**
 * W2.4 estimated-tax derivations.
 *
 * kernel-ok: this test exercises the per-tax-regime computation branches, so it
 * necessarily names the specific entity keys (sole_prop / partnership / s_corp /
 * c_corp / nonprofit) whose estimate math differs. It is not an inlined display
 * list — it verifies the regime-specific logic in estimatedTax.ts.
 *
 * Proves the acceptance list:
 *  1. The estimate is GROUNDED on the P&L net income — feeding the same entries
 *     through profitAndLoss and through estimateForYear ties to the cent.
 *  2. Changing the ENTITY TYPE changes the output (sole_prop pays SE tax, s_corp
 *     doesn't, c_corp uses the corporate path) — no redeploy, just a different
 *     basis row.
 *  3. Changing a PARAMS row changes the output (bump the effective rate → the tax
 *     moves) — proves rates are data, never hardcoded.
 *  4. Unavailable states never fake a number (no profile / no params / no profit /
 *     non-estimating entity).
 *  5. Penalty level is date-driven off the kernel deadline.
 *
 * Money is integer minor units throughout; hand-computed expected figures below.
 */
import { describe, expect, it } from "vitest";
import { profitAndLoss } from "./reports";
import {
  estimateForYear,
  estimateFromNetIncome,
  nextEstimateDeadline,
  penaltyLevel,
  type TaxBasis,
  type YearParams,
} from "./estimatedTax";
import type { JournalEntry, JournalLine, Side } from "./types";

let seq = 0;
const uid = () => `id-${seq++}`;

const ACCT = {
  cash: { id: "a-cash", code: "1000", name: "Cash", type: "asset" as const },
  sales: { id: "a-sales", code: "4000", name: "Sales", type: "income" as const },
  rent: { id: "a-rent", code: "6000", name: "Rent", type: "expense" as const },
};
type Acct = (typeof ACCT)[keyof typeof ACCT];

function line(acct: Acct, side: Side, amount_minor: number): JournalLine {
  return {
    id: uid(), account_id: acct.id, amount_minor, currency: "USD", side, memo: null,
    account: { code: acct.code, name: acct.name, type: acct.type },
  };
}
function entry(date: string, lines: JournalLine[], opts: Partial<Pick<JournalEntry, "status" | "source">> = {}): JournalEntry {
  return {
    id: uid(), entry_date: date, memo: null, status: opts.status ?? "posted",
    source: opts.source ?? "manual", source_ref: null, reverses_id: null,
    created_at: `${date}T00:00:00Z`, lines,
  } as JournalEntry;
}

// The federal 2025 params exactly as seeded in the W2.4 migration.
const FED_2025: YearParams = {
  citation: "https://www.irs.gov/forms-pubs/about-form-1040-es",
  self_employment: {
    net_earnings_factor: 0.9235,
    rate: 0.153,
    ss_wage_base_minor: 17610000,
    ss_rate: 0.124,
    medicare_rate: 0.029,
    deduction_factor: 0.5,
  },
  income_tax: { effective_rate: 0.22 },
  safe_harbor: { current_year_pct: 0.9, prior_year_pct: 1.0, prior_year_pct_high_agi: 1.1, high_agi_threshold_minor: 15000000 },
  set_aside: { default_pct: 0.3 },
  corporate: { effective_rate: 0.21, safe_harbor_current_year_pct: 1.0, no_self_employment: true },
};

const basis = (entity: string | null, params: YearParams = FED_2025): TaxBasis => ({
  entity_type: entity, jurisdiction_code: "US-FED", currency: "USD", params,
});

const YEAR = 2025;

describe("estimate is grounded on the P&L (ties to the cent)", () => {
  // $100,000 profit for the year: $120k sales − $20k rent.
  const entries = [
    entry(`${YEAR}-03-15`, [line(ACCT.cash, "D", 12_000_000), line(ACCT.sales, "C", 12_000_000)]),
    entry(`${YEAR}-06-10`, [line(ACCT.rent, "D", 2_000_000), line(ACCT.cash, "C", 2_000_000)]),
    // an entry in a DIFFERENT year must be excluded from this year's estimate
    entry(`${YEAR - 1}-12-31`, [line(ACCT.cash, "D", 9_000_000), line(ACCT.sales, "C", 9_000_000)]),
  ];

  it("uses exactly the P&L net income for the tax year", () => {
    const pnl = profitAndLoss(entries, (d) => d.slice(0, 4) === String(YEAR));
    expect(pnl.netIncome).toBe(10_000_000); // $100k, prior-year row excluded
    const est = estimateForYear(entries, basis("sole_prop"), YEAR);
    expect(est.netIncomeMinor).toBe(pnl.netIncome);
  });

  it("sole_prop: SE tax + income tax, safe-harbor per quarter (hand-computed)", () => {
    const est = estimateFromNetIncome(10_000_000, basis("sole_prop"), YEAR);
    // SE earnings = round(10,000,000 * 0.9235) = 9,235,000
    // SS = round(9,235,000 * 0.124) = 1,145,140 ; Medicare = round(9,235,000 * 0.029) = 267,815
    // SE tax = 1,412,955
    const se = est.components.find((c) => c.key === "self_employment")!;
    expect(se.amountMinor).toBe(1_412_955);
    // income base = 10,000,000 - round(1,412,955 * 0.5) = 10,000,000 - 706,478 = 9,293,522
    // fed income = round(9,293,522 * 0.22) = 2,044,575
    const fed = est.components.find((c) => c.key === "federal_income")!;
    expect(fed.amountMinor).toBe(2_044_575);
    expect(est.totalAnnualMinor).toBe(3_457_530);
    // safe harbor 0.9 = round(3,457,530 * 0.9) = 3,111,777 ; /4 = round(777,944.25) = 777,944
    expect(est.perQuarterMinor).toBe(777_944);
    // set-aside 0.30 of income
    expect(est.setAsidePct).toBe(0.3);
    expect(est.setAsideMinor).toBe(3_000_000);
    expect(est.status).toBe("ok");
    expect(est.citation).toBe(FED_2025.citation);
  });
});

describe("changing the entity type changes the estimate (no redeploy)", () => {
  const NET = 10_000_000;

  it("s_corp pays no SE tax on pass-through profit (income tax only)", () => {
    const est = estimateFromNetIncome(NET, basis("s_corp"), YEAR);
    expect(est.components.find((c) => c.key === "self_employment")).toBeUndefined();
    // income tax on the full net (no SE deduction) = round(10,000,000 * 0.22) = 2,200,000
    expect(est.components.find((c) => c.key === "federal_income")!.amountMinor).toBe(2_200_000);
    expect(est.totalAnnualMinor).toBe(2_200_000);
  });

  it("c_corp uses the flat corporate rate (its own 100% safe harbor)", () => {
    const est = estimateFromNetIncome(NET, basis("c_corp"), YEAR);
    expect(est.components).toHaveLength(1);
    const corp = est.components[0];
    expect(corp.key).toBe("corporate");
    expect(corp.amountMinor).toBe(2_100_000); // 10,000,000 * 0.21
    // corporate safe harbor is 100% → per quarter = 2,100,000 / 4 = 525,000
    expect(est.perQuarterMinor).toBe(525_000);
  });

  it("sole_prop and s_corp on the SAME income produce different totals", () => {
    const sp = estimateFromNetIncome(NET, basis("sole_prop"), YEAR).totalAnnualMinor;
    const sc = estimateFromNetIncome(NET, basis("s_corp"), YEAR).totalAnnualMinor;
    expect(sp).not.toBe(sc);
    expect(sp).toBeGreaterThan(sc); // SE tax makes the sole-prop owe more
  });
});

describe("changing a params row changes the estimate (rates are data)", () => {
  it("bumping the federal effective rate moves the income tax", () => {
    const lower = estimateFromNetIncome(10_000_000, basis("s_corp", { ...FED_2025, income_tax: { effective_rate: 0.2 } }), YEAR);
    const higher = estimateFromNetIncome(10_000_000, basis("s_corp", { ...FED_2025, income_tax: { effective_rate: 0.3 } }), YEAR);
    expect(lower.totalAnnualMinor).toBe(2_000_000);
    expect(higher.totalAnnualMinor).toBe(3_000_000);
    expect(higher.totalAnnualMinor).toBeGreaterThan(lower.totalAnnualMinor);
  });

  it("a state block adds a state-income component", () => {
    const withState: YearParams = { ...FED_2025, state: { income_tax: { effective_rate: 0.06 } } };
    const est = estimateFromNetIncome(10_000_000, basis("s_corp", withState), YEAR);
    const state = est.components.find((c) => c.key === "state_income");
    expect(state).toBeDefined();
    // s_corp has no SE deduction → base is the full net; 10,000,000 * 0.06 = 600,000
    expect(state!.amountMinor).toBe(600_000);
  });

  it("changing the safe-harbor pct changes the quarterly payment", () => {
    const p90 = estimateFromNetIncome(10_000_000, basis("s_corp"), YEAR).perQuarterMinor;
    const p100 = estimateFromNetIncome(10_000_000, basis("s_corp", { ...FED_2025, safe_harbor: { current_year_pct: 1.0, prior_year_pct: 1.0 } }), YEAR).perQuarterMinor;
    // 2,200,000 * 0.9 / 4 = 495,000 ; 2,200,000 * 1.0 / 4 = 550,000
    expect(p90).toBe(495_000);
    expect(p100).toBe(550_000);
  });
});

describe("unavailable states never fake a number", () => {
  it("no profile → no_profile, zero everywhere", () => {
    const est = estimateFromNetIncome(10_000_000, basis(null), YEAR);
    expect(est.status).toBe("no_profile");
    expect(est.totalAnnualMinor).toBe(0);
    expect(est.perQuarterMinor).toBe(0);
  });

  it("nonprofit → no_estimate_entity", () => {
    expect(estimateFromNetIncome(10_000_000, basis("nonprofit"), YEAR).status).toBe("no_estimate_entity");
  });

  it("empty params → no_params (never estimate on missing rates)", () => {
    expect(estimateFromNetIncome(10_000_000, basis("sole_prop", {}), YEAR).status).toBe("no_params");
  });

  it("no profit → no_profit, zero payment", () => {
    const loss = estimateFromNetIncome(-500_000, basis("sole_prop"), YEAR);
    expect(loss.status).toBe("no_profit");
    expect(loss.perQuarterMinor).toBe(0);
    const zero = estimateFromNetIncome(0, basis("sole_prop"), YEAR);
    expect(zero.status).toBe("no_profit");
  });
});

describe("penalty level is date-driven off the kernel deadline", () => {
  const dl = (days_until: number) => ({
    obligation_key: "q2_estimate", kind: "estimate", label: "Q2 estimated tax payment",
    due_date: "2025-06-15", days_until, citation: null,
  });

  it("picks the nearest estimate deadline and ignores non-estimates", () => {
    const chosen = nextEstimateDeadline([
      { obligation_key: "annual_return", kind: "annual_return", label: "Return", due_date: "2026-04-15", days_until: 5, citation: null },
      dl(40),
      dl(12),
    ]);
    expect(chosen?.days_until).toBe(12);
  });

  it("classifies overdue / soon / none, and only when a payment is owed", () => {
    expect(penaltyLevel(nextEstimateDeadline([dl(-3)]), 500_000, 21)).toBe("overdue");
    expect(penaltyLevel(nextEstimateDeadline([dl(10)]), 500_000, 21)).toBe("soon");
    expect(penaltyLevel(nextEstimateDeadline([dl(40)]), 500_000, 21)).toBe("none");
    // no amount owed → never nag
    expect(penaltyLevel(nextEstimateDeadline([dl(-3)]), 0, 21)).toBe("none");
    // no deadline → none
    expect(penaltyLevel(null, 500_000, 21)).toBe("none");
  });
});
