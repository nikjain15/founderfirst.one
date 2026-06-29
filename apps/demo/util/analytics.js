/**
 * analytics.js — PostHog, consent-gated (same "Option B" two-tier model as the
 * website, and the SAME `ff_consent_v1` key — the demo is same-origin on
 * founderfirst.one, so a visitor's choice on the site carries over here).
 *
 *   • consent "unset"    → anonymous, cookieless (memory persistence, no replay)
 *   • consent "accepted" → full (localStorage + session replay)
 *   • consent "declined" → capture nothing
 *
 * Import once at startup (main.jsx). Other modules `import posthog from 'posthog-js'`.
 */
import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY || import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

function getConsent() {
  try {
    const v = localStorage.getItem('ff_consent_v1');
    return v === 'accepted' || v === 'declined' ? v : 'unset';
  } catch { return 'unset'; }
}

let tier = 'none'; // 'none' | 'anon' | 'full'

function startAnonymous() {
  if (tier !== 'none' || !KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    persistence: 'memory',              // no cookies / no localStorage
    person_profiles: 'identified_only',
    autocapture: true,
    enable_heatmaps: true,
    enableExceptionAutocapture: true,
    capture_pageview: false,
    disable_session_recording: true,    // replay is personal → waits for consent
  });
  posthog.register({ product: 'demo' });
  posthog.capture('$pageview');
  tier = 'anon';
}

function upgradeToFull() {
  if (tier === 'full' || !KEY) return;
  if (tier === 'anon') {
    posthog.set_config({ persistence: 'localStorage' });
    posthog.startSessionRecording();
  } else {
    posthog.init(KEY, {
      api_host: HOST,
      persistence: 'localStorage',
      person_profiles: 'identified_only',
      autocapture: true,
      enable_heatmaps: true,
      enableExceptionAutocapture: true,
      capture_pageview: false,
      disable_session_recording: false,
    });
    posthog.register({ product: 'demo' });
    posthog.capture('$pageview');
  }
  tier = 'full';
}

function optOut() {
  if (tier !== 'none') { try { posthog.opt_out_capturing(); } catch { /* noop */ } }
  tier = 'none';
}

if (KEY && typeof window !== 'undefined') {
  const c = getConsent();
  if (c === 'accepted') upgradeToFull();
  else if (c === 'unset') startAnonymous();   // Option B: aggregate-by-default
  // declined → nothing

  window.addEventListener('ff:consent-change', (e) => {
    const detail = e && e.detail;
    if (detail === 'accepted') upgradeToFull();
    else if (detail === 'declined') optOut();
  });
}

export default posthog;
