/**
 * synthesize-insights — the "Synthesize" stage of the learning loop.
 *
 * Admin picks data SOURCES + outcome GOALS in the UI and clicks Generate. This:
 *   1. collects a REAL metrics snapshot from each selected source (PostHog +
 *      is_admin()-gated RPCs, read with the caller's admin JWT),
 *   2. flattens it into a list of {metric,value} datapoints — the only numbers
 *      the model is allowed to cite,
 *   3. asks the Penny Worker /insights route (Workers AI) to produce a short
 *      summary + grounded findings bucketed by goal, each carrying evidence,
 *   4. GROUNDING GUARD: drops any finding whose evidence doesn't match a real
 *      datapoint (defends against hallucinated numbers even if the model emits
 *      them), then writes insight_runs + one insight_actions row per finding.
 *
 * Sources: product | marketing | waitlist | support | signals.
 * Goals:   product | content | customer.
 *
 * Auth: verify_jwt = true (config.toml) + is_admin().
 * Secrets: POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID?, POSTHOG_HOST?,
 *   COMPOSE_ENDPOINT_URL (→ Penny Worker), COMPOSE_SECRET, SUPABASE_* (auto).
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

const ALL_SOURCES = ["product", "marketing", "waitlist", "support", "signals"] as const;
const ALL_GOALS = ["product", "content", "customer"] as const;
type Datapoint = { metric: string; value: number | string };

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const pct = (a: number, b: number): number => (b > 0 ? Math.round((a / b) * 100) : 0);

/* ── PostHog (product usage) ──────────────────────────────────────────────── */

