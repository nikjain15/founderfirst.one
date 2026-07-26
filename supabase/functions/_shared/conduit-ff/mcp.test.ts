/**
 * MCP server tests: the registry lists the read-only tools, a call works, and
 * tenant scoping is enforced (a non-member org is refused, never leaks data).
 * Exercises @conduit/mcp's pure ToolRegistry (no SDK, no transport).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ToolRegistry } from "../conduit/mcp/index.ts";
import { buildFfMcpTools, type ResolveAccess } from "./mcpTools.ts";
import { buildRetriever } from "./retrieval.ts";
import { TenantAccessError } from "./dataAccess.ts";
import { mockDataAccess, SAMPLE_ACCOUNTS } from "./_mocks.ts";

// A resolveAccess that only admits members of "org-allowed".
const resolveAccess: ResolveAccess = (orgId) => {
  if (orgId !== "org-allowed") {
    return Promise.reject(new TenantAccessError("actor is not a member of this org"));
  }
  return Promise.resolve(mockDataAccess({ orgId, accounts: SAMPLE_ACCOUNTS }));
};

const buildRetrieverFor = (access: { listAccounts: () => Promise<typeof SAMPLE_ACCOUNTS> }) =>
  access.listAccounts().then((accounts) => buildRetriever({ accounts, priors: [], taxRules: [] }));

function registry(): ToolRegistry {
  return new ToolRegistry(buildFfMcpTools({ resolveAccess, buildRetrieverFor }));
}

Deno.test("tools/list exposes exactly the read-only FounderFirst tools", () => {
  const list = registry().list();
  const names = list.map((t) => t.name);
  assertEquals(names, [
    "ff_get_transaction",
    "ff_list_ledger_accounts",
    "ff_prior_categorizations",
    "ff_tax_rule_lookup",
  ]);
  // No write/mutation tool is exposed on the MCP surface.
  assert(!names.some((n) => /write|post|update|delete|create|recategor/i.test(n)));
});

Deno.test("tools/call succeeds for a member org (tenant-scoped read)", async () => {
  const outcome = await registry().call("ff_list_ledger_accounts", { org_id: "org-allowed" });
  assert(outcome.ok, "call should succeed for a member");
  const structured = outcome.ok ? (outcome.result.structuredContent as { accounts: unknown[] }) : { accounts: [] };
  assertEquals(structured.accounts.length, SAMPLE_ACCOUNTS.length);
});

Deno.test("tenant isolation: a non-member org is refused, no data leaks", async () => {
  const outcome = await registry().call("ff_list_ledger_accounts", { org_id: "org-other" });
  // Registry call itself succeeds (handler ran) but the tool result is an error.
  assert(outcome.ok, "handler returns a clean error result, not a throw");
  const result = outcome.ok ? outcome.result : null;
  assertEquals(result?.isError, true);
  assert(String(result?.content[0].text).includes("not a member"));
});

Deno.test("invalid arguments are rejected by the registry before the handler runs", async () => {
  const outcome = await registry().call("ff_get_transaction", { org_id: "org-allowed" }); // missing entry_id
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.error.code, "invalid_arguments");
});

Deno.test("unknown tool is a structured error, not a throw", async () => {
  const outcome = await registry().call("ff_drop_tables", { org_id: "org-allowed" });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.error.code, "unknown_tool");
});
