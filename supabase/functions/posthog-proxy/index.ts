/**
 * posthog-proxy — admin-only Edge Function over PostHog's HogQL Query API.
 * Holds the PostHog **personal** API key (read scope) server-side and exposes a
 * small read API so the admin Analytics page can show product analytics without
 * exposing any key client-side.
 *
 * Endpoints (POST body, JSON):
 *   { action: "overview",  days }                 // pageviews, unique users, sessions
 *   { action: "traffic",   days }                 // pageviews + users per day
 *   { action: "topPages",  days, limit? }         // top pages by views
 *   { action: "topEvents", days, limit? }         // top custom/autocaptured events
 *
 * Auth: verify_jwt = true (config.toml) + is_admin() RPC (mirrors ga-proxy).
 *
 * Secrets (set via `supabase secrets set`):
 *   POSTHOG_PERSONAL_API_KEY  — phx_… personal key, read scope
 *   POSTHOG_PROJECT_ID        — optional, defaults to 394556
 *   POSTHOG_HOST              — optional, defaults to https://us.posthog.com
 *   SUPABASE_URL / SUPABASE_ANON_KEY — provided automatically by Supabase
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: false as const, status: 500, error: "supabase env missing" };
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: userRes, error: userErr } = await client.auth.getUser();
  if (userErr || !userRes.user?.email) return { ok: false as const, status: 401, error: "unauthenticated" };
  const { data: isAdmin, error: rpcErr } = await client.rpc("is_admin");
  if (rpcErr || !isAdmin) return { ok: false as const, status: 403, error: "admin only" };
  return { ok: true as const, email: userRes.user.email };
}

// Run a HogQL query against the PostHog Query API. `days`/`limit` are clamped
// integers interpolated into the SQL — safe (no string params from the client).
async function hogql(host: string, project: string, key: string, query: string): Promise<any[]> {
  const res = await fetch(`${host}/api/projects/${project}/query/`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`posthog_${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.results ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405);

  const auth = await requireAdmin(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const KEY     = Deno.env.get("POSTHOG_PERSONAL_API_KEY") ?? "";
  const PROJECT = Deno.env.get("POSTHOG_PROJECT_ID") ?? "394556";
  const HOST    = (Deno.env.get("POSTHOG_HOST") ?? "https://us.posthog.com").replace(/\/$/, "");
  if (!KEY) return json({ error: "missing_config", hint: "Set POSTHOG_PERSONAL_API_KEY secret" }, 500);

  let body: { action?: string; days?: number; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const days  = Math.max(1, Math.min(body.days  ?? 30, 365));
  const limit = Math.max(1, Math.min(body.limit ?? 10,  50));
  const since = `timestamp >= now() - INTERVAL ${days} DAY`;

  try {
    if (body.action === "overview") {
      const r = await hogql(HOST, PROJECT, KEY,
        `SELECT count() AS pageviews, count(DISTINCT person_id) AS users, count(DISTINCT $session_id) AS sessions
         FROM events WHERE event = '$pageview' AND ${since}`);
      const row = r[0] ?? [0, 0, 0];
      return json({ pageviews: Number(row[0] ?? 0), users: Number(row[1] ?? 0), sessions: Number(row[2] ?? 0) });
    }
    if (body.action === "traffic") {
      const r = await hogql(HOST, PROJECT, KEY,
        `SELECT toDate(timestamp) AS day, count() AS pageviews, count(DISTINCT person_id) AS users
         FROM events WHERE event = '$pageview' AND ${since} GROUP BY day ORDER BY day`);
      return json({ rows: r.map((x: any[]) => ({ date: String(x[0]), pageviews: Number(x[1]), users: Number(x[2]) })) });
    }
    if (body.action === "topPages") {
      const r = await hogql(HOST, PROJECT, KEY,
        `SELECT properties.$pathname AS path, count() AS views, count(DISTINCT person_id) AS users
         FROM events WHERE event = '$pageview' AND ${since} GROUP BY path ORDER BY views DESC LIMIT ${limit}`);
      return json({ rows: r.map((x: any[]) => ({ path: String(x[0] ?? "/"), views: Number(x[1]), users: Number(x[2]) })) });
    }
    if (body.action === "topEvents") {
      const r = await hogql(HOST, PROJECT, KEY,
        `SELECT event, count() AS n FROM events
         WHERE event NOT LIKE '$%' AND ${since} GROUP BY event ORDER BY n DESC LIMIT ${limit}`);
      return json({ rows: r.map((x: any[]) => ({ event: String(x[0]), count: Number(x[1]) })) });
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "posthog_error", message: (e as Error).message }, 502);
  }
});
