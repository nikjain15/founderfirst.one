/**
 * gsc-proxy — Supabase Edge Function that holds the GCP service-account
 * credentials and exposes a small, admin-only API over the Google Search
 * Console (Search Analytics) API.
 *
 * Endpoints (POST body, JSON):
 *   { action: "summary",     days: number }              // totals
 *   { action: "byDate",      days: number }              // per-day rows (trend)
 *   { action: "topQueries",  days: number, limit?: num } // search queries
 *   { action: "topPages",    days: number, limit?: num } // landing pages
 *
 * Auth:
 *   - verify_jwt = true (see ../../config.toml) — Supabase verifies the
 *     caller's JWT before the function runs.
 *   - We additionally require the caller be an admin (is_admin() RPC), so
 *     non-admin accounts can't read Search Console data.
 *
 * Secrets required (set via `supabase secrets set`):
 *   GCP_SA_JSON        — full service-account JSON, stringified. REUSED from
 *                        ga-proxy; the service-account email must be added as a
 *                        user on the GSC property (Settings → Users), and the
 *                        "Google Search Console API" enabled in its GCP project.
 *   SUPABASE_URL       — provided automatically by Supabase
 *   SUPABASE_ANON_KEY  — provided automatically by Supabase
 *
 * Site URL: the verified GSC Domain property. Single source of truth here.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// The verified Search Console Domain property for founderfirst.one.
const GSC_SITE_URL = "sc-domain:founderfirst.one";

// ---- CORS ------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// ---- GCP service-account → access token (JWT bearer flow) ------------------
// Identical flow to ga-proxy; only the OAuth scope differs (webmasters.readonly).

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { token: string; expires: number } | null = null;

async function pemToCryptoKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function b64url(s: string): string {
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud:   sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const key = await pemToCryptoKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
  const jwt = `${signingInput}.${sigB64}`;

  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`google_token_${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = {
    token:   data.access_token,
    expires: Date.now() + (data.expires_in * 1000),
  };
  return cachedToken.token;
}

// ---- Search Console Search Analytics API -----------------------------------
async function searchAnalytics(
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`gsc_${res.status}: ${await res.text()}`);
  return res.json();
}

// GSC wants explicit YYYY-MM-DD dates. Data lags ~2-3 days; the API simply
// returns the freshest available within the window, so endDate=today is fine.
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dateRange(days: number) {
  const span = Math.max(1, Math.min(days, 480));
  const end = new Date();
  const start = new Date(end.getTime() - span * 86_400_000);
  return { startDate: ymd(start), endDate: ymd(end) };
}

// ---- Admin check via Supabase user JWT -------------------------------------
async function requireAdmin(req: Request): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  const auth = req.headers.get("Authorization") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, status: 500, error: "supabase env missing" };
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes, error: userErr } = await client.auth.getUser();
  if (userErr || !userRes.user?.email) return { ok: false, status: 401, error: "unauthenticated" };
  const { data: isAdmin, error: rpcErr } = await client.rpc("is_admin");
  if (rpcErr || !isAdmin) return { ok: false, status: 403, error: "admin only" };
  return { ok: true, email: userRes.user.email };
}

// ---- Handler ---------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const auth = await requireAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const SA_JSON = Deno.env.get("GCP_SA_JSON") ?? "";
  if (!SA_JSON) {
    return json({ error: "missing_config", hint: "Set GCP_SA_JSON secret" }, 500);
  }

  let sa: ServiceAccount;
  try { sa = JSON.parse(SA_JSON); } catch { return json({ error: "bad_sa_json" }, 500); }

  let body: { action?: string; days?: number; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const days  = Math.max(1, Math.min(body.days  ?? 28, 480));
  const limit = Math.max(1, Math.min(body.limit ?? 10,  100));
  const range = dateRange(days);

  try {
    const token = await getAccessToken(sa);

    if (body.action === "summary") {
      const r = await searchAnalytics(token, { ...range });
      const row = r.rows?.[0] ?? {};
      return json({
        clicks:      Number(row.clicks ?? 0),
        impressions: Number(row.impressions ?? 0),
        ctr:         Number(row.ctr ?? 0),
        position:    Number(row.position ?? 0),
      });
    }

    if (body.action === "byDate") {
      const r = await searchAnalytics(token, { ...range, dimensions: ["date"] });
      return json({
        rows: (r.rows ?? []).map((x: any) => ({
          date:        x.keys?.[0] ?? "",
          clicks:      Number(x.clicks ?? 0),
          impressions: Number(x.impressions ?? 0),
          ctr:         Number(x.ctr ?? 0),
          position:    Number(x.position ?? 0),
        })),
      });
    }

    if (body.action === "topQueries") {
      const r = await searchAnalytics(token, { ...range, dimensions: ["query"], rowLimit: limit });
      return json({
        rows: (r.rows ?? []).map((x: any) => ({
          query:       x.keys?.[0] ?? "",
          clicks:      Number(x.clicks ?? 0),
          impressions: Number(x.impressions ?? 0),
          ctr:         Number(x.ctr ?? 0),
          position:    Number(x.position ?? 0),
        })),
      });
    }

    if (body.action === "topPages") {
      const r = await searchAnalytics(token, { ...range, dimensions: ["page"], rowLimit: limit });
      return json({
        rows: (r.rows ?? []).map((x: any) => ({
          page:        x.keys?.[0] ?? "",
          clicks:      Number(x.clicks ?? 0),
          impressions: Number(x.impressions ?? 0),
          ctr:         Number(x.ctr ?? 0),
          position:    Number(x.position ?? 0),
        })),
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "gsc_error", message: (e as Error).message }, 502);
  }
});
