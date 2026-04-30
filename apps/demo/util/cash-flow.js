/**
 * util/cashFlow.js — Ledger row → GAAP cash flow bucket mapper.
 *
 * Usage: categorizeCashFlow(category) → "operating" | "investing" | "financing"
 *
 * Mapping rules (per Step 7e spec):
 *   income categories          → operating (positive)
 *   expense categories         → operating (negative) EXCEPT:
 *     "Equipment*", "Furniture*", "Vehicle*" → investing
 *     "Loan payment*", "Owner's draw*", "Owner contribution*" → financing
 */

const INVESTING_PATTERNS = ["equipment", "furniture", "vehicle"];

const FINANCING_PATTERNS = [
  "loan payment",
  "owner's draw",
  "owner draw",
  "owner contribution",
  "estimated tax payment", // non-deductible personal tax payment
];

/**
 * Returns "operating" | "investing" | "financing" for a given category string.
 * Income categories (passed as type:"income") are always operating.
 */
export function categorizeCashFlow(category) {
  if (!category) return "operating";
  const lower = category.toLowerCase();
  for (const p of INVESTING_PATTERNS) {
    if (lower.includes(p)) return "investing";
  }
  for (const p of FINANCING_PATTERNS) {
    if (lower.includes(p)) return "financing";
  }
  return "operating";
}
