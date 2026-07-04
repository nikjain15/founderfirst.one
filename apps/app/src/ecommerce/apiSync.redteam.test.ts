/**
 * RT-230 — adversarial tests for the Square + PayPal API payout sync (W4.1-C/D).
 *
 * Each test pins a defect the red-team found so it can never silently return:
 *  1. PayPal reconcile was a TAUTOLOGY (reportedNet := our own net) — it could
 *     never fail, so a sign/mapping bug would post a wrong split that "balanced"
 *     (violates LEARNINGS #16). We now reconcile against the withdrawal line (the
 *     money that actually left PayPal). This test proves a corrupted split is
 *     caught (reconciles=false), and a correct one still passes.
 *  2. A multi-currency PayPal window was silently summed into ONE currency. It
 *     must instead be flagged (reconciles=false, currency not a real ISO) so the
 *     caller SKIPS — multi-currency is a separate card.
 */
import { describe, expect, it } from "vitest";
import { paypalPayoutToComponents, type PayPalTransactionApi } from "./apiSync";

const GOOD: PayPalTransactionApi[] = [
  { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "50.00", currency_code: "USD" }, fee_amount: { value: "-1.80" } } },
  { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "120.00", currency_code: "USD" }, fee_amount: { value: "-3.78" } } },
  { transaction_info: { transaction_event_code: "T1107", transaction_amount: { value: "-20.00", currency_code: "USD" }, fee_amount: { value: "0.70" } } },
  // the withdrawal line — the actual net leaving PayPal (145.12)
  { transaction_info: { transaction_event_code: "T0400", transaction_amount: { value: "-145.12", currency_code: "USD" }, fee_amount: { value: "0" } } },
];

describe("RT-230 PayPal API sync — genuine reconcile (not a tautology)", () => {
  it("reconciles against the withdrawal line, not against its own net", () => {
    const r = paypalPayoutToComponents("BATCH-RT", "2026-06-30", "USD", GOOD);
    expect(r.reportedNetMinor).toBe(14512); // Σ withdrawal magnitudes, NOT self-net
    expect(r.components.netMinor).toBe(14512);
    expect(r.reconciles).toBe(true);
  });

  it("FLAGS a split that does not tie to the withdrawal (a mapping/sign bug)", () => {
    // Corrupt one sale gross so the split no longer ties to the 145.12 withdrawal.
    // Under the old tautology this still reported reconciles=true (bug hidden).
    const corrupt = GOOD.map((t, i) =>
      i === 0
        ? { transaction_info: { ...t.transaction_info!, transaction_amount: { value: "500.00", currency_code: "USD" } } }
        : t,
    );
    const r = paypalPayoutToComponents("BATCH-RT", "2026-06-30", "USD", corrupt);
    expect(r.reportedNetMinor).toBe(14512);
    expect(r.components.netMinor).not.toBe(14512);
    expect(r.reconciles).toBe(false); // caught, so the caller SKIPS (never posts)
  });

  it("does NOT silently sum a multi-currency window — flags it for skip", () => {
    const mixed: PayPalTransactionApi[] = [
      { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "50.00", currency_code: "USD" }, fee_amount: { value: "-1.80" } } },
      { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "40.00", currency_code: "EUR" }, fee_amount: { value: "-1.50" } } },
      { transaction_info: { transaction_event_code: "T0400", transaction_amount: { value: "-86.70", currency_code: "USD" }, fee_amount: { value: "0" } } },
    ];
    const r = paypalPayoutToComponents("BATCH-MIX", "2026-06-30", "USD", mixed);
    expect(r.reconciles).toBe(false); // multi-currency → skip, not a silent mis-sum
  });
});
