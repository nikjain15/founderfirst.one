/**
 * Trial-balance comparison for a QBO migration (W2.2 — the "trust moment").
 *
 * After the migrated history posts to the ledger, we diff QBO's OWN trial balance
 * (snapshotted at pull time) against the ledger's trial balance, account by account,
 * to the CENT. A difference is never silent — it surfaces as a variance row the
 * owner can read and explain. Pure functions over minor-unit integers; DB-free.
 */
import type { AccountBalance } from "../ledger/reports";

/** One row of QBO's own trial balance, as snapshotted by the qbo-import pull. */
export interface ProviderTbRow {
  name: string;
  debit_minor: number;
  credit_minor: number;
}

export interface TbComparisonRow {
  name: string;
  /** Provider (QBO) net in debit-positive minor units (debit − credit). */
  providerNet: number;
  /** Ledger net in debit-positive minor units. */
  ledgerNet: number;
  /** ledgerNet − providerNet. Zero ⇒ this account ties. */
  diff: number;
  /** Only in QBO / only in the ledger / present in both. */
  presence: "both" | "provider_only" | "ledger_only";
}

export interface TbComparison {
  rows: TbComparisonRow[];
  providerTotalNet: number;
  ledgerTotalNet: number;
  /** Σ|diff| across every row — the total unexplained variance, in minor units. */
  totalVariance: number;
  /** True ⇒ every account ties to the cent (totalVariance === 0). */
  tiesToTheCent: boolean;
}

/** Normalize an account name for matching (QBO vs ledger may differ in case/spacing). */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const providerNet = (r: ProviderTbRow) => r.debit_minor - r.credit_minor;

/**
 * Compare a provider trial balance against ledger account balances (from
 * `accountBalances()`), matching by normalized account name. Every account that
 * appears on either side gets a row; a non-zero `diff` is the variance to explain.
 */
export function compareTrialBalances(
  provider: ProviderTbRow[],
  ledger: AccountBalance[],
): TbComparison {
  const byName = new Map<string, TbComparisonRow>();

  for (const p of provider) {
    const key = normalizeName(p.name);
    if (!key) continue;
    const net = providerNet(p);
    const existing = byName.get(key);
    if (existing) {
      existing.providerNet += net;
    } else {
      byName.set(key, { name: p.name, providerNet: net, ledgerNet: 0, diff: 0, presence: "provider_only" });
    }
  }

  for (const l of ledger) {
    const key = normalizeName(l.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (existing) {
      existing.ledgerNet += l.net;
      existing.presence = "both";
    } else {
      byName.set(key, { name: l.name, providerNet: 0, ledgerNet: l.net, diff: 0, presence: "ledger_only" });
    }
  }

  let providerTotalNet = 0;
  let ledgerTotalNet = 0;
  let totalVariance = 0;
  const rows = [...byName.values()];
  for (const r of rows) {
    r.diff = r.ledgerNet - r.providerNet;
    providerTotalNet += r.providerNet;
    ledgerTotalNet += r.ledgerNet;
    totalVariance += Math.abs(r.diff);
  }
  // Variances first (largest |diff|), then ties by name — the reviewer reads what broke.
  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.name.localeCompare(b.name));

  return {
    rows,
    providerTotalNet,
    ledgerTotalNet,
    totalVariance,
    tiesToTheCent: totalVariance === 0,
  };
}
