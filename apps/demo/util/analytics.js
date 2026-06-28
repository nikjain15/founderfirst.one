/**
 * analytics.js — PostHog initialization.
 *
 * Import this module once at app startup (main.jsx) as a side-effect.
 * Any module that needs to capture events imports posthog directly:
 *   import posthog from 'posthog-js';
 */

import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
if (KEY) {
  posthog.init(KEY, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    autocapture: true,                 // clicks/rage-clicks (was missing → no click data)
    enable_heatmaps: true,             // clickmaps + scrollmaps
    enableExceptionAutocapture: true,
    disable_session_recording: false,  // session replay
    capture_pageview: false,
  });
  // Tag every event with the product so the demo segments separately from the
  // website/app/admin in PostHog. (Path /businessowner vs /cpa splits the view.)
  posthog.register({ product: 'demo' });
  posthog.capture('$pageview');        // was never sent before
}

export default posthog;
