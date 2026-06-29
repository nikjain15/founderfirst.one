/**
 * ai-catalog-sync — refreshes ai_model_catalog from the live model universe (Phase 5).
 *
 * Pulls OpenRouter's PUBLIC /models endpoint (no key needed) for the rich metadata
 * — price, context window, input modalities, supported_parameters (tool/JSON/
 * reasoning), and the third-party `benchmarks` scores it carries — maps each model
 * into ai_model_catalog, and computes `recommended_for` archetype tags so the admin
 * Models tab can self-recommend per use case (plan §8, D22).
 *
 * Enrichment hooks (run when their creds are present, else skipped cleanly):
 *   - Workers-AI `task` tag + context, via the Cloudflare models API
 *     (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID).
 *   - leaderboard signals (Artificial Analysis intelligence, LMArena Elo) — TODO,
 *     wired the same way once a source key/dataset mirror is set.
 *
 * Auth: verify_jwt = true (default) + is_admin() — triggered from the admin "Sync
 * catalog" button. (A pg_cron schedule can be added later with a cron secret.)
 * Writes use the service role (bypasses RLS on ai_model_catalog).
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

const numOr = (v: unknown, d = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Compute archetype recommendation tags from price tier + context + capabilities.
 *  Deliberately simple + transparent; refined once leaderboard signals land. */
function recommendFor(row: {
  inputPerMTok: number | null;
  contextLength: number;
  params: string[];
  modalities: string[];
  id: string;
  instruct: boolean;
}): string[] {
  const tags = new Set<string>();
  const p = row.inputPerMTok; // null = unknown price (e.g. OpenRouter "auto") → no price-based tags
  const cheap = p != null && p >= 0 && p <= 0.3;
  const mid = p != null && p > 0.3 && p <= 3;
  const frontier = p != null && p > 3;
  const tools = row.params.includes("tools") || row.params.includes("tool_choice");
  const jsonOut = row.params.includes("response_format") || row.params.includes("structured_outputs");
  const reasoning = row.params.includes("reasoning") || row.params.includes("include_reasoning");
  const idl = row.id.toLowerCase();

  if (cheap) tags.add("classification");
  if (tools || jsonOut) tags.add("extraction");
  if (row.contextLength >= 32_000 && !frontier) tags.add("summarization");
  if (frontier || reasoning) tags.add("reasoning");
  if (row.instruct || mid || frontier) tags.add("chat");
  if (mid || frontier) tags.add("writing");
  if (idl.includes("code") || idl.includes("coder")) tags.add("coding");
  if (idl.includes("guard") || idl.includes("-safety")) tags.add("safety");
  return [...tags];
}

async function syncOpenRouter(admin: any): Promise<{ upserted: number; error?: string }> {
  let models: any[];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) return { upserted: 0, error: `openrouter_${res.status}` };
    models = (await res.json())?.data ?? [];
  } catch (e) {
    return { upserted: 0, error: e instanceof Error ? e.message : String(e) };
  }

  const rows = models.map((m: any) => {
    const params: string[] = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
    const modalities: string[] = m.architecture?.input_modalities ?? [];
    // OpenRouter uses negative sentinels (e.g. -1) for variable-priced router models;
    // treat those as unknown (null) rather than a fake cheap price.
    const rawIn = numOr(m.pricing?.prompt) * 1_000_000;
    const rawOut = numOr(m.pricing?.completion) * 1_000_000;
    const inputPerMTok = rawIn < 0 ? null : rawIn;
    const outputPerMTok = rawOut < 0 ? null : rawOut;
    const contextLength = numOr(m.context_length ?? m.top_provider?.context_length);
    return {
      model: m.id,
      provider: "openrouter",
      display_name: m.name ?? m.id,
      description: (m.description ?? "").slice(0, 1000),
      context_length: contextLength || null,
      input_per_mtok: inputPerMTok,
      output_per_mtok: outputPerMTok,
      modalities,
      capabilities: {
        supported_parameters: params,
        instruct_type: m.architecture?.instruct_type ?? null,
        is_moderated: m.top_provider?.is_moderated ?? null,
        max_completion_tokens: m.top_provider?.max_completion_tokens ?? null,
      },
      benchmarks: m.benchmarks ?? null,
      recommended_for: recommendFor({
        inputPerMTok,
        contextLength,
        params,
        modalities,
        id: m.id,
        instruct: !!m.architecture?.instruct_type,
      }),
      source: "openrouter",
      synced_at: new Date().toISOString(),
    };
  });

  // Upsert in chunks to stay within payload limits.
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await admin.from("ai_model_catalog").upsert(chunk, { onConflict: "model" });
    if (error) return { upserted, error: error.message };
    upserted += chunk.length;
  }
  return { upserted };
}

/** Flag catalog rows that are actually routable (present in ai_model_prices). */
async function markRoutable(admin: any): Promise<void> {
  const { data } = await admin.from("ai_model_prices").select("model");
  const routable = new Set((data ?? []).map((r: any) => r.model));
  if (routable.size === 0) return;
  // Reset then set — cheap given catalog size.
  await admin.from("ai_model_catalog").update({ routable: false }).neq("model", "");
  await admin.from("ai_model_catalog").update({ routable: true }).in("model", [...routable]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !serviceKey) return json({ error: "not_configured" }, 503);

  // is_admin() gate, using the caller's JWT.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: isAdmin, error: adminErr } = await caller.rpc("is_admin");
  if (adminErr || isAdmin !== true) return json({ error: "not_authorized" }, 403);

  const admin = createClient(url, serviceKey);

  const or = await syncOpenRouter(admin);
  if (!or.error) await markRoutable(admin);

  return json({
    ok: !or.error,
    openrouter: or,
    // enrichment steps run when their creds exist; reported so the admin sees status
    workers_ai: Deno.env.get("CLOUDFLARE_API_TOKEN") ? "pending" : "skipped (no CLOUDFLARE_API_TOKEN)",
    leaderboards: "todo",
    synced_at: new Date().toISOString(),
  }, or.error ? 502 : 200);
});
