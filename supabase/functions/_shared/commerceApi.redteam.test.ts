/**
 * RT-230 — adversarial Deno tests for the server-side PayPal roll-up.
 *
 * fetchPayPalPayout previously set `reportedNetMinor = c.net; reconciles = true`
 * unconditionally — a tautology that could NEVER catch a mapping bug and would
 * post a wrong split that "reconciled" (LEARNINGS #16). And a multi-currency
 * window was summed into one currency silently. paypalPayoutFromDetails now
 * reconciles against the withdrawal line and refuses to sum across currencies.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { paypalPayoutFromDetails, type PayPalDetail } from "./commerceApi.ts";

const GOOD: PayPalDetail[] = [
  { transaction_info: { transaction_id: "TX1", transaction_event_code: "T0006", transaction_amount: { value: "50.00", currency_code: "USD" }, fee_amount: { value: "-1.80" } } },
  { transaction_info: { transaction_id: "TX2", transaction_event_code: "T0006", transaction_amount: { value: "120.00", currency_code: "USD" }, fee_amount: { value: "-3.78" } } },
  { transaction_info: { transaction_id: "TX3", transaction_event_code: "T1107", transaction_amount: { value: "-20.00", currency_code: "USD" }, fee_amount: { value: "0.70" } } },
  { transaction_info: { transaction_id: "WTX", transaction_event_code: "T0400", transaction_amount: { value: "-145.12", currency_code: "USD" }, fee_amount: { value: "0" } } },
];

Deno.test("PayPal roll-up reconciles against the withdrawal line (not self-net)", () => {
  const p = paypalPayoutFromDetails(GOOD, "2026-06-30", "paypal-window:2026-06-30")!;
  assertEquals(p.payoutId, "WTX"); // Option A anchor = transfer-to-bank txn id
  assertEquals(p.reportedNetMinor, 14512); // Σ withdrawal magnitudes
  assertEquals(p.netMinor, 14512);
  assertEquals(p.reconciles, true);
});

Deno.test("PayPal roll-up SKIPS (returns null) when there is no transfer-to-bank line", () => {
  const notWithdrawn = GOOD.slice(0, 3); // no withdrawal txn → not a completed payout
  const p = paypalPayoutFromDetails(notWithdrawn, "2026-06-30", "paypal-window:2026-06-30");
  assertEquals(p, null); // never synthesize a date-based id and post
});

Deno.test("PayPal roll-up FLAGS a split that does not tie to the withdrawal", () => {
  const corrupt = GOOD.map((d, i) =>
    i === 0
      ? { transaction_info: { ...d.transaction_info!, transaction_amount: { value: "500.00", currency_code: "USD" } } }
      : d,
  );
  const p = paypalPayoutFromDetails(corrupt, "2026-06-30", "paypal:2026-06-30")!;
  assertEquals(p.reportedNetMinor, 14512);
  assertEquals(p.reconciles, false); // caught → caller skips, never posts
});

Deno.test("PayPal roll-up refuses to sum a multi-currency window", () => {
  const mixed: PayPalDetail[] = [
    { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "50.00", currency_code: "USD" }, fee_amount: { value: "-1.80" } } },
    { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "40.00", currency_code: "EUR" }, fee_amount: { value: "-1.50" } } },
    { transaction_info: { transaction_id: "WTX", transaction_event_code: "T0400", transaction_amount: { value: "-86.70", currency_code: "USD" }, fee_amount: { value: "0" } } },
  ];
  const p = paypalPayoutFromDetails(mixed, "2026-06-30", "paypal-window:2026-06-30")!;
  assertEquals(p.reconciles, false);
  assertEquals(p.currency, "MIXED");
});
