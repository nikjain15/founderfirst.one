/**
 * voice-check — admin-gated proxy that critiques draft copy against the live
 * FounderFirst voice guide, using the local Ollama model on the Signals host.
 *
 * Same authenticated-middle-hop shape as email-compose:
 *
 *   admin (JWT)  →  voice-check (verifies admin + loads live voice guide)
 *     →  compose-server over the Cloudflare Tunnel (COMPOSE_ENDPOINT_URL +
 *        COMPOSE_SECRET)  →  Ollama
 *
 * The host compose-server must expose a `/voice-check` route that takes
 * { text, guide } and returns { on_voice: boolean, score: number 0-100,
 * deviations: string[], rewrites: {before,after}[], summary: string }. (The
 * existing host only has /compose for email drafting — add the sibling route;
 * see tools/signals-worker/README.md "AI email drafting".) Until then this
 * returns a clear not_configured error and the editor falls back to the instant
 * heuristic.
 *
 * Secrets: COMPOSE_ENDPOINT_URL, COMPOSE_SECRET (same as email-compose),
 * SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (auto).
 * Auth: verify_jwt = false; the caller's admin JWT is checked in code.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // ---- Admin auth ----------------------------------------------------------
  const url = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user?.email) return json({ error: "unauthorized" }, 401);
  const { data: adminRow } = await userClient
    .from("admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
  if (!adminRow) return json({ error: "forbidden" }, 403);

  // ---- Input ---------------------------------------------------------------
  let text = "";
  try { text = String((await req.json())?.text ?? "").trim(); }
  catch { return json({ error: "bad_json" }, 400); }
  if (text.length < 10) return json({ error: "text_required", detail: "Add some copy to check against the voice guide." }, 400);

  // ---- Load the live voice guide (service role bypasses RLS) ----------------
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: voice } = await service.rpc("get_live_voice");
  const guide: string = (Array.isArray(voice) ? voice[0]?.body : voice?.body) ?? "";
  if (!guide) return json({ error: "no_voice_guide", detail: "No live voice guide is set yet." }, 409);

  // ---- Config check --------------------------------------------------------
  const endpoint = Deno.env.get("COMPOSE_ENDPOINT_URL");
  const secret = Deno.env.get("COMPOSE_SECRET");
  if (!endpoint || !secret) {
    return json({ error: "not_configured", detail: "AI voice check isn't set up yet. Set COMPOSE_ENDPOINT_URL and COMPOSE_SECRET, and add the /voice-check route to compose-server (see signals-worker README)." }, 503);
  }

  // ---- Forward to the host over the tunnel ---------------------------------
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/voice-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-compose-secret": secret },
      body: JSON.stringify({ text, guide }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: "check_failed", detail: data?.detail ?? `host ${res.status}` }, 502);
    return json({ ok: true, review: data.review ?? data });
  } catch (e) {
    return json({ error: "check_unreachable", detail: String((e as Error).message) }, 502);
  }
});
