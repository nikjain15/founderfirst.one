/**
 * Money lives as integer minor units (cents) in a bigint column — never float
 * (ARCHITECTURE.md §6.1). Format only at the edge; parse user input back to minor
 * units for the write-path. Pilot magnitudes fit safely in a JS number.
 */
export function formatMoney(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format((minor || 0) / 100);
}

/** Compact form for headline numbers ("$12,400"), no cents. */
export function formatMoneyShort(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((minor || 0) / 100);
}

/** Parse a typed dollar amount (e.g. "1,234.50") to minor units. null if invalid. */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = String(input).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
