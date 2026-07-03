/**
 * penny-thread unit tests — the deterministic (model-off) path (W3.1, red-team P2-2).
 *
 * These assert the pieces that make the deterministic fallback correct AND persona-
 * driven, so that with no ANTHROPIC_API_KEY (or a model outage) the owner still gets
 * the right figure, and editing the live 'app' persona still changes the thread's
 * decline / connect-books copy (not a hardcoded English string).
 *
 *   deno test supabase/functions/penny-thread/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  money, metricPhrase, personaOverride, DECLINE_DEFAULT, CONNECT_BOOKS_DEFAULT,
  type GroundedFact,
} from "../_shared/thread/route.ts";

Deno.test("money: renders minor units as USD, parens for negatives", () => {
  assertEquals(money(20000), "$200.00");
  assertEquals(money(0), "$0.00");
  assertEquals(money(-500), "($5.00)");
});

Deno.test("metricPhrase: states the exact figure and category/period", () => {
  const f: GroundedFact = {
    metric: "spend", amountMinor: 20000, categoryLabel: "Software",
    periodLabel: "Q2 2026", categoryUnmatched: false,
  };
  const p = metricPhrase(f);
  assertEquals(p.includes("$200.00"), true);
  assertEquals(p.includes("Software"), true);
  assertEquals(p.includes("Q2 2026"), true);
});

Deno.test("personaOverride: a persona edit changes the deterministic decline copy (P2-2)", () => {
  // With no override tag, the fn uses the baked defaults.
  const plain = "You are Penny. Warm and grounded.";
  assertEquals(personaOverride(plain, "decline"), null);
  assertEquals(personaOverride(plain, "empty"), null);

  // Editing the live 'app' persona to include labeled lines changes the output on
  // the deterministic path with no redeploy.
  const edited =
    "You are Penny. Warm and grounded.\n" +
    "[thread:decline] I can only speak to your income, spending, profit, and cash.\n" +
    "[thread:empty] Hook up your bank and I'll start reading your books.";
  assertEquals(
    personaOverride(edited, "decline"),
    "I can only speak to your income, spending, profit, and cash.",
  );
  assertEquals(
    personaOverride(edited, "empty"),
    "Hook up your bank and I'll start reading your books.",
  );
});

Deno.test("baked fallback copy is Q&A-appropriate (not the categorize prompt)", () => {
  // The thread's baked decline/defer copy must be about answering money questions —
  // never the categorize prompt's 'return an account_id' framing.
  assertEquals(DECLINE_DEFAULT.includes("account_id"), false);
  assertEquals(CONNECT_BOOKS_DEFAULT.includes("account_id"), false);
  assertEquals(CONNECT_BOOKS_DEFAULT.toLowerCase().includes("connect"), true);
});
