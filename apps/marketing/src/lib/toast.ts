/**
 * Toast — bottom-of-page status pill.
 * Looks for [data-toast]; if absent, logs to console and returns.
 * One toast at a time; hideAfter milliseconds before auto-dismiss.
 */

const HIDE_AFTER_MS = 3500;
let hideTimer: number | null = null;

export function showToast(message: string): void {
  const el = document.querySelector<HTMLElement>("[data-toast]");
  if (!el) {
    console.info("[toast]", message);
    return;
  }
  el.textContent = message;
  el.classList.add("show");
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    el.classList.remove("show");
    hideTimer = null;
  }, HIDE_AFTER_MS);
}
