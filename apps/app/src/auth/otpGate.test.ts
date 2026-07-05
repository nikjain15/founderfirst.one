import { describe, expect, it } from "vitest";
import { canDispatchOtp } from "./otpGate";

describe("canDispatchOtp", () => {
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

  it("allows dispatch once a captcha token is present", () => {
    expect(
      canDispatchOtp({ hasTurnstile: true, captchaToken: "tok", rateLimit: { allowed: true } }),
    ).toEqual({ ok: true });
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

  it("checks captcha BEFORE the rate limit (fail on the cheaper check first)", () => {
    expect(
      canDispatchOtp({
        hasTurnstile: true,
        captchaToken: null,
        rateLimit: { allowed: false, retry_after_seconds: 10 },
      }),
    ).toEqual({ ok: false, reason: "captcha_required" });
  });
});
