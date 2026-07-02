/**
 * W2.2 trial-balance comparison — the trust moment. A migrated ledger must tie to
 * QuickBooks' own trial balance to the CENT; any difference must surface as a
 * variance row, never silently. These are pure over minor-unit integers.
 */
import { describe, expect, it } from "vitest";
import { compareTrialBalances, normalizeName, type ProviderTbRow } from "./tbCompare";
import type { AccountBalance } from "../ledger/reports";

// helper: build a ledger AccountBalance with a debit-positive net
const ledger = (name: string, net: number): AccountBalance => ({
  account_id: name, code: null, name,
  type: "asset", debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, net,
});
const prov = (name: string, debit: number, credit: number): ProviderTbRow => ({ name, debit_minor: debit, credit_minor: credit });

describe("compareTrialBalances", () => {
  it("ties to the cent when the migrated ledger matches QBO exactly", () => {
    const provider = [prov("Checking", 10000, 0), prov("Sales", 0, 10000)];
    const books = [ledger("Checking", 10000), ledger("Sales", -10000)];
    const c = compareTrialBalances(provider, books);
    expect(c.tiesToTheCent).toBe(true);
    expect(c.totalVariance).toBe(0);
    expect(c.rows.every((r) => r.diff === 0)).toBe(true);
    expect(c.providerTotalNet).toBe(0);
    expect(c.ledgerTotalNet).toBe(0);
  });

  it("surfaces a one-cent difference as a variance row — never silent", () => {
    const provider = [prov("Checking", 10000, 0), prov("Sales", 0, 10000)];
    const books = [ledger("Checking", 10001), ledger("Sales", -10000)]; // 1c off
    const c = compareTrialBalances(provider, books);
    expect(c.tiesToTheCent).toBe(false);
    expect(c.totalVariance).toBe(1);
    // largest variance sorts first
    expect(c.rows[0].name).toBe("Checking");
    expect(c.rows[0].diff).toBe(1);
  });

  it("matches accounts by normalized name (case / whitespace insensitive)", () => {
    const provider = [prov("Office  Supplies", 5000, 0)];
    const books = [ledger("office supplies", 5000)];
    const c = compareTrialBalances(provider, books);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].presence).toBe("both");
    expect(c.rows[0].diff).toBe(0);
    expect(c.tiesToTheCent).toBe(true);
  });

  it("flags an account present only in QuickBooks", () => {
    const provider = [prov("Petty Cash", 2500, 0)];
    const books: AccountBalance[] = [];
    const c = compareTrialBalances(provider, books);
    expect(c.rows[0].presence).toBe("provider_only");
    expect(c.rows[0].providerNet).toBe(2500);
    expect(c.rows[0].ledgerNet).toBe(0);
    expect(c.rows[0].diff).toBe(-2500);
    expect(c.tiesToTheCent).toBe(false);
  });

  it("flags an account present only in the ledger", () => {
    const provider: ProviderTbRow[] = [];
    const books = [ledger("Uncategorized", 700)];
    const c = compareTrialBalances(provider, books);
    expect(c.rows[0].presence).toBe("ledger_only");
    expect(c.rows[0].diff).toBe(700);
  });

  it("collapses duplicate provider rows (subtotals) into one net", () => {
    const provider = [prov("Sales", 0, 6000), prov("Sales", 0, 4000)];
    const books = [ledger("Sales", -10000)];
    const c = compareTrialBalances(provider, books);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].providerNet).toBe(-10000);
    expect(c.rows[0].diff).toBe(0);
  });

  it("totalVariance sums the absolute diffs across every account", () => {
    const provider = [prov("A", 100, 0), prov("B", 0, 100)];
    const books = [ledger("A", 130), ledger("B", -80)]; // +30 and +20 variance
    const c = compareTrialBalances(provider, books);
    expect(c.totalVariance).toBe(50);
    expect(c.tiesToTheCent).toBe(false);
  });

  it("normalizeName lowercases and collapses whitespace", () => {
    expect(normalizeName("  Cash   On  Hand ")).toBe("cash on hand");
  });
});
