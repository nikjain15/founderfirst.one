// content_judge — editorial quality gate for the content pipeline.
//
// Scores a generated draft against the LIVE brand voice guide and the EXACT
// evidence the idea carried (nothing beyond it may be asserted as fact). Runs a
// single structured-output call to a model of a DIFFERENT family/tier than the
// generator (Opus judges Sonnet's draft) and returns a machine verdict the
// caller uses to gate the pipeline. Fail closed: on any error the caller treats
// the draft as NOT passed and leaves it for a human.

export type ContentJudge = {
  brand_voice: { score: number; note: string };
  grounding: { score: number; note: string; fabricated_claims: string[] };
  seo: { score: number; note: string };
  structure: { score: number; note: string };
  audio_script: { score: number; note: string };
  overall: number;
  verdict: "ship" | "revise" | "reject";
  issues: string[];
};

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["brand_voice", "grounding", "seo", "structure", "audio_script", "overall", "verdict", "issues"],
  properties: {
    brand_voice: { type: "object", additionalProperties: false, required: ["score", "note"], properties: { score: { type: "integer" }, note: { type: "string" } } },
    grounding: { type: "object", additionalProperties: false, required: ["score", "note", "fabricated_claims"], properties: { score: { type: "integer" }, note: { type: "string" }, fabricated_claims: { type: "array", items: { type: "string" } } } },
    seo: { type: "object", additionalProperties: false, required: ["score", "note"], properties: { score: { type: "integer" }, note: { type: "string" } } },
    structure: { type: "object", additionalProperties: false, required: ["score", "note"], properties: { score: { type: "integer" }, note: { type: "string" } } },
    audio_script: { type: "object", additionalProperties: false, required: ["score", "note"], properties: { score: { type: "integer" }, note: { type: "string" } } },
    overall: { type: "integer" },
    verdict: { type: "string", enum: ["ship", "revise", "reject"] },
    issues: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM = [
  "You are a strict editorial quality judge for FounderFirst's content pipeline. Score each dimension 0-10. Be skeptical and specific.",
  "BRAND_VOICE: match the voice guide — warm, plain, owner-first, no jargon, no hype. Hard fails: any exclamation mark, naming a competitor (QuickBooks/Xero/Bench/Pilot), naming underlying tech/AI models, customer-service filler, decorative emoji, British spellings.",
  "GROUNDING: every factual/statistical claim must trace to an allowed_fact. List in fabricated_claims ANY claim that introduces a number, date, price, duration, vendor, integration, or stat NOT in allowed_facts.",
  "SEO: title/description/slug/takeaways quality and keyword fit. STRUCTURE: headings, flow, scannability. AUDIO_SCRIPT: natural two-host read under the same rules.",
  "overall is a 0-10 weighted average. verdict='ship' ONLY if fabricated_claims is empty AND no brand-voice hard fail AND overall>=8; 'revise' if fixable; 'reject' if fundamentally off.",
].join("\n");

export async function judgeContent(
  apiKey: string,
  input: { voice: string; allowedFacts: string[]; topic: string; seo: unknown; blogMd: string; audioScript: string },
  model = "claude-opus-4-8",
): Promise<{ ok: true; judge: ContentJudge } | { ok: false; error: string }> {
  const user = [
    `VOICE GUIDE:\n${input.voice || "(unavailable — enforce: warm, plain, owner-first, no exclamation marks, no competitor names, no model names)"}`,
    `\nTOPIC: ${input.topic}`,
    `\nALLOWED FACTS (nothing beyond these may be asserted as fact/stat):\n${input.allowedFacts.map((f) => `- ${f}`).join("\n") || "(none)"}`,
    `\nSEO META:\n${JSON.stringify(input.seo)}`,
    `\nBLOG BODY:\n${input.blogMd}`,
    `\nAUDIO SCRIPT:\n${input.audioScript}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema: JUDGE_SCHEMA } },
      }),
    });
    if (!res.ok) return { ok: false, error: `judge ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const data = await res.json();
    const txt = (data.content ?? []).map((b: { text?: string }) => b.text ?? "").join("");
    return { ok: true, judge: JSON.parse(txt) as ContentJudge };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// The pipeline gate: a draft "passes" to review only on a clean ship verdict.
export function passesGate(j: ContentJudge): boolean {
  return j.verdict === "ship" && (j.grounding?.fabricated_claims?.length ?? 0) === 0;
}
