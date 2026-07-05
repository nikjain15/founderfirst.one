/**
 * Bill / AP pure math (RV2-D1) — kept React-free so it is unit-testable and so
 * the client mirrors the SERVER'S computation exactly. The authoritative numbers
 * are posted by the `upsert_bill` / `bill_ap_aging` RPCs; these helpers reproduce
 * the same arithmetic for an optimistic preview (the draft-form "Total", the AP
 * aging bucket labels). Money is integer minor units — never float.
 *
 * The line/total/balance/bucket arithmetic is IDENTICAL to invoicing's (AR ↔ AP
 * are symmetric), so we reuse invoiceMath's helpers rather than fork them — one
 * source, no drift. Only the domain naming differs.
 */
import {
  lineAmountMinor, invoiceTotalMinor, balanceMinor, agingBucket,
  type AgingBucket,
} from "./invoiceMath";

/** One bill line's amount in minor units: qty(3dp) × unit / 1000, rounded. */
export const billLineAmountMinor = lineAmountMinor;

/** Bill total = Σ line amounts. */
export const billTotalMinor = invoiceTotalMinor;

/** Open balance a bill still owes = total − paid. */
export const billBalanceMinor = balanceMinor;

export type ApAgingBucket = AgingBucket;

/** The AP aging bucket for a bill due date, as-of a reference date. MUST match
 *  the SQL `bill_ap_aging` boundaries — the same 30-day rule as AR aging. */
export const apAgingBucket = agingBucket;
