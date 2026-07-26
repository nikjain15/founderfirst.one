/**
 * The one place a FounderFirst generation path is routed through @conduit/client.
 *
 * We use the client in EMBEDDED mode and inject FounderFirst's OWN resolve (the
 * quality/cost front desk in packages/inference, vendored for Deno as
 * resolveAndJudgeOnDeno). No new inference core is introduced: the client is a
 * thin, uniform surface over the resolve FounderFirst already ships. The
 * categorization investigator drives every model turn through `client.infer`, so
 * the client surface is genuinely exercised on a real path.
 *
 * `retrieve` is wired to the RAG retriever so the client's retrieve() surface is
 * real too; `runAgent` is injected by the caller; `evaluate`/`usage` are not part
 * of this path and throw a clear error if called.
 */
import { createClient } from "../conduit/client/index.ts";
import type {
  AgentResult,
  ConduitClient,
  EmbeddedResolve,
  EvaluateResult,
  RetrieveResult,
  RunAgentParams,
  UsageResult,
} from "../conduit/client/types.ts";
import type { Retriever } from "./retrieval.ts";

export interface ConduitClientDeps {
  /** FounderFirst's resolve, already bound to its runtime env (Deno adapter). */
  resolve: EmbeddedResolve;
  /** Isolation key forwarded to resolve() as tenantId (org:<uuid> / org:founderfirst). */
  tenantId: string;
  /** Optional grounded retriever backing client.retrieve(). */
  retriever?: Retriever;
  /** Optional agent runner backing client.runAgent(). */
  runAgent?: (params: RunAgentParams) => Promise<AgentResult>;
  defaultMaxTokens?: number;
}

const UNSUPPORTED = "not supported on this FounderFirst path";

export function makeEmbeddedConduitClient(deps: ConduitClientDeps): ConduitClient {
  const retriever = deps.retriever;
  const runAgent = deps.runAgent;

  return createClient({
    mode: "embedded",
    tenantId: deps.tenantId,
    defaultMaxTokens: deps.defaultMaxTokens,
    core: {
      resolve: deps.resolve,

      async retrieve(params): Promise<RetrieveResult> {
        if (!retriever) return { chunks: [], grounded: false };
        const r = await retriever.retrieveGrounded(params.query, params.topK);
        return {
          grounded: r.grounded,
          chunks: r.results.map((x) => ({ id: x.id, score: x.score, text: x.text })),
        };
      },

      runAgent(params): Promise<AgentResult> {
        if (!runAgent) return Promise.reject(new Error(`runAgent ${UNSUPPORTED}`));
        return runAgent(params);
      },

      evaluate(): Promise<EvaluateResult> {
        return Promise.reject(new Error(`evaluate ${UNSUPPORTED}`));
      },

      usage(): Promise<UsageResult> {
        return Promise.reject(new Error(`usage ${UNSUPPORTED}`));
      },
    },
  });
}
