/**
 * E-commerce payout API sync — Square + PayPal, SANDBOX + READ-ONLY (W4.1-C/D).
 *
 * WHY THIS EXISTS
 * ───────────────
 * W4.1 / W4.1-B ship payout SPLITTING via file import (payouts.ts): a provider
 * payout report → normalized PayoutRow[] → PayoutComponents the ledger RPC posts.
 * This module adds the LIVE API path for Square + PayPal so payouts pull in and
 * split automatically — WITHOUT re-implementing the split. It maps each
 * provider's API JSON onto the SAME typed report rows the CSV path already knows
 * (SquarePayoutRow / PayPalTxnRow), then reuses squareRowsFrom / paypalRowsFrom /
 * componentsFromRows. One split, two ingestion paths.
 *
 * READ-ONLY: the fetch helpers only ever GET/query settlements + their component
 * transactions. Nothing here writes to the provider or moves money — that's a
 * hard scope boundary (W4.1-C/D: sandbox, read-only). Production OAuth (a prod
 * app + owner consent) is a separate, human-gated step and is NOT wired here.
 *
 * ⭐ EXACTLY-ONCE (the #1 correctness risk)
 * ─────────────────────────────────────────
 * The ledger RPC keys every payout on `ext:<provider>:payout:<payout_id>`
 * (unique per org). Exactly-once across the API and CSV paths is therefore a
 * matter of BOTH paths deriving the SAME native payout id for the same provider
 * payout. `apiPayoutId(provider, native)` is the ONE place that id is derived, so
 * an API pull of Square payout `PO-9F2K` and a CSV upload of the same `PO-9F2K`
 * collapse to a single posted entry. See apiSync.test.ts.
 *
 * This module is pure + DB-free (no fetch, no Supabase) so the whole mapping is
 * unit-testable in node, exactly like payouts.ts. The edge function
 * (supabase/functions/commerce-sync) does the actual sandbox HTTP + posting and
 * imports the SAME classifiers.
 */

import {
  componentsFromRows,
  paypalRowsFrom,
  squareRowsFrom,
  toMinor,
  type PayoutComponents,
  type PayoutProvider,
  type PayPalTxnRow,
  type SquarePayoutRow,
} from "./payouts";

/** Providers that expose a read-only sandbox payout API in this card. */
export type ApiSyncProvider = Extract<PayoutProvider, "square" | "paypal">;

/**
 * The single source of truth for a payout's idempotency anchor. BOTH the API
 * sync and the CSV upload MUST feed this same native id to the ledger RPC, so
 * the two paths share ONE `ext:<provider>:payout:<id>` key space and post the
 * payout EXACTLY ONCE. Trimmed to normalize incidental whitespace between paths.
 */
