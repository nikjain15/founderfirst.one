/**
 * responsive-ci — config for the automated responsive gate.
 *
 * The gate serves the assembled deploy artifact (dist/, produced by
 * `pnpm build`) and, for every route × width, asserts the RESPONSIVE.md
 * invariants. See run.mjs.
 */

// The width ladder from CLAUDE.md / apps/admin/RESPONSIVE.md. Every route is
// tested at every width.
export const WIDTHS = [
  320, 360, 375, 414, 480, 540, 640, 768, 834, 1024, 1280, 1440, 1920,
];

export const THRESHOLDS = {
  tapMinPx: 44, // touch targets ≥ 44×44 (--tap-min)
  inputMinFontPx: 16, // inputs ≥ 16px font-size (no iOS auto-zoom)
  horizontalScrollSlackPx: 2, // documentElement.scrollWidth − innerWidth must be ≤ this
};

// Routes served from the assembled dist/. These are the public, statically
// rendered pages (apps/web overlaid on apps/marketing). Admin is an auth-gated
// SPA; gating it needs test creds, so it's intentionally out of the default gate.
export const ROUTES = [
  "/", // marketing homepage (apps/web)
  "/compare/", // feature matrix
  "/blog/", // blog index
  "/confirmed/", // post-signup welcome
  "/extension-privacy/", // ported privacy policy
];

// Known offenders we don't want to block unrelated work on yet. Each entry is
// `${route} @ ${width} :: ${rule}` (rule ∈ horizontalScroll | tapTarget |
// inputFont). Anything matched here is reported as KNOWN but doesn't fail CI.
// Keep this list shrinking — every entry is debt. (Empty = strict gate.)
export const BASELINE = new Set([
  // e.g. "/blog/ @ 320 :: horizontalScroll",
]);

export const VIEWPORT_HEIGHT = 900;
