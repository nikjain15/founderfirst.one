/**
 * signup-confirmation's pure anti-enumeration/rate-limit helpers (SEC-4).
 *
 * Dependency-free (no supabase-js import) on purpose — index.ts pulls in
 * supabase-js's npm type-reference chain, which fails `deno check`/`deno
 * test` in this repo's CI (no node_modules; see report-export/validate.ts for
 * the same discipline). Keeping this logic here lets index.test.ts exercise
 * it directly instead of mirroring it by hand.
 */

/** Best-effort source IP from the standard proxy headers Cloudflare/Supabase set. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

// The exact response for "no such welcome to send" — used for BOTH an email
// that was never on the waitlist and one that already got its welcome email,
// so the two are indistinguishable to the caller. Otherwise an attacker could
// POST arbitrary addresses and enumerate waitlist membership from a 404-vs-200
// split (weekly audit PR #301 P2).
export const NOTHING_TO_SEND = { ok: true, skipped: "already_sent" } as const;
