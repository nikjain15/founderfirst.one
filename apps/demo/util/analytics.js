/**
 * analytics.js — PostHog initialization.
 *
 * Import this module once at app startup (main.jsx) as a side-effect.
 * Any module that needs to capture events imports posthog directly:
 *   import posthog from 'posthog-js';
 */

import posthog from 'posthog-js';

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  enableExceptionAutocapture: true,
  capture_pageview: false,
});

export default posthog;
