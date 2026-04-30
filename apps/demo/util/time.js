/**
 * util/time.js — date and time helpers.
 *
 * Every screen eventually has to format a date. Doing it in-line leads to
 * inconsistency ("Apr 22" vs "April 22, 2026" vs "22/04/2026"). One
 * helper file, one set of rules.
 *
 * Rules:
 * - American English formats everywhere (per CLAUDE.md).
 * - Relative time up to 7 days ("2 hours ago"); absolute after that
 *   ("Apr 16").
 * - Never show seconds to the user — bookkeeping is not real-time.
 * - All helpers accept Date | string | number and return strings.
 */

/**
 * Coerce anything into a Date. Returns null if the value is not a valid date
 * rather than throwing — the caller decides how to render the absence.
 */
export function toDate(value) {
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (value === null || value === undefined) return null;
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

/**
 * "Apr 22" / "Apr 22, 2025" (year added if different from current year).
 */
export function formatShortDate(value, now = new Date()) {
  const d = toDate(value);
  if (!d) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  const opts = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return new Intl.DateTimeFormat("en-US", opts).format(d);
}

/**
 * "April 22, 2026" — used on invoices and formal surfaces.
 */
export function formatLongDate(value) {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/**
 * "2 hours ago" / "yesterday" / "Apr 16" — the default for transaction lists.
 */
export function formatRelative(value, now = new Date()) {
  const d = toDate(value);
  if (!d) return "";

  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  const diffHr = Math.round(diffMs / 3_600_000);
  const diffDay = Math.round(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return formatShortDate(d, now);
}

/**
 * Turn a cents-or-dollars number into "$1,234.50". Negative values use a
 * minus sign, not parens — cleaner on mobile.
 */
export function formatMoney(amount, { currency = "USD" } = {}) {
  if (typeof amount !== "number" || isNaN(amount)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}
