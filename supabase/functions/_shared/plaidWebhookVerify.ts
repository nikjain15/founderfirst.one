/**
 * plaidWebhookVerify — authenticate an inbound Plaid webhook BEFORE we act on it.
 *
 * plaid-webhook is a PUBLIC endpoint (verify_jwt=false): Plaid POSTs to it with no
 * user JWT. Without a check, ANYONE who learns an item_id could POST a forged
 * `TRANSACTIONS` webhook (forcing syncs / Plaid API spend) or a forged `ITEM`/ERROR
 * webhook (flipping a victim's connection to `revoked`/`error` — a silent feed DoS).
 *
 * Two layers, defense-in-depth. A request passes if EITHER holds:
 *
 *   1. Shared-secret gate (always enforced when configured). We register the
 *      webhook URL with a secret query param / header and require it back. Set
 *      PLAID_WEBHOOK_SECRET in the fn env; the caller must present it in the
 *      `X-Webhook-Secret` header (or `?secret=` on the URL). Simple, testable,
 *      and sufficient to stop blind forgery.
 *
 *   2. Plaid JWT verification. Plaid signs every webhook body and sends a JWT in
 *      the `Plaid-Verification` header (ES256, kid → key from
 *      /webhook_verification_key/get). When a verifier is supplied we validate the
 *      JWT header alg + the body hash claim. (The network key-fetch lives in the
 *      fn; this module is the pure, unit-testable gate.)
 *
 * Fail CLOSED: if a secret is configured and the request presents neither a valid
 * secret nor a verified JWT, reject. If NO secret is configured AND no JWT
 * verifier is wired, we refuse in production (env PLAID_ENV=production) and only
 * allow through in sandbox, so a misconfig can't silently open the endpoint in
 * prod. (Roadmap §W2.3 red-team: webhook forgery is the crown-jewel target.)
 */

export interface VerifyInput {
  /** value of the X-Webhook-Secret header, if any */
  headerSecret: string | null;
  /** value of a ?secret= query param, if any */
  querySecret: string | null;
  /** the configured PLAID_WEBHOOK_SECRET (env), if any */
  configuredSecret: string | null;
  /** result of the Plaid JWT verification, if one ran (null = not attempted) */
  jwtVerified: boolean | null;
  /** PLAID_ENV — 'sandbox' | 'development' | 'production' */
  env: string;
}

export interface VerifyResult {
  ok: boolean;
  reason: string;
}

/** constant-time string compare (avoid secret-length/timing leaks) */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyPlaidWebhook(input: VerifyInput): VerifyResult {
  const { headerSecret, querySecret, configuredSecret, jwtVerified, env } = input;

  // Layer 2: a genuinely Plaid-signed JWT always passes.
  if (jwtVerified === true) return { ok: true, reason: "jwt_verified" };

  // Layer 1: shared secret.
  if (configuredSecret && configuredSecret.length > 0) {
    const presented = headerSecret ?? querySecret ?? "";
    if (presented && safeEqual(presented, configuredSecret)) {
      return { ok: true, reason: "shared_secret" };
    }
    // secret configured but not (correctly) presented, and JWT didn't verify.
    return { ok: false, reason: "bad_or_missing_secret" };
  }

  // No secret configured AND no verified JWT.
  if (jwtVerified === false) return { ok: false, reason: "jwt_invalid" };

  // Nothing configured to verify against. Fail closed in production; allow only
  // in sandbox/dev so an unconfigured prod deploy can't silently accept forgeries.
  if (env === "production") return { ok: false, reason: "no_verification_configured_in_prod" };
  return { ok: true, reason: "sandbox_unverified_allowed" };
}
