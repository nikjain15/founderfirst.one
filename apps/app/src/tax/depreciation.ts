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
  // FINAL-YEAR TRUE-UP — mirror of compute_depreciation_schedule's residual sweep.
  // Per-year Math.floor() strands a few cents of basis; MACRS/SL must recover EXACTLY
  // cost (tax) / cost-salvage (book) over the life or the temporary difference never
  // nets to zero. Sweep the residual into the final line so accumulated == basis.
  const last = out[out.length - 1];
  if (last) {
    last.tax_minor += asset.cost_minor - taxAcc;
    last.book_minor += bookBase - bookAcc;
    last.tax_accumulated_minor = asset.cost_minor;
    last.book_accumulated_minor = bookBase;
    last.book_tax_delta_minor = last.tax_minor - last.book_minor;
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

/**
 * The disposal-YEAR convention fraction of that year's NORMAL depreciation
 * (mirror of disposal_year_fraction in 20260703070200). half-year → 0.5;
 * mid-quarter → the mid-quarter disposal fraction by disposal quarter
 * (Q1 .125, Q2 .375, Q3 .625, Q4 .875 — Pub 946); mid-month → (month-0.5)/12.
 */
export function disposalYearFraction(
  convention: "half_year" | "mid_quarter" | "mid_month" | "full_year",
  disposalMonth: number,
): number {
  if (convention === "mid_quarter") {
    return (Math.floor((disposalMonth - 1) / 3) * 2 + 1) / 8; // .125 … .875
  }
  if (convention === "mid_month") return (disposalMonth - 0.5) / 12;
  return 0.5; // half_year (and default)
}

export interface DisposalResult {
  book_basis_minor: number;
  book_gain_loss_minor: number;
  tax_basis_minor: number;
  tax_gain_loss_minor: number;
  recapture_section: "§1245" | "§1250" | null;
  recapture_minor: number; // ordinary recapture = min(tax gain, tax accumulated)
}

/**
 * IRS-correct disposal (mirror of dispose_fixed_asset in 20260703070200).
 * Adjusted basis = cost − accumulated depreciation THROUGH the disposal year, where
 * the disposal-year depreciation is the year's NORMAL depreciation × the acquisition
 * convention fraction. gain/loss = proceeds − adjusted basis, computed BOOK and TAX
 * separately; on a tax gain, min(gain, tax accumulated) is ordinary §1245/§1250
 * recapture (§1245 personal property, §1250 real property).
 */
export function disposeAsset(args: {
  costMinor: number;
  salvageMinor: number;
  proceedsMinor: number;
  // accumulated through the year BEFORE disposal (whole allowed years):
  bookPriorAccumulatedMinor: number;
  taxPriorAccumulatedMinor: number;
  // the disposal year's NORMAL (unconventioned) depreciation:
  bookDisposalYearFullMinor: number;
  taxDisposalYearFullMinor: number;
  convention: "half_year" | "mid_quarter" | "mid_month" | "full_year";
  disposalMonth: number;
  propertyType?: "personal" | "real";
}): DisposalResult {
  const frac = disposalYearFraction(args.convention, args.disposalMonth);
  const bookDy = Math.floor(args.bookDisposalYearFullMinor * frac);
  const taxDy = Math.floor(args.taxDisposalYearFullMinor * frac);
  const bookAcc = Math.min(
    args.bookPriorAccumulatedMinor + bookDy,
    args.costMinor - args.salvageMinor,
  );
  const taxAcc = Math.min(args.taxPriorAccumulatedMinor + taxDy, args.costMinor);
  const bookBasis = args.costMinor - bookAcc;
  const taxBasis = args.costMinor - taxAcc;
  const bookGl = args.proceedsMinor - bookBasis;
  const taxGl = args.proceedsMinor - taxBasis;
  let recapture = 0;
  let section: "§1245" | "§1250" | null = null;
  if (taxGl > 0) {
    recapture = Math.min(taxGl, taxAcc);
    section = args.propertyType === "real" ? "§1250" : "§1245";
  }
  return {
    book_basis_minor: bookBasis,
    book_gain_loss_minor: bookGl,
    tax_basis_minor: taxBasis,
    tax_gain_loss_minor: taxGl,
    recapture_section: section,
    recapture_minor: recapture,
  };
}
