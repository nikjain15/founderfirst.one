/**
 * Difficulty routing for the categorization investigator (provider mocked).
 *
 * Proves the cascade actually executes and routes by DIFFICULTY instead of pinning
 * one model:
 *   - an easy, high-confidence, well-retrieved case stays on the CHEAP tier;
 *   - a low-confidence draft escalates to the REASONING tier;
 *   - a step-cap hit (a severe signal) escalates to the HARDEST tier;
 *   - a weak-retrieval case opens directly on the REASONING tier (no wasted cheap
 *     pass);
 *   - the sampling contract holds: the escalated reasoning/hardest models are NOT
 *     sampling-legal, so temperature is withheld from them;
 *   - the deterministic grounding gate still rejects an off-chart account.
 *
 * No network, no database — the model provider is a per-model scripted queue and
 * the data access is in-memory.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { investigateCategorization, type TierModels } from "./investigator.ts";
import { buildRetriever } from "./retrieval.ts";
import { acceptsSampling } from "../inference/core.ts";
import { mockDataAccess, SAMPLE_ACCOUNTS } from "./_mocks.ts";
import type { ConduitClient, InferParams } from "../conduit/client/types.ts";

const TIERS: TierModels = {
  cheap: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  reasoning: { provider: "anthropic", model: "claude-sonnet-4-6" },
  hardest: { provider: "anthropic", model: "claude-opus-4-8" },
};

function toolCall(name: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool: { name, args } });
}
function final(obj: unknown): string {
  return JSON.stringify({ final: obj });
}

/** A model client whose scripted replies are keyed by the pinned model id, so a
 *  test can give the cheap tier one behavior and an escalated tier another. Every
 *  infer call is recorded so the routed model (and its sampling params) is asserted. */
function routedClient(byModel: Record<string, string[]>): { client: ConduitClient; calls: InferParams[] } {
  const calls: InferParams[] = [];
  const idx: Record<string, number> = {};
  const client: ConduitClient = {
    mode: "embedded",
    infer(params: InferParams) {
      calls.push(params);
      const m = params.pinModel?.model ?? "unpinned";
      const q = byModel[m] ?? ["{}"];
      const i = idx[m] ?? 0;
      idx[m] = i + 1;
      const output = i < q.length ? q[i] : q[q.length - 1];
      return Promise.resolve({ output, model: m, provider: "anthropic" as const, costUsd: 0, latencyMs: 1 });
    },
    retrieve: () => Promise.resolve({ chunks: [], grounded: false }),
    runAgent: () => Promise.reject(new Error("unused")),
    evaluate: () => Promise.reject(new Error("unused")),
    usage: () => Promise.reject(new Error("unused")),
  };
  return { client, calls };
}

const priors = [{ account_id: "acc-software", account_name: "Software Subscriptions", match_value: "figma", times_applied: 3 }];
const data = () => mockDataAccess({
  accounts: SAMPLE_ACCOUNTS,
  transaction: { entry_id: "e1", description: "Figma monthly", direction: "out", amount_minor: 1500, entry_date: null },
  priors,
});
const groundedRetriever = () => buildRetriever({ accounts: SAMPLE_ACCOUNTS, priors, taxRules: [] });

function modelsUsed(calls: InferParams[]): string[] {
  return [...new Set(calls.map((c) => c.pinModel?.model ?? "unpinned"))];
}

Deno.test("easy, high-confidence, well-retrieved case stays on the CHEAP tier", async () => {
  const { client, calls } = routedClient({
    [TIERS.cheap.model]: [
      toolCall("prior_categorizations", { description: "Figma monthly" }),
      final({ account_id: "acc-software", confidence: 0.95, rationale: "Filed Figma under Software Subscriptions before." }),
    ],
  });
  const res = await investigateCategorization({
    client, retriever: groundedRetriever(), data: data(), entryId: "e1",
    description: "Figma monthly", direction: "out", accounts: SAMPLE_ACCOUNTS,
    useCase: "penny_categorize", maxSteps: 6, tiers: TIERS,
  });

  assertEquals(res.tier, "cheap");
  assertEquals(res.escalated, false);
  assertEquals(res.proposal?.account_id, "acc-software");
  assertEquals(modelsUsed(calls), [TIERS.cheap.model], "only the cheap tier was called");
  assert(acceptsSampling(TIERS.cheap.model), "cheap tier is sampling-legal (gets temperature)");
});

