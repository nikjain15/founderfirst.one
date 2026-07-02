/**
 * Bank-reconciliation matcher engine (W1.1) — PURE functions over statement lines
 * and ledger entries. The DB stores only CONFIRMED matches (see the reconciliation
 * schema migration); this module proposes candidates and derives the report, so
 * both the on-screen flow and the tests read one source of truth (no drift).
 *
 * Statement line = an import_rows row (bank_transactions is Plaid-fed, lands W2.3;
 * until then we reconcile against import_rows, per the W1.1 card). Its
 * `amount_minor` is signed: +money in, −money out. We match a statement line to a
 * ledger entry by the movement on the reconciled bank account: the entry's net on
 * that account (Σ debits − Σ credits, i.e. debit-positive) must equal the
 * statement line's signed amount, within a date window.
 *
 * Matching is two-pass:
 *   EXACT  — same signed amount AND same date. Highest trust; auto-applied.
 *   FUZZY  — same signed amount within ±`windowDays`. Proposed, CPA confirms.
 * A statement line and a ledger entry each match at most once (greedy, nearest
 * date first), mirroring the DB's live-match unique indexes.
 *
 * All amounts are integer minor units (cents) — never float (ARCHITECTURE.md §6.1).
 */
import type { JournalEntry } from "./types";

export type MatchKind = "exact" | "fuzzy" | "manual";

/** A bank statement line to reconcile (subset of import_rows). */
export interface StatementLine {
  id: string; // import_rows.id
  txn_date: string; // YYYY-MM-DD
  description: string | null;
  amount_minor: number; // signed: +in / −out
}

/** A candidate pairing the matcher proposes. */
export interface MatchCandidate {
  import_row_id: string;
  entry_id: string;
  kind: Exclude<MatchKind, "manual">;
  amount_minor: number; // the statement line's signed amount
  dateDelta: number; // |days| between statement line and entry date (0 for exact)
}

/** Whole-day difference between two YYYY-MM-DD dates (UTC, calendar days). */
export function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.round(Math.abs(ms) / 86_400_000);
}

/**
 * The debit-positive net an entry moves on a given account (Σ D − Σ C on that
 * account's lines). For a bank/cash asset account this is the signed cash flow:
 * a deposit (debit to cash) is positive, a withdrawal (credit) negative — the
 * same sign convention as a bank statement line's `amount_minor`.
 */
export function entryNetOnAccount(entry: JournalEntry, accountId: string): number {
  let net = 0;
  for (const l of entry.lines ?? []) {
    if (l.account_id !== accountId) continue;
    net += l.side === "D" ? l.amount_minor : -l.amount_minor;
  }
  return net;
}

/** A ledger entry reduced to what the matcher needs: its net on the bank account. */
export interface EntryMovement {
  entry_id: string;
  entry_date: string;
  net_minor: number; // debit-positive net on the reconciled account
}

/** Entries that actually touch the account, still in the books, with a nonzero net. */
export function movementsForAccount(entries: JournalEntry[], accountId: string): EntryMovement[] {
  const out: EntryMovement[] = [];
  for (const e of entries) {
    if (e.status === "pending_review") continue; // not in the books
    if (e.status === "reversed") continue; // a reversed entry can't clear a line
    const net = entryNetOnAccount(e, accountId);
    if (net === 0) continue;
    out.push({ entry_id: e.id, entry_date: e.entry_date, net_minor: net });
  }
  return out;
}

export interface AutoMatchInput {
  lines: StatementLine[];
  movements: EntryMovement[];
  windowDays?: number; // fuzzy date window, default 4
  alreadyMatchedRowIds?: Iterable<string>; // import_row_ids already confirmed
  alreadyMatchedEntryIds?: Iterable<string>; // entry_ids already confirmed
}

export interface AutoMatchResult {
  candidates: MatchCandidate[]; // proposed pairings (exact first, then fuzzy)
  unmatchedLines: StatementLine[]; // statement lines with no candidate
  unmatchedMovements: EntryMovement[]; // ledger movements with no candidate
}

