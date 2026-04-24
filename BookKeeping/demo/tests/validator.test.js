/**
 * tests/validator.test.js — unit tests for the voice validator.
 *
 * The validator is the highest-leverage thing in the demo — it gates every
 * Penny utterance before it reaches the user. Bugs here mean Penny says
 * things that violate the voice rules, which is the worst failure mode
 * for a trust-centric product.
 *
 * Run with `npm test`.
 */

import { describe, it, expect } from "vitest";
import { validate } from "../guardrails/voice-validator.js";

const validApprovalCard = {
  headline: "Notion — $19",
  why: "You've been using this for client notes. Categorizing as Software.",
  ctaPrimary: "Confirm",
  ctaSecondary: "Change",
};

describe("validate — shape", () => {
  it("accepts a well-formed approval card payload", () => {
    const v = validate(validApprovalCard, { intent: "card.approval" });
    expect(v.ok).toBe(true);
  });

  it("rejects missing headline", () => {
    const v = validate(
      { ...validApprovalCard, headline: "" },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(false);
  });

  it("rejects missing why", () => {
    const v = validate(
      { ...validApprovalCard, why: "" },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(false);
  });
});

describe("validate — banned phrases", () => {
  it("rejects shame-style backlog language", () => {
    const v = validate(
      {
        ...validApprovalCard,
        why: "You have 14 items to review. Let's clean them up.",
      },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(false);
  });

  it("rejects non-approved emoji", () => {
    const v = validate(
      { ...validApprovalCard, headline: "Notion — $19 ✅" },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(false);
  });

  it("accepts approved emoji 🎉", () => {
    const v = validate(
      { ...validApprovalCard, headline: "$3,500 in from Acme 🎉" },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(true);
  });
});

describe("validate — British spellings", () => {
  it("rejects 'organised'", () => {
    const v = validate(
      {
        ...validApprovalCard,
        why: "Organised under Software. Confirm?",
      },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(false);
  });

  it("rejects 'colour'", () => {
    const v = validate(
      { ...validApprovalCard, why: "Tagged with the team colour." },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(false);
  });

  it("accepts 'organized', 'color'", () => {
    const v = validate(
      { ...validApprovalCard, why: "Organized under Software. Color-coded." },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(true);
  });
});
