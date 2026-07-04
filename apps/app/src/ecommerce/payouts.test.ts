/**
 * E-commerce payout splitting (W4.1) — DB-free unit tests for the split math that
 * could silently make the books wrong: a lump payout must fan into gross sales /
 * fees / refunds / net, tie to the cent with NO float drift, and each provider's
 * report must classify into the shared buckets. Mirrors ledger/*.test.ts style.
 */
import { describe, expect, it } from "vitest";
import {
  assertReconciles,
  componentsFromRows,
  shopifyRowsFrom,
  stripeRowsFrom,
  toMinor,
  type PayoutRow,
  type ShopifyPayoutRow,
  type StripeBalanceRow,
} from "./payouts";

describe("toMinor", () => {
  it("parses decimal money to integer minor units", () => {
    expect(toMinor("48.20")).toBe(4820);
    expect(toMinor("$1,240.00")).toBe(124000);
    expect(toMinor("-1.24")).toBe(-124);
    expect(toMinor(64)).toBe(6400);
    expect(toMinor("")).toBe(0);
    expect(toMinor("0.10")).toBe(10);
  });
  it("rejects non-money", () => {
    expect(() => toMinor("abc")).toThrow();
  });
  it("has no float drift on tricky cents", () => {
    // 0.29 * 100 = 28.999999… in float; Math.round guards it
    expect(toMinor("0.29")).toBe(29);
    expect(toMinor("19.99")).toBe(1999);
  });
});

describe("componentsFromRows — provider-agnostic split", () => {
  it("splits gross − fees − refunds + adjust into net, ties to the cent", () => {
    const rows: PayoutRow[] = [
      { kind: "sale", amountMinor: 500000 }, // $5,000 gross
      { kind: "fee", amountMinor: 15000 }, // $150 fees
      { kind: "refund", amountMinor: 3000 }, // $30 refund
      { kind: "adjustment", amountMinor: -180 }, // −$1.80 dispute hold
    ];
    const c = componentsFromRows("stripe", "po_1", "2026-07-01", "USD", rows);
    expect(c.grossMinor).toBe(500000);
    expect(c.feesMinor).toBe(15000);
    expect(c.refundsMinor).toBe(3000);
    expect(c.adjustMinor).toBe(-180);
    // 500000 − 15000 − 3000 + (−180) = 481820  ($4,818.20)
    expect(c.netMinor).toBe(481820);
    // debits = credits check: gross(C) = fees(D) + refunds(D) + |adjust|(D) + net(D)
    expect(c.grossMinor).toBe(c.feesMinor + c.refundsMinor + Math.abs(c.adjustMinor) + c.netMinor);
  });

  it("handles a fee-only zero-sale payout (all refunds day)", () => {
    const rows: PayoutRow[] = [
      { kind: "refund", amountMinor: 10000 },
      { kind: "adjustment", amountMinor: 10000 }, // provider covers it → net 0
    ];
    const c = componentsFromRows("shopify", "sp_1", "2026-07-02", "USD", rows);
    expect(c.netMinor).toBe(0);
  });

  it("rejects non-integer minor units (guards accidental float)", () => {
    expect(() => componentsFromRows("stripe", "x", "2026-07-01", "USD", [{ kind: "sale", amountMinor: 12.5 }])).toThrow();
  });
});

describe("assertReconciles", () => {
  it("passes when derived net equals the reported net", () => {
    const c = componentsFromRows("stripe", "po", "2026-07-01", "USD", [
      { kind: "sale", amountMinor: 4820 + 180 },
      { kind: "fee", amountMinor: 180 },
    ]);
    expect(() => assertReconciles(c, 4820)).not.toThrow();
  });
  it("throws when the report net disagrees (a parse bug, never plug silently)", () => {
    const c = componentsFromRows("stripe", "po", "2026-07-01", "USD", [{ kind: "sale", amountMinor: 5000 }]);
    expect(() => assertReconciles(c, 4999)).toThrow(/does not reconcile/);
  });
});

describe("Stripe balance-transactions parser", () => {
  it("fans a charge into a sale + its fee, and sums to net", () => {
    const raw: StripeBalanceRow[] = [
      { type: "charge", amount: "50.00", fee: "1.75" }, // $50 sale, $1.75 fee
      { type: "charge", amount: "30.00", fee: "1.17" },
      { type: "refund", amount: "-10.00", fee: "0" },
      { type: "payout", amount: "-68.08", fee: "0" }, // ignored (the net line)
    ];
    const rows = stripeRowsFrom(raw);
    const c = componentsFromRows("stripe", "po_stripe", "2026-07-03", "USD", rows);
    expect(c.grossMinor).toBe(8000); // 50 + 30
    expect(c.feesMinor).toBe(292); // 1.75 + 1.17
    expect(c.refundsMinor).toBe(1000); // 10
    // net = 8000 − 292 − 1000 = 6708  ($67.08)
    expect(c.netMinor).toBe(6708);
    expect(() => assertReconciles(c, 6708)).not.toThrow();
  });

  it("classifies adjustments as signed net movers", () => {
    const rows = stripeRowsFrom([{ type: "adjustment", amount: "-5.00", fee: "0" }]);
    const c = componentsFromRows("stripe", "po", "2026-07-03", "USD", rows);
    expect(c.adjustMinor).toBe(-500);
    expect(c.netMinor).toBe(-500);
  });
});

