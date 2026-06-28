/**
 * geo-probe — once-a-day GEO (AI-answer) visibility probe, multi-engine.
 *
 * Invoked by the geo_trigger_probe() pg_cron job (see
 * 20260627150000_geo_visibility.sql), which POSTs here with the shared secret.
 * For each active geo_prompts row, asks EVERY configured AI engine the
 * buyer-intent question and records whether/where founderfirst.one was cited —
 * one geo_runs row per (prompt × engine). The admin Analytics → Visibility tab
 * reads geo_summary() over that history.
 *
 * Engines run iff their key is present, so you can start free with Gemini alone:
 *   - gemini      — GEMINI_API_KEY     (Google AI Studio free tier, Search Grounding)
 *   - perplexity  — PERPLEXITY_API_KEY (optional)
 *
 * Secrets required (set via `supabase secrets set`):
 *   GEO_PROBE_SECRET    — shared secret; cron sends it as x-geo-secret
 *   GEMINI_API_KEY      — Gemini key. Optional GEMINI_MODEL (default gemini-2.5-flash)
 *   PERPLEXITY_API_KEY  — optional second engine
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-provided
 *
 * Auth: verify_jwt = false; the shared secret gates it.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-geo-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const BRAND_DOMAIN = "founderfirst.one";
const BRAND_NAMES  = ["founderfirst", "founder first"];

// Heuristic competitor detection — names we expect in bookkeeping/accounting answers.
const COMPETITOR_NAMES = [
  "QuickBooks", "Xero", "FreshBooks", "Wave", "Bench", "Pilot", "Zoho Books",
  "Sage", "Bonsai", "Botkeeper", "Puzzle", "Digits", "Found", "Lili",
  "Novo", "Ramp", "Bill.com", "Melio", "NetSuite", "Kashoo",
];

type GeoPrompt = { id: string; prompt: string; topic: string | null };
type Source = { url: string; title: string };

type ProbeCore = {
  cited: boolean;
  rank: number | null;
  mentioned: boolean;
  competitors: string[];
  answer_excerpt: string;
  raw: Record<string, unknown>;
};

// Shared scoring: given the answer text + the engine's cited sources, decide
// whether/where the brand shows up. cited = our domain (or brand name) appears
// among the sources; rank = its 1-based position; mentioned = named in prose.
function analyze(answer: string, sources: Source[]): ProbeCore {
  const lower = answer.toLowerCase();
  const idx = sources.findIndex((s) =>
    s.url.toLowerCase().includes(BRAND_DOMAIN) ||
    BRAND_NAMES.some((n) => s.title.toLowerCase().includes(n)),
  );
  const cited = idx >= 0;
  const mentioned = BRAND_NAMES.some((n) => lower.includes(n)) || lower.includes(BRAND_DOMAIN);
  const competitors = COMPETITOR_NAMES.filter((c) => lower.includes(c.toLowerCase()));
  return {
    cited,
    rank: cited ? idx + 1 : null,
    mentioned,
    competitors,
    answer_excerpt: answer.slice(0, 600),
    raw: { sources },
  };
}

// ---- Perplexity ------------------------------------------------------------
async function probePerplexity(apiKey: string, p: GeoPrompt): Promise<ProbeCore> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [{ role: "user", content: p.prompt }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`perplexity_${res.status}: ${await res.text()}`);
  const data = await res.json();

  const answer: string = data?.choices?.[0]?.message?.content ?? "";
  const urls: string[] = [];
  if (Array.isArray(data?.citations)) for (const c of data.citations) if (typeof c === "string") urls.push(c);
  if (Array.isArray(data?.search_results)) for (const s of data.search_results) if (typeof s?.url === "string") urls.push(s.url);
  const sources: Source[] = urls.map((u) => ({ url: u, title: "" }));

  const core = analyze(answer, sources);
  core.raw = { ...core.raw, model: data?.model ?? "sonar" };
  return core;
}

// ---- Gemini (free tier, Search Grounding) ----------------------------------
// We enable the google_search tool; the response's groundingMetadata lists the
// web sources the model actually used. Note: grounding URIs are Vertex redirect
// links that mask the real domain, so we match on the source TITLE (usually the
// page/site name) as well as the answer text.
async function probeGemini(apiKey: string, model: string, p: GeoPrompt): Promise<ProbeCore> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: p.prompt }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini_${res.status}: ${await res.text()}`);
  const data = await res.json();

  const cand = data?.candidates?.[0];
  const answer: string = (cand?.content?.parts ?? [])
    .map((pt: any) => pt?.text ?? "").join(" ").trim();
  const chunks: any[] = cand?.groundingMetadata?.groundingChunks ?? [];
  const sources: Source[] = chunks
    .map((c) => ({ url: c?.web?.uri ?? "", title: c?.web?.title ?? "" }))
    .filter((s) => s.url || s.title);

  const core = analyze(answer, sources);
  core.raw = { ...core.raw, model };
  return core;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("GEO_PROBE_SECRET");
  if (!expected || req.headers.get("x-geo-secret") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  // Build the engine roster from whatever keys are configured.
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const geminiModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
  const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");

  const engines: Array<{ name: string; run: (p: GeoPrompt) => Promise<ProbeCore> }> = [];
  if (geminiKey)     engines.push({ name: "gemini",     run: (p) => probeGemini(geminiKey, geminiModel, p) });
  if (perplexityKey) engines.push({ name: "perplexity", run: (p) => probePerplexity(perplexityKey, p) });
  if (engines.length === 0) {
    return json({ error: "missing_config", hint: "Set GEMINI_API_KEY and/or PERPLEXITY_API_KEY" }, 500);
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: prompts, error: pErr } = await supa
    .from("geo_prompts")
    .select("id, prompt, topic")
    .eq("is_active", true);
  if (pErr) return json({ error: "prompt_lookup_failed", detail: pErr.message }, 500);
  if (!prompts?.length) return json({ ok: true, probed: 0, reason: "no_active_prompts" });

  const rows: Array<Record<string, unknown>> = [];
  const failures: Array<{ prompt: string; engine: string; error: string }> = [];

  // Probe each prompt on each engine. Sequential — gentle on the APIs and cheap.
  // One failure must never abort the rest of the run.
  for (const p of prompts as GeoPrompt[]) {
    for (const eng of engines) {
      try {
        const core = await eng.run(p);
        rows.push({ prompt_id: p.id, engine: eng.name, ...core });
      } catch (e) {
        failures.push({ prompt: p.prompt, engine: eng.name, error: (e as Error).message });
      }
    }
  }

  if (rows.length) {
    const { error: insErr } = await supa.from("geo_runs").insert(rows);
    if (insErr) return json({ error: "insert_failed", detail: insErr.message }, 500);
  }

  const cited = rows.filter((r) => (r as any).cited).length;
  return json({
    ok: true,
    engines: engines.map((e) => e.name),
    probed: rows.length,
    cited,
    failures: failures.length,
    failureDetail: failures.slice(0, 5),
  });
});
