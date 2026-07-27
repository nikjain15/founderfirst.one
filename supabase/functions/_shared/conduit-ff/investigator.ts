/**
 * The categorization investigator: the ambiguous-transaction path rebuilt as a
 * real bounded agent loop (@conduit/agent) instead of a single generate-then-gate
 * model call.
 *
 * WHAT CHANGED, AND WHAT DID NOT.
 *   - The GENERATIVE step is now a bounded reason-act loop: the model may call
 *     read-only tools (get_transaction, list_accounts, prior_categorizations,
 *     tax_rule_lookup), gather evidence grounded in the founder's real data, then
 *     draft ONE proposal. The loop is bounded by `maxSteps`; a never-finishing
 *     model stops at the cap and yields no proposal (fail-safe).
 *   - NO-AUTHORITY: the loop runs without `allowSideEffects`, every tool is
 *     read-only, and the investigator returns a DRAFT. It never writes the ledger.
 *   - The DETERMINISTIC financial gates stay exactly where they were: the caller
 *     (categorize/index.ts) still checks the drafted account_id against the org's
 *     live chart (byId), still runs the SQL reconciler, and the recategorize /
 *     autopost RPCs remain the only writers. This module weakens no gate; it only
 *     changes how the candidate account is proposed.
 *
 * Every model turn is routed through @conduit/client (embedded, FounderFirst's own
 * resolve injected), so both the agent and the client surface are exercised on one
 * real path.
 */
import { runAgent, type CallModel, type ModelTurn } from "../conduit/agent/loop.ts";
import type { ChatMessage } from "../inference/core.ts";
import type { ConduitClient } from "../conduit/client/types.ts";
import type { FfAccount } from "./dataAccess.ts";
import type { Retriever } from "./retrieval.ts";
import { buildInvestigatorTools } from "./tools.ts";
import { investigatorSkills } from "./skills.ts";

export interface DraftProposal {
  account_id: string;
  confidence: number;
  rationale: string;
}

export type ModelPin = { provider: string; model: string };

/** Difficulty tier the transaction was routed to. */
export type DifficultyTier = "cheap" | "reasoning" | "hardest";

/** The three model rungs the difficulty router escalates across. `cheap` is a
 *  Haiku-class model (temperature-legal); `reasoning`/`hardest` are Sonnet/Opus
 *  class (the resolve adapter withholds temperature from them — sampling contract). */
export interface TierModels {
  cheap: ModelPin;
  reasoning: ModelPin;
  hardest: ModelPin;
}

export interface InvestigateInput {
  client: ConduitClient;
  retriever: Retriever;
  entryId: string;
  description: string;
  direction: "in" | "out";
  accounts: FfAccount[];
  /** Bound accessor the tools read through. */
  // deno-lint-ignore no-explicit-any
  data: any;
  maxSteps?: number;
  useCase: string;
  /** Legacy single-model pin. When `tiers` is absent, the loop runs ONE pass on
   *  this model, so behavior is identical to the pre-routing path. */
  pinModel?: ModelPin;
  /** Difficulty-routed cascade. When present, the loop routes by difficulty:
   *  the cheap tier for confident/straightforward cases, escalating once to a
   *  reasoning (or hardest) tier when the signal is weak. */
  tiers?: TierModels;
  /** A drafted confidence below this cutoff escalates to a reasoning tier. */
  escalateBelow?: number;
}

export interface InvestigateResult {
  proposal: DraftProposal | null;
  note?: string;
  stoppedAtCap: boolean;
  steps: number;
  loadedSkills: string[];
  /** True when the drafted rationale passed the lexical groundedness heuristic. */
  groundedRationale?: boolean;
  /** Which difficulty tier produced this result. */
  tier: DifficultyTier;
  /** The model id actually driven (or "unpinned" when no pin was supplied). */
  modelUsed: string;
  /** True when the result came from an escalated (reasoning/hardest) pass. */
  escalated: boolean;
  /** Why the cascade escalated (only set on an escalated result). */
  escalationReason?: string;
}

const DEFAULT_MAX_STEPS = 5;
const DEFAULT_ESCALATE_BELOW = 0.45;

const BASE_SYSTEM =
  "You are Penny's transaction investigator. Work step by step to decide which " +
  "account a single transaction belongs in. Use the read-only tools to gather " +
  "evidence before you decide. You DRAFT a proposal; you never post to the ledger.";

