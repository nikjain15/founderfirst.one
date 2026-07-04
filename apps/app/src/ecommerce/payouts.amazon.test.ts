/**
 * Amazon payout splitting (W4.1-B) — parser unit tests with a realistic fixture
 * built from the documented V2 flat-file settlement report
 * (GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE — TAB-delimited; first data row is the
 * settlement summary whose total-amount is the actual bank deposit):
 *   https://developer-docs.amazon.com/sp-api/docs/report-type-values-settlement
 *
 * Traps pinned here: (1) the file is tab-delimited, not comma (import/csv.ts must
 * sniff it); (2) the summary row is the reconcile TARGET, never a component;
 * (3) every component row is one SIGNED amount — Order/ItemFees are negative
 * fees, Refund/ItemFees reversals are positive, and a truncated upload must fail
 * the reconcile check instead of posting a wrong-but-balanced split.
 */
import { describe, expect, it } from "vitest";
import { parseCsv } from "../import/csv";
import {
  amazonRowsFrom,
  componentsFromRows,
  parsePayoutCsv,
  type AmazonSettlementRow,
} from "./payouts";

const RAW: AmazonSettlementRow[] = [
  { transactionType: "", amountType: "", amount: "" }, // summary row → no component
  { transactionType: "Order", amountType: "ItemPrice", amount: "199.99" },
  { transactionType: "Order", amountType: "ItemPrice", amount: "4.99" }, // Shipping
  { transactionType: "Order", amountType: "ItemFees", amount: "-30.75" }, // Commission
  { transactionType: "Order", amountType: "ItemFees", amount: "-3.22" }, // FBAPerUnitFulfillmentFee
  { transactionType: "Order", amountType: "Promotion", amount: "-4.99" }, // promo rebate
  { transactionType: "Refund", amountType: "ItemPrice", amount: "-49.99" },
  { transactionType: "Refund", amountType: "ItemFees", amount: "7.50" }, // commission reversal
  { transactionType: "ServiceFee", amountType: "", amount: "-25.00" }, // Cost of Advertising
  { transactionType: "other-transaction", amountType: "", amount: "116.33" }, // reserve release
];

describe("Amazon V2 settlement parser", () => {
  it("classifies Order/Refund/ServiceFee/other rows into the shared buckets", () => {
    const rows = amazonRowsFrom(RAW);
    const c = componentsFromRows("amazon", "12345678901", "2026-06-29", "USD", rows);
    expect(c.grossMinor).toBe(19999 + 499); // ItemPrice principal + shipping
    expect(c.feesMinor).toBe(3075 + 322 + 2500); // commission + FBA + service fee
    expect(c.refundsMinor).toBe(4999);
    expect(c.adjustMinor).toBe(-499 + 750 + 11633); // promo − , fee reversal +, reserve release +
    // 20498 − 5897 − 4999 + 11884 = 21486 → the $214.86 deposit
    expect(c.netMinor).toBe(21486);
  });

  it("skips the settlement summary row (no transaction-type) — it is not a component", () => {
    expect(amazonRowsFrom([{ transactionType: "", amountType: "", amount: "214.86" }])).toHaveLength(0);
  });

  it("preserves every row's SIGNED contribution, so Σcomponents ≡ Σamounts", () => {
    const componentRows = RAW.filter((r) => r.transactionType !== "");
    const expected = componentRows.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
    const c = componentsFromRows("amazon", "sum", "2026-06-29", "USD", amazonRowsFrom(RAW));
    expect(c.netMinor).toBe(expected);
  });

  it("refund/fee polarity: a refund's fee reversal INCREASES the deposit", () => {
    const c = componentsFromRows(
      "amazon", "r", "2026-06-29", "USD",
      amazonRowsFrom([
        { transactionType: "Refund", amountType: "ItemPrice", amount: "-49.99" },
        { transactionType: "Refund", amountType: "ItemFees", amount: "7.50" },
      ]),
    );
    expect(c.refundsMinor).toBe(4999);
    expect(c.adjustMinor).toBe(750);
    expect(c.netMinor).toBe(-4999 + 750);
  });
});

