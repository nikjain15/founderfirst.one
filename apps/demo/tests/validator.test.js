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

describe("validate — null fields", () => {
  it("rejects a null top-level field", () => {
    const v = validate(
      { ...validApprovalCard, why: null },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(false);
  });
});

describe("validate — tone enum", () => {
  it("accepts a valid tone", () => {
    const v = validate(
      { ...validApprovalCard, tone: "fyi" },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(true);
  });

  it("rejects an unknown tone", () => {
    const v = validate(
      { ...validApprovalCard, tone: "warning" },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(false);
  });

  it("rejects tone 'celebration' for CPA viewer", () => {
    const v = validate(
      { ...validApprovalCard, tone: "celebration" },
      { intent: "books.qa", context: { viewer_role: "cpa" } }
    );
    expect(v.ok).toBe(false);
  });
});

describe("validate — CPA headline cap", () => {
  it("tightens headline cap to 80 chars when viewer_role is cpa", () => {
    const long = "A".repeat(100);
    const v = validate(
      { ...validApprovalCard, headline: long },
      { intent: "books.qa", context: { viewer_role: "cpa" } }
    );
    expect(v.ok).toBe(false);
  });

  it("permits 100-char headline for founder viewer", () => {
    const long = "A".repeat(100);
    const v = validate(
      { ...validApprovalCard, headline: long },
      { intent: "books.qa", context: { viewer_role: "founder" } }
    );
    expect(v.ok).toBe(true);
  });
});

describe("validate — CTA length", () => {
  it("rejects a CTA over 20 chars", () => {
    const v = validate(
      { ...validApprovalCard, ctaPrimary: "Confirm with my CPA today" },
      { intent: "card.approval" }
    );
    expect(v.ok).toBe(false);
  });
});

describe("validate — capture.parse shape", () => {
  const baseParse = {
    headline: "Got it — lunch with Sarah, $80.",
    parsed: {
      vendor: "Sarah (lunch)",
      amount: 80,
      category_guess: "Client meals (50%)",
      date: "2026-04-23",
    },
  };

  it("accepts a valid capture.parse", () => {
    const v = validate(baseParse, { intent: "capture.parse" });
    expect(v.ok).toBe(true);
  });

  it("accepts parsed.amount === null (asking for amount)", () => {
    const v = validate(
      { ...baseParse, parsed: { ...baseParse.parsed, amount: null } },
      { intent: "capture.parse" }
    );
    expect(v.ok).toBe(true);
  });

  it("rejects missing parsed.vendor", () => {
    const v = validate(
      { ...baseParse, parsed: { ...baseParse.parsed, vendor: "" } },
      { intent: "capture.parse" }
    );
    expect(v.ok).toBe(false);
  });

  it("rejects malformed date", () => {
    const v = validate(
      { ...baseParse, parsed: { ...baseParse.parsed, date: "yesterday" } },
      { intent: "capture.parse" }
    );
    expect(v.ok).toBe(false);
  });
});

describe("validate — tax caveat for books.qa / thread.qa", () => {
  it("rejects deduct claim without caveat", () => {
    const v = validate(
      {
        headline: "You can deduct that home office.",
        why: "It's a Schedule C Line 30 expense.",
      },
      { intent: "books.qa" }
    );
    expect(v.ok).toBe(false);
  });

  it("accepts deduct claim with founder-voice caveat", () => {
    const v = validate(
      {
        headline: "You can deduct that under current IRS rules.",
        why: "Routes to Schedule C Line 30. Your CPA will confirm.",
      },
      { intent: "books.qa" }
    );
    expect(v.ok).toBe(true);
  });

  it("accepts deduct claim with CPA-voice caveat", () => {
    const v = validate(
      {
        headline: "Deductible as Schedule C Line 30.",
        why: "Confirm with your filing position.",
      },
      { intent: "books.qa", context: { viewer_role: "cpa" } }
    );
    expect(v.ok).toBe(true);
  });
});

describe("validate — partnership entity guard", () => {
  it("rejects 'Schedule C' framing for partnership", () => {
    const v = validate(
      {
        headline: "This goes on Schedule C Line 22.",
        why: "Office supplies. Confirm with your filing position.",
      },
      { intent: "books.qa", context: { entity: "partnership" } }
    );
    expect(v.ok).toBe(false);
  });

  it("accepts Form 1065 framing for partnership", () => {
    const v = validate(
      {
        headline: "This routes to Form 1065 Line 20.",
        why: "Office supplies. Your CPA will confirm.",
      },
      { intent: "books.qa", context: { entity: "partnership" } }
    );
    expect(v.ok).toBe(true);
  });
});
