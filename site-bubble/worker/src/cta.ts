/**
 * CTA decision tree — pure function used by the Worker AND tests.
 *
 * The model also receives session state and is told the same rules in its
 * system prompt; this function is the runtime safety net that overrides any
 * model output. If `decideCta` returns `false`, we strip a `cta` from the
 * model response. If it returns `true` and the model didn't include one,
 * the runtime can synthesize the default one.
 */

export interface SessionState {
  turn_count: number;            // user-message count BEFORE this turn (0 on first message)
  on_waitlist: boolean;
  soft_decline_seen: boolean;
  last_turn_had_cta: boolean;
  buying_signal: boolean;        // computed for THIS message
}

export type CtaDecision = "force" | "allow" | "block";

export function decideCta(s: SessionState): CtaDecision {
  if (s.on_waitlist) return "block";
  if (s.buying_signal) return "force";
  if (s.soft_decline_seen) return "block";
  if (s.turn_count < 2) return "block";
  if (s.last_turn_had_cta) return "block";
  return "allow";
}

export const DEFAULT_CTA = {
  label: "Save your spot — just an email.",
  kind: "waitlist" as const,
};
