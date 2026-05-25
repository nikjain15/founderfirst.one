/**
 * anon_id — random opaque ID kept in localStorage. Generated lazily, only
 * after the user accepts the consent banner. Used to stitch a single visitor
 * across multiple events (funnel + retention).
 */

import { hasConsent } from "./consent";

const KEY = "ff_anon_id";

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "a-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Returns the anon_id only if consent has been given. Null otherwise. */
export function getAnonId(): string | null {
  if (!hasConsent()) return null;
  try {
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = makeId();
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return null;
  }
}

/** Clear when user revokes consent. */
export function clearAnonId(): void {
  try { localStorage.removeItem(KEY); } catch { /* swallow */ }
}
