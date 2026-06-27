/**
 * /insights — turns a REAL metrics snapshot into sharp, grounded findings with
 * Cloudflare Workers AI (free tier). Sibling of /compose; same shared-secret
 * contract so the synthesize-insights Supabase function only repoints its
 * COMPOSE_ENDPOINT_URL here.
 *
 *   admin (browser) → synthesize-insights fn (checks admin, collects metrics)
 *     → THIS /insights route (shared secret) → Workers AI → findings
 *
 * Anti-hallucination is the whole point:
 *   1. The model receives ONLY the numbers in the DATA block and the exact list
 *      of metric labels it is allowed to cite.
 *   2. Every finding MUST carry an `evidence: [{metric,value}]` drawn from that
 *      list. The caller (edge function) re-validates evidence against the real
 *      snapshot and drops anything unsupported — so a fabricated number can't
 *      survive even if the model emits one.
 *
 * Request:  { metrics, window_days, sources: string[], goals: string[] }
 *   metrics = { available: [{metric,value}], blocks: {source: <readable>} }
 *   goals   = subset of ["product","content","customer"]
 * Response: { ok, summary, model, findings: [{
 *   goal, surface, title, observation, suggested_action, confidence, evidence }] }
 */
import type { Env } from "./worker-env";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const GOALS = ["product", "content", "customer"] as const;
type Goal = (typeof GOALS)[number];

const GOAL_BRIEF: Record<Goal, string> = {
  product:
    "Improve the PRODUCT across its surfaces — the marketing website, the CPA app, the business-owner app, and the admin. Surface values: website | cpa | owner | admin.",
  content:
    "Improve the CONTENT engine — blog, podcast, and social — to drive SEO, GEO, AI discoverability and trust. Surface values: blog | podcast | social.",
  customer:
    "Solve CUSTOMER problems at scale — recurring pain that, fixed once, helps everyone and improves day to day. Surface values: support | penny | product.",
};

const cleanStr = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}

/** Escape raw control chars inside string literals — models emit real newlines. */
function escapeControlChars(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr && ch === "\n") { out += "\\n"; continue; }
    if (inStr && ch === "\r") { out += "\\r"; continue; }
    if (inStr && ch === "\t") { out += "\\t"; continue; }
    out += ch;
  }
  return out;
}

interface Datapoint { metric: string; value: number | string }
interface InsightsBody {
  metrics?: { available?: Datapoint[]; blocks?: Record<string, unknown> };
  window_days?: number;
  sources?: string[];
  goals?: string[];
}

function buildSystem(goals: Goal[], allowed: string[]): string {
  const goalLines = goals.map((g) => `- ${g}: ${GOAL_BRIEF[g]}`).join("\n");
  return `You are a sharp, skeptical product+growth analyst for FounderFirst, a bookkeeping/accounting service for US founders and small businesses. You turn REAL metrics into a few high-signal, prioritized actions.

You will improve ONLY these outcome areas (use the value as each finding's "goal"):
${goalLines}

ABSOLUTE RULES — no exceptions:
- Use ONLY the numbers in the DATA block. Never invent or estimate numbers, percentages, dates, competitor names, or trends that are not present in DATA.
- Every finding MUST include "evidence": an array of {metric, value} taken VERBATIM from the "available metrics" list. If you cannot ground a claim in at least one available metric, do NOT make the claim.
- Quality over quantity. Return 0–6 findings total. If the data is thin or flat, return fewer — even zero. Padding is failure.
- Each "observation" must state the number it rests on. Each "suggested_action" must be concrete and doable this week.
- Be specific to FounderFirst. No generic advice ("improve onboarding") without a metric behind it.

Return ONLY this JSON (no prose, no code fences):
{
  "summary": <2 sentences max: the single most important thing the data says>,
  "findings": [
    {
      "goal":             <one of: ${goals.join(" | ")}>,
      "surface":          <the specific surface this targets, from that goal's allowed surface values>,
      "title":            <the action, <= 90 chars, imperative>,
      "observation":      <what in the data prompts this, citing the number>,
      "suggested_action": <the concrete next step>,
      "confidence":       <"low" | "med" | "high">,
      "evidence":         [{ "metric": <one of the available metric labels>, "value": <its value> }]
    }
  ]
}

Available metric labels you may cite (and nothing else):
${allowed.map((m) => `- ${m}`).join("\n")}`;
}

export async function handleInsights(req: Request, env: Env): Promise<Response> {
  if (!env.COMPOSE_SECRET) {
    return jsonResp({ error: "not_configured", detail: "COMPOSE_SECRET not set on the Worker." }, 503);
  }
  if (req.headers.get("x-compose-secret") !== env.COMPOSE_SECRET) {
    return jsonResp({ error: "unauthorized" }, 401);
  }

  let body: InsightsBody;
  try {
    body = (await req.json()) as InsightsBody;
  } catch {
    return jsonResp({ error: "bad_json" }, 400);
  }

  const available = Array.isArray(body.metrics?.available) ? body.metrics!.available! : [];
  const goals = (Array.isArray(body.goals) ? body.goals : []).filter(
    (g): g is Goal => (GOALS as readonly string[]).includes(g),
  );
  if (available.length === 0) {
    return jsonResp({ error: "no_data", detail: "No metrics to analyze — select at least one source with data." }, 400);
  }
  if (goals.length === 0) {
    return jsonResp({ error: "no_goals", detail: "Select at least one outcome area to improve." }, 400);
  }

  const allowed = available.map((d) => d.metric);
  const dataBlock = JSON.stringify(
    { window_days: body.window_days ?? 30, sources: body.sources ?? [], metrics: available, context: body.metrics?.blocks ?? {} },
    null,
    1,
  ).slice(0, 12_000);

  let parsed: { summary?: unknown; findings?: unknown };
  try {
    const out = (await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: buildSystem(goals, allowed) },
        { role: "user", content: `DATA:\n${dataBlock}\n\nReturn the JSON now. Ground every finding in the available metrics.` },
      ],
      max_tokens: 1400,
      temperature: 0.2,
      response_format: { type: "json_object" },
    })) as { response?: unknown };
    const resp = out.response;
    parsed =
      resp && typeof resp === "object"
        ? (resp as Record<string, unknown>)
        : JSON.parse(escapeControlChars(extractJson(typeof resp === "string" ? resp : String(resp ?? "{}"))));
  } catch (e) {
    return jsonResp({ error: "synthesis_failed", detail: String((e as Error).message).slice(0, 200) }, 502);
  }

  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings = rawFindings
    .map((f: any) => ({
      goal: (GOALS as readonly string[]).includes(f?.goal) ? (f.goal as Goal) : null,
      surface: cleanStr(f?.surface, 40),
      title: cleanStr(f?.title, 120),
      observation: cleanStr(f?.observation, 600),
      suggested_action: cleanStr(f?.suggested_action, 600),
      confidence: ["low", "med", "high"].includes(f?.confidence) ? f.confidence : "low",
      evidence: Array.isArray(f?.evidence)
        ? f.evidence
            .map((e: any) => ({ metric: cleanStr(e?.metric, 80), value: e?.value }))
            .filter((e: any) => e.metric)
        : [],
    }))
    .filter((f) => f.goal && f.title && f.evidence.length > 0);

  return jsonResp({
    ok: true,
    model: MODEL,
    summary: cleanStr(parsed.summary, 400),
    findings,
  });
}
