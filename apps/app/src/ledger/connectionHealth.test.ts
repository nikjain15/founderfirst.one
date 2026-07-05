/**
 * IQ-2 · Connections UX coverage. Two halves:
 *   1. Pure logic — brokenConnections / isBroken / isReconnectable pick out the
 *      connections that need the banner and decide which offer one-click Reconnect.
 *   2. Source invariants — the banner renders ONLY for broken connections and
 *      exposes a Reconnect CTA that re-runs the OAuth connect path; the support
 *      affordance resolves to SITE.email (never a hardcoded address); no bare <h1>
 *      on this authed surface. Node env (no DOM), mirroring the app suite style.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SITE } from "@ff/site";
import { brokenConnections, isBroken, isReconnectable } from "./connectionHealth";
import type { ExternalConnection } from "./api";

const conn = (p: Partial<ExternalConnection>): ExternalConnection => ({
  id: "c1", provider: "qbo", tenant_name: "Acme", status: "active", last_error: null, ...p,
});

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("connection health — broken detection", () => {
  it("flags error and revoked as broken, active/pending as healthy", () => {
    expect(isBroken({ status: "error" })).toBe(true);
    expect(isBroken({ status: "revoked" })).toBe(true);
    expect(isBroken({ status: "active" })).toBe(false);
    expect(isBroken({ status: "pending" })).toBe(false);
  });

  it("brokenConnections returns only the broken ones (banner is broken-only)", () => {
    const conns = [
      conn({ id: "ok", status: "active" }),
      conn({ id: "bad", status: "error", last_error: "invalid_grant" }),
      conn({ id: "gone", status: "revoked", provider: "xero" }),
      conn({ id: "new", status: "pending" }),
    ];
    expect(brokenConnections(conns).map((c) => c.id)).toEqual(["bad", "gone"]);
  });

  it("all-healthy → no banner rows (empty)", () => {
    expect(brokenConnections([conn({ status: "active" })])).toEqual([]);
    expect(brokenConnections(undefined)).toEqual([]);
  });
});

describe("connection health — reconnectability", () => {
  it("OAuth providers (qbo/xero) can be reconnected in place", () => {
    expect(isReconnectable({ provider: "qbo" })).toBe(true);
    expect(isReconnectable({ provider: "xero" })).toBe(true);
  });
  it("bank feeds (plaid) fall back to manual — no in-place reconnect", () => {
    expect(isReconnectable({ provider: "plaid" })).toBe(false);
  });
});

describe("in-app support — resolves to SITE.email, never hardcoded", () => {
  const src = read("../components/ContactSupport.tsx");

  it("SITE.email is the single public support address", () => {
    expect(SITE.email).toBe("founder@founderfirst.one");
  });
  it("ContactSupport sources the address from SITE, not a literal", () => {
    expect(src).toMatch(/SITE\.email/);
    expect(src).toMatch(/from "@ff\/site"/);
    expect(src).not.toMatch(/founder@founderfirst\.one/); // no hardcoded address
    expect(src).toMatch(/mailto:/);
  });
  it("support copy comes from COPY (centralization)", () => {
    expect(src).toMatch(/COPY\.connections\.support/);
  });
});

describe("broken-connection banner — CTA + design invariants", () => {
  const src = read("../import/ImportFlow.tsx");

  it("renders a Reconnect CTA wired to the OAuth connect path", () => {
    expect(src).toMatch(/connectProvider\(/);
    expect(src).toMatch(/authorize_url/);
    expect(src).toMatch(/COPY\.importFlow\.reconnect\(/);
  });
  it("banner is gated on broken connections only", () => {
    expect(src).toMatch(/brokenConnections\(/);
    expect(src).toMatch(/if \(broken\.length === 0\) return null/);
  });
  it("no bare <h1> on this authed surface", () => {
    expect(src).not.toMatch(/<h1[\s>]/);
  });
});
