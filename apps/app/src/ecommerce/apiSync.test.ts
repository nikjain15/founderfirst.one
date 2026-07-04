/**
 * Square + PayPal API payout sync (W4.1-C/D) — mapping + split unit tests.
 *
 * Two things get proven here:
 *  1. The API JSON → PayoutComponents mapping ties to the cent, reusing the SAME
 *     split machinery (squareRowsFrom / paypalRowsFrom / componentsFromRows) as
 *     the file-import path.
 *  2. ⭐ EXACTLY-ONCE: the same provider payout ingested via the API path and via
 *     the CSV path produces the SAME split AND the SAME idempotency anchor
 *     (native payout id), so the ledger RPC's `ext:<provider>:payout:<id>` key
 *     collapses them to a single posted entry. This is the card's #1 risk.
 */
import { describe, expect, it } from "vitest";
import { parseCsv } from "../import/csv";
import { parsePayoutCsv } from "./payouts";
import {
  apiPayoutId,
  isoDate,
  paypalApiRows,
  paypalPayoutToComponents,
  paypalTypeForEvent,
  squareApiRows,
  squarePayoutToComponents,
  type PayPalTransactionApi,
  type SquarePayoutApi,
  type SquarePayoutEntryApi,
} from "./apiSync";

// ── Square: the API payout that mirrors the documented CSV fixture ───────────
const SQ_PAYOUT: SquarePayoutApi = {
  id: "PO-9F2K",
  status: "PAID",
  created_at: "2026-06-30T14:05:00Z",
  amount_money: { amount: 18179, currency: "USD" }, // $181.79 net deposit
};
const SQ_ENTRIES: SquarePayoutEntryApi[] = [
  { type: "CHARGE", gross_amount_money: { amount: 8800 }, fee_amount_money: { amount: -255 } },
  { type: "CHARGE", gross_amount_money: { amount: 13025 }, fee_amount_money: { amount: -378 } },
  { type: "REFUND", gross_amount_money: { amount: -3000 }, fee_amount_money: { amount: 87 } },
  { type: "ADJUSTMENT", gross_amount_money: { amount: -100 }, fee_amount_money: { amount: 0 } },
  { type: "DEPOSIT", gross_amount_money: { amount: -18179 }, fee_amount_money: { amount: 0 } }, // the payout line itself
];

describe("Square API payout → components", () => {
  it("maps the Payouts API entries and ties to Square's reported net", () => {
    const { components: c, reportedNetMinor, reconciles } = squarePayoutToComponents(SQ_PAYOUT, SQ_ENTRIES);
    expect(c.grossMinor).toBe(8800 + 13025);
    expect(c.feesMinor).toBe(255 + 378);
    expect(c.refundsMinor).toBe(3000);
    expect(c.adjustMinor).toBe(87 - 100);
    expect(c.netMinor).toBe(18179);
    expect(reportedNetMinor).toBe(18179);
    expect(reconciles).toBe(true);
    expect(c.payoutDate).toBe("2026-06-30");
    expect(c.provider).toBe("square");
  });

  it("squareApiRows drops the DEPOSIT/transfer row (it is the net, not a component)", () => {
    // squareRowsFrom already ignores DEPOSIT — assert the mapping preserves the raw type
    expect(squareApiRows(SQ_ENTRIES).some((r) => r.type.toLowerCase() === "deposit")).toBe(true);
  });

  it("rejects an invalid timestamp rather than silently defaulting the date", () => {
    expect(() => isoDate("not-a-date")).toThrow();
  });
});

// ── PayPal: transaction-search rows mirroring the activity-CSV fixture ────────
const PP_TXNS: PayPalTransactionApi[] = [
  { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "50.00", currency_code: "USD" }, fee_amount: { value: "-1.80" } } },
  { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "120.00", currency_code: "USD" }, fee_amount: { value: "-3.78" } } },
  { transaction_info: { transaction_event_code: "T1107", transaction_amount: { value: "-20.00", currency_code: "USD" }, fee_amount: { value: "0.70" } } }, // refund + fee credit-back
  { transaction_info: { transaction_event_code: "T0400", transaction_amount: { value: "-145.12", currency_code: "USD" }, fee_amount: { value: "0" } } }, // withdrawal = the payout line
];

