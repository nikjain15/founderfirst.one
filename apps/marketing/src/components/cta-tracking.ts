/**
 * CTA click tracking.
 *
 * Any element with `data-cta="<id>"` (and optionally `data-cta-location="<area>"`)
 * fires a `cta_click` event when clicked. Lets us tag CTAs across the site
 * without spreading track() calls everywhere.
 *
 * Usage in markup:
 *   <a href="#waitlist" data-cta="hero_primary" data-cta-location="hero">Join waitlist</a>
 */
import { track } from "../lib/analytics";

export function initCtaTracking(): void {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const cta = target.closest<HTMLElement>("[data-cta]");
    if (!cta) return;
    track("cta_click", {
      cta_id:   cta.dataset.cta ?? null,
      location: cta.dataset.ctaLocation ?? null,
      href:     (cta as HTMLAnchorElement).href ?? null,
    });
  });
}
