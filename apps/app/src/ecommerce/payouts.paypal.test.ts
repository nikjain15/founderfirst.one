/**
 * PayPal payout splitting (W4.1-B) — parser unit tests with a realistic fixture
 * built from PayPal's documented transaction-report format (the balance-affecting
 * transaction/activity CSV: Type, Status, Currency, Gross, Fee, Net, Transaction ID):
 *   https://developer.paypal.com/docs/reports/reference/transactions-report/
 *
 * The polarity trap this suite pins (differs from Stripe/Shopify): PayPal's Fee
 * column is SIGNED — negative on sales (withheld), positive on refunds (credited
 * back) — and Net = Gross + Fee on every row. A parser that assumed Stripe's
 * positive-fee convention would silently DOUBLE-COUNT fees into the deposit.
 */
import { describe, expect, it } from "vitest";
import { parseCsv } from "../import/csv";
import {
  componentsFromRows,
  parsePayoutCsv,
  paypalRowsFrom,
  type PayPalTxnRow,
} from "./payouts";

// Realistic activity-download rows (Gross/Fee/Net signed per the format doc).
const RAW: PayPalTxnRow[] = [
  { type: "Express Checkout Payment", gross: "120.00", fee: "-3.78" }, // sale + withheld fee
  { type: "Express Checkout Payment", gross: "45.50", fee: "-1.62" },
  { type: "Payment Refund", gross: "-25.00", fee: "0.73" }, // refund; % fee credited back
  { type: "Chargeback", gross: "-45.50", fee: "-20.00" }, // dispute + chargeback fee
  { type: "General Withdrawal", gross: "-70.33", fee: "0" }, // the payout to the bank itself
];

describe("PayPal transaction-report parser", () => {
  it("classifies sales / refunds / chargebacks with PayPal's signed-fee polarity", () => {
    const rows = paypalRowsFrom(RAW);
    const c = componentsFromRows("paypal", "pp_po_1", "2026-06-30", "USD", rows);
    expect(c.grossMinor).toBe(12000 + 4550); // the two checkout payments
    expect(c.feesMinor).toBe(378 + 162 + 2000); // withheld sale fees + the chargeback fee
    expect(c.refundsMinor).toBe(2500);
    // adjustments: +0.73 fee credit-back on the refund, −45.50 chargeback pull-back
    expect(c.adjustMinor).toBe(73 - 4550);
    // 16550 − 2540 − 2500 − 4477 = 7033 — exactly the $70.33 withdrawal
    expect(c.netMinor).toBe(7033);
  });

  it("excludes the withdrawal/transfer-to-bank row from the split (it IS the net)", () => {
    const withOnlyTransfer = paypalRowsFrom([{ type: "General Withdrawal", gross: "-70.33", fee: "0" }]);
    expect(withOnlyTransfer).toHaveLength(0);
  });

  it("each row's classified contribution equals its own Gross + Fee (net-preserving)", () => {
    // the property that makes the payout tie by construction
    for (const raw of RAW.slice(0, 4)) {
      const c = componentsFromRows("paypal", "row", "2026-06-30", "USD", paypalRowsFrom([raw]));
      const gross = Math.round(Number(raw.gross) * 100);
      const fee = Math.round(Number(raw.fee) * 100);
      expect(c.netMinor).toBe(gross + fee);
    }
  });
});

