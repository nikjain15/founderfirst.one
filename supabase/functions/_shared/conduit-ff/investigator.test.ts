/**
 * End-to-end tests for the categorization agent loop (provider mocked).
 *
 * Proves: the loop terminates with a grounded draft; it respects the step cap;
 * it stays read-only (no-authority invariant); it grounds tool answers in the
 * retrieved corpus; and the deterministic grounding gate still rejects an
 * off-chart account. No network, no database.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { investigateCategorization, parseTurn } from "./investigator.ts";
import { buildRetriever } from "./retrieval.ts";
import { buildInvestigatorTools } from "./tools.ts";
import { runAgent } from "../conduit/agent/loop.ts";
import type { Tool } from "../conduit/agent/tool.ts";
import { mockDataAccess, scriptedClient, SAMPLE_ACCOUNTS } from "./_mocks.ts";

function toolCall(name: string, args: Record<string, unknown>): string {
  return JSON.stringify({ tool: { name, args } });
}
function final(obj: unknown): string {
  return JSON.stringify({ final: obj });
}

const baseInput = () => {
  const data = mockDataAccess({
    accounts: SAMPLE_ACCOUNTS,
    transaction: { entry_id: "e1", description: "Figma monthly", direction: "out", amount_minor: 1500, entry_date: null },
    priors: [{ account_id: "acc-software", account_name: "Software Subscriptions", match_value: "figma", times_applied: 3 }],
  });
  const retriever = buildRetriever({
    accounts: SAMPLE_ACCOUNTS,
    priors: [{ account_id: "acc-software", account_name: "Software Subscriptions", match_value: "figma", times_applied: 3 }],
    taxRules: [],
  });
  return { data, retriever };
};

Deno.test("agent loop terminates with a grounded draft proposal", async () => {
  const { data, retriever } = baseInput();
  const { client, calls } = scriptedClient([
    toolCall("get_transaction", {}),
    toolCall("prior_categorizations", { description: "Figma monthly" }),
    final({ account_id: "acc-software", confidence: 0.9, rationale: "Filed Figma under Software Subscriptions before." }),
  ]);

  const res = await investigateCategorization({
    client, retriever, data, entryId: "e1", description: "Figma monthly", direction: "out",
    accounts: SAMPLE_ACCOUNTS, useCase: "penny_categorize", maxSteps: 6,
  });

  assert(res.proposal, "expected a proposal");
  assertEquals(res.proposal?.account_id, "acc-software");
  assertEquals(res.stoppedAtCap, false);
  assert(res.steps >= 3, "should have taken tool + final steps");
  assert(calls.length >= 3, "each turn is one client.infer call");
});

Deno.test("agent loop respects the step cap (never-finishing model yields no proposal)", async () => {
  const { data, retriever } = baseInput();
  // Model only ever asks for the transaction, never finalizes.
  const { client } = scriptedClient([toolCall("get_transaction", {})]);
  const res = await investigateCategorization({
    client, retriever, data, entryId: "e1", description: "Figma monthly", direction: "out",
    accounts: SAMPLE_ACCOUNTS, useCase: "penny_categorize", maxSteps: 3,
  });
  assertEquals(res.stoppedAtCap, true);
  assertEquals(res.proposal, null);
  assertEquals(res.steps, 3, "took exactly maxSteps turns");
});

Deno.test("deterministic grounding gate rejects an off-chart account id", async () => {
  const { data, retriever } = baseInput();
  const { client } = scriptedClient([
    final({ account_id: "acc-not-in-chart", confidence: 0.99, rationale: "hallucinated account" }),
  ]);
  const res = await investigateCategorization({
    client, retriever, data, entryId: "e1", description: "Figma monthly", direction: "out",
    accounts: SAMPLE_ACCOUNTS, useCase: "penny_categorize",
  });
  assertEquals(res.proposal, null);
  assertEquals(res.note, "ungrounded_account");
});

Deno.test("no-authority invariant: a side-effecting tool is refused, not executed", async () => {
  let wrote = false;
  const writeTool: Tool = {
    name: "post_ledger",
    description: "writes the ledger",
    sideEffecting: true,
    jsonSchema: { type: "object", properties: {} },
    handler: () => {
      wrote = true;
      return Promise.resolve({ ok: true });
    },
  };
  const result = await runAgent({
    goal: "categorize",
    tools: [writeTool],
    maxSteps: 2,
    // callModel tries the write tool, then would finalize.
    callModel: (() => {
      let n = 0;
      return () => {
        n++;
        return Promise.resolve(n === 1 ? { toolCall: { name: "post_ledger", args: {} } } : { finalAnswer: "done" });
      };
    })(),
    // allowSideEffects intentionally omitted -> default deny.
  });
  assertEquals(wrote, false, "side-effecting handler must never run");
  const refused = result.steps.find((s) => s.kind === "tool_error" && s.error.kind === "side_effect_refused");
  assert(refused, "expected a side_effect_refused observation");
});

Deno.test("tools ground answers in retrieved data; tax_rule_lookup says not-found on empty corpus", async () => {
  const { data, retriever } = baseInput();
  const tools = buildInvestigatorTools({ data, retriever, entryId: "e1" });
  const taxTool = tools.find((t) => t.name === "tax_rule_lookup")!;
  const out = await taxTool.handler({ query: "depreciation MACRS recovery schedule" }) as { found: boolean };
  assertEquals(out.found, false, "no matching rule in corpus -> not found, never invented");

  const priorTool = tools.find((t) => t.name === "prior_categorizations")!;
  const priors = await priorTool.handler({ description: "Figma monthly" }) as { priors: unknown[] };
  assertEquals(priors.priors.length, 1, "prior categorization retrieved from the org's real data");
});

Deno.test("parseTurn tolerates code fences and stray prose", () => {
  assertEquals(parseTurn("```json\n{\"final\":{\"account_id\":\"a\"}}\n```").finalAnswer, JSON.stringify({ account_id: "a" }));
  assertEquals(parseTurn("here you go: {\"tool\":{\"name\":\"x\",\"args\":{}}}").toolCall?.name, "x");
  assertEquals(parseTurn("not json at all"), {});
});
