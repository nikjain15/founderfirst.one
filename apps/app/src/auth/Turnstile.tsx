/**
 * Cloudflare Turnstile widget (card SEC-2) — we're already on Cloudflare, so no
 * new vendor. Renders only when a site key is configured (env.ts `hasTurnstile`);
 * absent in local/preview envs, the login form degrades to captcha-optional
 * exactly like `hasSupabase` degrades to preview mode.
 *
 * The SECRET key lives only in Supabase Auth's dashboard captcha-provider
 * setting (Nik human step, LOOP_PROMPT rule 13) — Supabase verifies the token
 * server-side when `signInWithOtp` is called with `options.captchaToken`.
 */
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = SCRIPT_SRC;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("Turnstile script failed to load"));
      document.head.appendChild(el);
    });
  }
  return scriptPromise;
}

export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          // "flexible" fills the card width instead of a fixed 300px — the
          // default overflows the 320px width-ladder floor (RESPONSIVE.md).
          size: "flexible",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  return <div ref={hostRef} className="turnstile-widget" data-testid="turnstile-widget" />;
}
