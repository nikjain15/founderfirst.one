import { describe, expect, it } from "vitest";
import { canDispatchOtp } from "./otpGate";

describe("canDispatchOtp (admin)", () => {
  it("allows dispatch when Turnstile is not configured and the rate limit passes", () => {
    expect(
      canDispatchOtp({ hasTurnstile: false, captchaToken: null, rateLimit: { allowed: true } }),
    ).toEqual({ ok: true });
  });

  it("blocks on a missing captcha token when Turnstile IS configured", () => {
    expect(
      canDispatchOtp({ hasTurnstile: true, captchaToken: null, rateLimit: { allowed: true } }),
    ).toEqual({ ok: false, reason: "captcha_required" });
  });

  it("blocks on the server-side rate limit regardless of captcha state", () => {
    expect(
      canDispatchOtp({
        hasTurnstile: true,
        captchaToken: "tok",
        rateLimit: { allowed: false, retry_after_seconds: 42 },
      }),
    ).toEqual({ ok: false, reason: "rate_limited", retryAfterSeconds: 42 });
  });
});
