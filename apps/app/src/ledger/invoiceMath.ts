/**
 * Invoicing pure math (W4.3) — kept React-free so it is unit-testable and so the
 * client mirrors the SERVER'S computation exactly. The authoritative numbers are
 * posted by the `upsert_invoice` / aging RPCs; these helpers reproduce the same
 * arithmetic for an optimistic preview (the "Total" in the draft form, the aging
 * bucket labels). Money is integer minor units — never float (ARCHITECTURE §6.1).
 */

/** One line's amount in minor units: qty(3dp) × unit / 1000, rounded to the cent.
 *  MUST match the SQL `round((quantity_milli * unit_price_minor) / 1000.0)`. */
export function lineAmountMinor(quantityMilli: number, unitPriceMinor: number): number {
  return Math.round((quantityMilli * unitPriceMinor) / 1000);
}

/** Invoice total = Σ line amounts. */
export function invoiceTotalMinor(
  lines: { quantity_milli?: number; unit_price_minor: number }[],
): number {
  return lines.reduce(
    (sum, l) => sum + lineAmountMinor(l.quantity_milli ?? 1000, l.unit_price_minor),
    0,
  );
}

/** Open balance = total − paid. */
export function balanceMinor(totalMinor: number, amountPaidMinor: number): number {
  return totalMinor - amountPaidMinor;
}

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

/** The AR aging bucket for a due date, as-of a reference date. MUST match the SQL
 *  `invoice_ar_aging` boundaries (days overdue: ≤0 current, ≤30, ≤60, ≤90, else 90+). */
export function agingBucket(dueDate: string, asOf: string): AgingBucket {
  const due = Date.parse(dueDate + "T00:00:00Z");
  const ref = Date.parse(asOf + "T00:00:00Z");
  const daysOverdue = Math.round((ref - due) / 86_400_000);
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

/** Is an invoice a candidate for a reminder, given the cadence (days) from config?
 *  Mirrors `invoices_due_nudge`: sent/partial, has email, past due, not nudged
 *  within the cadence window. Cadence is DATA (never hardcoded). */
export function isDueForNudge(
  inv: {
    status: string;
    customer_email: string | null;
    due_date: string;
    last_nudge_at: string | null;
  },
  cadenceDays: number,
  asOf: string,
): boolean {
  if (inv.status !== "sent" && inv.status !== "partial") return false;
  if (!inv.customer_email) return false;
  const ref = Date.parse(asOf + "T00:00:00Z");
  if (Date.parse(inv.due_date + "T00:00:00Z") >= ref) return false;
  if (!inv.last_nudge_at) return true;
  const cadenceMs = Math.max(cadenceDays, 1) * 86_400_000;
  return Date.parse(inv.last_nudge_at) < ref - cadenceMs;
}
