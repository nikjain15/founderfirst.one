import { describe, it, expect } from "vitest";
import {
  emptyState, ingest, netAmount, liveAmountFor, type LedgerState,
} from "./plaidStateMachine";

// The state machine is the executable spec of plaid_ingest_transactions (Roadmap
// §W2.3). These tests prove the acceptance rules: exactly-once ingest,
// replay-safe webhooks, and reversal-based pending/posted/removed/modified.
//
// Amount convention (mirrors _shared/plaid.ts toSignedMinor): Plaid amount>0 is an
// OUTFLOW → negative minor here (money leaves the bank); amount<0 → positive.
const toSignedMinor = (plaidAmount: number) => -Math.round(plaidAmount * 100);

const add = (id: string, amount: number, date = "2026-07-01", pending = false) =>
  ({ transaction_id: id, amount_minor: amount, date, pending });

describe("plaid amount convention", () => {
  it("Plaid outflow (amount>0) becomes negative minor (money leaves bank)", () => {
    expect(toSignedMinor(12.34)).toBe(-1234);
  });
  it("Plaid inflow (amount<0) becomes positive minor (money into bank)", () => {
    expect(toSignedMinor(-50)).toBe(5000);
  });
});

describe("W2.3-LINK · a new transaction lands exactly once", () => {
  it("adds one ledger entry and one bank row", () => {
    const s = emptyState();
    ingest(s, { added: [add("t1", -2500)] });
    expect(s.rows.size).toBe(1);
    expect(s.entries.size).toBe(1);
    expect(liveAmountFor(s, "t1")).toBe(-2500);
    expect(netAmount(s)).toBe(-2500);
  });
});

describe("W2.3-REPLAY · a duplicate webhook is a no-op", () => {
  it("re-ingesting the same added page adds nothing", () => {
    const s = emptyState();
    const page = { added: [add("t1", -2500), add("t2", 4000)] };
    ingest(s, page);
    const before = { rows: s.rows.size, entries: s.entries.size, net: netAmount(s) };
    ingest(s, page);        // Plaid retries — at-least-once delivery
    ingest(s, page);        // and again
    expect(s.rows.size).toBe(before.rows);
    expect(s.entries.size).toBe(before.entries);
    expect(netAmount(s)).toBe(before.net);
  });

  it("the same transaction_id across two sync pages does not double-post", () => {
    const s = emptyState();
    ingest(s, { added: [add("t1", -1000)] });
    ingest(s, { added: [add("t1", -1000)] }); // e.g. overlapping cursor pages
    expect(s.entries.size).toBe(1);
    expect(netAmount(s)).toBe(-1000);
  });
});

describe("W2.3 · pending → posted", () => {
  it("promoting a pending txn with no amount change moves no money", () => {
    const s = emptyState();
    ingest(s, { added: [add("t1", -1000, "2026-07-01", true)] });
    expect(s.rows.get("t1")!.state).toBe("pending");
    ingest(s, { modified: [add("t1", -1000, "2026-07-01", false)] });
    expect(s.rows.get("t1")!.state).toBe("posted");
    expect(s.entries.size).toBe(1);       // no reversal, no new entry
    expect(netAmount(s)).toBe(-1000);
  });
});

describe("W2.3 · modified (amount change) via reversal + repost", () => {
  it("reverses the old entry and posts a corrected one; net = new amount", () => {
    const s = emptyState();
    ingest(s, { added: [add("t1", -1000)] });
    ingest(s, { modified: [add("t1", -1250)] });   // amount corrected upward
    // original reversed, reversal entry, plus new versioned entry = 3 entries
    expect(s.entries.size).toBe(3);
    expect(liveAmountFor(s, "t1")).toBe(-1250);
    expect(netAmount(s)).toBe(-1250);              // ties to the corrected amount
  });

  it("no posted entry is mutated in place (original amount preserved on the record)", () => {
    const s = emptyState();
    ingest(s, { added: [add("t1", -1000)] });
    const origKey = s.rows.get("t1")!.entryKey!;
    ingest(s, { modified: [add("t1", -1250)] });
    const orig = s.entries.get(origKey)!;
    expect(orig.amount_minor).toBe(-1000);         // untouched
    expect(orig.reversedByKey).toBeTruthy();       // cancelled by a reversal, not edited
  });
});

describe("W2.3-REMOVED · a removed txn reverses its entry, never deletes", () => {
  it("reversal nets the transaction to zero and marks the row removed", () => {
    const s = emptyState();
    ingest(s, { added: [add("t1", -1000), add("t2", 500)] });
    ingest(s, { removed: [{ transaction_id: "t1" }] });
    expect(s.rows.get("t1")!.state).toBe("removed");
    expect(liveAmountFor(s, "t1")).toBe(0);
    expect(netAmount(s)).toBe(500);                // only t2 remains
    // the original entry still exists (provenance), cancelled by a reversal
    expect(s.entries.size).toBe(3);
  });

  it("a replayed remove is idempotent — no second reversal", () => {
    const s = emptyState();
    ingest(s, { added: [add("t1", -1000)] });
    ingest(s, { removed: [{ transaction_id: "t1" }] });
    const after = s.entries.size;
    ingest(s, { removed: [{ transaction_id: "t1" }] });
    ingest(s, { removed: [{ transaction_id: "t1" }] });
    expect(s.entries.size).toBe(after);
    expect(netAmount(s)).toBe(0);
  });
});

describe("W2.3 · full lifecycle stays balanced", () => {
  it("add → pending→posted → modify → remove nets to zero", () => {
    const s: LedgerState = emptyState();
    ingest(s, { added: [add("t1", -1000, "2026-07-01", true)] });
    ingest(s, { modified: [add("t1", -1000, "2026-07-01", false)] });
    ingest(s, { modified: [add("t1", -1500, "2026-07-02", false)] });
    ingest(s, { removed: [{ transaction_id: "t1" }] });
    expect(liveAmountFor(s, "t1")).toBe(0);
    expect(netAmount(s)).toBe(0);                  // every posting cancelled out
  });
});
