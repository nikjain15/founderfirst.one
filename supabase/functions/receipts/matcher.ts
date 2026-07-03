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
  exactTies: number; // # of same-date+amount candidates (≥2 = ambiguous → confirm, never auto-attach)
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

  // Pass 1: EXACT (delta 0). Count ALL same-date+amount candidates — if two or
  // more tie, the receipt is AMBIGUOUS: we cannot know which transaction it
  // belongs to, so we surface the tie (exactTies ≥ 2) and let the tier pipeline
  // downgrade to a confirm card rather than silently auto-attach to the first.
  const exactTies = sameAmount.filter((c) => dayDiff(receipt.receipt_date!, c.entry_date) === 0);
  if (exactTies.length > 0) {
    const exact = exactTies[0];
    return { entry_id: exact.entry_id, kind: "exact", dateDelta: 0, amount_minor: Math.abs(exact.amount_minor), exactTies: exactTies.length };
  }

  // Pass 2: FUZZY within ±windowDays, nearest date wins.
  let best: EntryCandidate | null = null;
  let bestDelta = Infinity;
  for (const c of sameAmount) {
    const d = dayDiff(receipt.receipt_date, c.entry_date);
    if (d <= windowDays && d < bestDelta) { best = c; bestDelta = d; }
  }
  if (!best) return null;
  return { entry_id: best.entry_id, kind: "fuzzy", dateDelta: bestDelta, amount_minor: Math.abs(best.amount_minor), exactTies: 0 };
}

/**
 * Confidence for a receipt match, in [0,1], for the W3.2 tier bands. This is the
 * matcher's OWN signal (not a magic threshold — the CUTOFFS that turn it into a
 * tier live in platform_config and are applied by receiptTier):
 *   • exact date + amount → strong, but NOT certain on its own. Amount+date can
 *     collide (two same-price purchases the same day), so an exact match is only
 *     maximally confident (1.0) when the parsed VENDOR also corroborates the
 *     entry. An uncorroborated exact match decays into the medium band so it
 *     confirms rather than auto-attaches (the vendor-check, not provenance alone).
 *   • fuzzy → decays with date distance (nearer = surer), staying in the medium/
 *     low band so a date-off match confirms rather than auto-attaches by default.
 * A vendor-name corroboration nudges confidence up (still ≤1).
 */
export function matchConfidence(match: ReceiptMatch, vendorCorroborated: boolean): number {
  const exactBase = vendorCorroborated ? 1 : 0.6; // uncorroborated exact ⇒ medium band, needs a vendor to auto-attach
  let base = match.kind === "exact" ? exactBase : Math.max(0.4, 0.85 - match.dateDelta * 0.12);
  if (match.kind === "fuzzy" && vendorCorroborated) base = Math.min(1, base + 0.1);
  return Math.round(base * 1000) / 1000;
}

/**
 * Band a receipt match into a W3.2 trust tier. The CUTOFFS are DATA — passed in
 * from platform_config (confidence_high / confidence_medium) — never hardcoded
 * here; this is the same discipline the categorize edge fn uses. HIGH →
 * auto-attach; MEDIUM/LOW → a confirm card in Review. Mirrors the server decision
 * in supabase/functions/receipts/index.ts so on-screen and server are one source.
 *
 * Trust-safety (W3.2 principle — Penny only AUTO-acts when genuinely sure):
 *   • AMBIGUOUS exact (exactTies ≥ 2): two or more transactions share the same
 *     amount+date, so we cannot know which the receipt belongs to → downgrade to
 *     LOW (confirm card) so the owner picks. Never silently attach to the first.
 *   • An amount+date exact match is NOT auto-attached on provenance alone: it
 *     qualifies for HIGH only when the parsed vendor CORROBORATES the entry
 *     (vendorCorroborated), OR the confidence otherwise clears confidence_high.
 *     Amount+date that match but a vendor that does not corroborate → confirm
 *     card, banded by the config cutoffs.
 *   • A fuzzy match is banded purely by the config cutoffs (no exact provenance).
 */
export interface TierCutoffs { confidence_high: number; confidence_medium: number }
export type Tier = "high" | "medium" | "low";
export interface TierContext { vendorCorroborated?: boolean }
export function receiptTier(
  match: ReceiptMatch,
  confidence: number,
  cutoffs: TierCutoffs,
  ctx: TierContext = {},
): Tier {
  // Ambiguous exact ties can never auto-attach — surface as a confirm card.
  if (match.kind === "exact" && match.exactTies >= 2) return "low";
  // A single unambiguous exact match is HIGH only if the vendor corroborates OR
  // the confidence clears the config high cutoff — otherwise it confirms.
  if (match.kind === "exact" && ctx.vendorCorroborated) return "high";
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