Deno.test("low-confidence draft escalates from CHEAP to the REASONING tier", async () => {
  const { client, calls } = routedClient({
    // Rationale is lexically grounded (so the groundedness heuristic passes) —
    // isolating LOW CONFIDENCE as the escalation signal under test.
    [TIERS.cheap.model]: [final({ account_id: "acc-software", confidence: 0.2, rationale: "Figma Software Subscriptions monthly" })],
    [TIERS.reasoning.model]: [final({ account_id: "acc-software", confidence: 0.88, rationale: "Figma is a software subscription." })],
  });
  const res = await investigateCategorization({
    client, retriever: groundedRetriever(), data: data(), entryId: "e1",
    description: "Figma monthly", direction: "out", accounts: SAMPLE_ACCOUNTS,
    useCase: "penny_categorize", maxSteps: 6, tiers: TIERS, escalateBelow: 0.45,
  });

  assertEquals(res.tier, "reasoning");
  assertEquals(res.escalated, true);
  assertEquals(res.escalationReason, "low_confidence");
  assertEquals(res.modelUsed, TIERS.reasoning.model);
  assertEquals(res.proposal?.confidence, 0.88);
  assert(calls.some((c) => c.pinModel?.model === TIERS.cheap.model), "cheap tier was tried first");
  assert(calls.some((c) => c.pinModel?.model === TIERS.reasoning.model), "escalated to reasoning");
  assert(!acceptsSampling(TIERS.reasoning.model), "sampling contract: reasoning tier withholds temperature");
});

Deno.test("step-cap hit (severe) escalates from CHEAP straight to the HARDEST tier", async () => {
  const { client, calls } = routedClient({
    // Cheap model never finalizes -> stops at the cap (a severe signal).
    [TIERS.cheap.model]: [toolCall("get_transaction", {})],
    [TIERS.hardest.model]: [final({ account_id: "acc-software", confidence: 0.9, rationale: "Software subscription." })],
  });
  const res = await investigateCategorization({
    client, retriever: groundedRetriever(), data: data(), entryId: "e1",
    description: "Figma monthly", direction: "out", accounts: SAMPLE_ACCOUNTS,
    useCase: "penny_categorize", maxSteps: 3, tiers: TIERS,
  });

  assertEquals(res.tier, "hardest");
  assertEquals(res.escalated, true);
  assertEquals(res.escalationReason, "stopped_at_cap");
  assertEquals(res.proposal?.account_id, "acc-software");
  assert(calls.some((c) => c.pinModel?.model === TIERS.hardest.model), "escalated to the hardest tier");
  assert(!calls.some((c) => c.pinModel?.model === TIERS.reasoning.model), "did not stop at reasoning for a severe signal");
  assert(!acceptsSampling(TIERS.hardest.model), "sampling contract: hardest tier withholds temperature");
});

Deno.test("weak-retrieval case opens directly on the REASONING tier", async () => {
  // A description with no lexical overlap with the corpus fails the retrieval gate.
  const weakDesc = "Zzqx 9981 unknownvendor";
  const { client, calls } = routedClient({
    [TIERS.reasoning.model]: [final({ account_id: "acc-meals", confidence: 0.7, rationale: "Best available match." })],
  });
  const res = await investigateCategorization({
    client, retriever: groundedRetriever(),
    data: mockDataAccess({ accounts: SAMPLE_ACCOUNTS, transaction: { entry_id: "e2", description: weakDesc, direction: "out", amount_minor: 100, entry_date: null }, priors }),
    entryId: "e2", description: weakDesc, direction: "out", accounts: SAMPLE_ACCOUNTS,
    useCase: "penny_categorize", maxSteps: 6, tiers: TIERS,
  });

  assertEquals(res.tier, "reasoning");
  assertEquals(res.escalated, true);
  assertEquals(res.escalationReason, "weak_retrieval");
  assertEquals(modelsUsed(calls), [TIERS.reasoning.model], "the cheap tier was never called for a weak-retrieval case");
});

Deno.test("deterministic grounding gate still rejects an off-chart account under routing", async () => {
  const { client } = routedClient({
    [TIERS.cheap.model]: [final({ account_id: "acc-not-in-chart", confidence: 0.99, rationale: "hallucinated" })],
    // Escalation (no grounded draft is severe) also hallucinates -> still rejected.
    [TIERS.hardest.model]: [final({ account_id: "acc-still-not-real", confidence: 0.99, rationale: "hallucinated again" })],
  });
  const res = await investigateCategorization({
    client, retriever: groundedRetriever(), data: data(), entryId: "e1",
    description: "Figma monthly", direction: "out", accounts: SAMPLE_ACCOUNTS,
    useCase: "penny_categorize", maxSteps: 6, tiers: TIERS,
  });
  assertEquals(res.proposal, null, "an off-chart account is never proposed, on any tier");
  assertEquals(res.note, "ungrounded_account");
});

Deno.test("sampling contract: only Haiku-class models accept temperature", () => {
  assert(acceptsSampling("claude-haiku-4-5-20251001"));
  assert(acceptsSampling("claude-haiku-4-5"));
  assert(!acceptsSampling("claude-sonnet-4-6"));
  assert(!acceptsSampling("claude-opus-4-8"));
  assert(!acceptsSampling(undefined));
});
