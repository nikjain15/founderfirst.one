/**
 * Marketing landing entry.
 *
 * Order:
 *  1. Styles (tokens → primitives → page-specific).
 *  2. captureInboundRef — runs before anything else so a ?ref= param is
 *     persisted even if the user bounces immediately.
 *  3. initAnalytics — fires $pageview.
 *  4. UI components.
 */

// Styles — tokens first, then primitives, then page styles.
import "@ff/design-system/tokens.css";
import "@ff/design-system/components/typography.css";
import "@ff/design-system/components/ff-mark.css";
import "@ff/design-system/components/p-mark.css";
import "@ff/design-system/components/penny-bubble.css";
import "@ff/design-system/components/button.css";
import "@ff/design-system/components/waitlist-form.css";
import "./styles/site.css";
import "./styles/sections/try-penny.css";

// Side-effect setup.
import { captureInboundRef } from "./lib/referral";
import { initAnalytics } from "./lib/analytics";

// UI components.
import { initNavDropdown }   from "./components/nav-dropdown";
import { initNavTracking }   from "./components/nav-tracking";
import { initTryPenny }      from "./components/try-penny";
import { initSignupForms }   from "./components/signup-form";
import { markDecorativeAria } from "./components/a11y";

captureInboundRef();
initAnalytics();

// Wait for DOM so component selectors can resolve (defer-equivalent for module scripts).
document.addEventListener("DOMContentLoaded", () => {
  markDecorativeAria();
  initNavDropdown();
  initNavTracking();
  initTryPenny();
  initSignupForms();
});
