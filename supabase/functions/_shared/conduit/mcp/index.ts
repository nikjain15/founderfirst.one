/**
 * @conduit/mcp public surface — PURE SUBSET (vendored for FounderFirst).
 *
 * This vendored copy exports only the transport-agnostic registry, validator,
 * and types. The upstream SDK-touching transports (server.ts / stdio.ts /
 * http.ts, which import `@modelcontextprotocol/sdk` at call time) are NOT
 * vendored under supabase/functions/, because Supabase Edge (Deno) type-checks
 * everything reachable here and must not depend on an npm SDK. The live stdio
 * server that wires these tools onto the SDK lives Node-side in tools/ff-mcp.
 */
export type {
  ConduitTool,
  ToolDescriptor,
  ToolResult,
  ToolContent,
  TextContent,
  JsonSchema,
  JsonSchemaType,
  ValidationIssue,
  RegistryError,
  RegistryErrorCode,
  CallOutcome,
} from "./types.ts";

export { ToolRegistry } from "./registry.ts";
export { validateArgs } from "./validate.ts";
