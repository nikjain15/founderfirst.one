/**
 * RV2-A1 — the return WORKSHEET per form (roadmap-v2 Candidate A, step 1).
 *
 * The mission: "a CPA files taxes directly from Penny, no re-keying." Step 1 is the
 * TRUST surface — a review-ready worksheet where every return line traces back to the
 * exact ledger entries that produced it ("show your work"). This is a PROJECTION over
 * the ledger; it never mutates the books (ARCHITECTURE §6.5, same stance as reports).
 *
 * It sits ON TOP of the seeded Wave-1 tax mapping engine:
 *   - line metadata  ← tax_form_lines (seeded; NO law literals live here)
 *   - account→line   ← resolve_account_tax_lines() (CPA override > seed rule > unmapped)
 *   - amounts        ← the org's journal entries (posted + reversed, per reports.ts)
 *
 * Where engine.mapReturn() traces a line down to the ACCOUNTS feeding it, the
 * worksheet goes one level deeper — down to the individual JOURNAL ENTRIES — so a
 * reviewer can drill from a line straight to the transactions behind it. The two are
 * consistent by construction: a line's amount == Σ of its account balances ==
 * Σ of its traced entry contributions (the tie-out assertion below and in the tests).
 *
 * Pure functions over DATA (no React, no law facts) so the tie-out is unit-testable
 * in the node env and check-law-literals stays clean.
 */
import type { JournalEntry } from "../ledger/types";
import type { AccountResolution, TaxFormLine, ResolvedBy, TaxSection, LineKind } from "./types";

/** Posting convention shared with reports.ts: an entry is "in the books" unless it is
 *  still pending review. Reversed entries stay (offset by their reversal) so the
 *  worksheet nets to the same figure the trial balance / P&L show. */
const inBooks = (e: JournalEntry) => e.status !== "pending_review";

/** Signed natural-side contribution of one journal line, in minor units. Income and
 *  equity/liability are credit-normal (credit positive); asset/expense are debit-normal
 *  (debit positive). Matches accountBalances()/profitAndLoss() so the worksheet ties to
 *  those reports to the cent. Falls back to debit-normal when the account type is
 *  unknown (same default as reports.ts). */
function naturalContribution(
  side: "D" | "C",
  amount_minor: number,
  type: AccountResolution["account_type"] | undefined,
): number {
  const creditNormal = type === "income" || type === "liability" || type === "equity";
  const debit = side === "D" ? amount_minor : -amount_minor;
  return creditNormal ? -debit : debit;
}

/** One journal entry's contribution to a single return line — the drill-down row. */
export interface WorksheetSource {
  entry_id: string;
  entry_date: string;
  memo: string | null;
  account_id: string;
  account_code: string | null;
  account_name: string;
  /** signed, natural-side minor units this entry contributes to the line */
  amount_minor: number;
}

/** A single computed return line with full traceability to the ledger. */
export interface WorksheetLine {
  line_key: string;      // stable semantic key (survives annual re-seeds)
  line_code: string | null; // display line number ('8','24b','L·1') — null for info lines
  label: string;
  section: TaxSection;
  sort_order: number;
  kind: LineKind;
  amount_minor: number;  // Σ of source_entries[].amount_minor (ties to the books)
  source_entries: WorksheetSource[]; // the exact ledger entries behind this line
  resolved_by: ResolvedBy | "seed"; // how the feeding accounts were mapped ('override'|'rule'|'seed')
}

/** An account whose activity has no return line — surfaced, never silently dropped
 *  (research §B.0.4). A worksheet with any unmapped account is NOT review-ready. */
export interface WorksheetUnmapped {
  account_id: string;
  account_code: string | null;
  account_name: string;
  amount_minor: number;
  source_entries: WorksheetSource[];
}

export interface Worksheet {
  jurisdiction_code: string;
  form_code: string;
  entity_type: string;
  tax_year: number;
  form_name: string;
  lines: WorksheetLine[];
  unmapped: WorksheetUnmapped[];
  totalMappedMinor: number;
  totalUnmappedMinor: number;
  /** true iff every account with activity landed on a defined line (unmapped empty).
   *  A worksheet gates review/handoff on this (research §B.2 package-ready gate). */
  reviewReady: boolean;
}

/**
 * Inclusive calendar-year entry-date predicate for a given tax year: keeps entries
 * dated on-or-within [YYYY-01-01 .. YYYY-12-31]. Entry dates are ISO 'YYYY-MM-DD'
 * strings (lexicographically ordered), so a plain string compare is exact — no Date
 * parsing / timezone drift. This is the scoping the Filing surface MUST apply so a
 * form's lines only carry that year's activity (see Filing.tsx). Pure date math, no
 * law facts (fiscal-year returns are a later refinement).
 */
export function taxYearDateFilter(taxYear: number): (entryDate: string) => boolean {
  const lo = `${taxYear}-01-01`;
  const hi = `${taxYear}-12-31`;
  return (d) => d >= lo && d <= hi;
}

