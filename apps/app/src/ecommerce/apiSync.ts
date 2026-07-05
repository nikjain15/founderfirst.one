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
 * matter of BOTH paths deriving the SAME payout id for the same provider payout:
 *   • Square HAS a native payout id → both paths use it verbatim (apiPayoutId).
 *   • PayPal has NO native settlement/batch id (Transaction Search groups by date
 *     window), so BOTH paths derive the id from the transfer-to-bank (withdrawal)
 *     transaction id via paypalCanonicalPayoutId — the actual money movement that
 *     IS the payout (Option A, Nik 4 Jul). A window with no withdrawal is not a
 *     completed payout and is SKIPPED, never posted under a synthesized id.
 * So an API pull of Square `PO-9F2K` and a CSV of the same collapse to one entry,
 * and a PayPal API pull and CSV of the same payout collapse on the withdrawal txn
 * id. See apiSync.test.ts.
 *
 * This module is pure + DB-free (no fetch, no Supabase) so the whole mapping is
 * unit-testable in node, exactly like payouts.ts. The edge function
 * (supabase/functions/commerce-sync) does the actual sandbox HTTP + posting and
 * imports the SAME classifiers.
 */

import {
  componentsFromRows,
  isPayPalWithdrawalEventCode,
  paypalCanonicalPayoutId,
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
 * A PayPal settlement window's transactions → PayoutComponents. Reuses
 * paypalRowsFrom + componentsFromRows — the SAME split as the CSV path. The
 * withdrawal/transfer row is excluded by paypalRowsFrom (it IS the net), so the
 * component rows reconcile to the deposit.
 *
 * ⭐ EXACTLY-ONCE (Option A, Nik 4 Jul): the payout id is DERIVED from the
 * transfer-to-bank (withdrawal) transaction id via the shared
 * paypalCanonicalPayoutId — the exact money movement the CSV export also carries.
 * The `_windowLabel` arg is only a human label for logs, NEVER the idempotency
 * anchor; PayPal Transaction Search has no native batch id, so keying on the
 * date-window label is what caused an API pull and a CSV upload of the SAME
 * payout to post TWICE. When the window has NO withdrawal transaction the money
 * has not left PayPal yet — this is NOT a completed payout, so we return
 * `skip:'not_withdrawn'` and the caller MUST NOT post (no synthesized id).
 *
 * RECONCILE (RT-230): when a withdrawal is present we reconcile our split net
 * against Σ(withdrawal magnitudes) — the money that actually left PayPal — NOT
 * against our own computed net (a tautology that can never fail; LEARNINGS #16).
 * Multi-currency windows are refused (reconciles=false) so the caller skips
 * rather than mis-summing into one currency (a separate card).
 */
export function paypalPayoutToComponents(
  _windowLabel: string,
  payoutDate: string,
  currency: string,
  txns: PayPalTransactionApi[],
):
  | { components: PayoutComponents; reportedNetMinor: number | null; reconciles: boolean; skip?: undefined }
  | { components: null; reportedNetMinor: null; reconciles: false; skip: "not_withdrawn" } {
  const currencies = new Set<string>();
  let withdrawalNetMinor = 0;
  let sawWithdrawal = false;
  const withdrawalTxnIds: string[] = [];
  for (const t of txns) {
    const info = t.transaction_info ?? {};
    const cc = info.transaction_amount?.currency_code;
    if (cc) currencies.add(cc.toString());
    // Only an OUTBOUND transfer-to-bank is the payout. The T04xx family also
    // contains withdrawal REVERSALS / returned transfers (money coming BACK into
    // PayPal, positive gross); those must NOT anchor the payout nor inflate the
    // reconcile target (RT-230: a T04 reversal otherwise sorted ahead of the real
    // withdrawal id → wrong anchor + non-reconcile). A genuine transfer-to-bank
    // has negative gross; a reversal has positive. Sign is the taxonomy-independent
    // discriminator both paths agree on.
    const wGross = toMinor(info.transaction_amount?.value ?? "0");
    if (isPayPalWithdrawalEventCode(info.transaction_event_code ?? "") && wGross < 0) {
      sawWithdrawal = true;
      withdrawalNetMinor += Math.abs(wGross);
      withdrawalTxnIds.push(info.transaction_id ?? "");
    }
  }
  // Option A: no completed payout without a transfer-to-bank txn id to key on.
  const canonicalId = paypalCanonicalPayoutId(withdrawalTxnIds);
  if (!sawWithdrawal || canonicalId == null) {
    return { components: null, reportedNetMinor: null, reconciles: false, skip: "not_withdrawn" };
  }
  const id = apiPayoutId(canonicalId);
  const rows = paypalRowsFrom(paypalApiRows(txns));
  const components = componentsFromRows("paypal", id, payoutDate, currency, rows);
  const multiCurrency = currencies.size > 1;
  const reportedNetMinor = withdrawalNetMinor;
  const reconciles = !multiCurrency && reportedNetMinor === components.netMinor;
  return { components, reportedNetMinor, reconciles };
}