export function apiPayoutId(nativeId: string): string {
  const id = (nativeId ?? "").toString().trim();
  if (!id) throw new Error("payout id is required for exactly-once idempotency");
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// Square — Payouts API (read-only), sandbox base https://connect.squareupsandbox.com
//
// Flow (read-only): ListPayouts → for each payout, ListPayoutEntries. A payout
// entry has a `type` (DEPOSIT / CHARGE / REFUND / FEE / ADJUSTMENT / …) plus
// gross_amount_money + fee_amount_money in MINOR units already (Square Money is
// integer cents). We normalize onto SquarePayoutRow (the CSV path's shape) so
// squareRowsFrom classifies identically to the uploaded transfer report.
//   https://developer.squareup.com/reference/square/payouts-api
// ═══════════════════════════════════════════════════════════════════════════

/** Square Money: integer minor units + currency (its native shape). */
export interface SquareMoney {
  amount?: number | null; // minor units (integer)
  currency?: string | null;
}

/** One Square payout-entry as the Payouts API returns it (fields we use). */
export interface SquarePayoutEntryApi {
  id?: string;
  type?: string; // DEPOSIT / CHARGE / REFUND / FEE / ADJUSTMENT …
  gross_amount_money?: SquareMoney | null;
  fee_amount_money?: SquareMoney | null;
}

/** One Square payout (the settlement/deposit) as ListPayouts returns it. */
export interface SquarePayoutApi {
  id?: string;
  status?: string; // PAID / SENT / …
  created_at?: string; // ISO timestamp
  amount_money?: SquareMoney | null; // the net deposit (reconcile target)
}

/** Square Money → decimal string toMinor understands, preserving sign. */
function squareMoneyToDecimal(m: SquareMoney | null | undefined): string {
  const minor = Math.trunc(Number(m?.amount ?? 0));
  return (minor / 100).toFixed(2);
}

/** Map Square API payout-entries → the CSV path's SquarePayoutRow[]. */
export function squareApiRows(entries: SquarePayoutEntryApi[]): SquarePayoutRow[] {
  return entries.map((e) => ({
    type: (e.type ?? "").toString(),
    gross: squareMoneyToDecimal(e.gross_amount_money),
    fees: squareMoneyToDecimal(e.fee_amount_money),
  }));
}

/** ISO timestamp → YYYY-MM-DD deposit date (UTC), the ledger's payout_date. */
export function isoDate(ts: string | null | undefined): string {
  const s = (ts ?? "").toString();
  const d = s ? new Date(s) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid payout timestamp: ${JSON.stringify(ts)}`);
  return d.toISOString().slice(0, 10);
}

/**
 * A Square payout + its entries → PayoutComponents, reconciled against Square's
 * own reported net (amount_money). Reuses squareRowsFrom + componentsFromRows —
 * the SAME split as the CSV path. Throws (never plugs) if it doesn't tie, so a
 * mapping bug surfaces before anything posts (LEARNINGS #16).
 */
export function squarePayoutToComponents(
  payout: SquarePayoutApi,
  entries: SquarePayoutEntryApi[],
): { components: PayoutComponents; reportedNetMinor: number | null; reconciles: boolean } {
  const payoutId = apiPayoutId(payout.id ?? "");
  const currency = payout.amount_money?.currency ?? "USD";
  const rows = squareRowsFrom(squareApiRows(entries));
  const components = componentsFromRows("square", payoutId, isoDate(payout.created_at), currency, rows);
  const reportedNetMinor =
    payout.amount_money?.amount != null ? Math.trunc(Number(payout.amount_money.amount)) : null;
  const reconciles = reportedNetMinor == null ? true : reportedNetMinor === components.netMinor;
  return { components, reportedNetMinor, reconciles };
}

// ═══════════════════════════════════════════════════════════════════════════
// PayPal — Payouts + Transaction Search (read-only), sandbox base
// https://api-m.sandbox.paypal.com
//
// A PayPal payout batch groups payout items; but for MERCHANT settlement the
// balance-affecting transactions come from the Transaction Search API, whose
// rows carry transaction_amount + fee_amount (both signed, from the merchant's
// side, exactly like the transaction CSV). We normalize onto PayPalTxnRow so
// paypalRowsFrom classifies identically to the uploaded activity report.
//   https://developer.paypal.com/docs/api/transaction-search/v1/
// ═══════════════════════════════════════════════════════════════════════════

/** PayPal amount object: value is a DECIMAL string, currency_code separate. */
export interface PayPalAmount {
  value?: string | null; // decimal string, signed
  currency_code?: string | null;
}

/** One PayPal transaction-search row (fields we use). */
export interface PayPalTransactionApi {
  transaction_info?: {
    transaction_id?: string;
    transaction_event_code?: string; // T0006 (checkout), T1107 (refund), T0400 (withdrawal)…
    transaction_amount?: PayPalAmount | null; // signed gross
    fee_amount?: PayPalAmount | null; // signed fee (negative on a sale)
  } | null;
}

/**
 * Human-readable type from PayPal's event code, so paypalRowsFrom's substring
 * classification (refund / withdrawal / …) works the same as on the CSV `Type`.
 * Codes: https://developer.paypal.com/docs/transaction-search/transaction-event-codes/
 */
export function paypalTypeForEvent(code: string, signedGrossMinor: number): string {
  const c = (code ?? "").toString().trim().toUpperCase();
  if (c.startsWith("T11")) return "Refund"; // T11xx = reversals/refunds
  if (c === "T0400" || c.startsWith("T04")) return "General Withdrawal"; // transfer to bank — the payout line
  if (c.startsWith("T20") || c.startsWith("T03")) return "Adjustment"; // holds / disputes / adjustments
  return signedGrossMinor >= 0 ? "Payment" : "Adjustment";
}

/** Map PayPal transaction-search rows → the CSV path's PayPalTxnRow[]. */
export function paypalApiRows(txns: PayPalTransactionApi[]): PayPalTxnRow[] {
  return txns.map((t) => {
    const info = t.transaction_info ?? {};
    const gross = toMinor(info.transaction_amount?.value ?? "0");
    return {
      type: paypalTypeForEvent(info.transaction_event_code ?? "", gross),
      gross: info.transaction_amount?.value ?? "0",
      fee: info.fee_amount?.value ?? "0",
    };
  });
}

/**
 * A PayPal payout (batch id + its transactions) → PayoutComponents. Reuses
 * paypalRowsFrom + componentsFromRows — the SAME split as the CSV path. The
 * withdrawal/transfer row is excluded by paypalRowsFrom (it IS the net), so the
 * component rows reconcile to the deposit.
 */
export function paypalPayoutToComponents(
  payoutId: string,
  payoutDate: string,
  currency: string,
  txns: PayPalTransactionApi[],
): { components: PayoutComponents; reportedNetMinor: number } {
  const id = apiPayoutId(payoutId);
  const rows = paypalRowsFrom(paypalApiRows(txns));
  const components = componentsFromRows("paypal", id, payoutDate, currency, rows);
  return { components, reportedNetMinor: components.netMinor };
}
