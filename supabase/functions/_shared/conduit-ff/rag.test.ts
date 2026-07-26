/**
 * RAG grounding tests: both failure modes handled explicitly.
 *   (a) bad retrieval -> say not-found, never invent
 *   (b) unfaithful answer -> groundedness heuristic flags unsupported spans
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRetriever } from "./retrieval.ts";
import { SAMPLE_ACCOUNTS } from "./_mocks.ts";

const corpus = {
  accounts: SAMPLE_ACCOUNTS,
  priors: [{ account_id: "acc-software", account_name: "Software Subscriptions", match_value: "figma", times_applied: 3 }],
  taxRules: [
    { id: "meals-50", text: "Business meals are generally 50 percent deductible when ordinary and necessary." },
  ],
};

Deno.test("(a) bad retrieval: an unrelated query returns not-found, no context", async () => {
  const r = buildRetriever(corpus);
  const out = await r.retrieveGrounded("quantum chromodynamics lattice gauge");
  assertEquals(out.grounded, false);
  assertEquals(out.context, "");
  assert(out.gate.reason, "gate should explain why it is not grounded");
});

Deno.test("(a) empty corpus is always not-found", async () => {
  const r = buildRetriever({ accounts: [], priors: [], taxRules: [] });
  const out = await r.retrieveGrounded("anything");
  assertEquals(out.grounded, false);
});

Deno.test("relevant query grounds and returns real corpus context", async () => {
  const r = buildRetriever(corpus);
  const out = await r.retrieveGrounded("meals deductible");
  assertEquals(out.grounded, true);
  assert(out.context.toLowerCase().includes("deductible"), "context comes from the corpus");
});

Deno.test("(b) unfaithful answer: groundedness flags a claim with no lexical anchor", async () => {
  const r = buildRetriever(corpus);
  const out = await r.retrieveGrounded("meals deductible");
  const report = r.assertGrounded("Meals are fully deductible and travel is reimbursed at aircraft rates.", out.results);
  assertEquals(report.grounded, false);
  assert(report.unsupported.length > 0, "the unsupported claim is flagged");
  assertEquals(report.method, "lexical-overlap-heuristic");
});

Deno.test("(b) a faithful answer passes the groundedness heuristic", async () => {
  const r = buildRetriever(corpus);
  const out = await r.retrieveGrounded("meals deductible");
  const report = r.assertGrounded("Business meals are generally 50 percent deductible.", out.results);
  assertEquals(report.grounded, true);
});
