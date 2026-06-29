/**
 * Admin analytics — captures internal staff usage of /admin into PostHog,
 * tagged `product: "admin"` so it segments from the website/demo/app/chat in the
 * same project. The admin is an auth-walled first-party staff tool, so capture
 * is not behind the public cookie banner. Build env: VITE_POSTHOG_KEY / HOST
 * (see .github/workflows/pages.yml).
 */
import posthog from "posthog-js";

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

let started = false;

export function initAdminAnalytics(): void {
  if (started || typeof window === "undefined" || !KEY) return;
  started = true;
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: true,
    capture_pageview: true,   // SPA route changes are captured via pageview events
    enable_heatmaps: true,
    disable_session_recording: false,
    persistence: "localStorage",
  });
  posthog.register({ product: "admin" });
}
