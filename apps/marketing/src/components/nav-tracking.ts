/**
 * Fire analytics events for nav interactions on the marketing landing.
 * Pure tracking — does not affect behavior.
 */
import { track } from "../lib/analytics";

export function initNavTracking(): void {
  document.querySelector(".nav-dropdown-toggle")?.addEventListener("click", () => {
    track("nav_demo_dropdown_open");
  });

  const links = document.querySelectorAll<HTMLAnchorElement>(".nav-dropdown-menu a");
  for (const link of links) {
    link.addEventListener("click", () => {
      const href = link.getAttribute("href") ?? "";
      const audience = href.includes("cpa") ? "cpa" : "business_owner";
      track("nav_demo_click", { audience, href });
    });
  }
}
