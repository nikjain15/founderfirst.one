/**
 * /compose — drafts email copy with Cloudflare Workers AI (free tier), replacing
 * the local Ollama compose-server that ran on the signals Mac.
 *
 * Same contract as the old Mac compose-server so the email-compose Supabase
 * function needs no change — only its COMPOSE_ENDPOINT_URL secret is repointed
 * here:
 *
 *   admin (browser, signed-in)  →  email-compose Supabase fn (checks admin)
 *     →  THIS /compose route (shared secret)  →  Workers AI
 *
 * Returns { ok, draft: {subject, preheader, eyebrow, heading, intro, body,
 * cta_label, footer} } — identical shape the admin "Draft with AI" UI expects.
 */
import type { Env } from "./worker-env";
import { resolveAndJudgeOnWorkers } from "../../../packages/inference/src/adapters/workers";
import { USE_CASE, TENANT_FOUNDERFIRST } from "../../../packages/inference/src/core";

const SYSTEM = `You write short transactional/announcement emails for FounderFirst, a bookkeeping and accounting service for US founders, freelancers, and small-business owners. The voice is plain, warm, and useful — never salesy or hypey, no exclamation marks, no emoji.

Given a brief, return ONLY this JSON (no prose around it):
{
  "subject":   <inbox subject line, <= 45 characters, specific and plain>,
  "preheader": <40-90 chars of preview text that ADDS to the subject, never repeats it>,
  "eyebrow":   <a 1-2 word label shown above the headline, Title Case, e.g. "Product update">,
  "heading":   <one clear sentence that pays off the subject>,
  "intro":     <one optional setup sentence, or "">,
  "body":      <the main message in plain text; use \\n\\n between short paragraphs; 2-4 sentences total; sign off as "— The FounderFirst team">,
  "cta_label": <2-4 word button label, or "" if no button fits>,
  "footer":    <one muted line: why they got it, e.g. "You're getting this because you're a FounderFirst customer.">
}
Rules: write for a non-technical reader; do not use {curly-brace} placeholders; do not invent specific numbers, dates, or names that the brief didn't give you. Keep it honest and concrete. Never use these filler phrases: "Hang tight", "Sounds good", "Awesome", "Great question", "Perfect", "I'd be happy to", "Unfortunately", "Thanks for reaching out". Never name the underlying technology, and never approximate a price.`;

const cleanStr = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Models sometimes wrap JSON in prose or code fences; extract the first object. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}

/** Escape raw control characters that appear INSIDE string literals — models
 *  often emit real newlines in long fields (e.g. body), which is invalid JSON. */
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

export async function handleEmailCompose(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.COMPOSE_SECRET) {
    return jsonResp({ error: "not_configured", detail: "COMPOSE_SECRET not set on the Worker." }, 503);
  }
  if (req.headers.get("x-compose-secret") !== env.COMPOSE_SECRET) {
    return jsonResp({ error: "unauthorized" }, 401);
  }

  let brief = "";
  try {
    brief = String(((await req.json()) as { brief?: unknown })?.brief ?? "").trim();
  } catch {
    return jsonResp({ error: "bad_json" }, 400);
  }
  if (brief.length < 3) {
    return jsonResp({ error: "brief_required", detail: "Describe the email you want in a sentence or two." }, 400);
  }

  let parsed: Record<string, unknown>;
  try {
    // Routes through the AI quality & cost layer: same Workers-AI model + params
    // as before (output unchanged). Phase 2 — async batch grading (D2): the draft
    // is judged off the hot path and ONE enriched ai_decisions row is written.
    // Internal admin tool → tenant_id = the FounderFirst org (D15).
    const result = await resolveAndJudgeOnWorkers(
      {
        useCase: USE_CASE.EMAIL_COMPOSE,
        tenantId: TENANT_FOUNDERFIRST,
        system: SYSTEM,
        messages: [{ role: "user", content: `Brief:\n${brief.slice(0, 2000)}` }],
        maxTokens: 700,
        temperature: 0.5,
        jsonObject: true,
        // Phase 4 (D10): model from DB routing (ai_model_config), editable in admin.
        record: { storeInput: true },
      },
      env,
      ctx,
    );
    const resp = result.raw;
    // Workers AI models vary: some return the JSON as a string, others as an
    // already-parsed object. Handle both, and repair raw control chars.
    parsed =
      resp && typeof resp === "object"
        ? (resp as Record<string, unknown>)
        : JSON.parse(escapeControlChars(extractJson(typeof resp === "string" ? resp : String(resp ?? "{}"))));
  } catch (e) {
    return jsonResp({ error: "compose_failed", detail: String((e as Error).message).slice(0, 200) }, 502);
  }

  const draft = {
    subject:   cleanStr(parsed.subject, 60),
    preheader: cleanStr(parsed.preheader, 120),
    eyebrow:   cleanStr(parsed.eyebrow, 40) || "FounderFirst",
    heading:   cleanStr(parsed.heading, 160),
    intro:     cleanStr(parsed.intro, 200),
    body:      cleanStr(parsed.body, 1500),
    cta_label: cleanStr(parsed.cta_label, 40),
    footer:    cleanStr(parsed.footer, 200) || "You're getting this because you're a FounderFirst customer.",
  };
  if (!draft.subject || !draft.heading) {
    return jsonResp({ error: "weak_draft", detail: "model returned an empty subject/heading" }, 502);
  }
  return jsonResp({ ok: true, draft });
}
