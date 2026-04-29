/**
 * Referral block on the confirmation page.
 *
 * Responsibilities:
 *  - Resolve the user's slug (URL ?slug=… first, then localStorage, then a
 *    "preview-xxxx" placeholder so the page never looks empty).
 *  - Fill in [data-ref-url] with the display URL.
 *  - Wire [data-ref-action="copy"] / "email" / "message" buttons.
 *  - Fetch the live referral count and update earned / to-go / progress fill.
 */
import { getMySlug, buildRefDisplayUrl } from "../lib/referral";
import { getReferralCount } from "../lib/supabase";
import { track } from "../lib/analytics";
import { showToast } from "../lib/toast";

const MAX_MONTHS = 12;

export function initReferral(): void {
  const slug = resolveSlug();
  const url = buildRefDisplayUrl(slug);

  // Display URL
  const urlEl = document.querySelector<HTMLElement>("[data-ref-url]");
  if (urlEl) urlEl.textContent = url;

  // Actions
  document.querySelector<HTMLButtonElement>('[data-ref-action="copy"]')
    ?.addEventListener("click", (e) => copyLink(e.currentTarget as HTMLButtonElement, url));
  document.querySelector<HTMLButtonElement>('[data-ref-action="email"]')
    ?.addEventListener("click", () => shareByEmail(url));
  document.querySelector<HTMLButtonElement>('[data-ref-action="message"]')
    ?.addEventListener("click", () => shareByMessage(url));

  // Live count
  void updateProgress(slug);
}

function resolveSlug(): string {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("slug");
  if (fromUrl && /^[A-Za-z0-9_-]{1,40}$/.test(fromUrl)) return fromUrl;
  const fromStorage = getMySlug();
  if (fromStorage) return fromStorage;
  // Preview placeholder so the UI never looks broken.
  return "preview-" + Math.random().toString(36).slice(2, 6);
}

async function updateProgress(slug: string): Promise<void> {
  const count = await getReferralCount(slug);
  if (count === null) return; // no Supabase — leave the static 0/12 default
  const earnedEl = document.querySelector<HTMLElement>("[data-ref-earned]");
  const togoEl   = document.querySelector<HTMLElement>("[data-ref-togo]");
  const fillEl   = document.querySelector<HTMLElement>("[data-ref-progress]");
  if (earnedEl) earnedEl.innerHTML = `${count} <span class="ref-of">/ ${MAX_MONTHS}</span>`;
  if (togoEl)   togoEl.textContent = `${MAX_MONTHS - count} to go`;
  if (fillEl) {
    fillEl.style.width = `${(count / MAX_MONTHS) * 100}%`;
    const bar = fillEl.parentElement;
    bar?.setAttribute("aria-valuenow", String(count));
  }
}

function copyLink(button: HTMLButtonElement, displayUrl: string): void {
  const url = displayUrl.startsWith("http") ? displayUrl : `https://${displayUrl}`;

  const onSuccess = (): void => {
    track("ref_link_copied");
    const original = button.textContent;
    button.textContent = "Copied!";
    window.setTimeout(() => { button.textContent = original; }, 2000);
  };

  const onFail = (): void => {
    showToast("Copy failed — long-press the link to copy manually.");
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(onSuccess).catch(() => fallbackCopy(url, onSuccess, onFail));
  } else {
    fallbackCopy(url, onSuccess, onFail);
  }
}

function fallbackCopy(url: string, onSuccess: () => void, onFail: () => void): void {
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) onSuccess(); else onFail();
  } catch {
    onFail();
  }
}

function shareByEmail(displayUrl: string): void {
  const url = displayUrl.startsWith("http") ? displayUrl : `https://${displayUrl}`;
  track("ref_share_email");
  const subject = "Try Penny — she does your books for you";
  const body =
    "I just joined the waitlist for Penny — an AI bookkeeper that hooks into Stripe + bank and handles the books so you don't have to.\n\n" +
    `Join through my link and your first 3 months are free:\n${url}\n\n` +
    "— sent from FounderFirst";
  location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function shareByMessage(displayUrl: string): Promise<void> {
  const url = displayUrl.startsWith("http") ? displayUrl : `https://${displayUrl}`;
  track("ref_share_message");
  const text =
    "Try Penny — AI bookkeeper that handles your books for you. " +
    `Join through my link for 3 months free: ${url}`;

  // Web Share API — best path on mobile + modern desktop.
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Penny — AI bookkeeper", text, url });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // user cancelled
    }
  }

  // Mobile fallback — open SMS composer.
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  if (isMobile) {
    const sep = isIOS ? "&" : "?";
    location.href = `sms:${sep}body=${encodeURIComponent(text)}`;
    return;
  }

  // Desktop fallback — copy to clipboard.
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("Message copied — paste it into your favorite chat app."))
      .catch(() => showToast("Copy failed — long-press the link to copy manually."));
  } else {
    showToast("Long-press the link above to copy and share manually.");
  }
}
