/**
 * draft-variant — admin-gated AI drafting for learning-loop experiments. Drafts
 * an on-brand variant of a piece of marketing copy (a headline, sub, CTA, …).
 *
 * Voice is SINGLE-SOURCED: every draft is grounded in the LIVE voice guide
 * (`get_live_voice` RPC) — never hardcoded tone. Change the guide in
 * /content#voice and every future draft follows. The admin still runs the
 * existing `voice-check` soft-warning on the result before publishing.
 *
 * Body: { field: "headline"|"sub"|"cta", control: string, brief?: string }
 * Returns: { text }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  // ── admin gate (mirror voice-check) ──
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) return json({ error: "unauthorized" }, 401);
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: adminRow } = await service.from("admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
  if (!adminRow) return json({ error: "forbidden" }, 403);

  let body: { field?: string; control?: string; brief?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const field = (body.field ?? "headline").trim();
  const control = (body.control ?? "").trim();
  const brief = (body.brief ?? "").trim();
  if (!control) return json({ error: "control_required" }, 400);

  // ── live voice guide (single source of truth) ──
  const { data: voice } = await service.rpc("get_live_voice");
  const guide: string = (Array.isArray(voice) ? voice[0]?.body : voice?.body) ?? "";

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "not_configured", detail: "Set ANTHROPIC_API_KEY." }, 503);
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

  const system = [
    "You write marketing copy for FounderFirst (product: Penny, an autonomous AI bookkeeper).",
    "Write STRICTLY in the brand voice below — match its tone, rhythm, and vocabulary.",
    "Rules: never claim Penny does taxes (say 'CPA-ready'); never invent features; one line only; no quotes around the output; return ONLY the new copy, nothing else.",
    "",
    "=== LIVE VOICE GUIDE ===",
    guide || "(voice guide unavailable — keep it warm, plain, confident, founder-to-founder)",
  ].join("\n");

  const userMsg = [
    `Draft ONE alternative for this ${field} to A/B test against the current version.`,
    `Current (${field}): "${control}"`,
    brief ? `Angle to try: ${brief}` : "Try a distinct angle (different emotional hook or value framing) while staying on-voice and truthful.",
    "Return only the new copy.",
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 200, system, messages: [{ role: "user", content: userMsg }] }),
    });
    if (!res.ok) return json({ error: "anthropic_error", message: await res.text() }, 502);
    const data = await res.json();
    const text = (data?.content?.[0]?.text ?? "").trim().replace(/^["']|["']$/g, "");
    if (!text) return json({ error: "empty_draft" }, 502);
    return json({ text });
  } catch (e) {
    return json({ error: "draft_error", message: (e as Error).message }, 502);
  }
});
