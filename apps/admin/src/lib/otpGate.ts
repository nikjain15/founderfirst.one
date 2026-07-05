/**
 * Pure decision logic for whether an OTP-request submit may proceed (card
 * SEC-2). Mirrors apps/app/src/auth/otpGate.ts — kept separate since apps/admin
 * and apps/app are independent packages with no shared component library.
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
