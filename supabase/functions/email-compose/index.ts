/**
 * email-compose — admin-gated proxy that drafts email copy with the local Ollama
 * model running on the Signals host.
 *
 * The browser can't reach Ollama (localhost-only, no auth) and must not hold the
 * shared secret, so this function is the authenticated middle hop:
 *
 *   admin (signed-in JWT)  →  email-compose (verifies admin)  →  compose-server
 *     over a Cloudflare Tunnel (COMPOSE_ENDPOINT_URL + COMPOSE_SECRET)  →  Ollama
 *
 * Returns the drafted fields as JSON; the admin previews and accepts them.
 *
 * Secrets (set via `supabase secrets set`):
 *   COMPOSE_ENDPOINT_URL  — public tunnel URL of compose-server, e.g.
 *                           https://compose.founderfirst.one  (no trailing /compose)
 *   COMPOSE_SECRET        — shared secret; must match the host's COMPOSE_SECRET
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY — auto-provided
 *
 * Auth: verify_jwt = false (see config.toml); the caller's admin JWT is checked
 * in code, same pattern as changelog-digest preview/send.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  // ---- Admin auth (the caller's JWT, not the shared secret) ----------------
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

  // ---- Config check --------------------------------------------------------
  const endpoint = Deno.env.get("COMPOSE_ENDPOINT_URL");
  const secret   = Deno.env.get("COMPOSE_SECRET");
  if (!endpoint || !secret) {
    return json({ error: "not_configured", detail: "AI drafting isn't set up yet. Set COMPOSE_ENDPOINT_URL and COMPOSE_SECRET (see signals-worker README)." }, 503);
  }

  let brief = "";
  try { brief = String((await req.json())?.brief ?? "").trim(); }
  catch { return json({ error: "bad_json" }, 400); }
  if (brief.length < 3) return json({ error: "brief_required", detail: "Describe the email you want in a sentence or two." }, 400);

  // ---- Single voice + email task note ---------------------------------------
  // One canonical voice guide drives every surface; email layers its own task
  // note on top (penny_outreach_persona, surface='email'). We fetch both here
  // (service role) and forward them so compose-server doesn't hold a second copy
  // of FounderFirst's voice. If either is unset, compose-server falls back to its
  // baked-in default, so email keeps working.
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const [{ data: voiceRows }, { data: personaRows }] = await Promise.all([
    svc.rpc("get_live_voice"),
    svc.rpc("get_live_outreach_persona", { p_surface: "email" }),
  ]);
  const voice   = (voiceRows as { body?: string }[] | null)?.[0]?.body ?? "";
  const persona = (personaRows as { body?: string }[] | null)?.[0]?.body ?? "";

  // ---- Forward to the host compose-server over the tunnel ------------------
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/compose`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-compose-secret": secret },
      body: JSON.stringify({ brief, voice, persona }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: "compose_failed", detail: data?.detail ?? `host ${res.status}` }, 502);
    return json({ ok: true, draft: data.draft });
  } catch (e) {
    return json({ error: "compose_unreachable", detail: String((e as Error).message) }, 502);
  }
});
