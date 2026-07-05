/**
 * Behavior config — the trust-tier / autonomy knobs that used to be magic numbers
 * baked into components and the categorize edge fn (card CENTRAL-1, Roadmap
 * principle #3). Every threshold now comes from `platform_config` (platform
 * default) with an optional per-org override in `org_settings` — admin-tunable,
 * no redeploy. Changing a row changes behavior.
 *
 * The values are read via the `get_effective_behavior_config` RPC (org override
 * folded over the platform default in the DB). Until that resolves — or if it
 * errors — we fall back to CONFIG_DEFAULTS, which MUST stay in lock-step with the
 * seed in the migration so the app behaves identically whether or not the fetch
 * has landed (the same "baked fallback" discipline the live persona uses).
 */
import { useQuery } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";

export interface BehaviorConfig {
  /** Confidence at/above which Penny's pick reads as "high" (hi band). */
  confidence_high: number;
  /** Confidence at/above which it reads as "medium"; below is "low". */
  confidence_medium: number;
  /** How many rows auto-ask Penny on mount (thundering-herd / cost guard). */
  auto_propose_limit: number;
  /** Owner interruption budget — max Penny asks per week (usability gate). */
  asks_per_week: number;
  /** Default digest cadence in days (e.g. the weekly review nudge). */
  digest_cadence_days: number;
  /** Days between AR reminder nudges for an overdue invoice (W4.3). */
  invoice_nudge_cadence_days: number;
  /** Days after a period's end that an unclosed period reads as "overdue" for a
   *  firm's month-end SLA / responsiveness tracking (RV2-C1, Signal #3). */
  close_sla_days: number;
}

/** Baked fallback — MUST match the platform_config seed in the migration. */
export const CONFIG_DEFAULTS: BehaviorConfig = {
  confidence_high: 0.75,
  confidence_medium: 0.45,
  auto_propose_limit: 8,
  asks_per_week: 5,
  digest_cadence_days: 7,
  invoice_nudge_cadence_days: 7,
  close_sla_days: 10,
};

const KEYS = Object.keys(CONFIG_DEFAULTS) as (keyof BehaviorConfig)[];

/** Coerce an arbitrary config row (jsonb value map) into a typed BehaviorConfig,
 *  filling any missing/invalid key from the baked default. */
function coerce(raw: Record<string, unknown> | null | undefined): BehaviorConfig {
  const out = { ...CONFIG_DEFAULTS };
  if (raw) {
    for (const k of KEYS) {
      const v = Number(raw[k]);
      if (Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}

/**
 * The effective behavior config for an org (platform default + org override).
 * Falls back to CONFIG_DEFAULTS while loading or on error — so callers can read
 * `.data ?? CONFIG_DEFAULTS` and always have a value.
 */
export function useBehaviorConfig(orgId: string | undefined) {
  return useQuery({
    queryKey: ["behavior-config", orgId],
    // 60s freshness mirrors the live-persona cache window.
    staleTime: 60_000,
    queryFn: async (): Promise<BehaviorConfig> => {
      const sb = getClient();
      const { data, error } = await sb.rpc("get_effective_behavior_config", {
        p_org: orgId ?? null,
      });
      if (error) throw error;
      return coerce(data as Record<string, unknown> | null);
    },
  });
}

export type ConfBand = "hi" | "mid" | "lo";

/** Band a confidence score using the (config-driven) cutoffs. */
export function confBand(c: number, cfg: BehaviorConfig): ConfBand {
  if (c >= cfg.confidence_high) return "hi";
  if (c >= cfg.confidence_medium) return "mid";
  return "lo";
}

// ── W3.2 trust tiers ──────────────────────────────────────────────────────────
export type Tier = "high" | "medium" | "low";

/**
 * The trust tier for a categorization proposal (card W3.2). Mirrors the server's
 * authoritative decision (supabase/functions/categorize `tierFor`) so the app and
 * the edge fn agree, and so the tier assignment is unit-testable without a DB.
 *
 * A learned RULE or a repeat-VENDOR prior is HIGH by provenance — Penny has seen
 * this exact call before, regardless of the model's stated confidence. Otherwise
 * band by the config cutoffs (never a magic number — cutoffs come from cfg).
 */
export function assignTier(
  confidence: number,
  source: "rule" | "vendor_prior" | "penny",
  cfg: BehaviorConfig,
): Tier {
  if (source === "rule" || source === "vendor_prior") return "high";
  if (confidence >= cfg.confidence_high) return "high";
  if (confidence >= cfg.confidence_medium) return "medium";
  return "low";
}

/**
 * Budget accounting for the ≤N-asks/week interruption cap (card W3.2). Given the
 * asks already spent this week and the config budget, decide whether ONE more
 * low-confidence unknown may interrupt the owner, or must DEFER to the digest.
 * Income never interrupts (it belongs in the digest, not a card).
 */
export function budgetDisposition(
  spent: number,
  cfg: BehaviorConfig,
  opts: { isIncome?: boolean } = {},
): { interrupt: boolean; defer: boolean; reason?: "income" | "budget_spent" } {
  if (opts.isIncome) return { interrupt: false, defer: true, reason: "income" };
  if (spent >= cfg.asks_per_week) return { interrupt: false, defer: true, reason: "budget_spent" };
  return { interrupt: true, defer: false };
}
