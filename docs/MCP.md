# FounderFirst MCP server

A Model Context Protocol server that exposes FounderFirst's ledger data to MCP
clients (Claude Desktop, agent runtimes) as **read-only, tenant-scoped** tools.
It is built on `@conduit/mcp` (vendored at
`supabase/functions/_shared/conduit/mcp`), reusing the same pure `ToolRegistry`
and JSON-schema validator that the in-app agent path uses, so the tools behave
identically whether they are called in-process or over MCP.

## Tools

All tools require an `org_id` and read only that org's data. A caller who is not
a member of the requested org is refused. There are no write tools and no
cross-tenant reads.

| Tool | Arguments | Returns |
|------|-----------|---------|
| `ff_list_ledger_accounts` | `org_id` | the org's live chart of accounts |
| `ff_get_transaction` | `org_id`, `entry_id` | one transaction (description, direction, amount) |
| `ff_prior_categorizations` | `org_id`, `description` | how the org previously categorized matching transactions |
| `ff_tax_rule_lookup` | `org_id`, `query` | tax-rule passages grounded in the org's corpus, or not-found |

`ff_tax_rule_lookup` runs the same RAG grounding as the in-app investigator: if
nothing relevant is retrieved it returns `found: false` rather than inventing a
rule.

## Isolation model

Tenant isolation is structural, not advisory:

1. Every tool call resolves an accessor through `makeSupabaseDataAccess`, which
   runs the membership guard (`can_write_org_as`) for the server's configured
   actor before any read.
2. The accessor is bound to one `org_id`; every query carries `.eq("org_id", ...)`.
3. The surface has no method that writes a ledger. Posting stays in the
   deterministic `recategorize_entry` / `autopost_categorization` RPC path.

This mirrors the existing edge-function guards (RLS plus explicit membership
checks under the service-role key), so the MCP server cannot read or write
anything a member could not already read through the app.

## Running it (stdio, local)

The MCP SDK is imported dynamically so it is not a monorepo build or lockfile
dependency. Install it where you run the server:

```bash
npm i @modelcontextprotocol/sdk
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
FF_MCP_ACTOR_ID=<member-user-id> \
tsx tools/ff-mcp/server.ts
```

Claude Desktop client config:

```json
{
  "mcpServers": {
    "founderfirst": {
      "command": "tsx",
      "args": ["tools/ff-mcp/server.ts"],
      "env": {
        "SUPABASE_URL": "https://<project>.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "<service-role-key>",
        "FF_MCP_ACTOR_ID": "<member-user-id>"
      }
    }
  }
}
```

## Hosted URL shape (HTTP/SSE)

For a hosted deployment, the same `ToolRegistry` is served over the MCP
Streamable HTTP / SSE transport behind the app's existing auth. The intended URL
shape is:

```
POST https://api.founderfirst.one/mcp        # JSON-RPC (tools/list, tools/call)
GET  https://api.founderfirst.one/mcp/sse     # server to client event stream
```

The hosted transport authenticates the caller with a FounderFirst session
(bearer), derives `FF_MCP_ACTOR_ID` from it, and applies the same per-org
membership guard on every `tools/call`. The tool registry and validation are
transport independent, so the hosted server shares this exact tool set.
