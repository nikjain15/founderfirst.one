/**
 * Receipt→transaction matcher (W3.5) — a PURE function that reuses the W1.1
 * reconciliation matcher discipline: EXACT (amount + same date) first, FUZZY
 * (amount within ±windowDays, nearest date) second. Kept separate + dependency-
 * free so Vitest can exercise parse→match with no DB (one source of truth with
 * the edge fn, which imports it).
 *
 * A receipt's `amount_minor` is signed the same way a statement line is: −out
 * (money spent — the common case) / +in. We match it to a ledger entry by the
 * entry's debit-positive net on its NON-holding side… but receipts have no bank
 * account context, so we match on the entry's TOTAL magnitude (the amount the
 * transaction moved) against the receipt amount, within the date window. This is
 * deliberately amount-first like reconciliation; the tier pipeline downstream
 * decides whether a candidate is trustworthy enough to auto-attach.
 */

export interface ParsedReceipt {
  vendor: string | null;
  amount_minor: number | null; // signed: −out / +in (abs value is what we match on)
  receipt_date: string | null; // YYYY-MM-DD
}

/** A ledger entry reduced to what the matcher needs. */
export interface EntryCandidate {
  entry_id: string;
  entry_date: string; // YYYY-MM-DD
  amount_minor: number; // the entry's total magnitude (Σ debits), always positive
  memo: string | null;
  has_receipt: boolean; // an entry that already has a live receipt is not a candidate
}

export interface ReceiptMatch {
  entry_id: string;
  kind: "exact" | "fuzzy";
  dateDelta: number; // |days| between receipt and entry (0 for exact)
  amount_minor: number; // the entry magnitude matched
}

/** Whole-day difference between two YYYY-MM-DD dates (UTC, calendar days). */
export function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.round(Math.abs(ms) / 86_400_000);
}

/**
 * Best match for a parsed receipt among the candidate entries. EXACT (same
 * calendar date + same amount magnitude) wins outright; otherwise the FUZZY
 * candidate with the same magnitude and the nearest date within ±windowDays.
 * Entries that already carry a receipt are skipped (one receipt per entry).
 * Returns null when the receipt lacks an amount or nothing matches.
 */
export function matchReceipt(
  receipt: ParsedReceipt,
  candidates: EntryCandidate[],
  windowDays = 4,
): ReceiptMatch | null {
  if (receipt.amount_minor == null || !receipt.receipt_date) return null;
  const target = Math.abs(receipt.amount_minor);
  if (target === 0) return null;

  const sameAmount = candidates.filter(
    (c) => !c.has_receipt && Math.abs(c.amount_minor) === target,
  );
  if (sameAmount.length === 0) return null;

  // Pass 1: EXACT (delta 0). Pick the first same-date candidate.
  const exact = sameAmount.find((c) => dayDiff(receipt.receipt_date!, c.entry_date) === 0);
  if (exact) {
    return { entry_id: exact.entry_id, kind: "exact", dateDelta: 0, amount_minor: Math.abs(exact.amount_minor) };
  }

  // Pass 2: FUZZY within ±windowDays, nearest date wins.
  let best: EntryCandidate | null = null;
  let bestDelta = Infinity;
  for (const c of sameAmount) {
    const d = dayDiff(receipt.receipt_date, c.entry_date);
    if (d <= windowDays && d < bestDelta) { best = c; bestDelta = d; }
  }
  if (!best) return null;
  return { entry_id: best.entry_id, kind: "fuzzy", dateDelta: bestDelta, amount_minor: Math.abs(best.amount_minor) };
}

/**
 * Confidence for a receipt match, in [0,1], for the W3.2 tier bands. This is the
 * matcher's OWN signal (not a magic threshold — the CUTOFFS that turn it into a
 * tier live in platform_config and are applied by tierFor in the edge fn):
 *   • exact date → strong (1.0). Amount + same-day is as sure as reconciliation's
 *     exact pass.
 *   • fuzzy → decays with date distance (nearer = surer), staying in the medium/
 *     low band so a date-off match confirms rather than auto-attaches by default.
 * A vendor-name corroboration nudges confidence up (still ≤1).
 */
export function matchConfidence(match: ReceiptMatch, vendorCorroborated: boolean): number {
  let base = match.kind === "exact" ? 1 : Math.max(0.4, 0.85 - match.dateDelta * 0.12);
  if (vendorCorroborated) base = Math.min(1, base + 0.1);
  return Math.round(base * 1000) / 1000;
}

/**
 * Band a receipt match into a W3.2 trust tier. The CUTOFFS are DATA — passed in
 * from platform_config (confidence_high / confidence_medium) — never hardcoded
 * here; this is the same discipline the categorize edge fn uses. An exact-date
 * match is HIGH by provenance (as sure as reconciliation's exact pass); a fuzzy
 * match is banded by the config cutoffs. HIGH → auto-attach; MEDIUM/LOW → a
 * confirm card. Mirrors tierFor() in supabase/functions/receipts/index.ts so the
 * on-screen behavior and the server decision are one source of truth.
 */
export interface TierCutoffs { confidence_high: number; confidence_medium: number }
export type Tier = "high" | "medium" | "low";
export function receiptTier(match: ReceiptMatch, confidence: number, cutoffs: TierCutoffs): Tier {
  if (match.kind === "exact") return "high";
  if (confidence >= cutoffs.confidence_high) return "high";
  if (confidence >= cutoffs.confidence_medium) return "medium";
  return "low";
}

/** Does the parsed vendor appear in the matched entry's memo? (corroboration) */
export function vendorInMemo(vendor: string | null, memo: string | null): boolean {
  if (!vendor || !memo) return false;
  const v = vendor.toLowerCase().trim();
  return v.length >= 3 && memo.toLowerCase().includes(v);
}
