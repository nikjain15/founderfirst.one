/**
 * listening-intake — the single front door for Signals intake.
 *
 * Two callers POST normalized posts here:
 *   - The browser extension (manual capture from closed communities, e.g. a
 *     Facebook group). It holds the shared secret in its options.
 *   - (Phase 2) the API Direct poller, if we ever push instead of pull.
 *
 * Quick-Add from the admin does NOT use this endpoint — it calls the
 * sig_quick_add_item RPC directly with the admin's JWT.
 *
 * This function checks a shared-secret header, then inserts via the
 * service-role-only sig_ingest_item RPC (dedups on external_url). The browser
 * never holds a DB key — only the intake secret.
 *
 * Secrets required (set via `supabase secrets set`):
 *   LISTENING_INTAKE_SECRET   — shared secret; the extension sends it as
 *                               x-listening-secret
 *   SUPABASE_URL              — auto-provided
 *   SUPABASE_SERVICE_ROLE_KEY — auto-provided; used to call sig_ingest_item
 *
 * Auth: verify_jwt = false (see ../../config.toml) — the shared secret gates it.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-listening-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const ALLOWED_VIA = ["extension", "quick_add", "api_direct", "bright_data", "octolens"];

type Payload = {
  platform: string;                  // "facebook_group" | "reddit" | "linkedin" | ...
  external_url?: string | null;
  author_handle?: string | null;
  author_url?: string | null;
  title?: string | null;
  body?: string | null;
  posted_at?: string | null;         // ISO; optional
  captured_via?: string;             // defaults to "extension"
  raw?: Record<string, unknown>;     // anything else the capturer grabbed
};

function clip(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  // Shared-secret auth — only holders of the intake secret may post.
  const expected = Deno.env.get("LISTENING_INTAKE_SECRET");
  if (!expected || req.headers.get("x-listening-secret") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Payload;
  try { body = await req.json(); }
  catch { return json({ error: "bad_json" }, 400); }

  const platform = clip(body.platform, 64);
  if (!platform) return json({ error: "missing_platform" }, 400);

  // A capture is useless without something to score — require body or title.
  const text = clip(body.body, 20000);
  const title = clip(body.title, 500);
  if (!text && !title) return json({ error: "missing_content" }, 400);

  const via = body.captured_via && ALLOWED_VIA.includes(body.captured_via)
    ? body.captured_via
    : "extension";

  let postedAt: string | null = null;
  if (body.posted_at) {
    const d = new Date(body.posted_at);
    if (!isNaN(d.getTime())) postedAt = d.toISOString();
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: itemId, error } = await supa.rpc("sig_ingest_item", {
    p_platform:      platform,
    p_external_url:  clip(body.external_url, 2000),
    p_author_handle: clip(body.author_handle, 200),
    p_author_url:    clip(body.author_url, 2000),
    p_title:         title,
    p_body:          text,
    p_posted_at:     postedAt,
    p_captured_via:  via,
    p_raw:           body.raw && typeof body.raw === "object" ? body.raw : {},
    p_source_id:     null,
  });

  if (error) return json({ error: "ingest_failed", detail: error.message }, 500);

  return json({ ok: true, item_id: itemId });
});
