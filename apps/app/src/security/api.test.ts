import { describe, it, expect } from "vitest";
import { mfaGateState, orgMfaGateBlocked } from "./api";

// The pure decision cores of SEC-1's two gates: the login-time step-up (any
// verified factor must reach aal2 before anything renders) and the per-org
// "require two-factor" policy (blocks only members without a verified factor).

describe("mfaGateState (login-time step-up)", () => {
  it("no assurance data yet → ok (don't block on an unresolved query)", () => {
    expect(mfaGateState(null)).toBe("ok");
  });

  it("aal1 with no elevation available (no enrolled factor) → ok", () => {
    expect(mfaGateState({ currentLevel: "aal1", nextLevel: "aal1" })).toBe("ok");
  });

  it("already at aal2 → ok, even though a factor exists", () => {
    expect(mfaGateState({ currentLevel: "aal2", nextLevel: "aal2" })).toBe("ok");
  });

  it("aal1 but a verified factor makes aal2 reachable → challenge", () => {
    expect(mfaGateState({ currentLevel: "aal1", nextLevel: "aal2" })).toBe("challenge");
  });
});

describe("orgMfaGateBlocked (per-org require-MFA policy)", () => {
  it("org does not require MFA → never blocked, factor status irrelevant", () => {
    expect(orgMfaGateBlocked({ mfaRequired: false, hasVerifiedFactor: false })).toBe(false);
    expect(orgMfaGateBlocked({ mfaRequired: false, hasVerifiedFactor: true })).toBe(false);
  });

  it("org requires MFA and the user has no verified factor → blocked", () => {
    expect(orgMfaGateBlocked({ mfaRequired: true, hasVerifiedFactor: false })).toBe(true);
  });

  it("org requires MFA and the user already has a verified factor → not blocked", () => {
    expect(orgMfaGateBlocked({ mfaRequired: true, hasVerifiedFactor: true })).toBe(false);
  });
});
