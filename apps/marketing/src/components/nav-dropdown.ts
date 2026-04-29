/**
 * Nav "Try Penny" dropdown.
 * - Click toggle to open/close.
 * - Click outside to close.
 * - Escape to close (and return focus to the toggle).
 *
 * Contract: the dropdown wrapper has [data-nav-dropdown], its toggle is the
 * first .nav-dropdown-toggle inside it. Multiple dropdowns are supported.
 */
export function initNavDropdown(): void {
  const dropdowns = document.querySelectorAll<HTMLElement>("[data-nav-dropdown]");
  if (dropdowns.length === 0) return;

  for (const dropdown of dropdowns) {
    const toggle = dropdown.querySelector<HTMLButtonElement>(".nav-dropdown-toggle");
    if (!toggle) continue;

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    document.addEventListener("click", (e) => {
      const target = e.target as Node | null;
      if (target && !dropdown.contains(target)) {
        dropdown.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dropdown.classList.contains("open")) {
        dropdown.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }
}
