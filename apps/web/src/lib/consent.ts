/**
 * Consent state (Option B — aggregate-by-default, identified-on-consent).
 * Ported from apps/marketing; same `ff_consent_v1` key so a returning visitor's
 * choice carries over after the apps/web cutover. PostHog only captures after
 * "accepted"; "declined" is remembered so we don't re-prompt.
 */
const KEY = "ff_consent_v1";
export type ConsentState = "accepted" | "declined" | "unset";

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
