/**
 * RT-230c — adversarial tests for the PayPal exactly-once anchor (Option A),
 * hammering the "transfer-to-bank txn id" pick across the API and CSV paths.
 *
 * Each test pins a defect the red-team found (or proves an assumption holds):
 *
 *  1. T04 PREFIX BREADTH / withdrawal REVERSAL (P1, FIXED). The T04xx event-code
 *     family (and the "…Reversal" human type) contains not only outbound
 *     transfers-to-bank but their REVERSALS / returned transfers — money coming
 *     BACK into PayPal (positive gross). Before the fix a reversal was counted as
 *     a withdrawal: it inflated the reconcile target AND, because ids are sorted,
 *     a reversal txn id could sort AHEAD of the real withdrawal id and become the
 *     exactly-once anchor — a wrong key that re-opened the double-post. The anchor
 *     is now restricted to OUTBOUND transfers (negative gross) on BOTH paths.
 *
 *  2. MULTI-WITHDRAWAL 1:1 collapse (P2, verified). A window with two genuine
 *     outbound transfers must collapse to ONE deterministic key, IDENTICAL on the
 *     API and CSV paths (first by stable sort), or the double-post returns.
 *
 *  3. API↔CSV byte-parity of the anchor extended to multi-withdrawal + reversal —
 *     the two ingestion paths must derive the exact same key for the same money.
 */
import { describe, expect, it } from "vitest";
import { paypalPayoutToComponents, type PayPalTransactionApi } from "./apiSync";
import { parsePayoutCsv } from "./payouts";
import { parseCsv } from "../import/csv";

const key = (id: string) => `ext:paypal:payout:${id}`;

describe("RT-230c · withdrawal reversal must not anchor or inflate the payout", () => {
  // A sale nets 97.00, transferred to bank (WREAL, negative). A later returned
  // transfer (WREV, POSITIVE gross) shares the T04 family / "Reversal" type and
  // sorts alphabetically BEFORE the real withdrawal — the exact ambush.
  const API: PayPalTransactionApi[] = [
    { transaction_info: { transaction_id: "SALE", transaction_event_code: "T0006", transaction_amount: { value: "100.00", currency_code: "USD" }, fee_amount: { value: "-3.00" } } },
    { transaction_info: { transaction_id: "WREAL", transaction_event_code: "T0400", transaction_amount: { value: "-97.00", currency_code: "USD" }, fee_amount: { value: "0" } } },
    { transaction_info: { transaction_id: "AAREV", transaction_event_code: "T0403", transaction_amount: { value: "50.00", currency_code: "USD" }, fee_amount: { value: "0" } } },
  ];

  it("API: anchors on the OUTBOUND withdrawal, never the reversal, and reconciles", () => {
    const r = paypalPayoutToComponents("w", "2026-06-30", "USD", API);
    if (r.skip) throw new Error("expected a completed payout, got skip");
    // The reversal (AAREV) sorts first alphabetically but is positive-gross → excluded.
    expect(r.components.payoutId).toBe("WREAL");
    // reconcile target = the real outbound magnitude only (97.00), not 97+50.
    expect(r.reportedNetMinor).toBe(9700);
    expect(r.reconciles).toBe(true);
  });

  it("CSV: anchors on the OUTBOUND withdrawal, never the reversal row", () => {
    const text = [
      `Date,Type,Gross,Fee,Net,Transaction ID`,
      `2026-06-30,Express Checkout Payment,100.00,-3.00,97.00,SALE`,
      `2026-06-30,General Withdrawal,-97.00,0,-97.00,WREAL`,
      `2026-06-30,Withdrawal Reversal,50.00,0,50.00,AAREV`,
    ].join("\n");
    const r = parsePayoutCsv("paypal", "ignored", "2026-06-30", "USD", parseCsv(text));
    expect(r.skip).toBeUndefined();
    expect(r.components.payoutId).toBe("WREAL");
  });

  it("API↔CSV derive the IDENTICAL anchor key under a reversal (no path divergence)", () => {
    const api = paypalPayoutToComponents("w", "2026-06-30", "USD", API);
    const text = [
      `Date,Type,Gross,Fee,Net,Transaction ID`,
      `2026-06-30,Express Checkout Payment,100.00,-3.00,97.00,SALE`,
      `2026-06-30,General Withdrawal,-97.00,0,-97.00,WREAL`,
      `2026-06-30,Withdrawal Reversal,50.00,0,50.00,AAREV`,
    ].join("\n");
    const csv = parsePayoutCsv("paypal", "ignored", "2026-06-30", "USD", parseCsv(text));
    if (api.skip) throw new Error("api skipped unexpectedly");
    expect(key(api.components.payoutId)).toBe(key(csv.components.payoutId));
    expect(key(api.components.payoutId)).toBe(key("WREAL"));
  });
});

describe("RT-230c · multi-withdrawal window collapses to ONE deterministic, path-identical key", () => {
  // Two genuine outbound transfers in one window; ids chosen so first-by-sort is WBBB.
  const API: PayPalTransactionApi[] = [
    { transaction_info: { transaction_id: "SALE", transaction_event_code: "T0006", transaction_amount: { value: "200.00", currency_code: "USD" }, fee_amount: { value: "0" } } },
    { transaction_info: { transaction_id: "WDDD", transaction_event_code: "T0400", transaction_amount: { value: "-120.00", currency_code: "USD" }, fee_amount: { value: "0" } } },
    { transaction_info: { transaction_id: "WBBB", transaction_event_code: "T0400", transaction_amount: { value: "-80.00", currency_code: "USD" }, fee_amount: { value: "0" } } },
  ];
  const CSV = [
    `Date,Type,Gross,Fee,Net,Transaction ID`,
    `2026-06-30,Website Payment,200.00,0,200.00,SALE`,
    `2026-06-30,General Withdrawal,-120.00,0,-120.00,WDDD`,
    `2026-06-30,General Withdrawal,-80.00,0,-80.00,WBBB`,
  ].join("\n");

  it("API picks the first withdrawal id by stable sort (deterministic)", () => {
    const r = paypalPayoutToComponents("w", "2026-06-30", "USD", API);
    if (r.skip) throw new Error("unexpected skip");
    expect(r.components.payoutId).toBe("WBBB"); // sort → WBBB < WDDD
  });

  it("CSV picks the SAME first withdrawal id (path parity)", () => {
    const r = parsePayoutCsv("paypal", "ignored", "2026-06-30", "USD", parseCsv(CSV));
    expect(r.components.payoutId).toBe("WBBB");
  });

  it("API↔CSV keys are byte-identical under multi-withdrawal", () => {
    const api = paypalPayoutToComponents("w", "2026-06-30", "USD", API);
    const csv = parsePayoutCsv("paypal", "ignored", "2026-06-30", "USD", parseCsv(CSV));
    if (api.skip) throw new Error("unexpected skip");
    expect(key(api.components.payoutId)).toBe(key(csv.components.payoutId));
  });

  it("input-order independence: shuffling the API rows does not change the anchor", () => {
    const shuffled = [API[2], API[0], API[1]];
    const r = paypalPayoutToComponents("w", "2026-06-30", "USD", shuffled);
    if (r.skip) throw new Error("unexpected skip");
    expect(r.components.payoutId).toBe("WBBB"); // sort makes it order-independent
  });
});
