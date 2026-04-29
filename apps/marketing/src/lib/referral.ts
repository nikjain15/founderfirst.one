/**
 * Referral primitives — slug generation, inbound capture, persistence.
 *
 * Storage keys:
 *   ff_referred_by  — slug of the person who invited the current visitor
 *   ff_my_slug      — slug allocated to the current visitor on signup
 *   ff_email        — email the visitor signed up with (used by /confirmed/)
 */

const REF_KEY  = "ff_referred_by";
const SLUG_KEY = "ff_my_slug";
const EMAIL_KEY = "ff_email";
const REF_MAX_LEN = 40;

export function makeSlug(email: string): string {
  const local = email.split("@")[0] ?? "";
  const prefix = local.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "founder";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${suffix}`;
}

/** Run on every page load — captures ?ref=… or /p/:slug into localStorage. */
export function captureInboundRef(): void {
  try {
    const params = new URLSearchParams(location.search);
    const refQ = params.get("ref");
    if (refQ) {
      localStorage.setItem(REF_KEY, refQ.slice(0, REF_MAX_LEN));
    }
    const pathMatch = location.pathname.match(/\/p\/([A-Za-z0-9_-]+)/);
    if (pathMatch && pathMatch[1]) {
      localStorage.setItem(REF_KEY, pathMatch[1].slice(0, REF_MAX_LEN));
    }
  } catch {
    // Private mode / storage disabled — silently skip.
  }
}

export function getReferredBy(): string | null {
  try { return localStorage.getItem(REF_KEY); } catch { return null; }
}

export function persistSignup(email: string, slug: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(SLUG_KEY, slug);
  } catch { /* private mode */ }
}

export function getMySlug(): string | null {
  try { return localStorage.getItem(SLUG_KEY); } catch { return null; }
}

export function getMyEmail(): string | null {
  try { return localStorage.getItem(EMAIL_KEY); } catch { return null; }
}

/**
 * Build the display URL for the user's invite link.
 * On localhost we still show "founderfirst.one" so the link looks right
 * during preview — the slug is what matters.
 */
export function buildRefDisplayUrl(slug: string): string {
  const isLocalhost =
    location.hostname === "localhost" ||
    location.hostname.startsWith("127.") ||
    location.hostname === "";
  const host = isLocalhost ? "founderfirst.one" : location.hostname;
  return `${host}/?ref=${slug}`;
}
