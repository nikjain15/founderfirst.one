/**
 * FounderFirst MCP server (stdio).
 *
 * Exposes the READ-ONLY, tenant-scoped FounderFirst tools (chart of accounts,
 * one transaction, prior categorizations, grounded tax-rule lookup) to any MCP
 * client (Claude Desktop, an agent runtime, etc.). The tool set and its
 * validation come from @conduit/mcp's pure ToolRegistry (vendored at
 * supabase/functions/_shared/conduit); this entry only adds the stdio transport.
 *
 * Isolation: every tool takes an `org_id` and resolves a membership-checked,
 * org-bound accessor (`makeSupabaseDataAccess`). A caller who is not a member of
 * the requested org is refused. There are NO write tools and NO cross-tenant
 * reads on this surface.
 *
 * DEPENDENCY-LIGHT: the MCP SDK is imported dynamically at startup so it is not a
 * build-time or lockfile dependency of the monorepo. Install it where you run the
 * server:  `npm i @modelcontextprotocol/sdk`.  Run:  `tsx tools/ff-mcp/server.ts`.
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FF_MCP_ACTOR_ID (the
 * member acting through this server). Optional: ANTHROPIC_MODEL.
 */
import { createClient } from "@supabase/supabase-js";
import { ToolRegistry } from "../../supabase/functions/_shared/conduit/mcp/index.ts";
import type { CallOutcome, ToolResult } from "../../supabase/functions/_shared/conduit/mcp/index.ts";
import {
  makeSupabaseDataAccess,
  type FfDataAccess,
  type SupabaseLike,
} from "../../supabase/functions/_shared/conduit-ff/dataAccess.ts";
import { buildRetriever } from "../../supabase/functions/_shared/conduit-ff/retrieval.ts";
import { buildFfMcpTools } from "../../supabase/functions/_shared/conduit-ff/mcpTools.ts";

const SERVER_NAME = "founderfirst";
const SERVER_VERSION = "0.1.0";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env ${name}`);
  return v;
}

function outcomeToCallResult(outcome: CallOutcome): ToolResult {
  if (outcome.ok) return outcome.result;
  const e = outcome.error;
  const detail = e.issues?.length ? "\n" + e.issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n") : "";
  return {
    isError: true,
    content: [{ type: "text", text: `${e.code}: ${e.message}${detail}` }],
    structuredContent: { error: e },
  };
}

async function main(): Promise<void> {
  const url = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const actorId = requireEnv("FF_MCP_ACTOR_ID");
  const svc = createClient(url, serviceKey, { auth: { persistSession: false } }) as unknown as SupabaseLike;

  const registry = new ToolRegistry(
    buildFfMcpTools({
      // Membership-checked + org-bound accessor. Throws for non-members.
      resolveAccess: (orgId: string) => makeSupabaseDataAccess({ svc, orgId, actorId }),
      buildRetrieverFor: async (access: FfDataAccess) => {
        const [accounts, taxRules] = await Promise.all([access.listAccounts(), access.taxRuleCorpus()]);
        return buildRetriever({ accounts, priors: [], taxRules });
      },
    }),
  );

  // Dynamic import keeps the SDK off the monorepo's build/lockfile path.
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");

  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: registry.list() }));
  server.setRequestHandler(CallToolRequestSchema, async (req: { params?: { name?: string; arguments?: unknown } }) => {
    const outcome = await registry.call(req.params?.name ?? "", req.params?.arguments);
    return outcomeToCallResult(outcome);
  });

  await server.connect(new StdioServerTransport());
  // Serves until the transport closes.
}

main().catch((err) => {
  console.error("ff-mcp failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
