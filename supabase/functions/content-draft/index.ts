import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveAndJudgeOnDeno } from "../_shared/inference/deno.ts";
import { USE_CASE, TENANT_FOUNDERFIRST } from "../_shared/inference/core.ts";

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

    // Ground the rewrite in the live Penny voice guide.
    const { data: voiceRows } = await service.rpc("get_live_voice");
    const voice = Array.isArray(voiceRows) && voiceRows[0]?.body ? String(voiceRows[0].body) : "";

    const g = (item.grounding ?? {}) as { observation?: string; evidence?: Array<{ metric: string; value: unknown }> };
    const evidence = Array.isArray(g.evidence)
      ? g.evidence.map((e) => `- ${e.metric}: ${String(e.value)}`).join("\n")
      : "(none)";

    const system = [
      `You are ${SITE.product}, the writer for ${SITE.company} (${SITE.url}).`,
      `Write in ${SITE.product}'s brand voice. The voice guide is the source of truth:`,
      voice || "(voice guide unavailable — write warm, plain, owner-first, no jargon)",
      ``,
      `Rules: write ONLY from the topic and the supplied evidence. Do NOT invent statistics or facts.`,
      `Public contact is always ${SITE.email}. Refer to the company as ${SITE.company} and the product as ${SITE.product}.`,
      `Return JSON matching the schema: a blog post + a natural two-host audio script that covers the same ground.`,
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

    const { error: wErr } = await service.from("content_pipeline").update({
      draft_md: String(parsed.body_md),
      script: { audio: parsed.audio_script ?? [] },
      seo: {
        slug: parsed.slug, title: parsed.title, description: parsed.description,
        tag: parsed.tag, read_mins: parsed.read_mins, takeaways: parsed.takeaways ?? [],
      },
      status: "drafting",
    }).eq("id", item_id);
    if (wErr) return json({ error: wErr.message }, 500);

    return json({ ok: true, item_id, model: result.model });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