describe("Amazon flat file end-to-end (tab-delimited text → parseCsv → parsePayoutCsv)", () => {
  // The documented header set, tab-separated. Component cells we don't classify on
  // (order-id, sku, …) carry realistic values to prove they're ignored cleanly.
  const HEADERS = [
    "settlement-id", "settlement-start-date", "settlement-end-date", "deposit-date",
    "total-amount", "currency", "transaction-type", "order-id", "merchant-order-id",
    "adjustment-id", "shipment-id", "marketplace-name", "amount-type",
    "amount-description", "amount", "fulfillment-id", "posted-date",
  ];
  const row = (cells: Partial<Record<(typeof HEADERS)[number], string>>): string =>
    HEADERS.map((h) => cells[h] ?? "").join("\t");

  const text = [
    HEADERS.join("\t"),
    row({ "settlement-id": "12345678901", "settlement-start-date": "2026-06-15T00:00:00+00:00",
          "settlement-end-date": "2026-06-29T00:00:00+00:00", "deposit-date": "2026-06-29T00:00:00+00:00",
          "total-amount": "214.86", currency: "USD" }),
    row({ "settlement-id": "12345678901", "transaction-type": "Order", "order-id": "111-2223334-5556667",
          "marketplace-name": "amazon.com", "amount-type": "ItemPrice", "amount-description": "Principal",
          amount: "199.99", "fulfillment-id": "AFN", "posted-date": "2026-06-16" }),
    row({ "settlement-id": "12345678901", "transaction-type": "Order", "order-id": "111-2223334-5556667",
          "amount-type": "ItemPrice", "amount-description": "Shipping", amount: "4.99" }),
    row({ "settlement-id": "12345678901", "transaction-type": "Order", "order-id": "111-2223334-5556667",
          "amount-type": "ItemFees", "amount-description": "Commission", amount: "-30.75" }),
    row({ "settlement-id": "12345678901", "transaction-type": "Order", "order-id": "111-2223334-5556667",
          "amount-type": "ItemFees", "amount-description": "FBAPerUnitFulfillmentFee", amount: "-3.22" }),
    row({ "settlement-id": "12345678901", "transaction-type": "Order", "order-id": "111-2223334-5556667",
          "amount-type": "Promotion", "amount-description": "Shipping", amount: "-4.99" }),
    row({ "settlement-id": "12345678901", "transaction-type": "Refund", "order-id": "111-9998887-6665554",
          "adjustment-id": "AdjId777", "amount-type": "ItemPrice", "amount-description": "Principal",
          amount: "-49.99" }),
    row({ "settlement-id": "12345678901", "transaction-type": "Refund", "order-id": "111-9998887-6665554",
          "adjustment-id": "AdjId777", "amount-type": "ItemFees", "amount-description": "Commission",
          amount: "7.50" }),
    row({ "settlement-id": "12345678901", "transaction-type": "ServiceFee",
          "amount-description": "Cost of Advertising", amount: "-25.00" }),
    row({ "settlement-id": "12345678901", "transaction-type": "other-transaction",
          "amount-description": "Previous Reserve Amount Balance", amount: "116.33" }),
  ].join("\n");

  it("sniffs the tab delimiter and splits the settlement into the component buckets", () => {
    const csv = parseCsv(text);
    expect(csv.headers).toContain("transaction-type"); // tab-sniffing worked
    const r = parsePayoutCsv("amazon", "12345678901", "2026-06-29", "USD", csv);
    expect(r.components.grossMinor).toBe(20498);
    expect(r.components.feesMinor).toBe(5897);
    expect(r.components.refundsMinor).toBe(4999);
    expect(r.components.adjustMinor).toBe(11884);
    expect(r.components.netMinor).toBe(21486);
  });

  it("reconciles against the summary row's total-amount (the actual deposit)", () => {
    const r = parsePayoutCsv("amazon", "12345678901", "2026-06-29", "USD", parseCsv(text));
    expect(r.reportedNetMinor).toBe(21486);
    expect(r.reconciles).toBe(true);
  });

  it("a TRUNCATED settlement file fails the reconcile check (owner sees it, never plugged)", () => {
    const truncated = text.split("\n").slice(0, 6).join("\n"); // lost refunds + fees + reserve rows
    const r = parsePayoutCsv("amazon", "12345678901", "2026-06-29", "USD", parseCsv(truncated));
    expect(r.reportedNetMinor).toBe(21486); // summary still claims the full deposit
    expect(r.components.netMinor).not.toBe(21486);
    expect(r.reconciles).toBe(false);
  });

  it("re-parsing the identical file is deterministic (idempotent re-import upstream)", () => {
    const a = parsePayoutCsv("amazon", "12345678901", "2026-06-29", "USD", parseCsv(text));
    const b = parsePayoutCsv("amazon", "12345678901", "2026-06-29", "USD", parseCsv(text));
    expect(a).toEqual(b);
    expect(`ext:${a.components.provider}:payout:${a.components.payoutId}`).toBe("ext:amazon:payout:12345678901");
  });

  it("throws (not plugs) when the flat file lacks its settlement columns", () => {
    const bad = parseCsv(`type,amount\ncharge,10.00`);
    expect(() => parsePayoutCsv("amazon", "bad", "2026-06-29", "USD", bad)).toThrow(/transaction-type/);
  });

  it("neutralizes a formula-bearing cell (import discipline, see export.ts + #211)", () => {
    const evil = [
      "transaction-type\tamount-type\tamount\ttotal-amount",
      "=cmd|' /C calc'!A0\tItemPrice\t10.00\t",
    ].join("\n");
    const r = parsePayoutCsv("amazon", "evil", "2026-06-29", "USD", parseCsv(evil));
    // unknown transaction-type → signed adjustment; the hostile string is dropped
    expect(r.components.adjustMinor).toBe(1000);
    expect(r.components.netMinor).toBe(1000);
    expect(JSON.stringify(r.components)).not.toContain("cmd|");
  });
});
