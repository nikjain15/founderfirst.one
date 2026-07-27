/**
 * deterministic.ts: the pure, dependency-free kernel of Penny's deterministic
 * categorization path (rule + vendor-prior matching).
 *
 * This is the NON-model, NO-API-key path: given a transaction description and a
 * set of learned categorization rules / vendor priors, it picks an account by
 * lexical matching alone. It is the exact predicate the DB-backed `matchVendorPrior`
 * and the `match_categorization_rule` SQL path enforce in `categorize/index.ts`:
 * a lowercased, trimmed match_value that is either an exact string equal to the
 * description or a substring contained within it.
 *
 * Keeping the predicate here (imported by both the edge function and the offline
 * eval harness) means the labeled categorization eval scores the same matching
 * logic that runs in production, not a re-implementation. No network, no DB, no env.
 */

export type MatchType = "description_contains" | "description_exact";

export interface CategorizationRule {
  /** The learned account this rule files a matching transaction into. */
  account: string;
  /** The vendor / description fragment to match on (case-insensitive). */
  matchValue: string;
  /** Exact-equals vs. substring-contains. Defaults to contains. */
  matchType?: MatchType;
  /** How many times this rule has been applied; higher wins ties (busiest first). */
  timesApplied?: number;
}

/**
 * Does a single rule match this (already-lowercased) description text?
 * Mirrors the hit test in `categorize/index.ts` matchVendorPrior:
 *   match_type === "description_exact" ? desc === mv : desc.includes(mv)
 */
export function matchesRule(lowerText: string, matchValue: string, matchType: MatchType = "description_contains"): boolean {
  const mv = (matchValue ?? "").toLowerCase().trim();
  if (!mv) return false;
  return matchType === "description_exact" ? lowerText === mv : lowerText.includes(mv);
}

export interface DeterministicResult {
  /** The chosen account, or null when no rule matched (Penny would defer / ask). */
  account: string | null;
  /** The rule that produced the pick, if any. */
  matchedValue: string | null;
  source: "vendor_prior" | "rule" | "none";
}

/**
 * Run the deterministic categorizer over one transaction.
 *
 * `text` is the transaction description; `hints` are optional extra strings (e.g. a
 * memo fragment or a normalized vendor token) that are matched alongside it, exactly
 * as the product folds vendor context into the description before matching. Rules are
 * evaluated busiest-first (times_applied desc, stable) and the first hit wins, which
 * is the same ordering the DB reader applies. Returns account=null when nothing hits.
 */
export function categorizeDeterministic(
  text: string,
  hints: string[],
  rules: CategorizationRule[],
): DeterministicResult {
  const lower = [text ?? "", ...(hints ?? [])].join(" ").toLowerCase().trim();
  if (!lower) return { account: null, matchedValue: null, source: "none" };

  const ordered = [...rules].sort((a, b) => (b.timesApplied ?? 0) - (a.timesApplied ?? 0));
  for (const r of ordered) {
    if (matchesRule(lower, r.matchValue, r.matchType ?? "description_contains")) {
      return {
        account: r.account,
        matchedValue: r.matchValue,
        source: (r.matchType ?? "description_contains") === "description_exact" ? "rule" : "vendor_prior",
      };
    }
  }
  return { account: null, matchedValue: null, source: "none" };
}
