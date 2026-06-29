import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveAndJudgeOnDeno } from "../_shared/inference/deno.ts";
import { USE_CASE, TENANT_FOUNDERFIRST } from "../_shared/inference/core.ts";
import { judgeContent, passesGate } from "../_shared/content_judge.ts";

/**
 * content-draft — Step 5 of the content pipeline. Turns a pipeline "idea" into a
 * brand-voice draft: a blog post (title, takeaways, markdown body) + a short
 * two-host audio script, both grounded in the LIVE Penny voice guide and the
 * SITE brand constants. Writes draft_md / script / seo onto the content_pipeline
 * row and moves it to 'drafting'. The human reviews next; audio + publish follow.
 *
 * Grounding, not invention: the model is told to write only from the supplied
 * topic + the evidence the idea carries, in Penny's voice. No fabricated stats.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

// SITE brand constants — edge functions can't import @ff/site (package boundary),
// so the load-bearing few are mirrored here. Keep in sync with packages/site.
const SITE = {
  company: "FounderFirst",
  product: "Penny",
  url: "https://founderfirst.one",
  email: "founder@founderfirst.one",
} as const;

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["slug", "title", "description", "tag", "read_mins", "takeaways", "body_md", "audio_script"],
  properties: {
    slug: { type: "string", description: "kebab-case url slug" },
    title: { type: "string" },
    description: { type: "string", description: "one-sentence summary for cards + SEO" },
    tag: { type: "string", enum: ["Guides", "Product", "Stories", "Money"] },
    read_mins: { type: "integer", description: "estimated read time in minutes, 1–20" },
    takeaways: { type: "array", description: "1–5 key takeaways", items: { type: "string" } },
    body_md: { type: "string", description: "the full post in markdown (## headings + paragraphs)" },
    audio_script: {
      type: "array",
      description: "two-host conversational read of the post (at least two turns)",
      items: {
        type: "object", additionalProperties: false, required: ["speaker", "text"],
        properties: { speaker: { type: "string", enum: ["host", "guest"] }, text: { type: "string" } },
      },
    },
  },
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });

    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u.user?.email) return json({ error: "unauthenticated" }, 401);
    const { data: isAdmin, error: aErr } = await userClient.rpc("is_admin");
    if (aErr || !isAdmin) return json({ error: "admin only" }, 403);

    const { item_id } = await req.json().catch(() => ({}));
    if (!item_id) return json({ error: "item_id required" }, 400);

    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const { data: item, error: iErr } = await service
      .from("content_pipeline").select("id, topic, angle, grounding, status").eq("id", item_id).single();
    if (iErr || !item) return json({ error: "item not found" }, 404);

    // Single-voice + surface-task-note pattern (same as discord / signals / email):
    //   <live voice guide>  +  <'content' surface task note>  +  <code-held output contract>
    // The hard rules (no competitors, no exclamation marks, strict grounding, etc.)
    // live in the voice guide — the single source of truth — NOT hard-coded here.
    const { data: voiceRows } = await service.rpc("get_live_voice");
    const voice = Array.isArray(voiceRows) && voiceRows[0]?.body ? String(voiceRows[0].body) : "";
    const { data: personaRows } = await service.rpc("get_live_outreach_persona", { p_surface: "content" });
    const persona = Array.isArray(personaRows) && personaRows[0]?.body ? String(personaRows[0].body) : "";

    const g = (item.grounding ?? {}) as { observation?: string; evidence?: Array<{ metric: string; value: unknown }> };
    const evidence = Array.isArray(g.evidence)
      ? g.evidence.map((e) => `- ${e.metric}: ${String(e.value)}`).join("\n")
      : "(none)";

    const system = [
      `You are ${SITE.product}, the writer for ${SITE.company} (${SITE.url}).`,
      ``,
      `# Voice guide (source of truth — every rule here is binding and machine-checked after you write):`,
      voice || "(voice guide unavailable — write warm, plain, owner-first, no jargon, no exclamation marks, no competitor names, no model names)",
      ``,
      `# Content task note (this surface):`,
      persona || "Write a blog post (## headings, scannable) plus a natural two-host audio script covering the same ground. Use only the supplied evidence.",
      ``,
      `# Output contract:`,
      `Public contact is always ${SITE.email}. Return JSON matching the schema: a blog post + a two-host audio script that covers the same ground under the same rules.`,
    ].join("\n");

    const userMsg = [
      `Topic: ${item.topic}`,
      item.angle ? `Angle: ${item.angle}` : ``,
      g.observation ? `Why this matters: ${g.observation}` : ``,
      `Evidence you may cite (and nothing beyond it):`,
      evidence,
    ].filter(Boolean).join("\n");

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "no_anthropic_key" }, 500);
    const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

    const result = await resolveAndJudgeOnDeno(
      {
        useCase: USE_CASE.CONTENT_DRAFT,
        tenantId: TENANT_FOUNDERFIRST,
        system,
        messages: [{ role: "user", content: userMsg }],
        maxTokens: 4000,
        jsonSchema: DRAFT_SCHEMA,
        timeoutMs: 90_000,
        anthropic: { maxRetries: 0 },
        pinModel: { provider: "anthropic", model },
        record: { storeInput: true },
      },
      {
        ANTHROPIC_API_KEY: apiKey,
        SUPABASE_URL: url,
        SUPABASE_SERVICE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      },
    );

    const parsed = JSON.parse(result.text || "{}");
    if (!parsed.title || !parsed.body_md) return json({ error: "draft_incomplete", model: result.model }, 502);

    // Editorial quality gate — judge the draft against the voice guide + the exact
    // evidence (Opus judges Sonnet). A clean 'ship' auto-advances to review; anything
    // else stays in 'drafting' with the judge's issues attached for a human. Fail closed.
    const allowedFacts = Array.isArray(g.evidence) ? g.evidence.map((e) => String(e.value)) : [];
    const audioText = (parsed.audio_script ?? [] as Array<{ speaker: string; text: string }>)
      .map((t: { speaker: string; text: string }) => `[${t.speaker}] ${t.text}`).join("\n");
    const judged = await judgeContent(apiKey, {
      voice, allowedFacts, topic: String(item.topic),
      seo: { slug: parsed.slug, title: parsed.title, description: parsed.description, tag: parsed.tag, takeaways: parsed.takeaways ?? [] },
      blogMd: String(parsed.body_md), audioScript: audioText,
    });
    const judge = judged.ok ? judged.judge : null;
    const passed = judge ? passesGate(judge) : false;

    const { error: wErr } = await service.from("content_pipeline").update({
      draft_md: String(parsed.body_md),
      script: { audio: parsed.audio_script ?? [] },
      seo: {
        slug: parsed.slug, title: parsed.title, description: parsed.description,
        tag: parsed.tag, read_mins: parsed.read_mins, takeaways: parsed.takeaways ?? [],
      },
      judge: judge ?? { error: judged.ok ? null : judged.error, verdict: "reject" },
      status: passed ? "review" : "drafting",
    }).eq("id", item_id);
    if (wErr) return json({ error: wErr.message }, 500);

    return json({ ok: true, item_id, model: result.model, gate: { passed, verdict: judge?.verdict ?? "reject", overall: judge?.overall ?? null, fabricated: judge?.grounding?.fabricated_claims ?? [], issues: judge?.issues ?? [] } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
