/**
 * Consent state — Option B (aggregate-by-default, identified-on-consent).
 *
 * Pre-consent:
 *   - Anonymous aggregate events fire (no anon_id, no PostHog person, no cookie).
 *   - We learn HOW MANY did each step, not WHO.
 *
 * Post-consent:
 *   - anon_id generated and stored in localStorage.
 *   - Per-visitor funnel + retention works.
 *
 * Decline: state is recorded so we don't re-prompt every page load.
 */

const KEY = "ff_consent_v1";
type ConsentState = "accepted" | "declined" | "unset";

export function getConsent(): ConsentState {
  try {
    const v = localStorage.getItem(KEY);
    return v === "accepted" || v === "declined" ? v : "unset";
  } catch {
    return "unset";
  }
}

export function setConsent(state: "accepted" | "declined"): void {
  try { localStorage.setItem(KEY, state); } catch { /* swallow */ }
  window.dispatchEvent(new CustomEvent("ff:consent-change", { detail: state }));
}

export function hasConsent(): boolean {
  return getConsent() === "accepted";
}