/**
 * Two-pass greedy auto-match. EXACT (amount + same date) first, then FUZZY
 * (amount within ±windowDays), nearest date preferred. Each line and each entry
 * is consumed at most once; already-confirmed ids are excluded up front.
 */
export function autoMatch(input: AutoMatchInput): AutoMatchResult {
  const windowDays = input.windowDays ?? 4;
  const usedRows = new Set<string>(input.alreadyMatchedRowIds ?? []);
  const usedEntries = new Set<string>(input.alreadyMatchedEntryIds ?? []);
  const candidates: MatchCandidate[] = [];

  const lines = input.lines.filter((l) => !usedRows.has(l.id));
  const movements = input.movements.filter((m) => !usedEntries.has(m.entry_id));

  // index movements by signed amount for O(1) amount lookup.
  const byAmount = new Map<number, EntryMovement[]>();
  for (const m of movements) {
    const arr = byAmount.get(m.net_minor);
    if (arr) arr.push(m);
    else byAmount.set(m.net_minor, [m]);
  }

  const take = (l: StatementLine, maxDelta: number): MatchCandidate | null => {
    const pool = byAmount.get(l.amount_minor);
    if (!pool) return null;
    let best: EntryMovement | null = null;
    let bestDelta = Infinity;
    for (const m of pool) {
      if (usedEntries.has(m.entry_id)) continue;
      const d = dayDiff(l.txn_date, m.entry_date);
      if (d <= maxDelta && d < bestDelta) { best = m; bestDelta = d; }
    }
    if (!best) return null;
    usedEntries.add(best.entry_id);
    usedRows.add(l.id);
    return {
      import_row_id: l.id,
      entry_id: best.entry_id,
      kind: bestDelta === 0 ? "exact" : "fuzzy",
      amount_minor: l.amount_minor,
      dateDelta: bestDelta,
    };
  };

  // Pass 1: EXACT (delta 0). Pass 2: FUZZY (delta ≤ windowDays) on what's left.
  for (const l of lines) { const c = take(l, 0); if (c) candidates.push(c); }
  for (const l of lines) { if (usedRows.has(l.id)) continue; const c = take(l, windowDays); if (c) candidates.push(c); }

  const unmatchedLines = lines.filter((l) => !usedRows.has(l.id));
  const unmatchedMovements = movements.filter((m) => !usedEntries.has(m.entry_id));
  return { candidates, unmatchedLines, unmatchedMovements };
}

// ── Reconciliation report (opening / cleared / outstanding / closing) ──────────
export interface ConfirmedMatch {
  amount_minor: number; // the cleared statement-line amount (signed)
}

export interface ReconciliationReport {
  opening_minor: number; // statement opening balance
  cleared_minor: number; // Σ confirmed cleared matches
  outstanding_minor: number; // Σ statement lines NOT yet matched
  closing_minor: number; // statement closing balance
  computed_closing_minor: number; // opening + cleared (what the books say cleared to)
  difference_minor: number; // closing − computed_closing; 0 ⇒ ties to the cent
  ties: boolean; // difference is exactly zero
}

/**
 * Derive the reconciliation report. TIES-TO-THE-CENT invariant:
 *   computed_closing = opening + Σ cleared   (integer minor units, no float)
 *   difference       = statement closing − computed_closing
 * A reconciled month has difference === 0. `outstanding` is the sum of statement
 * lines still unmatched — the short list the CPA must resolve to reach zero.
 */
export function reconciliationReport(args: {
  opening_minor: number;
  closing_minor: number;
  confirmed: ConfirmedMatch[];
  outstandingLines: StatementLine[];
}): ReconciliationReport {
  const cleared_minor = args.confirmed.reduce((s, m) => s + m.amount_minor, 0);
  const outstanding_minor = args.outstandingLines.reduce((s, l) => s + l.amount_minor, 0);
  const computed_closing_minor = args.opening_minor + cleared_minor;
  const difference_minor = args.closing_minor - computed_closing_minor;
  return {
    opening_minor: args.opening_minor,
    cleared_minor,
    outstanding_minor,
    closing_minor: args.closing_minor,
    computed_closing_minor,
    difference_minor,
    ties: difference_minor === 0,
  };
}
