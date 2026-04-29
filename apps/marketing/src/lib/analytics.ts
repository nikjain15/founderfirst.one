/**
 * Analytics wrapper — PostHog, eventually GA.
 *
 * Single API: `track(event, props)`. Never call posthog directly elsewhere.
 *
 * Privacy rule: NEVER pass email or any other PII as a prop. Track the fact
 * of an action (waitlist_signup), not the identity behind it.
 *
 * If POSTHOG_KEY is empty, init is skipped and track() becomes a no-op (with
 * a console.debug so dev still sees what would have fired).
 */
import posthog from "posthog-js";
import { POSTHOG_KEY, POSTHOG_HOST, hasAnalytics, isDev } from "./env";

let inited = false;

export function initAnalytics(): void {
  if (inited) return;
  if (!hasAnalytics) {
    if (isDev) console.debug("[analytics] no VITE_POSTHOG_KEY — track() is a no-op");
    return;
  }
  posthog.init(POSTHOG_KEY, {
    api_host:         POSTHOG_HOST,
    autocapture:      true,
    capture_pageview: false, // we fire $pageview manually below for control
    person_profiles:  "identified_only",
  });
  inited = true;

  // Manual pageview so the page name is consistent across entries.
  track("$pageview", { page: pageNameFromPath(location.pathname), path: location.pathname });
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!inited) {
    if (isDev) console.debug("[analytics]", event, props);
    return;
  }
  posthog.capture(event, props);
}

function pageNameFromPath(path: string): string {
  if (path === "/" || path === "/index.html") return "marketing_landing";
  if (path.startsWith("/confirmed")) return "marketing_confirmed";
  if (path.startsWith("/blog"))      return "blog";
  return "marketing_other";
}
