/**
 * Invoicing pure-math tests (W4.3). These lock the client's optimistic
 * computation to the server's arithmetic: line = round(qty×unit/1000), total =
 * Σ lines, AR aging boundaries, and the config-driven nudge selector. The
 * authoritative posting + aging live in the DB (pgTAP w4_3_invoicing_test.sql);
 * these guard the preview + the "changing config changes behavior" contract.
 */
import { describe, expect, it } from "vitest";
import {
  agingBucket, balanceMinor, clampPayment, invoiceTotalMinor, isDueForNudge, lineAmountMinor,
} from "./invoiceMath";
import { AGING_BUCKETS } from "./reports";
import { COPY } from "../copy";

describe("line + total math (integer minor units, no float drift)", () => {
  it("computes a line amount as qty(3dp) × unit / 1000, rounded to the cent", () => {
    expect(lineAmountMinor(1000, 5000)).toBe(5000);       // 1 × $50.00
    expect(lineAmountMinor(2000, 5000)).toBe(10000);      // 2 × $50.00
    expect(lineAmountMinor(1500, 999)).toBe(1499);        // 1.5 × $9.99 = 14.985 → 14.99
    expect(lineAmountMinor(333, 100)).toBe(33);           // 0.333 × $1.00 = 0.333 → 0.33
  });

  it("totals the sample invoice to the cent (matches the pgTAP fixture)", () => {
    // 2 × 5000 + 1 × 1500 = 11500 (same as w4_3_invoicing_test.sql)
    expect(invoiceTotalMinor([
      { quantity_milli: 2000, unit_price_minor: 5000 },
      { unit_price_minor: 1500 },  // qty defaults to 1
    ])).toBe(11500);
  });

  it("balance = total − paid", () => {
    expect(balanceMinor(11500, 4000)).toBe(7500);
    expect(balanceMinor(11500, 11500)).toBe(0);
  });
});

// AUDIT Program 5, F1: the pay-row input passed any typed amount straight to
// the RPC with no client-side cap — the server rejected it (books were always
// safe) but the owner just saw a raw error toast. Shared by Invoicing (AR) and
// Bills (AP) so the two payment rows can't drift apart.
describe("REG-W4-F1 — payment entry clamps to the outstanding balance", () => {
  it("caps an over-balance entry at the balance", () => {
    expect(clampPayment(15000, 10000)).toBe(10000);
  });
  it("passes an at-or-under-balance entry through unchanged", () => {
    expect(clampPayment(6000, 10000)).toBe(6000);
    expect(clampPayment(10000, 10000)).toBe(10000);
  });
  it("falls back to the full balance when the input doesn't parse", () => {
    expect(clampPayment(null, 10000)).toBe(10000);
  });
  it("never returns a negative amount for a zero balance", () => {
    expect(clampPayment(500, 0)).toBe(0);
  });
});

// AUDIT Program 5, F3: the live Invoicing/Bills strips bucket by DUE date (5
// buckets, this file's agingBucket) while the lender package buckets by
// TRANSACTION date (4 buckets, reports.ts AGING_BUCKETS) — genuinely different
// measures of the same receivable, not a one-source-of-truth violation. Left
// unlabeled, an owner comparing the two screens sees mismatched totals with no
// explanation. This locks both (a) the two schemes staying intentionally
// distinct in shape, so a "helpful" merge doesn't silently drop the labeling
// need, and (b) every surface naming its own basis in copy.
describe("REG-W4-F3 — the two AR/AP aging schemes are labeled, not silently divergent", () => {
  it("the due-date scheme (live strips) has 5 buckets", () => {
    const dueDateBuckets: ReturnType<typeof agingBucket>[] =
      ["current", "1-30", "31-60", "61-90", "90+"];
    expect(new Set(dueDateBuckets).size).toBe(5);
  });
  it("the transaction-date scheme (lender package) has a different bucket count", () => {
    expect(AGING_BUCKETS.length).toBe(4);
    expect(AGING_BUCKETS.length).not.toBe(5);
  });
  it("the lender package labels its aging tables by transaction date", () => {
    expect(COPY.reports.pkgArAging.toLowerCase()).toContain("transaction date");
    expect(COPY.reports.pkgApAging.toLowerCase()).toContain("transaction date");
  });
  it("the live Invoicing/Bills strips label their aging by due date", () => {
    expect(COPY.invoicing.agedByDueDate.toLowerCase()).toContain("due date");
    expect(COPY.bills.agedByDueDate.toLowerCase()).toContain("due date");
  });
});

describe("AR aging buckets — boundaries match the SQL", () => {
  it("puts a not-yet-due invoice in current", () => {
    expect(agingBucket("2026-05-01", "2026-04-01")).toBe("current");
    expect(agingBucket("2026-04-01", "2026-04-01")).toBe("current"); // due today = 0 overdue
  });
  it("bands overdue by 30-day windows", () => {
    expect(agingBucket("2026-04-01", "2026-04-15")).toBe("1-30");
    expect(agingBucket("2026-04-01", "2026-05-10")).toBe("31-60");
    expect(agingBucket("2026-04-01", "2026-06-10")).toBe("61-90");
    expect(agingBucket("2026-01-01", "2026-05-01")).toBe("90+"); // matches pgTAP 90+ case
  });
});

describe("nudge selector — cadence is DATA (changing it changes behavior)", () => {
  const base = { status: "sent", customer_email: "a@b.test", due_date: "2026-01-10", last_nudge_at: null };

  it("selects an overdue, opted-in, never-nudged invoice", () => {
    expect(isDueForNudge(base, 7, "2026-05-01")).toBe(true);
  });
  it("skips a draft / paid / void invoice", () => {
    expect(isDueForNudge({ ...base, status: "draft" }, 7, "2026-05-01")).toBe(false);
    expect(isDueForNudge({ ...base, status: "paid" }, 7, "2026-05-01")).toBe(false);
  });
  it("skips an invoice with no customer email (can't send a reminder)", () => {
    expect(isDueForNudge({ ...base, customer_email: null }, 7, "2026-05-01")).toBe(false);
  });
  it("skips an invoice not yet due", () => {
    expect(isDueForNudge({ ...base, due_date: "2026-06-01" }, 7, "2026-05-01")).toBe(false);
  });
  it("throttles within the cadence window, then re-selects after it", () => {
    const nudged = { ...base, last_nudge_at: "2026-04-28T00:00:00Z" };
    // 3 days after last nudge, a 7-day cadence throttles it out…
    expect(isDueForNudge(nudged, 7, "2026-05-01")).toBe(false);
    // …but a 1-day cadence lets it through: SAME invoice, DIFFERENT config → different behavior.
    expect(isDueForNudge(nudged, 1, "2026-05-01")).toBe(true);
  });
});
