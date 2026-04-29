/**
 * Mark decorative glyphs aria-hidden so screen readers don't announce
 * "P" / "FF" / arrow as content. Runs once on page load.
 */
export function markDecorativeAria(): void {
  const decorative = document.querySelectorAll<HTMLElement>(
    ".ff-mark, .p-mark, .check-icon, .conf-dot, .conf-badge-circle, .tl-num"
  );
  for (const el of decorative) el.setAttribute("aria-hidden", "true");

  // SVGs without an explicit label are decorative.
  const svgs = document.querySelectorAll<SVGElement>("svg");
  for (const svg of svgs) {
    if (!svg.hasAttribute("aria-label") && !svg.hasAttribute("role")) {
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
    }
  }
}
