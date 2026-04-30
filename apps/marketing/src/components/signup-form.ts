/**
 * Signup form — wires every <form data-signup-form="<source>"> to Supabase.
 *
 * Flow:
 *  1. Validate email (cheap regex; the server does the real validation).
 *  2. Disable submit, show "Saving…" label.
 *  3. Call signupToWaitlist (writes via SECURITY DEFINER RPC; falls back to
 *     a synthetic slug in preview/dev mode).
 *  4. Fire waitlist_signup analytics event with the form's data-signup-form
 *     value as `source` (e.g. "hero", "waitlist").
 *  5. Persist email + slug to localStorage so /confirmed/ can show the link
 *     even if the URL is opened later.
 *  6. Redirect to /confirmed/?slug=<slug>.
 *
 * On error: re-enable the form, show a toast, log to console.
 */
import { signupToWaitlist } from "../lib/supabase";
import { track } from "../lib/analytics";
import { getReferredBy, persistSignup } from "../lib/referral";
import { showToast } from "../lib/toast";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function initSignupForms(): void {
  const forms = document.querySelectorAll<HTMLFormElement>("[data-signup-form]");
  for (const form of forms) {
    form.addEventListener("submit", (e) => handleSubmit(e, form));
  }
}

async function handleSubmit(e: SubmitEvent, form: HTMLFormElement): Promise<void> {
  e.preventDefault();

  const input = form.querySelector<HTMLInputElement>('input[type="email"]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!input || !button) return;
  if (button.disabled) return; // prevent double-submit

  const email = input.value.trim();
  const source = form.dataset.signupForm ?? "unknown";

  if (!EMAIL_RE.test(email)) {
    input.focus();
    showToast("Please enter a valid email.");
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Saving…";

  try {
    const result = await signupToWaitlist({
      email,
      source,
      referredBy: getReferredBy(),
    });

    track("waitlist_signup", { source, already_on_list: result.alreadyOnList });

    persistSignup(email, result.slug);

    if (result.alreadyOnList) {
      showToast("You're already on the list — welcome back!");
    }

    // Real navigation to a real page — back-button works, refresh works,
    // /confirmed/ can be opened directly.
    location.href = `/confirmed/?slug=${encodeURIComponent(result.slug)}`;
  } catch (err) {
    console.error("[signup]", err);
    showToast("Something went wrong — try again.");
    button.disabled = false;
    button.textContent = originalLabel ?? "Claim 3 months free →";
  }
}
