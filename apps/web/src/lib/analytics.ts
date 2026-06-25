/**
 * Analytics — the learning loop's Capture stage. PostHog (self-host/EU) captures
 * heatmaps, autocapture, and pageviews, but ONLY after consent (Option B). Single
 * API: track(event, props). Safe to call before init — events are dropped until
 * PostHog is live. Env via Astro PUBLIC_* (exposed to the client).
 */
import posthog from "posthog-js";
import { getConsent } from "./consent";

const KEY = import.meta.env.PUBLIC_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.PUBLIC_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com";

let started = false;

function start(): void {
  if (started || !KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: true,        // clicks/rage-clicks → heatmaps
    capture_pageview: false,  // we send pageviews explicitly
    persistence: "localStorage",
  });
  started = true;
  posthog.capture("$pageview");
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (started) posthog.capture(event, props);
}

/** Call once on every page; inits PostHog if the visitor already consented, and
 *  arms a listener so accepting later turns capture on without a reload. */
export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  if (getConsent() === "accepted") start();
  window.addEventListener("ff:consent-change", (e) => {
    if ((e as CustomEvent).detail === "accepted") start();
  });
}
