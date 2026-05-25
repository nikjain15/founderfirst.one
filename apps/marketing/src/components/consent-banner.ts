/**
 * Cookie / analytics consent banner.
 *
 * Appears bottom-right on first visit. Two buttons: Accept / Decline.
 * Once a choice is made we set localStorage and never re-prompt.
 *
 * On Accept → fires `ff:consent-change` → analytics.ts initializes PostHog
 *   and starts using anon_id.
 * On Decline → no anon_id ever generated; aggregate Supabase events still
 *   fire (we want raw counts), but no per-visitor tracking.
 */
import { getConsent, setConsent } from "../lib/consent";

export function initConsentBanner(): void {
  if (getConsent() !== "unset") return;

  const root = document.createElement("div");
  root.className = "ff-consent";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Privacy consent");
  root.innerHTML = `
    <p class="ff-consent-text">
      We use cookies to understand how founders use this site so we can build a better product.
      No selling, no ads — just product analytics. <a href="/privacy" target="_blank" rel="noopener">Learn more</a>.
    </p>
    <div class="ff-consent-actions">
      <button type="button" class="ff-consent-decline" aria-label="Decline analytics">Decline</button>
      <button type="button" class="ff-consent-accept"  aria-label="Accept analytics">Accept</button>
    </div>
  `;

  root.querySelector(".ff-consent-accept")?.addEventListener("click", () => {
    setConsent("accepted");
    root.remove();
  });
  root.querySelector(".ff-consent-decline")?.addEventListener("click", () => {
    setConsent("declined");
    root.remove();
  });

  document.body.appendChild(root);
}
