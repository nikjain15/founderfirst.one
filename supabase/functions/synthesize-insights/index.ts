/**
 * synthesize-insights — the "Synthesize" stage of the product learning loop.
 *
 * Admin clicks "Generate now" → this function:
 *   1. pulls a metrics snapshot from PostHog (overview, traffic, top pages, top
 *      events) over the window, server-side with POSTHOG_PERSONAL_API_KEY,
 *   2. asks the local Ollama model (via the compose-server tunnel) to turn the
 *      snapshot into a short summary + structured findings
 *      [{ observation, likely_cause, suggested_action, confidence }],
 *   3. writes an insight_runs row + one insight_actions row per finding (service
 *      role), which the admin then accepts / dismisses / marks done (the "Act"
 *      stage).
 *
 * The host compose-server must expose an `/insights` route taking
 * { metrics, window_days } and returning { summary, findings: [...] }. (Same
 * Ollama, sibling to /compose — see tools/signals-worker/README.md.) Until it's
 * added, this records an error run with a clear message.
 *
 * Auth: verify_jwt = true (config.toml) + is_admin() (mirrors posthog-proxy).
 * Secrets: POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID?, POSTHOG_HOST?,
 *   COMPOSE_ENDPOINT_URL, COMPOSE_SECRET, SUPABASE_* (auto).
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

async function requireAdmin(req: Request, url: string, anon: string) {
  const auth = req.headers.get("Authorization") ?? "";
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error } = await client.auth.getUser();
  if (error || !u.user?.email) return { ok: false as const, status: 401, error: "unauthenticated" };
  const { data: isAdmin, error: rErr } = await client.rpc("is_admin");
  if (rErr || !isAdmin) return { ok: false as const, status: 403, error: "admin only" };
  return { ok: true as const, uid: u.user.id };
}

async function hogql(host: string, project: string, key: string, query: string): Promise<any[]> {
  const res = await fetch(`${host}/api/projects/${project}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`posthog_${res.status}: ${await res.text()}`);
  return (await res.json()).results ?? [];
}

async function collectMetrics(days: number) {
  const KEY = Deno.env.get("POSTHOG_PERSONAL_API_KEY") ?? "";
  const PROJECT = Deno.env.get("POSTHOG_PROJECT_ID") ?? "394556";
  const HOST = (Deno.env.get("POSTHOG_HOST") ?? "https://us.posthog.com").replace(/\/$/, "");
  if (!KEY) throw new Error("missing POSTHOG_PERSONAL_API_KEY");
  const since = `timestamp >= now() - INTERVAL ${days} DAY`;

  const [overview, topPages, topEvents] = await Promise.all([
    hogql(HOST, PROJECT, KEY,
      `SELECT count() AS pageviews, count(DISTINCT person_id) AS users, count(DISTINCT $session_id) AS sessions
       FROM events WHERE event = '$pageview' AND ${since}`),
    hogql(HOST, PROJECT, KEY,
      `SELECT properties.$pathname AS path, count() AS views FROM events
       WHERE event = '$pageview' AND ${since} GROUP BY path ORDER BY views DESC LIMIT 15`),
    hogql(HOST, PROJECT, KEY,
      `SELECT event, count() AS n FROM events
       WHERE event NOT LIKE '$%' AND ${since} GROUP BY event ORDER BY n DESC LIMIT 15`),
  ]);
  const ov = overview[0] ?? [0, 0, 0];
  return {
    window_days: days,
    overview: { pageviews: Number(ov[0] ?? 0), users: Number(ov[1] ?? 0), sessions: Number(ov[2] ?? 0) },
    topPages: topPages.map((x: any[]) => ({ path: String(x[0] ?? "/"), views: Number(x[1]) })),
    topEvents: topEvents.map((x: any[]) => ({ event: String(x[0]), count: Number(x[1]) })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = await requireAdmin(req, url, anon);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let days = 30;
  try { const b = await req.json(); days = Math.max(1, Math.min(Number(b?.days ?? 30), 365)); } catch { /* default */ }

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // 1. Metrics snapshot
  let metrics: any;
  try { metrics = await collectMetrics(days); }
  catch (e) { return json({ error: "metrics_failed", detail: (e as Error).message }, 502); }

  // 2. Synthesize via the Ollama tunnel
  const endpoint = Deno.env.get("COMPOSE_ENDPOINT_URL");
  const secret = Deno.env.get("COMPOSE_SECRET");
  if (!endpoint || !secret) {
    return json({ error: "not_configured", detail: "AI synthesis isn't set up yet. Set COMPOSE_ENDPOINT_URL/COMPOSE_SECRET and add the /insights route to compose-server (see signals-worker README)." }, 503);
  }

  let summary = "";
  let findings: any[] = [];
  let model = "ollama";
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-compose-secret": secret },
      body: JSON.stringify({ metrics, window_days: days }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: "synthesis_failed", detail: data?.detail ?? `host ${res.status}` }, 502);
    summary = String(data.summary ?? "");
    findings = Array.isArray(data.findings) ? data.findings : [];
    if (data.model) model = String(data.model);
  } catch (e) {
    return json({ error: "synthesis_unreachable", detail: (e as Error).message }, 502);
  }

  // 3. Persist run + actions
  const { data: run, error: rErr } = await service
    .from("insight_runs")
    .insert({ window_days: days, metrics, summary, findings, model, status: "complete", created_by: auth.uid })
    .select("id")
    .single();
  if (rErr) return json({ error: "save_failed", detail: rErr.message }, 500);

  const actions = findings
    .filter((f) => f && (f.suggested_action || f.observation))
    .map((f) => ({
      run_id: run.id,
      title: String(f.suggested_action || f.observation).slice(0, 200),
      observation: String(f.observation ?? ""),
      suggested_action: String(f.suggested_action ?? ""),
      confidence: f.confidence ? String(f.confidence) : null,
    }));
  if (actions.length) await service.from("insight_actions").insert(actions);

  return json({ ok: true, run_id: run.id, finding_count: findings.length });
});
