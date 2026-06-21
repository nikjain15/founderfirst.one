/**
 * Privacy policy page entry.
 *
 * Order:
 *  1. Styles.
 *  2. initAnalytics — fires $pageview for /privacy/.
 *  3. a11y pass for decorative marks.
 */

import "@ff/design-system/tokens.css";
import "@ff/design-system/components/typography.css";
import "@ff/design-system/components/ff-mark.css";
import "@ff/design-system/components/p-mark.css";
import "@ff/design-system/components/button.css";
import "./styles/site.css";
import "./styles/legal.css";

import { initAnalytics } from "./lib/analytics";
import { markDecorativeAria } from "./components/a11y";

initAnalytics();
markDecorativeAria();
