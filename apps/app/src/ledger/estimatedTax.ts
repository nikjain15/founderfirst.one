/**
 * W2.4 · Quarterly estimated-tax assistant — pure derivations.
 *
 * The estimate is DERIVED from the org's real ledger P&L (the same entries the
 * Reports tab renders — ties to the cent) plus LAW-DERIVED rate params fetched
 * from the kernel (tax_jurisdictions.params via the estimated_tax_basis RPC). No
 * rate, percentage, or deadline is hardcoded here — every number comes in through
 * `TaxBasis`, which the caller loads from the DB. Change a params row → the
 * estimate changes with no redeploy (the centralization gate).
 *
 * This is an ESTIMATE, surfaced with a clear "not tax advice — confirm with your
 * CPA" disclaimer in the UI. The income-tax component uses a single blended
 * effective rate (a deliberate v1 simplification; a full bracket calc is a later
 * card) — presented as an estimate, never as a filing.
 *
 * Kept React-free so the tie-out logic is unit-testable in node without a DOM,
 * and so the component and the tests read the SAME numbers (the homePulse.ts
 * discipline).
 */
import { profitAndLoss } from "./reports";
import type { JournalEntry } from "./types";

// ── The rate params, as returned by the estimated_tax_basis RPC ──────────────
// Mirrors the year-block shape seeded in the W2.4 migration. All optional so a
// partially-seeded jurisdiction (or a missing year) degrades to "can't estimate"
// rather than throwing — the caller renders an unavailable state, never a wrong
// number.
export interface SelfEmploymentParams {
  net_earnings_factor: number; // Schedule SE factor (e.g. 0.9235)
  rate: number; // combined SE rate (e.g. 0.153)
  ss_wage_base_minor: number; // OASDI cap in minor units
  ss_rate: number; // OASDI portion of `rate`
  medicare_rate: number; // Medicare portion of `rate`
  deduction_factor: number; // fraction of SE tax deductible before income tax
}
export interface IncomeTaxParams {
  effective_rate: number; // blended-effective estimate rate
  note?: string;
}
export interface SafeHarborParams {
  current_year_pct: number; // e.g. 0.90
  prior_year_pct: number; // e.g. 1.00
  prior_year_pct_high_agi?: number; // e.g. 1.10
  high_agi_threshold_minor?: number;
}
export interface SetAsideParams {
  default_pct: number; // owner-facing "set this % aside" guidance
}
export interface CorporateParams {
  effective_rate: number; // flat corporate rate
  safe_harbor_current_year_pct?: number;
  no_self_employment?: boolean;
}
export interface YearParams {
  citation?: string;
  self_employment?: SelfEmploymentParams;
  income_tax?: IncomeTaxParams;
  safe_harbor?: SafeHarborParams;
  set_aside?: SetAsideParams;
  corporate?: CorporateParams;
  state?: YearParams; // a state block folded on top of federal (income_tax + safe_harbor)
}
export interface TaxBasis {
  entity_type: string | null; // kernel entity key ('sole_prop','s_corp',…) or null (no profile)
  jurisdiction_code: string; // 'US-FED' | 'US-CA' | …
  currency: string;
  params: YearParams; // the resolved year block (federal, with state folded in)
}

// Entities whose owner earnings are subject to SE tax on the pass-through profit.
// Kernel keys (entity_types seed). C-corp files its own return (corporate path);
// nonprofit has no estimated income tax. S-corp profit is NOT SE-taxable (owners
// take reasonable wages via payroll, outside this estimate) — so it uses the
// income-tax-only path, same as a shareholder would for the pass-through.
// kernel-ok: tax computation branches on entity tax-regime semantics, not a data
// list. The estimate math is fundamentally different per regime (SE tax on
// pass-through profit vs. the flat corporate path vs. no estimate at all); these
// sets encode that computation, not a UI/display enumeration of entity types.
const SE_ENTITIES = new Set(["sole_prop", "partnership"]);
const CORPORATE_ENTITIES = new Set(["c_corp"]);
const NO_ESTIMATE_ENTITIES = new Set(["nonprofit"]);

