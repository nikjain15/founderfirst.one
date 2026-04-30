/**
 * tests/copy.test.js — unit tests for constants/copy.js.
 *
 * Three jobs:
 *   1. Confirm every exported group (and nested object) is frozen.
 *   2. Lock the 8 onboarding strings byte-identically against the
 *      "Approved onboarding copy" table in BookKeeping/demo/CLAUDE.md.
 *   3. Exercise every function entry to confirm interpolation shape.
 *
 * Run with `npm test`.
 */

import { describe, it, expect } from "vitest";
import {
  ONBOARDING_COPY,
  THREAD_INTRO_COPY,
  CARD_FALLBACK_COPY,
  EMPTY_STATE_COPY,
  TOAST_COPY,
  ERROR_COPY,
} from "../constants/ui-text.js";

// ── Freeze checks ────────────────────────────────────────────────────────────

describe("copy — freeze (top-level groups)", () => {
  it("freezes ONBOARDING_COPY",   () => expect(Object.isFrozen(ONBOARDING_COPY)).toBe(true));
  it("freezes THREAD_INTRO_COPY", () => expect(Object.isFrozen(THREAD_INTRO_COPY)).toBe(true));
  it("freezes CARD_FALLBACK_COPY",() => expect(Object.isFrozen(CARD_FALLBACK_COPY)).toBe(true));
  it("freezes EMPTY_STATE_COPY",  () => expect(Object.isFrozen(EMPTY_STATE_COPY)).toBe(true));
  it("freezes TOAST_COPY",        () => expect(Object.isFrozen(TOAST_COPY)).toBe(true));
  it("freezes ERROR_COPY",        () => expect(Object.isFrozen(ERROR_COPY)).toBe(true));
});

describe("copy — freeze (nested onboarding rows)", () => {
  for (const key of ["welcome", "entity", "entity-diag", "industry", "payments", "expenses", "checkin", "bank", "pulling"]) {
    it(`freezes ONBOARDING_COPY["${key}"]`, () => {
      expect(Object.isFrozen(ONBOARDING_COPY[key])).toBe(true);
    });
  }
});

describe("copy — freeze (nested thread + card rows)", () => {
  it("freezes THREAD_INTRO_COPY.nameQuestion", () => expect(Object.isFrozen(THREAD_INTRO_COPY.nameQuestion)).toBe(true));
  it("freezes THREAD_INTRO_COPY.idleFallback", () => expect(Object.isFrozen(THREAD_INTRO_COPY.idleFallback)).toBe(true));
  it("freezes ERROR_COPY.threadQaError",       () => expect(Object.isFrozen(ERROR_COPY.threadQaError)).toBe(true));
  it("freezes ERROR_COPY.booksQaError",        () => expect(Object.isFrozen(ERROR_COPY.booksQaError)).toBe(true));
});

// ── Locked onboarding strings (byte-identical to demo/CLAUDE.md table) ───────
//
// Editing any of these eight strings without CEO sign-off is a regression.
// If a test here fails, do NOT change the test — change the registry back.

describe("ONBOARDING_COPY — locked headlines / whys", () => {
  it("welcome row",  () => {
    expect(ONBOARDING_COPY.welcome.greeting).toBe("👋 Hi, I'm Penny.");
    expect(ONBOARDING_COPY.welcome.headline).toBe("Nice to meet you. The books are on me from here.");
    expect(ONBOARDING_COPY.welcome.why).toBe("One quick setup and I take it from here — for good.");
  });
  it("entity row", () => {
    expect(ONBOARDING_COPY.entity.headline).toBe("Let me make sure I understand your setup first.");
    expect(ONBOARDING_COPY.entity.why).toBe("Get this right once and I'll handle everything the right way — every time.");
  });
  it("entity-diag row", () => {
    expect(ONBOARDING_COPY["entity-diag"].headline).toBe("No worries at all — let's work it out together.");
    expect(ONBOARDING_COPY["entity-diag"].why).toBe("Two questions and I'll know exactly what to do.");
  });
  it("industry row", () => {
    expect(ONBOARDING_COPY.industry.headline).toBe("What kind of work do you do?");
    expect(ONBOARDING_COPY.industry.why).toBe("I want to know your business the way you know it.");
  });
  it("payments row", () => {
    expect(ONBOARDING_COPY.payments.headline).toBe("How do your clients pay you?");
    expect(ONBOARDING_COPY.payments.why).toBe("Every payment you earn — I'll be watching for it.");
  });
  it("expenses row", () => {
    expect(ONBOARDING_COPY.expenses.headline).toBe("What do you usually spend on?");
    expect(ONBOARDING_COPY.expenses.why).toBe("Tell me once. I'll recognize it every time after that.");
  });
  it("checkin row", () => {
    expect(ONBOARDING_COPY.checkin.headline).toBe("When's a good time for me to check in?");
    expect(ONBOARDING_COPY.checkin.why).toBe("I'll have everything ready — you just show up.");
  });
  it("bank row", () => {
    expect(ONBOARDING_COPY.bank.headline).toBe("Which account should I start watching?");
    expect(ONBOARDING_COPY.bank.why).toBe("I read every transaction as it comes in. Your money never moves.");
  });
});

// ── Function entries — interpolation shape ───────────────────────────────────

