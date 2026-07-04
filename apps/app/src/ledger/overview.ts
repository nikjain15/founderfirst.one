/**
 * Overview takeaway derivations — pure and React-free (same discipline as
 * homePulse.ts) so the takeaway logic is unit-testable in node without a DOM.
 *
 * PENNY-UX F8: the "no activity" takeaway used to derive from P&L income/expense
 * only, so balance-sheet-only books (opening balances, transfers) read as "No
 * activity yet" while the "Latest activity" panel directly beneath it listed
 * posted entries. The honesty contract is symmetry with that panel: the takeaway
 * may claim "no activity" only when the panel would show "No entries yet." — i.e.
 * when the book has no journal entries at all.
 */
import type { JournalEntry } from "./types";

/** Any journal entry counts as activity — matches the Latest-activity panel. */
export function hasLedgerActivity(entries: JournalEntry[]): boolean {
  return entries.length > 0;
}
