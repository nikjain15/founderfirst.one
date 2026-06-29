/**
 * Analytics — the learning loop's Capture stage. PostHog runs in TWO tiers
 * ("Option B"):
 *
 *   • Before consent (consent = "unset"): ANONYMOUS, COOKIELESS capture —
 *     `persistence: "memory"` (no cookies / no localStorage), no person profiles,
 *     NO session replay. Just aggregate pageviews + clicks (→ heatmaps/funnels).
 *     Sets nothing on the device, identifies no one.
 *   • On "Accept": UPGRADE in place to full capture — localStorage persistence
 *     + session replay.
 *   • On "Decline": stop capturing entirely (opt out).
 *
 * GA (cookie-based) only runs after explicit Accept.
 *
 * NOTE: for the pre-consent tier to be truly anonymous, enable
 * "Discard client IP data" in PostHog → Settings → Project. That strips the one
 * server-added identifier we can't remove client-side. Disclosed in /privacy.
 *
 * Single API: track(event, props) — safe before init (dropped until live).
 */
import posthog from "posthog-js";
import { getConsent } from "./consent";

const KEY = import.meta.env.PUBLIC_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.PUBLIC_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";
const GA_ID = import.meta.env.PUBLIC_GA_ID as string | undefined;

type Tier = "none" | "anon" | "full";
let tier: Tier = "none";
let gaStarted = false;

/** Segment super-properties for personalization + per-segment attribution
 *  (learning-loop Act-3). Derived without device storage, so cookieless-safe.
 *  PostHog flags can target these; insights/experiments can break down by them. */
function segmentProps(): Record<string, string> {
  const mobile = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches;
  const params = new URLSearchParams(window.location.search);
  const ref = document.referrer;
  let source = params.get("utm_source") || "";
  if (!source) { try { source = ref ? new URL(ref).hostname : "direct"; } catch { source = "direct"; } }
  return { device: mobile ? "mobile" : "desktop", source };
}

function startGa(): void {
  if (gaStarted || !GA_ID) return;
  gaStarted = true;
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

/** Tier 1: anonymous, cookieless. No device storage, no profiles, no replay. */
function startAnonymous(): void {
  if (tier !== "none" || !KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    persistence: "memory",            // ← no cookies / no localStorage
    person_profiles: "identified_only", // no anonymous person profiles
    autocapture: true,                // clicks → heatmaps
    capture_pageview: false,
    enable_heatmaps: true,
    disable_session_recording: true,  // replay is personal → waits for consent
  });
  posthog.register({ product: "website", ...segmentProps() });
  posthog.capture("$pageview");
  tier = "anon";
}

/** Tier 2: full. Upgrade an existing anon instance, or init fresh if consent
 *  was already granted on load. Adds device persistence + session replay. */
function upgradeToFull(): void {
  if (tier === "full" || !KEY) { startGa(); return; }
  if (tier === "anon") {
    posthog.set_config({ persistence: "localStorage" });
    posthog.startSessionRecording();
  } else {
    posthog.init(KEY, {
      api_host: HOST,
      persistence: "localStorage",
      person_profiles: "identified_only",
      autocapture: true,
      capture_pageview: false,
      enable_heatmaps: true,
      disable_session_recording: false,
    });
    posthog.register({ product: "website", ...segmentProps() });
    posthog.capture("$pageview");
  }
  tier = "full";
  startGa();
}

/** Respect an explicit decline — stop capturing (incl. the anon tier). */
function optOut(): void {
  if (tier !== "none") { try { posthog.opt_out_capturing(); } catch { /* noop */ } }
  tier = "none";
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (tier !== "none") posthog.capture(event, props);
}

/** Call once on every page. Picks the tier from current consent and arms a
 *  listener so the choice takes effect live (no reload). */
export function initAnalytics(): void {
  if (typeof window === "undefined") return;
  const c = getConsent();
  if (c === "accepted") upgradeToFull();
  else if (c === "unset") startAnonymous();   // Option B: aggregate-by-default
  // declined → capture nothing.

  window.addEventListener("ff:consent-change", (e) => {
    const detail = (e as CustomEvent).detail;
    if (detail === "accepted") upgradeToFull();
    else if (detail === "declined") optOut();
  });
}
