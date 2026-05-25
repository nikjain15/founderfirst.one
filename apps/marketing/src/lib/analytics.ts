/**
 * Analytics wrapper — PostHog (events) + Google Analytics (gtag) + Supabase events.
 *
 * Single API: `track(event, props)`. Never call posthog/gtag/supabase directly
 * elsewhere — we want one PII gatekeeper.
 *
 * Privacy rule: NEVER pass email or any other PII as a prop. Track the fact
 * of an action (waitlist_signup), not the identity behind it.
 *
 * Consent model — Option B (aggregate-by-default, identified-on-consent):
 *  - Pre-consent: Supabase events still fire WITHOUT anon_id (aggregate only).
 *    PostHog is gated to opt-in: it requires consent before it captures, so we
 *    only init it after the user accepts.
 *  - Post-consent: anon_id is generated and attached to Supabase events;
 *    PostHog initializes; GA continues as before (covered by its own consent
 *    mode in production).
 */
import posthog from "posthog-js";
import { POSTHOG_KEY, POSTHOG_HOST, GA_ID, hasAnalytics, hasGa, isDev } from "./env";
import { hasConsent, getConsent } from "./consent";
import { getAnonId } from "./anon-id";
import { trackEventRemote } from "./supabase";

let inited = false;
let posthogInited = false;

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

function initPosthogIfConsented(): void {
  if (posthogInited) return;
  if (!hasAnalytics) return;
  if (!hasConsent()) return;
  posthog.init(POSTHOG_KEY, {
    api_host:         POSTHOG_HOST,
    autocapture:      true,
    capture_pageview: false,
    person_profiles:  "identified_only",
  });
  posthogInited = true;
}

// Session tracking: a session is a 30-min idle gap. We fire `session_start`
// on first event of a session and `return_visit` if the same anon_id was last
// seen >24h ago.
const SESSION_KEY = "ff_session_ts";
const LAST_SEEN_KEY = "ff_last_seen";
const SESSION_TTL_MS = 30 * 60 * 1000;

function checkAndFireSessionStart(): void {
  let isNew = true;
  try {
    const last = Number(sessionStorage.getItem(SESSION_KEY) || "0");
    isNew = !last || Date.now() - last > SESSION_TTL_MS;
    sessionStorage.setItem(SESSION_KEY, String(Date.now()));
  } catch { /* swallow */ }
  if (isNew) {
    track("session_start", {
      referrer:   document.referrer || null,
      utm_source: new URL(location.href).searchParams.get("utm_source"),
      utm_medium: new URL(location.href).searchParams.get("utm_medium"),
      utm_campaign: new URL(location.href).searchParams.get("utm_campaign"),
    });
  }
}

function checkAndFireReturnVisit(): void {
  if (!hasConsent()) return; // return_visit requires anon_id
  try {
    const last = localStorage.getItem(LAST_SEEN_KEY);
    const now = Date.now();
    if (last) {
      const days = (now - Number(last)) / (1000 * 60 * 60 * 24);
      if (days >= 1) track("return_visit", { days_since_last: Math.round(days) });
    }
    localStorage.setItem(LAST_SEEN_KEY, String(now));
  } catch { /* swallow */ }
}

export function initAnalytics(): void {
  if (inited) return;
  inited = true;

  initPosthogIfConsented();
  initGa();
  if (!hasGa && isDev) console.debug("[analytics] no VITE_GA_ID — GA disabled");

  checkAndFireSessionStart();
  track("page_view", { page: pageNameFromPath(location.pathname), path: location.pathname });
  checkAndFireReturnVisit();

  // If user accepts later in the session, init PostHog retroactively.
  window.addEventListener("ff:consent-change", () => {
    if (getConsent() === "accepted") {
      initPosthogIfConsented();
      checkAndFireReturnVisit();
    }
  });
}

export function track(event: string, props?: Record<string, unknown>): void {
  const safeProps = props ?? {};

  // PostHog — only after consent
  if (posthogInited) {
    posthog.capture(event, safeProps);
  } else if (isDev) {
    console.debug("[analytics]", event, safeProps);
  }

  // GA — fire always (GA has its own consent mode)
  if (hasGa) {
    window.gtag?.("event", event, safeProps);
  }

  // Supabase mirror — fires always, but anon_id only post-consent.
  void trackEventRemote(event, safeProps, {
    anonId: getAnonId(),
    source: "marketing",
  });
}

function pageNameFromPath(path: string): string {
  if (path === "/" || path === "/index.html") return "marketing_landing";
  if (path.startsWith("/confirmed")) return "marketing_confirmed";
  if (path.startsWith("/blog"))      return "blog";
  return "marketing_other";
}