/**
 * Build the return worksheet for one org × form × tax-year, tracing each line down to
 * the journal entries behind it.
 *
 * @param meta        form identity (from the resolved tax_form row — no literals)
 * @param lines       the form's seeded lines (tax_form_lines)
 * @param resolutions per-account tax-line resolution (resolve_account_tax_lines output)
 * @param entries     the org's journal entries (already RLS-scoped + paginated)
 * @param dateFilter  optional entry-date predicate to scope to the tax period
 */
export function buildWorksheet(
  meta: {
    jurisdiction_code: string; form_code: string; entity_type: string;
    tax_year: number; form_name: string;
  },
  lines: TaxFormLine[],
  resolutions: AccountResolution[],
  entries: JournalEntry[],
  dateFilter?: (entryDate: string) => boolean,
): Worksheet {
  const lineByKey = new Map(lines.map((l) => [l.line_key, l]));
  const resByAccount = new Map(resolutions.map((r) => [r.account_id, r]));

  // Accumulators, created lazily so an all-zero line still renders (full form shape).
  const lineAgg = new Map<string, WorksheetLine>();
  const unmappedAgg = new Map<string, WorksheetUnmapped>();

  const ensureLine = (key: string): WorksheetLine | null => {
    const existing = lineAgg.get(key);
    if (existing) return existing;
    const l = lineByKey.get(key);
    if (!l) return null; // resolution pointed at a line the form doesn't define → treat as unmapped
    const wl: WorksheetLine = {
      line_key: l.line_key, line_code: l.line_code, label: l.label, section: l.section,
      sort_order: l.sort_order, kind: l.kind, amount_minor: 0, source_entries: [],
      resolved_by: "seed",
    };
    lineAgg.set(key, wl);
    return wl;
  };

  for (const e of entries) {
    if (!inBooks(e)) continue;
    if (dateFilter && !dateFilter(e.entry_date)) continue;
    for (const jl of e.lines ?? []) {
      const r = resByAccount.get(jl.account_id);
      // An account with no resolution row at all is out of scope for this form
      // (e.g. a balance-sheet account on an income-only Schedule C) — skip it, it is
      // neither mapped nor a review-blocking unmapped item.
      if (!r) continue;
      const contribution = naturalContribution(jl.side, jl.amount_minor, r.account_type);
      if (contribution === 0) continue;
      const src: WorksheetSource = {
        entry_id: e.id, entry_date: e.entry_date, memo: e.memo,
        account_id: r.account_id, account_code: r.account_code, account_name: r.account_name,
        amount_minor: contribution,
      };
      const line = r.resolved_by !== "unmapped" && r.line_key ? ensureLine(r.line_key) : null;
      if (line) {
        line.amount_minor += contribution;
        line.source_entries.push(src);
        // most specific resolution wins for the badge: an override beats a seed rule
        if (r.resolved_by === "override") line.resolved_by = "override";
        else if (line.resolved_by === "seed" && r.resolved_by === "rule") line.resolved_by = "rule";
      } else {
        const cur = unmappedAgg.get(r.account_id) ?? {
          account_id: r.account_id, account_code: r.account_code,
          account_name: r.account_name, amount_minor: 0, source_entries: [],
        };
        cur.amount_minor += contribution;
        cur.source_entries.push(src);
        unmappedAgg.set(r.account_id, cur);
      }
    }
  }

  // Include every seeded line (even zero-amount) so the artifact shows the full form
  // shape, ordered by the form's own sort order.
  for (const l of lines) ensureLine(l.line_key);
  const outLines = [...lineAgg.values()].sort((a, b) => a.sort_order - b.sort_order);
  const unmapped = [...unmappedAgg.values()].sort((a, b) => Math.abs(b.amount_minor) - Math.abs(a.amount_minor));

  const totalMappedMinor = outLines.reduce((s, l) => s + l.amount_minor, 0);
  const totalUnmappedMinor = unmapped.reduce((s, u) => s + u.amount_minor, 0);

  return {
    ...meta, lines: outLines, unmapped,
    totalMappedMinor, totalUnmappedMinor,
    reviewReady: unmapped.length === 0,
  };
}

/**
 * The tie-out invariant, exposed for the UI + tests: for every line, the sum of its
 * traced source-entry contributions must equal the line's stated amount, and likewise
 * for each unmapped account. If this ever returns false the worksheet is NOT
 * trustworthy and must not be handed off (this is the whole point of the surface).
 */
export function worksheetTiesOut(ws: Worksheet): boolean {
  const tie = (amount: number, sources: WorksheetSource[]) =>
    amount === sources.reduce((s, x) => s + x.amount_minor, 0);
  return ws.lines.every((l) => tie(l.amount_minor, l.source_entries))
    && ws.unmapped.every((u) => tie(u.amount_minor, u.source_entries));
}