/**
 * Build the CallModel the agent loop drives. Each turn is one client.infer call:
 * we append the tool catalogue and a strict single-JSON output contract to the
 * system prompt, hand the running transcript over, and parse the model's reply
 * into either a tool call or a final answer.
 */
function makeCallModel(input: InvestigateInput, model: ModelPin | undefined): CallModel {
  const allowedIds = input.accounts.map((a) => a.id);
  return async ({ system, messages, tools }) => {
    const catalogue = (tools ?? [])
      .map((t) => `- ${t.name}: ${t.description}\n  input schema: ${JSON.stringify(t.jsonSchema)}`)
      .join("\n");
    const contract =
      "\n\nRESPONSE CONTRACT: reply with EXACTLY ONE JSON object, no prose, no code " +
      "fence. To use a tool: {\"tool\":{\"name\":\"<tool>\",\"args\":{...}}}. To finish: " +
      "{\"final\":{\"account_id\":\"<one of the listed account ids>\",\"confidence\":<0..1>," +
      "\"rationale\":\"<one short sentence>\"}}. If no listed account fits, finish with " +
      "{\"final\":{\"account_id\":null,\"confidence\":0,\"rationale\":\"<why>\"}}. " +
      `Valid account ids: ${JSON.stringify(allowedIds)}.` +
      `\n\nTools:\n${catalogue}`;

    const infer = await input.client.infer({
      useCase: input.useCase,
      system: system + contract,
      messages: messages as ChatMessage[],
      maxTokens: 500,
      pinModel: model,
    });
    return parseTurn(infer.output);
  };
}

/** Parse the model's raw text into a ModelTurn. Tolerant of stray fences/prose. */
export function parseTurn(raw: string): ModelTurn {
  const obj = extractJson(raw);
  if (!obj || typeof obj !== "object") return {};
  const rec = obj as Record<string, unknown>;
  if (rec.tool && typeof rec.tool === "object") {
    const t = rec.tool as Record<string, unknown>;
    if (typeof t.name === "string") {
      return { toolCall: { name: t.name, args: (t.args ?? {}) as unknown } };
    }
  }
  if ("final" in rec) {
    return { finalAnswer: JSON.stringify(rec.final) };
  }
  return {};
}

