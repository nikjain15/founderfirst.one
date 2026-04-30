/**
 * Analytics wrapper — PostHog (events) + Google Analytics (gtag).
 *
 * Single API: `track(event, props)`. Never call posthog or gtag directly
 * elsewhere — we want one PII gatekeeper.
 *
 * Privacy rule: NEVER pass email or any other PII as a prop. Track the fact
 * of an action (waitlist_signup), not the identity behind it.
 *
 * If a key is empty:
 *  - PostHog init is skipped; track() logs to console in dev only.
 *  - GA loader is not appended; gtag() is a no-op.
 */
import posthog from "posthog-js";
import { POSTHOG_KEY, POSTHOG_HOST, GA_ID, hasAnalytics, hasGa, isDev } from "./env";

let inited = false;

// gtag has a `dataLayer`-based contract. Type the global so TS doesn't widen
// to `any` and so we can call it safely whether GA loaded or not.
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function initGa(): void {
  if (!hasGa) return;
  // Inject the gtag.js loader (matches what the legacy site did inline).
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]): void {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
}

export function initAnalytics(): void {
  if (inited) return;
  inited = true;

  if (hasAnalytics) {
    posthog.init(POSTHOG_KEY, {
      api_host:         POSTHOG_HOST,
      autocapture:      true,
      capture_pageview: false, // we fire $pageview manually below for control
      person_profiles:  "identified_only",
    });
    // Manual pageview so the page name is consistent across entries.
    posthog.capture("$pageview", {
      page: pageNameFromPath(location.pathname),
      path: location.pathname,
    });
  } else if (isDev) {
    console.debug("[analytics] no VITE_POSTHOG_KEY — PostHog disabled");
  }

  initGa();
  if (!hasGa && isDev) console.debug("[analytics] no VITE_GA_ID — GA disabled");
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (hasAnalytics) {
    posthog.capture(event, props);
  } else if (isDev) {
    console.debug("[analytics]", event, props);
  }
  // GA shadow-tracking: forward as a custom event so funnels can use either.
  if (hasGa) {
    window.gtag?.("event", event, props as Record<string, unknown> | undefined);
  }
}

function pageNameFromPath(path: string): string {
  if (path === "/" || path === "/index.html") return "marketing_landing";
  if (path.startsWith("/confirmed")) return "marketing_confirmed";
  if (path.startsWith("/blog"))      return "blog";
  return "marketing_other";
}