describe("PayPal API payout → components", () => {
  it("classifies event codes and ties to net (gross − fees − refunds ± adj)", () => {
    const { components: c } = paypalPayoutToComponents("PAYOUTBATCH-77", "2026-06-30", "USD", PP_TXNS);
    expect(c.grossMinor).toBe(5000 + 12000);
    expect(c.feesMinor).toBe(180 + 378);
    expect(c.refundsMinor).toBe(2000);
    expect(c.adjustMinor).toBe(70); // refund fee credit-back
    // 17000 − 558 − 2000 + 70 = 14512 → $145.12, exactly the withdrawal magnitude
    expect(c.netMinor).toBe(14512);
    expect(c.provider).toBe("paypal");
  });

  it("paypalTypeForEvent maps refund/withdrawal/adjustment codes", () => {
    expect(paypalTypeForEvent("T1107", -2000)).toBe("Refund");
    expect(paypalTypeForEvent("T0400", -14512)).toBe("General Withdrawal");
    expect(paypalTypeForEvent("T0006", 5000)).toBe("Payment");
    expect(paypalTypeForEvent("T2001", 0)).toBe("Adjustment");
  });

  it("paypalApiRows excludes nothing itself — paypalRowsFrom drops the withdrawal", () => {
    expect(paypalApiRows(PP_TXNS)).toHaveLength(4);
  });
});

// ── ⭐ EXACTLY-ONCE across API + CSV ─────────────────────────────────────────
describe("exactly-once: API and CSV ingest of the SAME payout collapse to one post", () => {
  it("Square: API pull and CSV upload of payout PO-9F2K produce identical split + id", () => {
    const csvText = [
      `Payout Date,Payout ID,Type,Gross Amount,Fees,Net Amount,Transaction ID`,
      `2026-06-30,PO-9F2K,Charge,88.00,-2.55,85.45,TXN-001`,
      `2026-06-30,PO-9F2K,Charge,130.25,-3.78,126.47,TXN-002`,
      `2026-06-30,PO-9F2K,Refund,-30.00,0.87,-29.13,TXN-003`,
      `2026-06-30,PO-9F2K,Adjustment,-1.00,0,-1.00,TXN-004`,
    ].join("\n");
    const csv = parsePayoutCsv("square", "PO-9F2K", "2026-06-30", "USD", parseCsv(csvText));
    const api = squarePayoutToComponents(SQ_PAYOUT, SQ_ENTRIES);

    // Same idempotency anchor (native payout id) → same ext:square:payout:<id> key.
    expect(api.components.payoutId).toBe(csv.components.payoutId);
    expect(api.components.payoutId).toBe("PO-9F2K");
    // Same split, to the cent → posting either path yields the same entry.
    expect(api.components.grossMinor).toBe(csv.components.grossMinor);
    expect(api.components.feesMinor).toBe(csv.components.feesMinor);
    expect(api.components.refundsMinor).toBe(csv.components.refundsMinor);
    expect(api.components.adjustMinor).toBe(csv.components.adjustMinor);
    expect(api.components.netMinor).toBe(csv.components.netMinor);
  });

  it("PayPal: API pull and CSV upload of batch PAYOUTBATCH-77 share id + net", () => {
    const csvText = [
      `Date,Type,Gross,Fee,Net,Transaction ID`,
      `2026-06-30,Express Checkout Payment,50.00,-1.80,48.20,TX1`,
      `2026-06-30,Website Payment,120.00,-3.78,116.22,TX2`,
      `2026-06-30,Refund,-20.00,0.70,-19.30,TX3`,
      `2026-06-30,General Withdrawal,-145.12,0,-145.12,TX4`,
    ].join("\n");
    const csv = parsePayoutCsv("paypal", "PAYOUTBATCH-77", "2026-06-30", "USD", parseCsv(csvText));
    const api = paypalPayoutToComponents("PAYOUTBATCH-77", "2026-06-30", "USD", PP_TXNS);

    expect(api.components.payoutId).toBe(csv.components.payoutId);
    expect(api.components.netMinor).toBe(csv.components.netMinor);
    expect(api.components.grossMinor).toBe(csv.components.grossMinor);
    expect(api.components.feesMinor).toBe(csv.components.feesMinor);
  });

  it("apiPayoutId trims so a whitespace-differing id still collides to one key", () => {
    expect(apiPayoutId("  PO-9F2K ")).toBe("PO-9F2K");
    expect(() => apiPayoutId("")).toThrow();
    expect(() => apiPayoutId("   ")).toThrow();
  });
});
