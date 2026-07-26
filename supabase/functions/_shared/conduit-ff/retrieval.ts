/**
 * RAG grounding for the categorization investigator, built on @conduit/rag.
 *
 * The founder's REAL data is the grounding corpus: their live chart of accounts,
 * their prior categorizations for the vendor in question, and the tax-rule text.
 * We index it with BM25 (lexical is the right default for short accounting labels
 * and vendor strings — there is no embedding call on the Edge runtime) and expose
 * two things the two RAG failure modes require:
 *
 *   (a) Bad retrieval: `retrieveGrounded` runs `gateRetrieval`. If nothing clears
 *       the score threshold, it returns `grounded: false` with an empty context,
 *       so the caller says "not found" instead of asking the model to invent.
 *
 *   (b) Unfaithful answer: `assertGrounded` runs `checkGroundedness` over a draft
 *       answer against the retrieved chunks, flagging spans with no lexical anchor
 *       in the founder's data (a heuristic, not an entailment proof — see the
 *       upstream module header).
 */
import { Bm25Retriever } from "../conduit/rag/bm25.ts";
import { buildContext } from "../conduit/rag/context.ts";
import {
  checkGroundedness,
  gateRetrieval,
  type GroundednessReport,
  type RetrievalGateResult,
} from "../conduit/rag/failure-modes.ts";
import type { Doc, RetrievalResult } from "../conduit/rag/types.ts";
import type { FfAccount, FfPriorCategorization, FfTaxRuleDoc } from "./dataAccess.ts";

export interface GroundingCorpus {
  accounts: FfAccount[];
  priors: FfPriorCategorization[];
  taxRules: FfTaxRuleDoc[];
}

export interface RetrieveGroundedResult {
  gate: RetrievalGateResult;
  results: RetrievalResult[];
  /** Packed, token-budgeted context string (empty when the gate failed). */
  context: string;
  /** True when retrieval cleared the threshold and answering is appropriate. */
  grounded: boolean;
}

/** BM25 absolute scores are unbounded; this threshold treats a near-zero top hit
 *  (no shared content term) as "no relevant context". */
const DEFAULT_MIN_TOP_SCORE = 0.15;
const DEFAULT_CONTEXT_TOKENS = 512;

/** Turn the founder's real data into retrievable documents with typed id prefixes. */
export function corpusToDocs(corpus: GroundingCorpus): Doc[] {
  const docs: Doc[] = [];
  for (const a of corpus.accounts) {
    docs.push({
      id: `account:${a.id}`,
      text: `Account ${a.code ?? ""} ${a.name} (${a.type})`.trim(),
    });
  }
  for (const p of corpus.priors) {
    docs.push({
      id: `prior:${p.account_id}`,
      text: `Previously filed "${p.match_value}" under ${p.account_name} ${p.times_applied} time(s)`,
    });
  }
  for (const t of corpus.taxRules) {
    docs.push({ id: `tax:${t.id}`, text: t.text });
  }
  return docs;
}

export interface Retriever {
  retrieveGrounded(query: string, topK?: number): Promise<RetrieveGroundedResult>;
  assertGrounded(answer: string, results: RetrievalResult[]): GroundednessReport;
}

export interface BuildRetrieverOptions {
  minTopScore?: number;
  contextTokens?: number;
}

/** Build a BM25-backed grounded retriever over the founder's real corpus. */
export function buildRetriever(
  corpus: GroundingCorpus,
  options: BuildRetrieverOptions = {},
): Retriever {
  const minTopScore = options.minTopScore ?? DEFAULT_MIN_TOP_SCORE;
  const contextTokens = options.contextTokens ?? DEFAULT_CONTEXT_TOKENS;
  const docs = corpusToDocs(corpus);
  const bm25 = new Bm25Retriever();
  if (docs.length > 0) bm25.add(docs);

  return {
    async retrieveGrounded(query: string, topK = 6): Promise<RetrieveGroundedResult> {
      const results = await bm25.query(query, topK);
      const gate = gateRetrieval(results, { minTopScore });
      if (!gate.hasRelevantContext) {
        return { gate, results, context: "", grounded: false };
      }
      const built = buildContext(results, contextTokens);
      return { gate, results, context: built.context, grounded: true };
    },

    assertGrounded(answer: string, results: RetrievalResult[]): GroundednessReport {
      return checkGroundedness(answer, results);
    },
  };
}
