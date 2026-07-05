/**
 * Bill / AP pure-math + no-fund-movement tests (RV2-D1). These lock the client's
 * optimistic AP computation to the server's arithmetic (line = round(qty×unit/
 * 1000), total = Σ lines, balance, AP aging boundaries) and assert the load-
 * bearing invariant for this TRACKING-ONLY feature: NO client code path can send
 * money. The authoritative posting + aging live in the DB (pgTAP
 * rv2_d1_ap_bill_pay_test.sql); these guard the preview + the invariant.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  apAgingBucket, billBalanceMinor, billLineAmountMinor, billTotalMinor,
} from "./billMath";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(HERE, rel), "utf8");

// Strip comments so the no-fund-movement scan tests CODE, not the prose that
// documents the invariant (comments legitimately say "no transfer/disbursement").
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments
    .replace(/^\s*\/\/.*$/gm, "")        // whole-line // comments
    .replace(/([^:])\/\/.*$/gm, "$1");   // trailing // comments (not URLs)

describe("bill line + total math (integer minor units, no float drift)", () => {
  it("computes a line amount as qty(3dp) × unit / 1000, rounded to the cent", () => {
    expect(billLineAmountMinor(1000, 5000)).toBe(5000);   // 1 × $50.00
    expect(billLineAmountMinor(2000, 5000)).toBe(10000);  // 2 × $50.00
    expect(billLineAmountMinor(1500, 999)).toBe(1499);    // 1.5 × $9.99 → 14.99
  });

  it("totals the sample bill to the cent (matches the pgTAP fixture)", () => {
    // 2 × 5000 + 1 × 1500 = 11500 (same as rv2_d1_ap_bill_pay_test.sql)
    expect(billTotalMinor([
      { quantity_milli: 2000, unit_price_minor: 5000 },
      { unit_price_minor: 1500 },  // qty defaults to 1
    ])).toBe(11500);
  });

  it("open balance = total − paid", () => {
    expect(billBalanceMinor(11500, 4000)).toBe(7500);
    expect(billBalanceMinor(11500, 11500)).toBe(0);
  });
});

describe("AP aging boundaries mirror the SQL (30-day rule, same as AR)", () => {
  const asOf = "2026-05-01";
  it("buckets a due date by days overdue", () => {
    expect(apAgingBucket("2026-06-01", asOf)).toBe("current"); // not yet due
    expect(apAgingBucket("2026-04-20", asOf)).toBe("1-30");
    expect(apAgingBucket("2026-03-15", asOf)).toBe("31-60");
    expect(apAgingBucket("2026-02-15", asOf)).toBe("61-90");
    expect(apAgingBucket("2026-01-10", asOf)).toBe("90+");
  });
});

describe("NO-FUND-MOVEMENT invariant — tracking only, never sends money", () => {
  // The bill-pay client + edge fn must never touch a payments/transfer rail. We
  // scan the source for any money-movement API surface. If a future edit adds a
  // real disbursement path, this test fails loudly (that change is decision-needed).
  const FORBIDDEN = [
    "stripe", "plaid.*transfer", "ach_transfer", "payout", "disburse",
    "wire_transfer", "sendmoney", "send_money", "transfer_funds", "initiate_transfer",
    "dwolla", "modern.?treasury", "moov", "checkbook",
  ];
  const sources = [
    read("./Bills.tsx"),
    read("./billMath.ts"),
    read("../../../../supabase/functions/bill-pay/index.ts"),
  ].map(stripComments).join("\n").toLowerCase();

  for (const term of FORBIDDEN) {
    it(`does not reference a money-movement surface: /${term}/`, () => {
      expect(sources).not.toMatch(new RegExp(term));
    });
  }

  it("the bill-pay api helpers only call the tracking edge fn (bill-pay), never a transfer fn", () => {
    const api = read("./api.ts");
    // The AP block invokes only the "bill-pay" function. Grab the invoke targets
    // that appear alongside bill ops and assert none is a payments provider.
    // Strip comments first so the invariant's own prose doesn't trip the scan.
    const apBlock = stripComments(api.slice(api.indexOf("AP / bill-pay — TRACKING ONLY")));
    expect(read("./api.ts")).toContain('"bill-pay"');
    expect(apBlock.toLowerCase()).not.toMatch(/stripe|payout|transfer|disburse/);
  });
});
