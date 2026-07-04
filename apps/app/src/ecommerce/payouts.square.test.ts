/**
 * Square payout splitting (W4.1-B) — parser unit tests with a realistic fixture
 * built from Square's documented transfer (payout) report format — the Dashboard
 * transfer-details export with Type, Gross Amount, Fees, Net Amount columns:
 *   https://squareup.com/help/us/en/article/5104-transfer-reports
 *
 * Polarity pinned here: like PayPal (and unlike Stripe/Shopify), Square's Fees
 * column is SIGNED — negative on charges — and Net Amount = Gross Amount + Fees.
 */
import { describe, expect, it } from "vitest";
import { parseCsv } from "../import/csv";
import {
  componentsFromRows,
  parsePayoutCsv,
  squareRowsFrom,
  type SquarePayoutRow,
} from "./payouts";

const RAW: SquarePayoutRow[] = [
  { type: "Charge", gross: "88.00", fees: "-2.55" },
  { type: "Charge", gross: "130.25", fees: "-3.78" },
  { type: "Refund", gross: "-30.00", fees: "0.87" }, // fee portion credited back
  { type: "Adjustment", gross: "-1.00", fees: "0" }, // e.g. a dispute admin adjustment
];

describe("Square payout-report parser", () => {
  it("maps Charge/Refund/Adjustment with Square's signed-fee polarity", () => {
    const rows = squareRowsFrom(RAW);
    const c = componentsFromRows("square", "sq_po_1", "2026-06-30", "USD", rows);
    expect(c.grossMinor).toBe(8800 + 13025);
    expect(c.feesMinor).toBe(255 + 378);
    expect(c.refundsMinor).toBe(3000);
    expect(c.adjustMinor).toBe(87 - 100); // refund fee credit-back − adjustment
    // 21825 − 633 − 3000 − 13 = 18179 → $181.79 deposit
    expect(c.netMinor).toBe(18179);
  });

  it("refund and fee polarity: a refund reduces the deposit, its fee credit raises it", () => {
    const refundOnly = componentsFromRows(
      "square", "sq_r", "2026-06-30", "USD",
      squareRowsFrom([{ type: "Refund", gross: "-30.00", fees: "0.87" }]),
    );
    expect(refundOnly.netMinor).toBe(-3000 + 87); // exactly the row's Net Amount −29.13
  });

  it("ignores deposit/transfer rows (the payout line itself, never a component)", () => {
    expect(squareRowsFrom([{ type: "Deposit", gross: "-181.79", fees: "0" }])).toHaveLength(0);
  });
});

describe("Square CSV end-to-end (parseCsv → parsePayoutCsv)", () => {
  const text = [
    `Payout Date,Payout ID,Type,Gross Amount,Fees,Net Amount,Transaction ID`,
    `2026-06-30,PO-9F2K,Charge,88.00,-2.55,85.45,TXN-001`,
    `2026-06-30,PO-9F2K,Charge,130.25,-3.78,126.47,TXN-002`,
    `2026-06-30,PO-9F2K,Refund,-30.00,0.87,-29.13,TXN-003`,
    `2026-06-30,PO-9F2K,Adjustment,-1.00,0,-1.00,TXN-004`,
  ].join("\n");

  it("splits the report, reads the 'Gross Amount'/'Net Amount' headers, and reconciles", () => {
    const r = parsePayoutCsv("square", "PO-9F2K", "2026-06-30", "USD", parseCsv(text));
    expect(r.components.grossMinor).toBe(21825);
    expect(r.components.feesMinor).toBe(633);
    expect(r.components.refundsMinor).toBe(3000);
    expect(r.components.netMinor).toBe(18179);
    // Σ Net Amount: 85.45 + 126.47 − 29.13 − 1.00 = 181.79
    expect(r.reportedNetMinor).toBe(18179);
    expect(r.reconciles).toBe(true);
  });

  it("re-parsing the identical file is deterministic (idempotent re-import upstream)", () => {
    const a = parsePayoutCsv("square", "PO-9F2K", "2026-06-30", "USD", parseCsv(text));
    const b = parsePayoutCsv("square", "PO-9F2K", "2026-06-30", "USD", parseCsv(text));
    expect(a).toEqual(b);
    expect(`ext:${a.components.provider}:payout:${a.components.payoutId}`).toBe("ext:square:payout:PO-9F2K");
  });

  it("throws (not plugs) when the Gross Amount column is missing", () => {
    const bad = parseCsv(`Type,Something\nCharge,10.00`);
    expect(() => parsePayoutCsv("square", "sq_bad", "2026-06-30", "USD", bad)).toThrow(/Gross Amount/);
  });

  it("neutralizes a formula-bearing Type cell (import discipline, see export.ts + #211)", () => {
    const evil = parseCsv(`Type,Gross Amount,Fees\n"@SUM(A1:A9)",12.00,-0.35`);
    const r = parsePayoutCsv("square", "sq_evil", "2026-06-30", "USD", evil);
    // an unknown type classifies as a signed adjustment (+ its fee); the hostile
    // string itself is dropped — components carry numbers only
    expect(r.components.adjustMinor).toBe(1200);
    expect(r.components.feesMinor).toBe(35);
    expect(r.components.netMinor).toBe(1165); // still exactly Gross + Fees
    expect(JSON.stringify(r.components)).not.toContain("SUM(");
  });
});
