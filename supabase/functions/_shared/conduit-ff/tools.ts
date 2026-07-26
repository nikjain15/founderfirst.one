/**
 * Read-only agent tools for the categorization investigator.
 *
 * Every tool here is `sideEffecting: false`: the investigator gathers evidence,
 * it never mutates the ledger. The no-authority invariant in @conduit/agent
 * would refuse a side-effecting tool anyway (the loop is run without
 * `allowSideEffects`), but keeping every tool genuinely read-only is the point —
 * the drafted proposal is handed back to the deterministic gate in
 * categorize/index.ts, which is the only thing allowed to change a book.
 *
 * The tools close over an `FfDataAccess` (already tenant-scoped) and a grounded
 * `Retriever`, so a tool can only ever read the one org it was built for.
 */
import type { Tool } from "../conduit/agent/tool.ts";
import type { FfDataAccess } from "./dataAccess.ts";
import type { Retriever } from "./retrieval.ts";

export interface InvestigatorToolsDeps {
  data: FfDataAccess;
  retriever: Retriever;
  /** The entry under investigation; get_transaction defaults to it. */
  entryId: string;
}

export function buildInvestigatorTools(deps: InvestigatorToolsDeps): Tool[] {
  const { data, retriever, entryId } = deps;

  const getTransaction: Tool = {
    name: "get_transaction",
    description:
      "Read the transaction under investigation (description, direction, amount). " +
      "Call this first to see what needs categorizing.",
    sideEffecting: false,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        entry_id: { type: "string", description: "defaults to the entry under investigation" },
      },
    },
    async handler(args) {
      const id = typeof args.entry_id === "string" && args.entry_id ? args.entry_id : entryId;
      const tx = await data.getTransaction(id);
      if (!tx) return { found: false };
      return { found: true, ...tx };
    },
  };

  const listAccounts: Tool = {
    name: "list_accounts",
    description:
      "List the org's live chart of accounts (id, code, name, type). The proposed " +
      "account_id in your final answer MUST be one of these ids.",
    sideEffecting: false,
    jsonSchema: { type: "object", additionalProperties: false, properties: {} },
    async handler() {
      return { accounts: await data.listAccounts() };
    },
  };

  const priorCategorizations: Tool = {
    name: "prior_categorizations",
    description:
      "Look up how this org previously categorized transactions matching a " +
      "description. Strong prior evidence when the vendor repeats.",
    sideEffecting: false,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["description"],
      properties: {
        description: { type: "string", minLength: 1, description: "transaction description to match" },
      },
    },
    async handler(args) {
      const priors = await data.priorCategorizations(String(args.description ?? ""));
      return { priors };
    },
  };

  const taxRuleLookup: Tool = {
    name: "tax_rule_lookup",
    description:
      "Retrieve tax-rule and accounting-treatment passages relevant to a query, " +
      "grounded in the org's data. If nothing relevant is found it says so — do " +
      "not infer a rule that was not retrieved.",
    sideEffecting: false,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1, description: "what treatment you need to check" },
      },
    },
    async handler(args) {
      const r = await retriever.retrieveGrounded(String(args.query ?? ""));
      if (!r.grounded) {
        return { found: false, reason: r.gate.reason ?? "no relevant context" };
      }
      return {
        found: true,
        context: r.context,
        sources: r.results.map((x) => ({ id: x.id, score: Number(x.score.toFixed(4)) })),
      };
    },
  };

  return [getTransaction, listAccounts, priorCategorizations, taxRuleLookup];
}
