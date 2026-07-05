/** Shared ledger row shapes (read side). Mirrors the Phase 2 schema; kept hand-
 *  typed until apps/app adopts a generated Database type (see supabase.ts). */
export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type EntryStatus = "posted" | "pending_review" | "reversed";
export type PeriodStatus = "open" | "closed";
export type Side = "D" | "C";

export interface LedgerAccount {
  id: string;
  code: string | null;
  name: string;
  type: AccountType;
  parent_id: string | null;
  currency: string;
  is_archived: boolean;
}

export interface JournalLine {
  id: string;
  account_id: string;
  amount_minor: number;
  currency: string;
  side: Side;
  memo: string | null;
  account?: Pick<LedgerAccount, "code" | "name" | "type"> | null;
  /**
   * The org's home-currency equivalent (W5.4 multi-currency). Optional on the
   * type — historical/legacy rows and every existing test fixture omit it —
   * but the write-path always populates it in the DB (equal to amount_minor
   * for a home-currency line, fx_rate * amount_minor otherwise). Reports fall
   * back to amount_minor when absent, so a single-currency org sees zero
   * change (docs/plans/multi-currency-design.md §6).
   */
  base_amount_minor?: number;
  fx_rate?: number | null;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  memo: string | null;
  status: EntryStatus;
  source: string;
  source_ref: string | null;
  reverses_id: string | null;
  created_at: string;
  lines: JournalLine[];
}

export interface AccountingPeriod {
  id: string;
  period_start: string;
  period_end: string;
  status: PeriodStatus;
  closed_at: string | null;
}

export const ACCOUNT_TYPES: AccountType[] = [
  "asset", "liability", "equity", "income", "expense",
];

/** A draft journal line in the new-entry form (UI state). */
export interface DraftLine {
  account_id: string;
  side: Side;
  amount: string; // typed dollars, parsed to minor on submit
  memo: string;
}
