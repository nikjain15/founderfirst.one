/**
 * W1.3-C depreciation engine — MECHANICS ONLY (mirror of the DB compute in
 * supabase/migrations/20260703070100_fixed_asset_rpcs.sql).
 *
 * NO LAW LITERALS live here (check-law-literals): MACRS percentages, the §179 cap,
 * and the bonus % all arrive as DATA (AssetClass / MacrsTable rows loaded from the
 * asset_classes / macrs_percentages seed tables). This file only does the
 * arithmetic the DB also does, so the app can preview a schedule client-side and a
 * test can assert the golden IRS numbers.
 *
 * The DB is the source of truth for a stored schedule; this is the same algorithm
 * for UI preview + unit-testing. Amounts are minor units (cents), integers.
 */

/** A recovery regime for an asset class, as seeded (mirrors asset_classes). */
export interface AssetClassData {
  recovery_period: number; // 3,5,7,10,15,20
  macrs_method: "200DB" | "150DB" | "SL";
  default_convention: "half_year" | "mid_quarter" | "mid_month";
  section_179_cap_minor: number | null;
  bonus_pct: number | null; // e.g. 40 for 2025
}

/** A MACRS percentage table: year_index (1-based) → published percent. */
export type MacrsTable = Record<number, number>;

export interface AssetInput {
  cost_minor: number;
  salvage_minor: number;
  in_service_month: number; // 1-12 (drives the mid-quarter selection)
  book_life_years: number;
  book_convention: "half_year" | "full_year";
  section_179_elected_minor: number;
  bonus_elected: boolean;
}

/** The mid-quarter table family for an in-service month (Q1..Q4 → q4 tables shipped). */
export function midQuarterKey(month: number): string {
  return `mid_quarter_q${Math.floor((month - 1) / 3) + 1}`;
}

/**
 * Tax depreciation for one recovery year (1-based year_index). §179 first (capped
 * at the class's law cap), then bonus on the remainder (at the class bonus %), then
 * MACRS % on what's left. All rates are DATA arguments — nothing law-derived is a
 * literal here.
 */
export function taxDepreciationForYear(
  asset: AssetInput,
  cls: AssetClassData,
  macrs: MacrsTable,
  yearIndex: number,
): number {
  if (yearIndex < 1) return 0;
  const s179 = Math.min(
    asset.section_179_elected_minor,
    cls.section_179_cap_minor ?? asset.cost_minor,
    asset.cost_minor,
  );
  const bonusBasis = asset.cost_minor - s179;
  const bonus =
    asset.bonus_elected && (cls.bonus_pct ?? 0) > 0
      ? Math.floor((bonusBasis * (cls.bonus_pct as number)) / 100)
      : 0;
  const macrsBasis = asset.cost_minor - s179 - bonus;
  const firstYearAddon = yearIndex === 1 ? s179 + bonus : 0;
  if (macrsBasis <= 0) return firstYearAddon;
  const pct = macrs[yearIndex];
  if (pct == null) return firstYearAddon;
  return firstYearAddon + Math.floor((macrsBasis * pct) / 100);
}

/** Straight-line book depreciation for one year, half-year convention aware. */
export function bookDepreciationForYear(asset: AssetInput, yearIndex: number): number {
  if (yearIndex < 1) return 0;
  const base = asset.cost_minor - asset.salvage_minor;
  if (base <= 0) return 0;
  const annual = base / asset.book_life_years;
  const life = asset.book_life_years;
  if (asset.book_convention === "half_year") {
    if (yearIndex === 1) return Math.floor(annual / 2);
    if (yearIndex > 1 && yearIndex <= life) return Math.floor(annual);
    if (yearIndex === Math.floor(life) + 1) return Math.ceil(annual / 2);
    return 0;
  }
  return yearIndex >= 1 && yearIndex <= life ? Math.floor(annual) : 0;
}

export interface ScheduleYear {
  year_index: number;
  book_minor: number;
  tax_minor: number;
  book_accumulated_minor: number;
  tax_accumulated_minor: number;
  book_tax_delta_minor: number; // tax - book (positive = extra tax deduction)
}

/** The full book + tax schedule for an asset, clamped so basis is never over-recovered. */
export function computeSchedule(
  asset: AssetInput,
  cls: AssetClassData,
  macrs: MacrsTable,
): ScheduleYear[] {
  const years = Math.max(Math.ceil(asset.book_life_years), cls.recovery_period) + 1;
  const out: ScheduleYear[] = [];
  let bookAcc = 0;
  let taxAcc = 0;
  const bookBase = asset.cost_minor - asset.salvage_minor;
  for (let i = 1; i <= years; i++) {
    let book = bookDepreciationForYear(asset, i);
    let tax = taxDepreciationForYear(asset, cls, macrs, i);
    if (bookAcc + book > bookBase) book = Math.max(bookBase - bookAcc, 0);
    if (taxAcc + tax > asset.cost_minor) tax = Math.max(asset.cost_minor - taxAcc, 0);
    if (book === 0 && tax === 0 && i > 1) continue;
    bookAcc += book;
    taxAcc += tax;
    out.push({
      year_index: i,
      book_minor: book,
      tax_minor: tax,
      book_accumulated_minor: bookAcc,
      tax_accumulated_minor: taxAcc,
      book_tax_delta_minor: tax - book,
    });
  }
  return out;
}

/** The M-1 bucket a year's book-vs-tax delta drafts into (mirrors draft_depreciation_m1). */
export function m1BucketForDelta(deltaMinor: number): string | null {
  if (deltaMinor === 0) return null;
  return deltaMinor > 0 ? "deduction_on_return_not_books" : "expense_on_books_not_return";
}

/** Gain/loss on disposal: proceeds - net book value (cost - book accumulated). */
export function disposalGainLoss(
  costMinor: number,
  bookAccumulatedMinor: number,
  proceedsMinor: number,
): { book_basis_minor: number; gain_loss_minor: number } {
  const basis = costMinor - bookAccumulatedMinor;
  return { book_basis_minor: basis, gain_loss_minor: proceedsMinor - basis };
}
