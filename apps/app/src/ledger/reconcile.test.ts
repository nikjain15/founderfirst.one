/**
 * W1.1 matcher-engine unit tests — EXACT + FUZZY auto-match, the account-net
 * derivation, and the reconciliation tie-out (opening / cleared / outstanding /
 * closing). Pure functions, no DB. Scenario ids: W1.1-AUTOMATCH, W1.1-TIEOUT.
 */
import { describe, expect, it } from "vitest";
import {
  autoMatch, dayDiff, entryNetOnAccount, movementsForAccount, reconciliationReport,
  type StatementLine,
} from "./reconcile";
import type { JournalEntry } from "./types";

const BANK = "acct-bank";
const REV = "acct-rev";

/** Build a two-line entry: a debit/credit split touching the bank account. */
function entry(
  id: string, date: string, bankMinor: number, side: "D" | "C",
  status: JournalEntry["status"] = "posted",
): JournalEntry {
  return {
    id, entry_date: date, memo: null, status, source: "manual", source_ref: null,
    reverses_id: null, created_at: `${date}T00:00:00Z`,
    lines: [
      { id: `${id}-a`, account_id: BANK, amount_minor: bankMinor, currency: "USD", side, memo: null },
      { id: `${id}-b`, account_id: REV, amount_minor: bankMinor, currency: "USD", side: side === "D" ? "C" : "D", memo: null },
    ],
  };
}

function line(id: string, date: string, amountMinor: number): StatementLine {
  return { id, txn_date: date, description: `line ${id}`, amount_minor: amountMinor };
}

describe("dayDiff", () => {
  it("counts calendar days regardless of order", () => {
    expect(dayDiff("2026-06-01", "2026-06-01")).toBe(0);
    expect(dayDiff("2026-06-05", "2026-06-01")).toBe(4);
    expect(dayDiff("2026-06-01", "2026-06-05")).toBe(4);
  });
});

describe("entryNetOnAccount", () => {
  it("is debit-positive on the account (deposit +, withdrawal −)", () => {
    expect(entryNetOnAccount(entry("e", "2026-06-01", 5000, "D"), BANK)).toBe(5000); // deposit
    expect(entryNetOnAccount(entry("e", "2026-06-01", 5000, "C"), BANK)).toBe(-5000); // withdrawal
    expect(entryNetOnAccount(entry("e", "2026-06-01", 5000, "D"), REV)).toBe(-5000); // contra side
  });
});

describe("movementsForAccount", () => {
  it("excludes pending_review and reversed entries and zero-net entries", () => {
    const es = [
      entry("posted", "2026-06-01", 100, "D"),
      entry("pending", "2026-06-01", 100, "D", "pending_review"),
      entry("reversed", "2026-06-01", 100, "D", "reversed"),
    ];
    const m = movementsForAccount(es, BANK);
    expect(m.map((x) => x.entry_id)).toEqual(["posted"]);
  });
});

