/**
 * PENNY-UX-4 — the CPA "+ Add client" request artifact (pure logic, no React).
 *
 * Server truth this encodes: an engagement is created ONLY by the client's owner
 * inviting the CPA (`invites` fn, owner-only) and the CPA accepting — there is no
 * RPC that lets a firm create a client org or engagement. So the firm-side
 * "+ Add client" affordance produces a REQUEST: a link to the owner's own
 * /settings invite-your-accountant form, pre-filled with the CPA's email via the
 * `invite_cpa` query param. The owner still reviews the address, chooses access,
 * and sends; accepting stays the only path to access (ARCHITECTURE §5).
 */

/** Query param carrying the requesting CPA's email into the owner's invite form. */
export const INVITE_CPA_PARAM = "invite_cpa";

// Same shape the `invites` edge fn enforces server-side — keep the client-side
// gate no looser (a junk param must never land in the owner's form).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The request link a CPA sends a client: the owner's own Settings invite form,
 *  pre-filled with the CPA's email. Returns null without a valid CPA email —
 *  never build a link that would dead-end the client. */
export function buildClientRequestLink(origin: string, cpaEmail: string): string | null {
  const email = normalizeEmail(cpaEmail);
  if (!email) return null;
  return `${origin}/settings?${INVITE_CPA_PARAM}=${encodeURIComponent(email)}`;
}

/** Parse + validate the `invite_cpa` param on the owner side. Strict: anything
 *  that isn't a plausible, bounded email (junk, markup, overlong) → null, so the
 *  form silently stays empty instead of rendering attacker-shaped text. */
export function parsePrefillEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  return normalizeEmail(raw);
}

function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v.length === 0 || v.length > 254) return null;
  if (!EMAIL_RE.test(v)) return null;
  return v;
}