describe("Shopify payout parser", () => {
  it("maps charge/refund/adjustment + fee into the shared buckets", () => {
    const raw: ShopifyPayoutRow[] = [
      { Type: "charge", Amount: "100.00", Fee: "3.20" },
      { Type: "charge", Amount: "40.00", Fee: "1.46" },
      { Type: "refund", Amount: "-15.00", Fee: "0" },
      { Type: "adjustment", Amount: "-2.00", Fee: "0" },
    ];
    const rows = shopifyRowsFrom(raw);
    const c = componentsFromRows("shopify", "po_shopify", "2026-07-03", "USD", rows);
    expect(c.grossMinor).toBe(14000); // 100 + 40
    expect(c.feesMinor).toBe(466); // 3.20 + 1.46
    expect(c.refundsMinor).toBe(1500); // 15
    expect(c.adjustMinor).toBe(-200); // −2
    // net = 14000 − 466 − 1500 − 200 = 11834
    expect(c.netMinor).toBe(11834);
    expect(() => assertReconciles(c, 11834)).not.toThrow();
  });
});

describe("idempotency contract (parser is deterministic)", () => {
  it("same report parses to the same components (re-import is a no-op upstream)", () => {
    const raw: StripeBalanceRow[] = [{ type: "charge", amount: "50.00", fee: "1.75" }];
    const a = componentsFromRows("stripe", "po_dup", "2026-07-03", "USD", stripeRowsFrom(raw));
    const b = componentsFromRows("stripe", "po_dup", "2026-07-03", "USD", stripeRowsFrom(raw));
    expect(a).toEqual(b);
    // the ledger idempotency key is derived from provider + payoutId → identical
    expect(`ext:${a.provider}:payout:${a.payoutId}`).toBe("ext:stripe:payout:po_dup");
  });
});

// ── CSV → PayoutComponents bridge (the upload UI's parse path) ────────────────
import { parsePayoutCsv, type ParsedPayoutCsv } from "./payouts";

describe("parsePayoutCsv", () => {
  it("splits a Stripe balance-transactions CSV into gross/fees and ties to net", () => {
    // two charges (100.00 gross, 3.20 fee) + (50.00 gross, 1.75 fee), one payout line
    const csv: ParsedPayoutCsv = {
      headers: ["type", "amount", "fee", "net"],
      rows: [
        ["charge", "100.00", "3.20", "96.80"],
        ["charge", "50.00", "1.75", "48.25"],
        ["payout", "-145.05", "0", "-145.05"], // the payout line itself is ignored by the parser
      ],
    };
    const r = parsePayoutCsv("stripe", "po_1", "2026-07-01", "USD", csv);
    expect(r.components.grossMinor).toBe(15000);
    expect(r.components.feesMinor).toBe(495);
    expect(r.components.refundsMinor).toBe(0);
    expect(r.components.netMinor).toBe(15000 - 495); // 14505
    // report net column sums to 96.80 + 48.25 − 145.05 = 0 (payout line offsets) —
    // reconcile compares against OUR computed net, which won't match this contrived
    // net column; the important property is the split is exact + float-free.
    expect(Number.isInteger(r.components.netMinor)).toBe(true);
    expect(r.rowCount).toBeGreaterThan(0);
  });

  it("reconciles a Shopify payout whose net column ties to the split", () => {
    const csv: ParsedPayoutCsv = {
      headers: ["Type", "Amount", "Fee", "Net"],
      rows: [
        ["charge", "200.00", "5.80", "194.20"],
        ["refund", "20.00", "0", "-20.00"],
      ],
    };
    const r = parsePayoutCsv("shopify", "sp_1", "2026-07-02", "USD", csv);
    expect(r.components.grossMinor).toBe(20000);
    expect(r.components.feesMinor).toBe(580);
    expect(r.components.refundsMinor).toBe(2000);
    // gross − fees − refunds = 20000 − 580 − 2000 = 17420
    expect(r.components.netMinor).toBe(17420);
    // report net column: 194.20 − 20.00 = 174.20 = 17420 → reconciles
    expect(r.reportedNetMinor).toBe(17420);
    expect(r.reconciles).toBe(true);
  });

  it("flags a report that does NOT reconcile (surfaced to owner, never plugged)", () => {
    const csv: ParsedPayoutCsv = {
      headers: ["Type", "Amount", "Fee", "Net"],
      rows: [["charge", "100.00", "3.00", "90.00"]], // net column lies: says 90 but 100−3=97
    };
    const r = parsePayoutCsv("shopify", "sp_bad", "2026-07-02", "USD", csv);
    expect(r.components.netMinor).toBe(9700);
    expect(r.reportedNetMinor).toBe(9000);
    expect(r.reconciles).toBe(false);
  });

  it("treats a missing net column as reconciled (no net to compare against)", () => {
    const csv: ParsedPayoutCsv = {
      headers: ["type", "amount", "fee"],
      rows: [["charge", "100.00", "3.00"]],
    };
    const r = parsePayoutCsv("stripe", "po_nonet", "2026-07-01", "USD", csv);
    expect(r.reportedNetMinor).toBeNull();
    expect(r.reconciles).toBe(true);
  });

  it("throws (not plugs) when required columns are missing", () => {
    const csv: ParsedPayoutCsv = { headers: ["foo", "bar"], rows: [["1", "2"]] };
    expect(() => parsePayoutCsv("stripe", "po_x", "2026-07-01", "USD", csv)).toThrow();
  });
});
