/**
 * FounderFirst MCP tools — READ-ONLY, tenant-scoped.
 *
 * These ConduitTool definitions are what the FounderFirst MCP server exposes over
 * stdio/HTTP. They are pure (no MCP SDK import) so the same tools are unit-tested
 * through @conduit/mcp's ToolRegistry under Deno.
 *
 * Tenant isolation is structural: every tool takes an `org_id` and resolves an
 * `FfDataAccess` through the injected `resolveAccess`, which runs the membership
 * guard and binds every subsequent read to that one org. A caller who is not a
 * member of the requested org gets a clean error, never another tenant's data.
 * There are NO write tools here — the MCP surface cannot mutate a ledger or read
 * across tenants.
 */
import type { ConduitTool, ToolResult } from "../conduit/mcp/index.ts";
import type { FfDataAccess } from "./dataAccess.ts";
import type { Retriever } from "./retrieval.ts";

/** Resolve a tenant-scoped, membership-checked accessor for one org. Throws
 *  (e.g. TenantAccessError) when the caller may not read that org. */
export type ResolveAccess = (orgId: string) => Promise<FfDataAccess>;

/** Build a grounded retriever for an org's corpus (tax_rule_lookup backing). */
export type BuildRetrieverFor = (access: FfDataAccess) => Promise<Retriever>;

export interface FfMcpDeps {
  resolveAccess: ResolveAccess;
  buildRetrieverFor: BuildRetrieverFor;
}

function ok(structured: unknown, text: string): ToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}
function fail(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }], structuredContent: { error: text } };
}

const orgIdSchema = {
  type: "string" as const,
  minLength: 1,
  description: "the org (tenant) to read; you must be a member",
};

export function buildFfMcpTools(deps: FfMcpDeps): ConduitTool[] {
  const { resolveAccess, buildRetrieverFor } = deps;

  const listLedgerAccounts: ConduitTool = {
    name: "ff_list_ledger_accounts",
    description: "List an org's live chart of accounts (read-only, tenant-scoped).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["org_id"],
      properties: { org_id: orgIdSchema },
    },
    async handler(args) {
      try {
        const access = await resolveAccess(String(args.org_id));
        const accounts = await access.listAccounts();
        return ok({ accounts }, `${accounts.length} account(s)`);
      } catch (e) {
        return fail(e instanceof Error ? e.message : "access denied");
      }
    },
  };

  const getUncategorizedTransaction: ConduitTool = {
    name: "ff_get_transaction",
    description: "Read one transaction (description, direction, amount) in an org (read-only).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["org_id", "entry_id"],
      properties: { org_id: orgIdSchema, entry_id: { type: "string", minLength: 1 } },
    },
    async handler(args) {
      try {
        const access = await resolveAccess(String(args.org_id));
        const tx = await access.getTransaction(String(args.entry_id));
        return tx ? ok({ transaction: tx }, tx.description) : fail("transaction not found in this org");
      } catch (e) {
        return fail(e instanceof Error ? e.message : "access denied");
      }
    },
  };

  const priorCategorizations: ConduitTool = {
    name: "ff_prior_categorizations",
    description: "How an org previously categorized transactions matching a description (read-only).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["org_id", "description"],
      properties: { org_id: orgIdSchema, description: { type: "string", minLength: 1 } },
    },
    async handler(args) {
      try {
        const access = await resolveAccess(String(args.org_id));
        const priors = await access.priorCategorizations(String(args.description));
        return ok({ priors }, `${priors.length} prior(s)`);
      } catch (e) {
        return fail(e instanceof Error ? e.message : "access denied");
      }
    },
  };

  const taxRuleLookup: ConduitTool = {
    name: "ff_tax_rule_lookup",
    description:
      "Retrieve tax-rule / treatment passages grounded in an org's corpus. Returns " +
      "not-found rather than inventing a rule (read-only).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["org_id", "query"],
      properties: { org_id: orgIdSchema, query: { type: "string", minLength: 1 } },
    },
    async handler(args) {
      try {
        const access = await resolveAccess(String(args.org_id));
        const retriever = await buildRetrieverFor(access);
        const r = await retriever.retrieveGrounded(String(args.query));
        if (!r.grounded) return ok({ found: false, reason: r.gate.reason }, "no relevant rule found");
        return ok(
          { found: true, context: r.context, sources: r.results.map((x) => ({ id: x.id, score: x.score })) },
          r.context,
        );
      } catch (e) {
        return fail(e instanceof Error ? e.message : "access denied");
      }
    },
  };

  return [listLedgerAccounts, getUncategorizedTransaction, priorCategorizations, taxRuleLookup];
}
