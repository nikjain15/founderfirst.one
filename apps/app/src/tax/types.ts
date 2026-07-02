/**
 * W1.3-B tax mapping engine — shared shapes (read side).
 *
 * The engine is a PROJECTION over the ledger (research §B.0.3): it never mutates
 * the books. It takes a resolved account->line map (from resolve_account_tax_lines
 * in the DB) + account balances (from apps/app/src/ledger/reports.ts) and produces
 * per-form-line amounts, the M-1 draft, and export artifacts.
 *
 * No law literals live here (check-law-literals): deductibility %, thresholds, line
 * numbers all arrive as DATA on TaxFormLine / from the seeded tables. This file is
 * mechanics only.
 */
import type { AccountType } from "../ledger/types";

export type TaxSection =
  | "income" | "cogs" | "deductions" | "balance_sheet" | "equity_rollforward" | "info";
export type LineKind = "amount" | "computed" | "subtotal" | "info";
export type ResolvedBy = "override" | "rule" | "unmapped";

/** A form line, as seeded (mirrors tax_form_lines). */
export interface TaxFormLine {
  line_key: string;
  line_code: string | null;
  label: string;
  section: TaxSection;
  sort_order: number;
  kind: LineKind;
  deductible_pct: number | null; // null = 100
  flows_to: string | null; // null | a form name | 'disallowed'
  notes?: string | null;
}

/** One account's resolution (mirrors resolve_account_tax_lines output). */
export interface AccountResolution {
  account_id: string;
  account_code: string | null;
  account_name: string;
  account_type: AccountType;
  line_key: string | null; // null == unmapped
  resolved_by: ResolvedBy;
  match_detail: string;
}

/** An account's signed balance for the period, in minor units (from ledger reports). */
export interface AccountAmount {
  account_id: string;
  /** Signed to the account's natural side: income credit-normal, expense/asset
   *  debit-normal — matches profitAndLoss()/accountBalances() conventions. The
   *  engine sums these onto lines as-is (a return line carries a natural-sign total). */
  amount_minor: number;
}

/** A computed form line with its rolled-up amount + the accounts feeding it. */
export interface MappedLine {
  line_key: string;
  line_code: string | null;
  label: string;
  section: TaxSection;
  sort_order: number;
  kind: LineKind;
  deductible_pct: number | null;
  flows_to: string | null;
  amount_minor: number; // Σ of feeding account amounts (book basis; M-1 applies deductibility)
  accounts: Array<{ account_id: string; account_code: string | null; account_name: string; amount_minor: number }>;
}

/** The full mapped return for one org × form × year. */
export interface MappedReturn {
  jurisdiction_code: string;
  form_code: string;
  entity_type: string;
  tax_year: number;
  form_name: string;
  lines: MappedLine[];
  unmapped: Array<{ account_id: string; account_code: string | null; account_name: string; amount_minor: number }>;
  /** tie-out: Σ of every account amount that landed on a line + unmapped == the TB
   *  total for those accounts. package generation gates on unmapped.length === 0. */
  totalMappedMinor: number;
  totalUnmappedMinor: number;
}

/** M-1 bucket keys (mirror tax_adjustments.m1_bucket). */
export type M1Bucket =
  | "income_on_books_not_return"
  | "expense_on_books_not_return"
  | "income_on_return_not_books"
  | "deduction_on_return_not_books";

/** A drafted (proposed) M-1 adjustment — mechanical, Penny-proposable. */
export interface M1Draft {
  m1_bucket: M1Bucket;
  kind: "permanent" | "temporary";
  amount_minor: number; // positive; bucket carries direction
  line_key: string | null;
  memo: string;
  origin_kind: string; // 'meals_disallowance' | 'penalties' | ...
  origin_ref: string; // idempotency key, e.g. 'meals:2025'
}

/** The Schedule M-1 reconciliation, computed from book net income + approved adjustments. */
export interface ScheduleM1 {
  bookNetIncomeMinor: number;
  additions: Array<{ bucket: M1Bucket; kind: string; amount_minor: number }>;
  subtractions: Array<{ bucket: M1Bucket; kind: string; amount_minor: number }>;
  taxableIncomeMinor: number; // book net + additions − subtractions
}
