/**
 * PENNY-UX-4 — request-link + prefill-param logic. The producer (firm side) and
 * resolver (owner side) must round-trip exactly, and the resolver must reject
 * anything that isn't a plausible email — the param feeds the owner's invite form.
 */
import { describe, expect, it } from "vitest";
import { COPY } from "../copy/strings";
import {
  INVITE_CPA_PARAM, buildClientRequestLink, parsePrefillEmail,
} from "./addClientRequest";

const ORIGIN = "https://penny.founderfirst.one";

describe("buildClientRequestLink (producer — firm side)", () => {
  it("targets the owner's /settings invite form with the CPA email in the param", () => {
    const link = buildClientRequestLink(ORIGIN, "cpa@firm.com");
    expect(link).toBe(`${ORIGIN}/settings?${INVITE_CPA_PARAM}=cpa%40firm.com`);
  });

  it("URL-encodes emails that need it (plus-addressing survives the round trip)", () => {
    const link = buildClientRequestLink(ORIGIN, "books+clients@firm.com");
    expect(link).toContain("books%2Bclients%40firm.com");
    const parsed = new URL(link as string).searchParams.get(INVITE_CPA_PARAM);
    expect(parsed).toBe("books+clients@firm.com");
  });

  it("normalizes case + whitespace so the owner sees the canonical address", () => {
    const link = buildClientRequestLink(ORIGIN, "  CPA@Firm.COM ");
    expect(link).toBe(`${ORIGIN}/settings?${INVITE_CPA_PARAM}=cpa%40firm.com`);
  });

  it("refuses to build a dead-end link without a valid email", () => {
    expect(buildClientRequestLink(ORIGIN, "")).toBeNull();
    expect(buildClientRequestLink(ORIGIN, "not-an-email")).toBeNull();
  });
});

describe("parsePrefillEmail (resolver — owner side)", () => {
  it("accepts a valid email and normalizes it", () => {
    expect(parsePrefillEmail("CPA@Firm.com")).toBe("cpa@firm.com");
    expect(parsePrefillEmail(" cpa@firm.com ")).toBe("cpa@firm.com");
  });

  it("rejects junk, markup, and non-emails (the form must stay empty, not render attacker text)", () => {
    for (const bad of [
      null, undefined, "", "   ", "not-an-email", "a@b", "no spaces@x.com",
      "<script>alert(1)</script>", "javascript:alert(1)", "a@b@c.com is fine? no",
    ]) {
      expect(parsePrefillEmail(bad as string | null)).toBeNull();
    }
  });

  it("rejects overlong values (bounded like the server)", () => {
    expect(parsePrefillEmail(`${"a".repeat(250)}@x.com`)).toBeNull();
  });

  it("round-trips the producer's link exactly", () => {
    const email = "books+clients@firm.com";
    const link = buildClientRequestLink(ORIGIN, email) as string;
    const raw = new URL(link).searchParams.get(INVITE_CPA_PARAM);
    expect(parsePrefillEmail(raw)).toBe(email);
  });
});

describe("the copy matches the mechanism (F4 — no dead-end instructions)", () => {
  it("Practice-home empty copy points at the affordance that now exists", () => {
    expect(COPY.practice.noClientsBody).toContain(COPY.nav.addClient);
    expect(COPY.practice.noClientsBody.toLowerCase()).toContain("switcher");
  });

  it("the send-along message carries both the link and the manual fallback", () => {
    const link = buildClientRequestLink(ORIGIN, "cpa@firm.com") as string;
    const msg = COPY.addClient.message(link, "cpa@firm.com");
    expect(msg).toContain(link);
    expect(msg).toContain("cpa@firm.com");
    expect(msg.toLowerCase()).toContain("settings"); // the not-on-Penny-yet path
  });
});