describe("THREAD_INTRO_COPY — interpolation", () => {
  it("businessQuestion(name) returns the locked phrasing", () => {
    expect(THREAD_INTRO_COPY.businessQuestion("Sarah")).toEqual({
      headline: "Nice to meet you, Sarah! What's your business called?",
      why:      "So Penny speaks to you, not just anyone.",
    });
  });
  it("greetingFallback(firstName) interpolates when present", () => {
    expect(THREAD_INTRO_COPY.greetingFallback("Sarah")).toEqual({
      headline: "Hi, Sarah. Here's what I'm seeing.",
      why:      "I pulled in the last 30 days.",
      tone:     "fyi",
    });
  });
  it("greetingFallback(\"\") drops the comma", () => {
    expect(THREAD_INTRO_COPY.greetingFallback("")).toEqual({
      headline: "Hi. Here's what I'm seeing.",
      why:      "I pulled in the last 30 days.",
      tone:     "fyi",
    });
  });
});

describe("CARD_FALLBACK_COPY — interpolation", () => {
  it("income(vendor, amountFmt)", () => {
    expect(CARD_FALLBACK_COPY.income("Bright Co", "$3,000")).toEqual({
      headline: "You just got paid 🎉",
      why:      "Bright Co — $3,000.",
      tone:     "celebration",
    });
  });
  it("ownersDraw(amountFmt)", () => {
    expect(CARD_FALLBACK_COPY.ownersDraw("$1,500")).toEqual({
      headline: "$1,500 moved to your personal account.",
      why:      "That's an owner's draw — it won't count as an expense.",
      tone:     "fyi",
    });
  });
  it("lowConfidence(amountFmt)", () => {
    expect(CARD_FALLBACK_COPY.lowConfidence("$42")).toEqual({
      headline:     "Caught a charge I don't recognize — $42.",
      why:          "Can you help me file this one?",
      ctaPrimary:   "Yes, business",
      ctaSecondary: "Personal",
      tone:         "action",
    });
  });
  it("expenseDefault(vendor, amountFmt, categoryGuess)", () => {
    expect(CARD_FALLBACK_COPY.expenseDefault("Notion", "$19", "Software")).toEqual({
      headline:     "Notion — $19.",
      why:          "Looks like Software.",
      ctaPrimary:   "Confirm",
      ctaSecondary: "Change",
      tone:         "fyi",
    });
  });
  it("expenseDefault falls back to 'an expense' when categoryGuess is null", () => {
    expect(CARD_FALLBACK_COPY.expenseDefault("Notion", "$19", null).why).toBe("Looks like an expense.");
    expect(CARD_FALLBACK_COPY.expenseDefault("Notion", "$19", undefined).why).toBe("Looks like an expense.");
  });
});

describe("TOAST_COPY — interpolation", () => {
  it("changedTo(category)",          () => expect(TOAST_COPY.changedTo("Software")).toBe("Changed to Software"));
  it("ruleCreated(vendor, category)", () => expect(TOAST_COPY.ruleCreated("Notion", "Software")).toBe("Auto-categorizing Notion as Software going forward ✓"));
  it("booksSentToCpa(cpaName)",      () => expect(TOAST_COPY.booksSentToCpa("Pat")).toBe("Books sent to Pat ✓"));
  it("staleAddRedirect(cpaName)",    () => expect(TOAST_COPY.staleAddRedirect("Pat")).toBe('Tap "Invite to live books" to manage Pat\'s additions.'));
  it("alreadyConnected(name)",       () => expect(TOAST_COPY.alreadyConnected("Chase")).toBe("Chase is already connected."));
  it("providerConnected(name)",      () => expect(TOAST_COPY.providerConnected("Chase")).toBe("Chase connected."));
  it("emailConnectedWatching(name)", () => expect(TOAST_COPY.emailConnectedWatching("Gmail")).toBe("Gmail connected — watching for receipts."));
  it("importComplete(count)",        () => expect(TOAST_COPY.importComplete(42)).toBe("42 transactions imported. Check your Penny thread."));
  it("invoiceSent(email)",           () => expect(TOAST_COPY.invoiceSent("a@b.co")).toBe("Invoice sent to a@b.co."));
  it("recurringScheduled(freq)",     () => expect(TOAST_COPY.recurringScheduled("monthly")).toBe("Recurring monthly invoice scheduled ✓"));
});

// ── Bucket coverage — lightweight sanity ─────────────────────────────────────

describe("copy — bucket sanity", () => {
  it("EMPTY_STATE_COPY entries are all non-empty strings", () => {
    for (const [k, v] of Object.entries(EMPTY_STATE_COPY)) {
      expect(typeof v, `EMPTY_STATE_COPY.${k}`).toBe("string");
      expect(v.length, `EMPTY_STATE_COPY.${k}`).toBeGreaterThan(0);
    }
  });
  it("TOAST_COPY entries are strings or functions", () => {
    for (const [k, v] of Object.entries(TOAST_COPY)) {
      expect(["string", "function"], `TOAST_COPY.${k}`).toContain(typeof v);
    }
  });
  it("ERROR_COPY entries are strings or frozen message objects", () => {
    for (const [k, v] of Object.entries(ERROR_COPY)) {
      if (typeof v === "object" && v !== null) {
        expect(Object.isFrozen(v), `ERROR_COPY.${k}`).toBe(true);
      } else {
        expect(typeof v, `ERROR_COPY.${k}`).toBe("string");
      }
    }
  });
});
