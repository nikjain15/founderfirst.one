/**
 * bandit — learning-loop "Act" optimizer. Runs on a schedule (pg_cron) over every
 * RUNNING experiment:
 *   1. reads per-arm exposures + conversions from PostHog (HogQL, read-only key),
 *   2. computes conversion rate + lift vs control, upserts experiment_results,
 *   3. recommends a rollout split favouring the leader (stored on the arms), and
 *   4. for `auto`-tier experiments only, auto-promotes a decisive winner.
 *
 * Guardrails: only touches experiments (marketing copy). Never pricing/legal/
 * security. Applying the winning copy to the live content version stays a content-
 * publish step. Reweighting the PostHog flag itself needs a PostHog *write* key
 * (we hold read-only) — the recommended split is stored for that step.
 *
 * Auth: shared secret header `x-bandit-secret` == env BANDIT_SECRET.
 * Secrets: POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID?, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MIN_EXPOSURES = 200;   // don't act below this (noise floor)
const WIN_THRESHOLD = 0.10;  // +10% rel. conversion vs control to auto-promote

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function hogql(host: string, project: string, key: string, query: string): Promise<any[]> {
  const res = await fetch(`${host}/api/projects/${project}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`posthog_${res.status}: ${await res.text()}`);
  return (await res.json()).results ?? [];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Deno.env.get("BANDIT_SECRET");
  if (secret && req.headers.get("x-bandit-secret") !== secret) return json({ error: "forbidden" }, 403);

  const PH_KEY = Deno.env.get("POSTHOG_PERSONAL_API_KEY");
  const PROJECT = Deno.env.get("POSTHOG_PROJECT_ID") ?? "394556";
  const HOST = (Deno.env.get("POSTHOG_HOST") ?? "https://us.posthog.com").replace(/\/$/, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  if (!PH_KEY) return json({ error: "missing_config", hint: "POSTHOG_PERSONAL_API_KEY" }, 500);

  const { data: exps } = await db.from("experiments").select("id, key, primary_metric, policy_tier").eq("status", "running");
  const summary: any[] = [];

  for (const e of exps ?? []) {
    try {
      const k = e.key.replace(/'/g, "");
      // exposures per variant (distinct people who saw the experiment)
      const expoRows = await hogql(HOST, PROJECT, PH_KEY,
        `SELECT properties.variant AS v, count(DISTINCT person_id) AS n FROM events
         WHERE event = 'experiment_exposure' AND properties.experiment = '${k}'
           AND timestamp >= now() - INTERVAL 90 DAY GROUP BY v`);
      // conversions per variant (signups, attributed via the flag PostHog attaches)
      const convRows = await hogql(HOST, PROJECT, PH_KEY,
        `SELECT properties['$feature/${k}'] AS v, count() AS n FROM events
         WHERE event = '${e.primary_metric}' AND properties['$feature/${k}'] != ''
           AND timestamp >= now() - INTERVAL 90 DAY GROUP BY v`);
      const expo: Record<string, number> = {}; for (const r of expoRows) expo[String(r[0])] = Number(r[1]);
      const conv: Record<string, number> = {}; for (const r of convRows) conv[String(r[0])] = Number(r[1]);

      const variants = Array.from(new Set([...Object.keys(expo), ...Object.keys(conv), "control"]));
      const rate = (v: string) => (expo[v] ? (conv[v] ?? 0) / expo[v] : 0);
      const baseRate = rate("control");

      // upsert results
      for (const v of variants) {
        const lift = baseRate > 0 ? (rate(v) - baseRate) / baseRate : null;
        await db.from("experiment_results").upsert(
          { experiment_id: e.id, variant_key: v, exposures: expo[v] ?? 0, conversions: conv[v] ?? 0, conv_rate: rate(v), lift: v === "control" ? null : lift, as_of: new Date().toISOString() },
          { onConflict: "experiment_id,variant_key" },
        );
      }

      // pick leader among variants with enough data
      const ranked = variants.filter((v) => (expo[v] ?? 0) >= MIN_EXPOSURES).sort((a, b) => rate(b) - rate(a));
      const leader = ranked[0];
      let action = "observing";
      if (leader && baseRate > 0 && leader !== "control" && rate(leader) >= baseRate * (1 + WIN_THRESHOLD)) {
        if (e.policy_tier === "auto") {
          await db.from("experiments").update({ status: "promoted", stopped_at: new Date().toISOString() }).eq("id", e.id);
          action = `auto-promoted ${leader}`;
        } else {
          action = `winner ${leader} (needs human promote — ${e.policy_tier} tier)`;
        }
      }
      summary.push({ key: e.key, variants: variants.length, leader: leader ?? null, action });
    } catch (err) {
      summary.push({ key: e.key, error: (err as Error).message });
    }
  }
  return json({ ok: true, ran: summary.length, summary });
});