describe("autoMatch — W1.1-AUTOMATCH", () => {
  it("matches EXACT (same amount + same date) first", () => {
    const lines = [line("L1", "2026-06-10", 5000)];
    const movements = movementsForAccount([entry("E1", "2026-06-10", 5000, "D")], BANK);
    const res = autoMatch({ lines, movements });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]).toMatchObject({ import_row_id: "L1", entry_id: "E1", kind: "exact", dateDelta: 0 });
    expect(res.unmatchedLines).toHaveLength(0);
  });

  it("matches FUZZY within the date window when no exact exists, nearest date wins", () => {
    const lines = [line("L1", "2026-06-10", 5000)];
    const movements = movementsForAccount([
      entry("E-far", "2026-06-14", 5000, "D"), // delta 4
      entry("E-near", "2026-06-12", 5000, "D"), // delta 2 — should win
    ], BANK);
    const res = autoMatch({ lines, movements, windowDays: 4 });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]).toMatchObject({ entry_id: "E-near", kind: "fuzzy", dateDelta: 2 });
  });

  it("does NOT match outside the window", () => {
    const lines = [line("L1", "2026-06-10", 5000)];
    const movements = movementsForAccount([entry("E1", "2026-06-20", 5000, "D")], BANK); // delta 10
    const res = autoMatch({ lines, movements, windowDays: 4 });
    expect(res.candidates).toHaveLength(0);
    expect(res.unmatchedLines).toHaveLength(1);
    expect(res.unmatchedMovements).toHaveLength(1);
  });

  it("consumes each line and entry at most once; prefers exact over fuzzy for a shared entry", () => {
    // Two lines of the same amount; one entry exact to L1, another fuzzy-only.
    const lines = [line("L1", "2026-06-10", 5000), line("L2", "2026-06-11", 5000)];
    const movements = movementsForAccount([
      entry("E1", "2026-06-10", 5000, "D"), // exact to L1
      entry("E2", "2026-06-13", 5000, "D"), // fuzzy to L2 (delta 2)
    ], BANK);
    const res = autoMatch({ lines, movements, windowDays: 4 });
    expect(res.candidates).toHaveLength(2);
    const byRow = Object.fromEntries(res.candidates.map((c) => [c.import_row_id, c]));
    expect(byRow.L1).toMatchObject({ entry_id: "E1", kind: "exact" });
    expect(byRow.L2).toMatchObject({ entry_id: "E2", kind: "fuzzy" });
  });

  it("excludes already-confirmed rows and entries", () => {
    const lines = [line("L1", "2026-06-10", 5000)];
    const movements = movementsForAccount([entry("E1", "2026-06-10", 5000, "D")], BANK);
    const res = autoMatch({ lines, movements, alreadyMatchedRowIds: ["L1"] });
    expect(res.candidates).toHaveLength(0);
  });

  it("handles withdrawals (negative amounts) with correct sign", () => {
    const lines = [line("L1", "2026-06-10", -2500)]; // money out
    const movements = movementsForAccount([entry("E1", "2026-06-10", 2500, "C")], BANK); // credit to bank
    const res = autoMatch({ lines, movements });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]).toMatchObject({ entry_id: "E1", kind: "exact", amount_minor: -2500 });
  });
});

describe("reconciliationReport — W1.1-TIEOUT", () => {
  it("ties to the cent: closing = opening + Σ cleared", () => {
    const r = reconciliationReport({
      opening_minor: 100_00,
      closing_minor: 150_00,
      confirmed: [{ amount_minor: 30_00 }, { amount_minor: 20_00 }], // +50.00 cleared
      outstandingLines: [],
    });
    expect(r.cleared_minor).toBe(50_00);
    expect(r.computed_closing_minor).toBe(150_00);
    expect(r.difference_minor).toBe(0);
    expect(r.ties).toBe(true);
  });

  it("surfaces the exact difference when a line is still outstanding", () => {
    const r = reconciliationReport({
      opening_minor: 100_00,
      closing_minor: 150_00,
      confirmed: [{ amount_minor: 30_00 }], // only 30 cleared
      outstandingLines: [line("L", "2026-06-10", 20_00)], // 20 still outstanding
    });
    expect(r.cleared_minor).toBe(30_00);
    expect(r.outstanding_minor).toBe(20_00);
    expect(r.computed_closing_minor).toBe(130_00);
    expect(r.difference_minor).toBe(20_00); // exactly the outstanding line
    expect(r.ties).toBe(false);
  });

  it("clearing the outstanding line makes it tie exactly (no float drift)", () => {
    const confirmed = [{ amount_minor: 33_33 }, { amount_minor: 16_67 }]; // 50.00 exactly
    const r = reconciliationReport({ opening_minor: 0, closing_minor: 50_00, confirmed, outstandingLines: [] });
    expect(r.difference_minor).toBe(0);
    expect(r.ties).toBe(true);
  });

  it("handles net-negative statement months (more out than in)", () => {
    const r = reconciliationReport({
      opening_minor: 500_00,
      closing_minor: 300_00,
      confirmed: [{ amount_minor: -200_00 }],
      outstandingLines: [],
    });
    expect(r.computed_closing_minor).toBe(300_00);
    expect(r.ties).toBe(true);
  });
});