export type EstimateStatus =
  | "ok"
  | "no_profile" // org hasn't set an entity type yet (onboarding W3.3)
  | "no_params" // jurisdiction/year not seeded → can't estimate (don't fake it)
  | "no_estimate_entity" // entity doesn't make quarterly estimates (e.g. nonprofit)
  | "no_profit"; // net income ≤ 0 for the period → nothing to estimate

export interface EstimateComponent {
  key: "self_employment" | "federal_income" | "state_income" | "corporate";
  labelKey: string; // a COPY key the component resolves (no literals here)
  amountMinor: number;
}

export interface EstimateResult {
  status: EstimateStatus;
  taxYear: number;
  netIncomeMinor: number; // the P&L net income the estimate is grounded on (ties to Reports)
  components: EstimateComponent[];
  totalAnnualMinor: number; // total estimated annual tax
  perQuarterMinor: number; // even split across 4 quarters (safe-harbor method)
  setAsidePct: number | null; // recommended set-aside % of income (0–1), from params
  setAsideMinor: number; // setAsidePct × income (guidance figure)
  citation: string | null;
}

/** Round a minor-unit product to the nearest cent using integer-safe math. */
function applyRate(minor: number, rate: number): number {
  return Math.round(minor * rate);
}

/**
 * The core estimate. Grounded on `netIncomeMinor` (a P&L figure from the ledger)
 * and `basis` (the law-derived params). Pure — no dates, no fetch, no rate
 * literals. `taxYear` is passed in (the caller derives it; nothing hardcoded).
 */
export function estimateFromNetIncome(
  netIncomeMinor: number,
  basis: TaxBasis,
  taxYear: number,
): EstimateResult {
  const empty = (status: EstimateStatus): EstimateResult => ({
    status,
    taxYear,
    netIncomeMinor,
    components: [],
    totalAnnualMinor: 0,
    perQuarterMinor: 0,
    setAsidePct: basis.params.set_aside?.default_pct ?? null,
    setAsideMinor: 0,
    citation: basis.params.citation ?? null,
  });

  const entity = basis.entity_type;
  if (!entity) return empty("no_profile");
  if (NO_ESTIMATE_ENTITIES.has(entity)) return empty("no_estimate_entity");

  const p = basis.params;
  const isCorp = CORPORATE_ENTITIES.has(entity);

  // A jurisdiction/year with no usable params can't be estimated — never fake it.
  const hasFedParams = isCorp ? Boolean(p.corporate) : Boolean(p.income_tax);
  if (!hasFedParams) return empty("no_params");

  if (netIncomeMinor <= 0) return { ...empty("no_profit") };

  const components: EstimateComponent[] = [];

  if (isCorp) {
    // C-corp: flat corporate rate on the entity's own profit. No SE tax.
    const rate = p.corporate!.effective_rate;
    const corp = applyRate(netIncomeMinor, rate);
    components.push({ key: "corporate", labelKey: "corporate", amountMinor: corp });
  } else {
    // Pass-through owner estimate: SE tax (sole-prop / partnership) + income tax.
    let incomeTaxBase = netIncomeMinor;

    if (SE_ENTITIES.has(entity) && p.self_employment) {
      const se = p.self_employment;
      const seEarnings = applyRate(netIncomeMinor, se.net_earnings_factor);
      // SS portion is capped at the wage base; Medicare portion is uncapped.
      const ssBase = Math.min(seEarnings, se.ss_wage_base_minor);
      const ssTax = applyRate(ssBase, se.ss_rate);
      const medicareTax = applyRate(seEarnings, se.medicare_rate);
      const seTax = ssTax + medicareTax;
      components.push({ key: "self_employment", labelKey: "selfEmployment", amountMinor: seTax });
      // Half the SE tax is deductible before income tax.
      incomeTaxBase = netIncomeMinor - applyRate(seTax, se.deduction_factor);
    }

    // Federal income tax (blended-effective estimate).
    const fedRate = p.income_tax!.effective_rate;
    const fedTax = applyRate(incomeTaxBase, fedRate);
    components.push({ key: "federal_income", labelKey: "federalIncome", amountMinor: fedTax });

    // State income tax, if the org's jurisdiction carries a state block.
    if (p.state?.income_tax) {
      const stateTax = applyRate(incomeTaxBase, p.state.income_tax.effective_rate);
      components.push({ key: "state_income", labelKey: "stateIncome", amountMinor: stateTax });
    }
  }

  const totalAnnualMinor = components.reduce((s, c) => s + c.amountMinor, 0);

  // Safe-harbor method: the current-year safe-harbor fraction of the estimated
  // liability, paid evenly across four quarters. The fraction is a param (corps
  // and individuals differ), never a literal.
  const shPct = isCorp
    ? p.corporate!.safe_harbor_current_year_pct ?? p.safe_harbor?.current_year_pct ?? 1
    : p.safe_harbor?.current_year_pct ?? 1;
  const safeHarborAnnual = applyRate(totalAnnualMinor, shPct);
  const perQuarterMinor = Math.round(safeHarborAnnual / 4);

  const setAsidePct = p.set_aside?.default_pct ?? null;
  const setAsideMinor = setAsidePct != null ? applyRate(netIncomeMinor, setAsidePct) : 0;

  return {
    status: "ok",
    taxYear,
    netIncomeMinor,
    components,
    totalAnnualMinor,
    perQuarterMinor,
    setAsidePct,
    setAsideMinor,
    citation: p.citation ?? null,
  };
}

