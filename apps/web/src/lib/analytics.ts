/**
 * Analytics — the learning loop's Capture stage. PostHog (self-host/EU) captures
 * heatmaps, autocapture, and pageviews, but ONLY after consent (Option B). Single
 * API: track(event, props). Safe to call before init — events are dropped until
 * PostHog is live. Env via Astro PUBLIC_* (exposed to the client).
 */
import posthog from "posthog-js";
import { getConsent } from "./consent";

const KEY = import.meta.env.PUBLIC_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.PUBLIC_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";
const GA_ID = import.meta.env.PUBLIC_GA_ID as string | undefined;

let started = false;

function startGa(): void {
  if (!GA_ID) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
  const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() { w.dataLayer.push(arguments); };
  w.gtag("js", new Date());
  w.gtag("config", GA_ID);
}

function start(): void {
  if (started) return;
  started = true;
  if (KEY) {
    posthog.init(KEY, {
      api_host: HOST,
      autocapture: true,        // clicks/rage-clicks → heatmaps
      capture_pageview: false,  // we send pageviews explicitly
      persistence: "localStorage",
    });
    posthog.capture("$pageview");
  }
  startGa();
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
