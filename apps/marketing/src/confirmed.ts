/**
 * Confirmation page entry.
 *
 * Order:
 *  1. Styles.
 *  2. initAnalytics — fires $pageview for /confirmed/.
 *  3. UI: referral block (Copy / Share / progress).
 */

import "@ff/design-system/tokens.css";
import "@ff/design-system/components/typography.css";
import "@ff/design-system/components/ff-mark.css";
import "@ff/design-system/components/p-mark.css";
import "@ff/design-system/components/button.css";
import "./styles/site.css";
import "./styles/confirmed.css";

import { initAnalytics } from "./lib/analytics";
import { initReferral }  from "./components/referral";
import { markDecorativeAria } from "./components/a11y";

initAnalytics();

document.addEventListener("DOMContentLoaded", () => {
  markDecorativeAria();
  initReferral();
});
