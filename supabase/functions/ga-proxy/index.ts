/**
 * ga-proxy — Supabase Edge Function that holds the GCP service-account
 * credentials and exposes a small, admin-only API over the GA4 Data API.
 *
 * Endpoints (POST body, JSON):
 *   { action: "overview",  days: number }
 *   { action: "traffic",   days: number }   // sessions per day
 *   { action: "topPages",  days: number, limit?: number }
 *   { action: "sources",   days: number, limit?: number }
 *
 * Auth:
 *   - verify_jwt = true (see ../../config.toml) — Supabase verifies the
 *     caller's JWT before the function runs.
 *   - We additionally require the caller's email be in the admin_users table
 *     so non-admin accounts can't read analytics.
 *
 * Secrets required (set via `supabase secrets set`):
 *   GA4_PROPERTY_ID    — numeric property ID (e.g. "123456789")
 *   GCP_SA_JSON        — full service-account JSON, stringified
 *   SUPABASE_URL       — provided automatically by Supabase
 *   SUPABASE_ANON_KEY  — provided automatically by Supabase
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
// GA4 Data API uses OAuth 2.0. We mint a self-signed JWT, exchange it at
// Google's token endpoint, cache the resulting access_token in memory for
// its lifetime, and call the API.

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
    scope: "https://www.googleapis.com/auth/analytics.readonly",
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

// ---- GA4 Data API ----------------------------------------------------------
async function ga4(
  propertyId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`ga4_${res.status}: ${await res.text()}`);
  return res.json();
}

function dateRange(days: number) {
  return { startDate: `${Math.max(1, Math.min(days, 365))}daysAgo`, endDate: "today" };
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
  // We rely on is_admin() to check the allowlist — calling the existing
  // SECURITY DEFINER function is cheaper than re-implementing the lookup.
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

  const PROPERTY_ID = Deno.env.get("GA4_PROPERTY_ID") ?? "";
  const SA_JSON     = Deno.env.get("GCP_SA_JSON") ?? "";
  if (!PROPERTY_ID || !SA_JSON) {
    return json({ error: "missing_config", hint: "Set GA4_PROPERTY_ID and GCP_SA_JSON secrets" }, 500);
  }

  let sa: ServiceAccount;
  try { sa = JSON.parse(SA_JSON); } catch { return json({ error: "bad_sa_json" }, 500); }

  let body: { action?: string; days?: number; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const days  = Math.max(1, Math.min(body.days  ?? 30, 365));
  const limit = Math.max(1, Math.min(body.limit ?? 10,  50));

  try {
    const token = await getAccessToken(sa);

    if (body.action === "overview") {
      const r = await ga4(PROPERTY_ID, token, {
        dateRanges: [dateRange(days)],
        metrics: [
          { name: "totalUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      });
      const row = r.rows?.[0]?.metricValues ?? [];
      return json({
        totalUsers:     Number(row[0]?.value ?? 0),
        sessions:       Number(row[1]?.value ?? 0),
        pageViews:      Number(row[2]?.value ?? 0),
        bounceRate:     Number(row[3]?.value ?? 0),
        avgSessionSec:  Number(row[4]?.value ?? 0),
      });
    }

    if (body.action === "traffic") {
      const r = await ga4(PROPERTY_ID, token, {
        dateRanges: [dateRange(days)],
        dimensions: [{ name: "date" }],
        metrics:    [{ name: "sessions" }, { name: "totalUsers" }],
        orderBys:   [{ dimension: { dimensionName: "date" }, desc: false }],
      });
      return json({
        rows: (r.rows ?? []).map((x: any) => ({
          date:     x.dimensionValues[0].value,
          sessions: Number(x.metricValues[0].value),
          users:    Number(x.metricValues[1].value),
        })),
      });
    }

    if (body.action === "topPages") {
      const r = await ga4(PROPERTY_ID, token, {
        dateRanges: [dateRange(days)],
        dimensions: [{ name: "pagePath" }],
        metrics:    [{ name: "screenPageViews" }, { name: "totalUsers" }],
        orderBys:   [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit,
      });
      return json({
        rows: (r.rows ?? []).map((x: any) => ({
          path:      x.dimensionValues[0].value,
          views:     Number(x.metricValues[0].value),
          users:     Number(x.metricValues[1].value),
        })),
      });
    }

    if (body.action === "sources") {
      const r = await ga4(PROPERTY_ID, token, {
        dateRanges: [dateRange(days)],
        dimensions: [{ name: "sessionSource" }],
        metrics:    [{ name: "sessions" }, { name: "totalUsers" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit,
      });
      return json({
        rows: (r.rows ?? []).map((x: any) => ({
          source:   x.dimensionValues[0].value,
          sessions: Number(x.metricValues[0].value),
          users:    Number(x.metricValues[1].value),
        })),
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "ga_error", message: (e as Error).message }, 502);
  }
});
