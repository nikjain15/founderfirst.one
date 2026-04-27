/**
 * Pure regex helpers — extraction + signal detection. No I/O. Imported by
 * the Worker AND the test suite.
 *
 * Email regex: deliberately permissive. Pulls a single email out of free
 * text. Tolerates plus-addressing, dots, hyphens.
 *
 * Phone regex: US-leaning. Tolerates `+1`, parentheses, dots, spaces, dashes.
 * Requires 10 digits after stripping non-digits, optionally with leading 1.
 */

const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/;

// Looks for a phone-shaped substring; we then validate the digit count.
const PHONE_LIKE_RE =
  /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;

export function extractEmail(text: string): string | null {
  const m = text.match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

export function extractPhone(text: string): string | null {
  const m = text.match(PHONE_LIKE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return null;
}

export const BUYING_SIGNAL_RE =
  /\b(price|pricing|how much|cost|launch|when (can|will|does)|sign[\s-]?up|early access|beta|count me in|i'?m in|where do i|how do i (get|sign|join))\b/i;

export const SOFT_DECLINE_RE =
  /\b(not now|just (looking|browsing)|maybe later|no thanks|not interested|i'?ll think|i'?ll come back)\b/i;

export function isBuyingSignal(message: string): boolean {
  return BUYING_SIGNAL_RE.test(message);
}

export function isSoftDecline(message: string): boolean {
  return SOFT_DECLINE_RE.test(message);
}