async function hogql(host: string, project: string, key: string, query: string): Promise<any[]> {
  const res = await fetch(`${host}/api/projects/${project}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`posthog_${res.status}: ${await res.text()}`);
  return (await res.json()).results ?? [];
}

async function collectProduct(userClient: any, days: number): Promise<Datapoint[]> {
  const out: Datapoint[] = [];
  const KEY = Deno.env.get("POSTHOG_PERSONAL_API_KEY") ?? "";
  if (KEY) {
    const PROJECT = Deno.env.get("POSTHOG_PROJECT_ID") ?? "394556";
    const HOST = (Deno.env.get("POSTHOG_HOST") ?? "https://us.posthog.com").replace(/\/$/, "");
    const since = `timestamp >= now() - INTERVAL ${days} DAY`;
    try {
      const [overview, topPages] = await Promise.all([
        hogql(HOST, PROJECT, KEY,
          `SELECT count() AS pageviews, count(DISTINCT person_id) AS users, count(DISTINCT $session_id) AS sessions
           FROM events WHERE event = '$pageview' AND ${since}`),
        hogql(HOST, PROJECT, KEY,
          `SELECT properties.$pathname AS path, count() AS views FROM events
           WHERE event = '$pageview' AND ${since} GROUP BY path ORDER BY views DESC LIMIT 6`),
      ]);
      const ov = overview[0] ?? [0, 0, 0];
      out.push({ metric: `product: pageviews (${days}d)`, value: num(ov[0]) });
      out.push({ metric: `product: unique users (${days}d)`, value: num(ov[1]) });
      out.push({ metric: `product: sessions (${days}d)`, value: num(ov[2]) });
      for (const p of topPages) out.push({ metric: `product: pageviews of ${String(p[0] ?? "/")}`, value: num(p[1]) });
    } catch { /* PostHog optional — skip if unreachable */ }
  }
  // Activation funnel via RPC (admin JWT).
  try {
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const { data } = await userClient.rpc("admin_funnel", { p_since: since });
    const rows = (data ?? []) as Array<{ stage: string; unique_users: number }>;
    for (let i = 0; i < rows.length; i++) {
      out.push({ metric: `product funnel: ${rows[i].stage} (unique users)`, value: num(rows[i].unique_users) });
      if (i > 0) {
        const prev = num(rows[i - 1].unique_users);
        out.push({ metric: `product funnel: ${rows[i - 1].stage} → ${rows[i].stage} conversion`, value: `${pct(num(rows[i].unique_users), prev)}%` });
      }
    }
  } catch { /* skip */ }
  return out;
}

async function collectMarketing(authHeader: string, days: number): Promise<Datapoint[]> {
  // Real GA4 data via the admin-gated ga-proxy edge function (service account →
  // analyticsdata.googleapis.com). Server-to-server call carrying the admin JWT.
  const out: Datapoint[] = [];
  const base = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const r = await fetch(`${base}/functions/v1/ga-proxy`, {
      method: "POST",
      headers: { Authorization: authHeader, apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ action, days, ...extra }),
    });
    if (!r.ok) throw new Error(`ga-proxy ${r.status}`);
    const d = await r.json();
    if (d?.error) throw new Error(d.error);
    return d;
  };
  try {
    const [ov, sources] = await Promise.all([call("overview"), call("sources", { limit: 5 })]);
    out.push({ metric: `marketing (GA4): total users (${days}d)`, value: num(ov.totalUsers) });
    out.push({ metric: `marketing (GA4): sessions (${days}d)`, value: num(ov.sessions) });
    out.push({ metric: `marketing (GA4): page views (${days}d)`, value: num(ov.pageViews) });
    out.push({ metric: `marketing (GA4): bounce rate %`, value: Math.round(num(ov.bounceRate) * 100) });
    out.push({ metric: `marketing (GA4): avg session (sec)`, value: Math.round(num(ov.avgSessionSec)) });
    for (const s of ((sources?.rows ?? []) as any[]).slice(0, 5)) {
      out.push({ metric: `marketing (GA4): sessions from ${s.source}`, value: num(s.sessions) });
    }
  } catch { /* GA4 optional — skip if proxy/secrets not configured */ }
  return out;
}

async function collectWaitlist(userClient: any, days: number): Promise<Datapoint[]> {
  const out: Datapoint[] = [];
  try {
    const [{ data: daily }, { data: sources }] = await Promise.all([
      userClient.rpc("admin_waitlist_daily", { p_days: Math.max(14, days) }),
      userClient.rpc("admin_waitlist_sources"),
    ]);
    const d = (daily ?? []) as Array<{ day: string; signups: number }>;
    const s = (sources ?? []) as Array<{ source: string; signups: number }>;
    const total = s.reduce((a, r) => a + num(r.signups), 0);
    const last7 = d.slice(-7).reduce((a, r) => a + num(r.signups), 0);
    const prev7 = d.slice(-14, -7).reduce((a, r) => a + num(r.signups), 0);
    out.push({ metric: "waitlist: total signups", value: total });
    out.push({ metric: "waitlist: signups last 7d", value: last7 });
    out.push({ metric: "waitlist: signups prev 7d", value: prev7 });
    for (const row of [...s].sort((a, b) => num(b.signups) - num(a.signups)).slice(0, 5)) {
      out.push({ metric: `waitlist: signups from ${row.source}`, value: num(row.signups) });
    }
  } catch { /* skip */ }
  return out;
}

async function collectSupport(userClient: any): Promise<Datapoint[]> {
  const out: Datapoint[] = [];
  try {
    const { data } = await userClient.rpc("get_analytics");
    const a: any = data ?? {};
    out.push({ metric: "support: open tickets", value: num(a.open_count) });
    out.push({ metric: "support: stale tickets (>24h)", value: num(a.stale_count) });
    out.push({ metric: "support: avg first reply (min, 7d)", value: num(a.avg_first_response_minutes_7d) });
    out.push({ metric: "support: resolved (7d)", value: num(a.resolved_7d) });
    if (a.csat_7d) out.push({ metric: "support: CSAT score % (7d)", value: num(a.csat_7d.score_pct) });
    const topics = Object.entries(a.topic_30d ?? {}).sort((x: any, y: any) => num(y[1]) - num(x[1])).slice(0, 6);
    for (const [t, n] of topics) out.push({ metric: `support: tickets about "${t}" (30d)`, value: num(n) });
  } catch { /* skip */ }
  return out;
}

async function collectSignals(userClient: any, days: number): Promise<Datapoint[]> {
  const out: Datapoint[] = [];
  try {
    const [{ data: pipe }, { data: themes }] = await Promise.all([
      userClient.rpc("sig_analytics_pipeline", { p_days: days }),
      userClient.rpc("sig_analytics_themes", { p_days: days, p_gran: "week" }),
    ]);
    const f: any = pipe?.funnel ?? {};
    out.push({ metric: "signals: leads promoted", value: num(f.promoted) });
    out.push({ metric: "signals: outreach sent", value: num(f.sent) });
    out.push({ metric: "signals: replies", value: num(f.replied) });
    out.push({ metric: "signals: won", value: num(f.won) });
    if (num(f.sent) > 0) out.push({ metric: "signals: reply rate %", value: pct(num(f.replied), num(f.sent)) });
    if (num(f.promoted) > 0) out.push({ metric: "signals: win rate %", value: pct(num(f.won), num(f.promoted)) });
    out.push({ metric: "signals: leads needing action (unsent)", value: num(pipe?.needs_action) });
    for (const p of ((themes?.pains ?? []) as any[]).slice(0, 6)) {
      out.push({ metric: `signals: pain "${String(p.tag).replace(/_/g, " ")}" mentions (vs prev ${num(p.prev)})`, value: num(p.count) });
    }
    for (const c of ((themes?.competitors ?? []) as any[]).slice(0, 5)) {
      out.push({ metric: `signals: competitor "${c.name}" mentions (vs prev ${num(c.prev)})`, value: num(c.count) });
    }
    for (const pl of ((themes?.platforms ?? []) as any[]).slice(0, 5)) {
      out.push({ metric: `signals: on-topic posts on ${pl.platform}`, value: num(pl.count) });
    }
  } catch { /* skip */ }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });

  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u.user?.email) return json({ error: "unauthenticated" }, 401);
  const { data: isAdmin, error: aErr } = await userClient.rpc("is_admin");
  if (aErr || !isAdmin) return json({ error: "admin only" }, 403);

  // ---- Parse request -------------------------------------------------------
  let days = 30;
  let sources: string[] = ["product"];
  let goals: string[] = ["product"];
  try {
    const b = await req.json();
    days = Math.max(1, Math.min(num(b?.days ?? 30), 365));
    if (Array.isArray(b?.sources)) sources = b.sources.filter((s: string) => (ALL_SOURCES as readonly string[]).includes(s));
    if (Array.isArray(b?.goals)) goals = b.goals.filter((g: string) => (ALL_GOALS as readonly string[]).includes(g));
  } catch { /* defaults */ }
  if (sources.length === 0) return json({ error: "no_sources", detail: "Pick at least one data source." }, 400);
  if (goals.length === 0) return json({ error: "no_goals", detail: "Pick at least one outcome area." }, 400);

  // ---- 1. Collect real evidence from each selected source ------------------
  const collectors: Record<string, () => Promise<Datapoint[]>> = {
    product: () => collectProduct(userClient, days),
    marketing: () => collectMarketing(authHeader, days),
    waitlist: () => collectWaitlist(userClient, days),
    support: () => collectSupport(userClient),
    signals: () => collectSignals(userClient, days),
  };
  const collected = await Promise.all(sources.map((s) => collectors[s]?.() ?? Promise.resolve([])));
  const available: Datapoint[] = collected.flat();
  if (available.length === 0) {
    return json({ error: "no_data", detail: "The selected sources have no data in this window yet." }, 422);
  }

  // ---- 2. Synthesize via the Penny Worker (Workers AI) ---------------------
  const endpoint = Deno.env.get("COMPOSE_ENDPOINT_URL");
  const secret = Deno.env.get("COMPOSE_SECRET");
  if (!endpoint || !secret) {
    return json({ error: "not_configured", detail: "AI synthesis isn't set up. Set COMPOSE_ENDPOINT_URL (Penny Worker) + COMPOSE_SECRET." }, 503);
  }

  let summary = "";
  let findings: any[] = [];
  let model = "workers-ai";
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-compose-secret": secret },
      body: JSON.stringify({ metrics: { available }, window_days: days, sources, goals }),
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

  // ---- 3. GROUNDING GUARD: keep only findings whose evidence is real -------
  const realMetrics = new Set(available.map((d) => d.metric));
  const grounded = findings
    .map((f: any) => ({
      ...f,
      evidence: (Array.isArray(f?.evidence) ? f.evidence : []).filter((e: any) => realMetrics.has(String(e?.metric))),
    }))
    .filter((f: any) => f?.title && Array.isArray(f.evidence) && f.evidence.length > 0);

  // ---- 4. Persist run + actions -------------------------------------------
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: run, error: rErr } = await service
    .from("insight_runs")
    .insert({ window_days: days, sources, goals, metrics: { available }, summary, findings: grounded, model, status: "complete", created_by: u.user.id })
    .select("id")
    .single();
  if (rErr) return json({ error: "save_failed", detail: rErr.message }, 500);

  const actions = grounded.map((f: any) => ({
    run_id: run.id,
    theme: f.goal ?? null,
    surface: f.surface ? String(f.surface).slice(0, 40) : null,
    title: String(f.suggested_action || f.title).slice(0, 200),
    observation: String(f.observation ?? ""),
    suggested_action: String(f.suggested_action ?? ""),
    confidence: f.confidence ? String(f.confidence) : null,
    evidence: f.evidence,
  }));
  if (actions.length) await service.from("insight_actions").insert(actions);

  return json({ ok: true, run_id: run.id, finding_count: grounded.length, dropped: findings.length - grounded.length });
});