/**
 * Convenience: estimate for a calendar tax year straight from ledger entries.
 * Filters the P&L to entries dated within `taxYear` (year-to-date if the year is
 * in progress) — the same profitAndLoss the Reports tab uses, so the net income
 * ties to Reports to the cent. `taxYear` comes from the caller (an `asOf` date),
 * never a hardcoded year.
 */
export function estimateForYear(
  entries: JournalEntry[],
  basis: TaxBasis,
  taxYear: number,
): EstimateResult {
  const yearStr = String(taxYear);
  const pnl = profitAndLoss(entries, (d) => d.slice(0, 4) === yearStr);
  return estimateFromNetIncome(pnl.netIncome, basis, taxYear);
}

// ── Deadline / penalty warning ───────────────────────────────────────────────
// A quarterly-estimate deadline (from the kernel's upcoming_filing_deadlines,
// kind='estimate') combined with the per-quarter figure. The penalty warning is
// purely date-driven off the kernel deadline — no hardcoded calendar. `warnWithin`
// (days) may come from behavior config; defaulted here so a caller can pass it.

export interface EstimateDeadline {
  obligation_key: string; // e.g. 'q2_estimate'
  label: string;
  due_date: string; // YYYY-MM-DD
  days_until: number;
  citation: string | null;
}

export type PenaltyLevel = "none" | "soon" | "overdue";

/**
 * Classify the nearest estimate deadline for a penalty nudge:
 *   overdue  → the deadline has passed (days_until < 0) and a payment is owed
 *   soon     → within `warnWithinDays` of the deadline
 *   none     → nothing imminent
 * Only warns when there is actually an estimated amount owed (perQuarterMinor > 0).
 */
export function penaltyLevel(
  deadline: EstimateDeadline | null,
  perQuarterMinor: number,
  warnWithinDays: number,
): PenaltyLevel {
  if (!deadline || perQuarterMinor <= 0) return "none";
  if (deadline.days_until < 0) return "overdue";
  if (deadline.days_until <= warnWithinDays) return "soon";
  return "none";
}

/** Pick the nearest quarterly-estimate deadline from a kernel deadline list. */
export function nextEstimateDeadline(
  deadlines: { obligation_key: string; kind: string; label: string; due_date: string; days_until: number; citation: string | null }[],
): EstimateDeadline | null {
  const estimates = deadlines
    .filter((d) => d.kind === "estimate")
    .sort((a, b) => a.days_until - b.days_until);
  const d = estimates[0];
  return d
    ? { obligation_key: d.obligation_key, label: d.label, due_date: d.due_date, days_until: d.days_until, citation: d.citation }
    : null;
}