function extractJson(raw: string): unknown {
  const text = (raw ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    // Fall back to the first balanced {...} span.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Run the bounded investigation and return a DRAFT proposal (or null). The caller
 * remains responsible for the deterministic grounding gate + reconciler.
 *
 * DIFFICULTY ROUTING. When `input.tiers` is supplied, the transaction is routed by
 * difficulty rather than pinned to one model:
 *   - A pre-model retrieval signal decides the STARTING rung. If the description
 *     retrieves weakly against the founder's own corpus (bad-retrieval gate), the
 *     cascade starts at the reasoning tier; otherwise it starts cheap.
 *   - After a pass, the result is re-checked. The cascade escalates ONCE to a
 *     stronger rung when the signal is weak: the loop stopped at its step cap, no
 *     grounded draft came back, the rationale failed the groundedness heuristic, or
 *     the drafted confidence is below `escalateBelow`. Severe signals (cap hit / no
 *     draft) jump straight to the hardest tier; softer signals step to reasoning.
 * Spend is bounded to at most two model passes. With no `tiers`, exactly one pass
 * runs on `pinModel`, so behavior (and every existing test) is unchanged.
 *
 * The deterministic grounding gate (allowedIds), the no-authority invariant, and
 * the reconciler in the caller are untouched by this routing.
 */
export async function investigateCategorization(input: InvestigateInput): Promise<InvestigateResult> {
  // Legacy single-model path: one pass, identical to the pre-routing behavior.
  if (!input.tiers) {
    return runPass(input, input.pinModel, "cheap", false, undefined);
  }

  const tiers = input.tiers;
  const escalateBelow = input.escalateBelow ?? DEFAULT_ESCALATE_BELOW;

  // Pre-model difficulty signal: does the description retrieve against the org's
  // own corpus at all? A weak/no-context retrieval is a hard case up front, so we
  // skip the cheap rung and open at the reasoning tier. Best-effort: a retriever
  // error is treated as "not weak" so we still open cheap (fail-cheap, not fail-up).
  let weakRetrieval = false;
  try {
    const pre = await input.retriever.retrieveGrounded(input.description);
    weakRetrieval = !pre.grounded;
  } catch {
    weakRetrieval = false;
  }

  const startTier: DifficultyTier = weakRetrieval ? "reasoning" : "cheap";
  const first = await runPass(
    input, tiers[startTier], startTier,
    startTier !== "cheap", weakRetrieval ? "weak_retrieval" : undefined,
  );

  const dec = escalationDecision(first, escalateBelow);
  if (!dec.escalate) return first;

  // Pick the escalation target. Severe signals (cap hit / no grounded draft) jump
  // to the hardest tier; softer signals (low confidence / ungrounded rationale)
  // step to reasoning. From reasoning we can only go up to hardest.
  let nextTier: DifficultyTier | null = null;
  if (startTier === "cheap") nextTier = dec.severe ? "hardest" : "reasoning";
  else if (startTier === "reasoning") nextTier = "hardest";
  if (!nextTier || nextTier === startTier) return first;

  return runPass(input, tiers[nextTier], nextTier, true, dec.reason);
}

/** Decide whether a pass's result is too weak and must escalate. */
function escalationDecision(
  r: InvestigateResult,
  escalateBelow: number,
): { escalate: boolean; severe: boolean; reason?: string } {
  if (r.stoppedAtCap) return { escalate: true, severe: true, reason: "stopped_at_cap" };
  if (!r.proposal) return { escalate: true, severe: true, reason: "no_grounded_draft" };
  if (r.groundedRationale === false) return { escalate: true, severe: false, reason: "ungrounded_rationale" };
  if (r.proposal.confidence < escalateBelow) return { escalate: true, severe: false, reason: "low_confidence" };
  return { escalate: false, severe: false };
}

/** One bounded agent pass on a single model, returning the annotated result. */
async function runPass(
  input: InvestigateInput,
  model: ModelPin | undefined,
  tier: DifficultyTier,
  escalated: boolean,
  escalationReason: string | undefined,
): Promise<InvestigateResult> {
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
  const tools = buildInvestigatorTools({
    data: input.data,
    retriever: input.retriever,
    entryId: input.entryId,
  });
  const allowedIds = new Set(input.accounts.map((a) => a.id));

  const goal =
    `Categorize transaction ${input.entryId}: "${input.description}" ` +
    `(${input.direction === "out" ? "money out" : "money in"}).`;
  const context = `direction=${input.direction} description=${input.description}`;

  const result = await runAgent({
    goal,
    context,
    system: BASE_SYSTEM,
    tools,
    skills: investigatorSkills,
    callModel: makeCallModel(input, model),
    maxSteps,
    // No-authority: never allow side effects. Every tool is read-only anyway.
    allowSideEffects: false,
  });

  const base = {
    stoppedAtCap: result.stoppedAtCap,
    steps: result.steps.length,
    loadedSkills: result.loadedSkills,
    tier,
    modelUsed: model?.model ?? "unpinned",
    escalated,
    ...(escalationReason ? { escalationReason } : {}),
  };

  if (result.answer === undefined) {
    return { proposal: null, note: "stopped_at_cap", ...base };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(result.answer) as Record<string, unknown>;
  } catch {
    return { proposal: null, note: "final_not_json", ...base };
  }

  const accountId = parsed?.account_id;
  if (typeof accountId !== "string" || !accountId) {
    return { proposal: null, note: "declined_no_account", ...base };
  }
  // Grounding gate (structural): the drafted account MUST be a live account we sent.
  if (!allowedIds.has(accountId)) {
    return { proposal: null, note: "ungrounded_account", ...base };
  }

  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
  const rationale = String(parsed.rationale ?? "").slice(0, 280) ||
    "Penny's best match for this transaction.";

  // Unfaithful-answer failure mode: flag a rationale with no lexical anchor in the
  // retrieved corpus. Observational (mirrors the existing judge posture) — it does
  // not fabricate or drop the proposal, it annotates it for the caller/logs.
  let groundedRationale: boolean | undefined;
  try {
    const r = await input.retriever.retrieveGrounded(input.description);
    if (r.results.length > 0) {
      groundedRationale = input.retriever.assertGrounded(rationale, r.results).grounded;
    }
  } catch {
    groundedRationale = undefined;
  }

  return {
    proposal: { account_id: accountId, confidence, rationale },
    groundedRationale,
    ...base,
  };
}