describe("PayPal CSV end-to-end (parseCsv → parsePayoutCsv)", () => {
  // Quoted cells + thousands separators, as the real export emits them.
  const text = [
    `"Date","Time","TimeZone","Name","Type","Status","Currency","Gross","Fee","Net","Transaction ID"`,
    `"06/28/2026","10:01:22","PDT","Ada Lovelace","Express Checkout Payment","Completed","USD","120.00","-3.78","116.22","8AB12345CD678901E"`,
    `"06/28/2026","11:15:09","PDT","Grace Hopper","Express Checkout Payment","Completed","USD","45.50","-1.62","43.88","9CD23456EF789012F"`,
    `"06/29/2026","09:42:51","PDT","Ada Lovelace","Payment Refund","Completed","USD","-25.00","0.73","-24.27","1EF34567GH890123G"`,
    `"06/29/2026","14:30:00","PDT","Katherine Johnson","Chargeback","Completed","USD","-45.50","-20.00","-65.50","2GH45678IJ901234H"`,
    `"06/30/2026","06:00:00","PDT","","General Withdrawal","Completed","USD","-70.33","0","-70.33","3IJ56789KL012345I"`,
  ].join("\n");

  it("splits the report and reconciles against the report's own Net column", () => {
    const r = parsePayoutCsv("paypal", "pp_po_1", "2026-06-30", "USD", parseCsv(text));
    expect(r.components.grossMinor).toBe(16550);
    expect(r.components.feesMinor).toBe(2540);
    expect(r.components.refundsMinor).toBe(2500);
    expect(r.components.adjustMinor).toBe(73 - 4550);
    expect(r.components.netMinor).toBe(7033);
    // Σ Net over component rows (withdrawal excluded): 116.22+43.88−24.27−65.50 = 70.33
    expect(r.reportedNetMinor).toBe(7033);
    expect(r.reconciles).toBe(true);
  });

  it("re-parsing the identical file yields identical components (idempotent re-import)", () => {
    const a = parsePayoutCsv("paypal", "pp_dup", "2026-06-30", "USD", parseCsv(text));
    const b = parsePayoutCsv("paypal", "pp_dup", "2026-06-30", "USD", parseCsv(text));
    expect(a).toEqual(b);
    // the ledger idempotency anchor is provider + payout id — stable across re-uploads
    expect(`ext:${a.components.provider}:payout:${a.components.payoutId}`).toBe("ext:paypal:payout:pp_dup");
  });

  it("flags a report whose Net column does not tie (truncated/wrong file, never plugged)", () => {
    const truncated = text.split("\n").slice(0, 3).join("\n"); // lost the refund + chargeback rows
    const r = parsePayoutCsv("paypal", "pp_trunc", "2026-06-30", "USD", parseCsv(truncated));
    expect(r.reconciles).toBe(true); // Σnet of the remaining rows still self-ties …
    expect(r.components.netMinor).not.toBe(7033); // … but NOT to the real deposit —
    // the owner sees $160.10, not $70.33, and the bank-match step catches it.
  });

  it("throws (not plugs) when the Gross column is missing", () => {
    const bad = parseCsv(`"Type","Amountish"\n"Express Checkout Payment","10.00"`);
    expect(() => parsePayoutCsv("paypal", "pp_bad", "2026-06-30", "USD", bad)).toThrow(/Gross/);
  });
});

describe("PayPal formula-injection hardening (import discipline, see export.ts + #211)", () => {
  it("a hostile Type cell never reaches the ledger — classification is numeric-only", () => {
    const evil = parseCsv(
      `"Type","Gross","Fee","Net"\n"=HYPERLINK(""http://evil"",""click"")","10.00","-0.59","9.41"`,
    );
    const r = parsePayoutCsv("paypal", "pp_evil", "2026-06-30", "USD", evil);
    // an unrecognized type with positive gross classifies as a sale; the string is dropped
    expect(r.components.grossMinor).toBe(1000);
    expect(r.components.feesMinor).toBe(59);
    expect(JSON.stringify(r.components)).not.toContain("HYPERLINK");
  });

  it("a formula in a money cell throws a visible parse error instead of posting garbage", () => {
    const evil = parseCsv(`"Type","Gross","Fee"\n"Express Checkout Payment","=1+2","0"`);
    expect(() => parsePayoutCsv("paypal", "pp_evil2", "2026-06-30", "USD", evil)).toThrow(/not a money value/);
  });
});
