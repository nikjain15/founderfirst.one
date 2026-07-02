/**
 * W2.3 red-team · plaid-webhook is a PUBLIC endpoint — forged webhooks are the
 * crown-jewel target. These pin the auth gate (supabase/functions/_shared/
 * plaidWebhookVerify.ts): a forged POST with no valid secret / no verified JWT is
 * rejected, and an unconfigured PRODUCTION deploy fails closed.
 */
import { describe, expect, it } from "vitest";
import {
  safeEqual,
  verifyPlaidWebhook,
} from "../../../../supabase/functions/_shared/plaidWebhookVerify.ts";

const base = {
  headerSecret: null as string | null,
  querySecret: null as string | null,
  configuredSecret: null as string | null,
  jwtVerified: null as boolean | null,
  env: "sandbox",
};

describe("plaid webhook verification gate", () => {
  it("FORGERY: a secret is configured but the caller presents none → rejected", () => {
    const r = verifyPlaidWebhook({ ...base, configuredSecret: "s3cr3t" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad_or_missing_secret");
  });

  it("FORGERY: wrong secret → rejected", () => {
    const r = verifyPlaidWebhook({ ...base, configuredSecret: "s3cr3t", headerSecret: "guess" });
    expect(r.ok).toBe(false);
  });

  it("correct shared secret (header) → accepted", () => {
    const r = verifyPlaidWebhook({ ...base, configuredSecret: "s3cr3t", headerSecret: "s3cr3t" });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("shared_secret");
  });

  it("correct shared secret (query param) → accepted", () => {
    const r = verifyPlaidWebhook({ ...base, configuredSecret: "s3cr3t", querySecret: "s3cr3t" });
    expect(r.ok).toBe(true);
  });

  it("a genuinely Plaid-signed JWT passes even with no shared secret", () => {
    const r = verifyPlaidWebhook({ ...base, jwtVerified: true });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("jwt_verified");
  });

  it("a present-but-invalid JWT and no secret → rejected", () => {
    const r = verifyPlaidWebhook({ ...base, jwtVerified: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("jwt_invalid");
  });

  it("PROD fail-closed: nothing configured in production → rejected", () => {
    const r = verifyPlaidWebhook({ ...base, env: "production" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_verification_configured_in_prod");
  });

  it("sandbox with nothing configured → allowed (dev ergonomics only)", () => {
    const r = verifyPlaidWebhook({ ...base, env: "sandbox" });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("sandbox_unverified_allowed");
  });

  it("safeEqual is length-safe and value-correct", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
