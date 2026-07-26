# Vendored: Conduit

Upstream: https://github.com/nikjain15/conduit (packages `client`, `agent`, `rag`, `mcp`).

This directory is a **copy, not a fork**. It carries the four new-capability
packages from Conduit so that FounderFirst's Supabase Edge (Deno) functions can
bundle them from within `supabase/functions/` — the same reason `_shared/inference`
is vendored (Supabase's function bundler does not reach across the repo root).

## What is vendored

| dir       | upstream package  | notes |
|-----------|-------------------|-------|
| `agent/`  | `@conduit/agent`  | bounded reason-act loop, tools, skills, JSON-schema validator |
| `rag/`    | `@conduit/rag`    | BM25 / vector / hybrid retrieval, context packing, failure-mode gates |
| `client/` | `@conduit/client` | one SDK surface, embedded + gateway transports |
| `mcp/`    | `@conduit/mcp`    | **pure subset only**: `types`, `registry`, `validate` (see below) |

## What is NOT vendored (deliberately)

Conduit's `@conduit/inference` is **not** re-vendored: FounderFirst already owns
a runtime-agnostic `resolve()` (`packages/inference/src`, vendored for Deno at
`supabase/functions/_shared/inference`). Conduit's inference core came from here,
so re-vendoring it would duplicate the single source of truth. The agent loop is
wired to FounderFirst's own `ChatMessage` / `resolve` instead.

The MCP transports that import `@modelcontextprotocol/sdk` at call time
(`server.ts`, `stdio.ts`, `http.ts`, `sdk-shim.d.ts`) are **not** vendored under
`supabase/functions/`, because Deno type-checks everything reachable here and the
Edge runtime has no npm SDK. The live stdio server that wires these tools onto the
SDK lives Node-side in `tools/ff-mcp/`. Only the pure `ToolRegistry` + validator
(no SDK) is vendored, so the same tools are unit-testable under Deno.

## Local adjustments (imports only; logic unchanged)

The upstream sources are copied verbatim except for import specifiers, which are
rewritten to resolve under Deno:

1. Relative imports carry explicit `.ts` extensions (Deno requires them). The
   `rag/` and `client/` sources already used `.ts`; `agent/` and `mcp/` did not.
2. `agent/loop.ts` imported `ChatMessage` from Conduit's inference package
   (`../../inference/src/core`); it now imports the identical type from
   FounderFirst's vendored inference core (`../../inference/core.ts`). The
   `ChatMessage` shape (`{ role, content }`) is identical in both.
3. `mcp/index.ts` re-exports only the pure subset (see above).

No other edits. To refresh, re-copy from upstream and re-apply steps 1–3.
