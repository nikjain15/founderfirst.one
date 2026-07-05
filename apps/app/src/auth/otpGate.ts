/**
 * Pure decision logic for whether an OTP-request submit may proceed (card
 * SEC-2). Kept separate from Login.tsx so the two independent gates — Cloudflare
 * Turnstile bot-check and the server-side rate limit (supabase/migrations/
 * 20260707070000_sec2_otp_rate_limit.sql) — are unit-testable without rendering
 * a component or hitting the network.
 */
export type OtpGateResult =
  | { ok: true }
  | { ok: false; reason: "captcha_required" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

export function canDispatchOtp(opts: {
  hasTurnstile: boolean;
  captchaToken: string | null;
  rateLimit: { allowed: true } | { allowed: false; retry_after_seconds: number };
}): OtpGateResult {
  if (opts.hasTurnstile && !opts.captchaToken) {
    return { ok: false, reason: "captcha_required" };
  }
  if (!opts.rateLimit.allowed) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: opts.rateLimit.retry_after_seconds };
  }
  return { ok: true };
}
