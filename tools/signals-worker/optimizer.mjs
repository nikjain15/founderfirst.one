/**
 * Daily sourcing optimizer — the self-improving loop.
 *
 * Once every 24h the worker runs this. It measures how each source is doing,
 * auto-disables dead ones (hybrid mode: retirement is automatic), asks the
 * managed model for new candidate queries informed by what's working, VALIDATES
 * each candidate against the live API (only ~100%-topical, novel ones survive),
 * and PROPOSES survivors as disabled sources for a human to enable. It also
 * suggests (never applies) threshold changes. The whole run is saved as a JSON
 * report in sig_settings['optimizer_last_run'] — that's the "Brain" summary.
 *
 * No new schema: stats come from REST reads, state lives in sig_settings.
 * See SIGNALS_SOLUTION.md. Autonomy = hybrid (auto-retire, propose-adds).
 */

import { generate, DRAFT_REFUSAL_RE } from "./brain.mjs";
import { searchApiDirect } from "./providers/apidirect.mjs";

const WINDOW_DAYS   = 7;
const MIN_VOLUME    = 15;    // need this many items before judging a source
const DEAD_YIELD    = 0.25;  // yield_score below this (with volume) -> auto-disable
const MAX_ACTIVE    = 40;    // cap on enabled api_direct sources
const MAX_PROPOSALS = 6;     // new candidates proposed per day
const VALIDATE_MIN  = 0.8;   // candidate must be >= this topical hit-rate to propose

const TOPICAL = ["bookkeep","account","quickbook","xero","tax","1099","invoic","reconcil",
  "ledger","payroll","freelanc","small business","expense","receipt","cpa","irs","s-corp","llc","bench"];

const SETTINGS_KEY = "optimizer_last_run";

// ---- helpers ---------------------------------------------------------------

const scoreOf = (row) => Array.isArray(row.sig_scores) ? row.sig_scores[0] : row.sig_scores;

// Lead stage for an item (1:1). PostgREST nests it as an array under sig_leads.
const leadStageOf = (row) => {
  const l = Array.isArray(row.sig_leads) ? row.sig_leads[0] : row.sig_leads;
  return l?.stage ?? null;
};

function perSourceStats(items, relThreshold) {
  const by = new Map();
  for (const it of items) {
    const sc = scoreOf(it);
    if (!sc) continue;   // judge SCORED items only — pending items have no signal yet
    const k = it.source_id ?? "none";
    if (!by.has(k)) by.set(k, { n: 0, rel: 0, relHit: 0, intent: 0, us: 0, needs: 0, promoted: 0, replied: 0, won: 0 });
    const s = by.get(k); s.n++;
    if (it.status === "promoted") s.promoted++;
    // Real outcomes — the only true measure of source quality. "replied"/"won"
    // are set by a human as a lead advances; a source that promotes leads but
    // never gets a reply or win is producing good-LOOKING posts, not good leads.
    const stage = leadStageOf(it);
    if (stage === "replied" || stage === "won") s.replied++;
    if (stage === "won") s.won++;
    if (sc.relevance != null) { s.rel += sc.relevance; if (sc.relevance >= relThreshold) s.relHit++; }
    if (sc.intent != null) s.intent += sc.intent;
    if (sc.geo === "us") s.us++;
    if (sc.role === "needs_help") s.needs++;
  }
  for (const s of by.values()) {
    s.rel_rate    = s.n ? s.relHit / s.n : 0;
    s.us_rate     = s.n ? s.us / s.n : 0;
    s.needs_rate  = s.n ? s.needs / s.n : 0;
    s.avg_intent  = s.n ? s.intent / s.n : 0;
    s.promo_rate  = s.n ? s.promoted / s.n : 0;
    s.reply_rate  = s.n ? s.replied / s.n : 0;
    s.won_rate    = s.n ? s.won / s.n : 0;
    // Composite: relevant + US + in-need posts (proxy), PLUS a bonus for posts
    // that became real replies/wins (truth). The outcome bonus only ever RAISES
    // yield, so proven sources rank higher and resist retirement; sources with
    // no real outcome are judged on the proxy alone.
    s.yield = 0.4 * s.rel_rate + 0.3 * s.us_rate + 0.3 * s.needs_rate
      + Math.min(0.2, s.promo_rate)
      + Math.min(0.25, s.reply_rate + 2 * s.won_rate);
  }
  return by;
}

async function topicalHitRate(platform, query) {
  try {
    const items = await searchApiDirect(platform, query, { page: 1, sortBy: "recent" });
    if (!items.length) return { rate: 0, n: 0 };
    const hits = items.filter((p) => {
      const t = `${p.title ?? ""} ${p.body ?? ""}`.toLowerCase();
      return TOPICAL.some((kw) => t.includes(kw));
    }).length;
    return { rate: hits / items.length, n: items.length };
  } catch (e) {
    return { rate: 0, n: 0, error: e.message };
  }
}

function painThemes(items, topK = 8) {
  const tally = new Map();
  for (const it of items) {
    const sc = scoreOf(it);
    if (!sc || sc.role !== "needs_help" || sc.geo !== "us") continue;
    for (const tag of sc.pain_tags ?? []) tally.set(tag, (tally.get(tag) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK)
    .map(([tag, count]) => ({ tag, count }));
}

// ---- anomaly scan (garbage-in / garbage-out detection) ----------------------
// Flags patterns that historically meant a pipeline bug rather than real leads:
// clusters of identical score signatures, high intent on near-empty text, and
// saved drafts that read like model refusals (the empty-facebook-items incident,
// 1 Jul 2026). Surfaced in the daily Brain report so a human sees it within a
// day instead of by stumbling on a polluted Leads view.
const THIN_TEXT_CHARS = 40;
const CLUSTER_FLAG_N  = 8;

function anomalyScan(items, drafts, settings) {
  const out = [];
  const clusters = new Map();
  let thin = 0;
  for (const it of items) {
    const sc = scoreOf(it);
    if (!sc || sc.intent == null || sc.intent < settings.intent_threshold) continue;
    if (`${it.title ?? ""}${it.body ?? ""}`.trim().length < THIN_TEXT_CHARS) thin++;
    const key = `${sc.intent}|${[...(sc.pain_tags ?? [])].sort().join(",")}`;
    clusters.set(key, (clusters.get(key) ?? 0) + 1);
  }
  for (const [key, n] of clusters) {
    if (n < CLUSTER_FLAG_N) continue;
    const [intent, tags] = key.split("|");
    out.push(`${n} high-intent items share an IDENTICAL score signature (intent=${intent}, tags=[${tags}]) — real posts vary; check the Feed for a scoring bug.`);
  }
  if (thin > 0) {
    out.push(`${thin} item(s) scored intent >= ${settings.intent_threshold} with under ${THIN_TEXT_CHARS} chars of text — the content guard may have a gap.`);
  }
  const refusals = drafts.filter((d) => d.draft && DRAFT_REFUSAL_RE.test(d.draft)).length;
  if (refusals > 0) {
    out.push(`${refusals} saved lead draft(s) read like model refusals — drafting is seeing empty or garbage input.`);
  }
  return out;
}

// near-miss threshold suggestions (suggest only, never applied)
function thresholdSuggestions(items, settings) {
  let relNearMiss = 0, intentNearMiss = 0, eligible = 0;
  for (const it of items) {
    const sc = scoreOf(it);
    if (!sc || sc.role !== "needs_help" || sc.geo !== "us") continue;
    eligible++;
    if (sc.relevance != null && sc.relevance >= settings.relevance_threshold - 0.06
        && sc.relevance < settings.relevance_threshold) relNearMiss++;
    if (sc.intent != null && sc.intent >= settings.intent_threshold - 15
        && sc.intent < settings.intent_threshold) intentNearMiss++;
  }
  const out = [];
  if (eligible >= 20 && relNearMiss / eligible > 0.2)
    out.push(`Lower relevance_threshold: ${relNearMiss}/${eligible} US needs-help posts fall just under ${settings.relevance_threshold} (within 0.06).`);
  if (eligible >= 20 && intentNearMiss / eligible > 0.2)
    out.push(`Lower intent_threshold: ${intentNearMiss}/${eligible} US needs-help posts score just under ${settings.intent_threshold}.`);
  return out;
}

// ---- the run ---------------------------------------------------------------

export async function runOptimizer(db, settings) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  const log = (m) => console.log(`[optimizer] ${m}`);
  log(`window since ${since}`);

  // Need pain_tags too — refetch items including them.
  const items = await fetchAllItemsFull(db, since);
  const { data: sources, error: se } = await db.from("sig_sources")
    .select("id,platform,query,enabled,captured_via").eq("captured_via", "api_direct");
  if (se) throw new Error(`sources: ${se.message}`);
  const srcById = new Map(sources.map((s) => [s.id, s]));

  const stats = perSourceStats(items, settings.relevance_threshold);

  // Sources that have EVER produced a real outcome (a lead that replied or won),
  // across all time — not just this window. Wins are rare and lagging, so a
  // proven source is never retired over a single quiet week.
  const proven = await fetchProvenSources(db);

  // 1. DIAGNOSE + auto-disable dead sources (hybrid: retirement is automatic,
  //    but reversible — a disabled source can be re-enabled in the Sources tab).
  //    A source is protected ONLY if it produced a real outcome (a lead that
  //    replied or won). Stale promotions that never got a reply no longer shield
  //    a dead source — that's the fix that keeps the list fresh.
  const disabled = [];
  for (const [sid, st] of stats) {
    if (sid === "none") continue;
    const src = srcById.get(sid);
    if (!src || !src.enabled) continue;
    const hasRealOutcome = st.replied > 0 || st.won > 0 || proven.has(sid);
    if (st.n >= MIN_VOLUME && st.yield < DEAD_YIELD && !hasRealOutcome) {
      const { error } = await db.from("sig_sources").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", sid);
      if (!error) {
        disabled.push({ platform: src.platform, query: src.query, yield: +st.yield.toFixed(2), n: st.n, promoted: st.promoted });
        log(`disabled "${src.query}" (yield ${st.yield.toFixed(2)}, n=${st.n}, promoted=${st.promoted}, no reply/win)`);
      }
    }
  }

  // 2. LEARN — leaderboard + pain themes.
  const leaderboard = [...stats.entries()]
    .filter(([sid]) => sid !== "none" && srcById.has(sid))
    .map(([sid, st]) => ({ platform: srcById.get(sid).platform, query: srcById.get(sid).query, yield: +st.yield.toFixed(2), n: st.n, promoted: st.promoted, replied: st.replied, won: st.won, us_rate: +st.us_rate.toFixed(2), needs_rate: +st.needs_rate.toFixed(2) }))
    .sort((a, b) => b.yield - a.yield);
  const winners = leaderboard.slice(0, 8);
  const themes = painThemes(items);

  // 3. GENERATE candidate phrases (managed model), informed by winners + themes.
  const stripQ = (s) => String(s).replace(/^["']+|["']+$/g, "").trim();
  const existing = new Set(sources.map((s) => stripQ(s.query || "").toLowerCase()));
  let candidates = [];
  try {
    const sys = `You generate search PHRASES to find US small-business owners, founders, and freelancers who NEED bookkeeping/accounting help. Each phrase must be SHORT (2-5 words) and anchored on a concrete term (bookkeeper, bookkeeping, quickbooks, accountant, taxes, 1099) so it matches tightly. Do NOT add quotation marks. Return ONLY a JSON array of plain strings.`;
    const usr = `Phrases already in use (do NOT repeat): ${[...existing].join(", ") || "none yet"}.
Top pain themes from real US leads: ${themes.map((t) => t.tag).join(", ") || "catch_up_bookkeeping, hates_quickbooks, year_end_scramble"}.
Propose ${MAX_PROPOSALS + 6} NEW phrases we are not already using.`;
    const raw = await generate(sys, usr, { maxTokens: 500 });
    const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
    candidates = arr.map(stripQ).filter((q) => q.length >= 3 && !existing.has(q.toLowerCase()));
    log(`generated ${candidates.length} novel candidate(s)`);
  } catch (e) { log(`generate failed: ${e.message}`); }

  // 4. VALIDATE candidates against the live API (wrap in quotes — the tight-match
  //    syntax). Keep only the topical, non-empty ones.
  const proposed = [];
  for (const phrase of candidates) {
    if (proposed.length >= MAX_PROPOSALS) break;
    const platform = "reddit"; // validate on reddit (highest volume); X can reuse the phrase
    const query = `"${phrase}"`;
    const { rate, n } = await topicalHitRate(platform, query);
    log(`validate ${query} -> ${(rate * 100).toFixed(0)}% topical (${n})`);
    if (rate >= VALIDATE_MIN && n >= 3) proposed.push({ platform, query, hit_rate: +rate.toFixed(2) });
  }

  // 5. PROPOSE — insert as DISABLED sources for human approval (hybrid).
  const activeCount = sources.filter((s) => s.enabled).length - disabled.length;
  const room = Math.max(0, MAX_ACTIVE - activeCount);
  const toInsert = proposed.slice(0, room).map((p) => ({
    platform: p.platform, query: p.query, captured_via: "api_direct",
    enabled: false, cadence_minutes: 360,
  }));
  if (toInsert.length) {
    const { error } = await db.from("sig_sources").insert(toInsert);
    if (error) log(`propose insert failed: ${error.message}`);
    else log(`proposed ${toInsert.length} new queries (disabled — enable in Sources tab)`);
  }

  // 6. threshold suggestions (never applied).
  const suggestions = thresholdSuggestions(items, settings);

  // 6b. anomaly scan — pipeline-health flags for the Brain report.
  const drafts = await fetchRecentDrafts(db, since);
  const anomalies = anomalyScan(items, drafts, settings);
  for (const a of anomalies) log(`ANOMALY: ${a}`);

  // 7. REPORT — save to sig_settings (the Brain summary).
  const report = {
    ran_at: new Date().toISOString(),
    window_days: WINDOW_DAYS,
    items_analyzed: items.length,
    disabled,
    proposed,
    pain_themes: themes,
    threshold_suggestions: suggestions,
    anomalies,
    leaderboard: leaderboard.slice(0, 12),
    summary: `Analyzed ${items.length} posts. Retired ${disabled.length} dead source(s), proposed ${proposed.length} new quer${proposed.length === 1 ? "y" : "ies"} for review. Top pain: ${themes.slice(0, 3).map((t) => t.tag).join(", ") || "n/a"}.`
      + (anomalies.length ? ` ⚠️ ${anomalies.length} pipeline anomaly flag(s) — see anomalies.` : ""),
  };
  await db.from("sig_settings").upsert({ key: SETTINGS_KEY, value: report, updated_at: new Date().toISOString(), updated_by: "optimizer" });
  log(report.summary);
  return report;
}

// Items incl. pain_tags (separate from the lean stats fetch).
async function fetchAllItemsFull(db, sinceISO) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("sig_items")
      .select("source_id,status,title,body,sig_scores(relevance,intent,geo,role,pain_tags),sig_leads(stage)")
      .gte("captured_at", sinceISO)
      .range(from, from + 999);
    if (error) throw new Error(`stats fetch: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Recent saved drafts, for the refusal anomaly check. Leads are low-volume.
async function fetchRecentDrafts(db, sinceISO) {
  const { data, error } = await db
    .from("sig_leads")
    .select("id,draft")
    .gte("created_at", sinceISO)
    .not("draft", "is", null)
    .limit(1000);
  if (error) { console.warn(`[optimizer] drafts fetch: ${error.message}`); return []; }
  return data ?? [];
}

// Source ids that have EVER produced a lead that replied or won (all time).
// Leads are low-volume (only the promoted set), so this is a cheap read.
async function fetchProvenSources(db) {
  const ids = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("sig_leads")
      .select("sig_items!inner(source_id)")
      .in("stage", ["replied", "won"])
      .range(from, from + 999);
    if (error) { console.warn(`[optimizer] proven-sources fetch: ${error.message}`); break; }
    for (const row of data ?? []) {
      const item = Array.isArray(row.sig_items) ? row.sig_items[0] : row.sig_items;
      if (item?.source_id) ids.add(item.source_id);
    }
    if (!data || data.length < 1000) break;
  }
  return ids;
}

// Daily gate: run at most once per 24h.
export async function maybeRunOptimizer(db, settings) {
  try {
    const { data } = await db.from("sig_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    const last = data?.value?.ran_at ? new Date(data.value.ran_at).getTime() : 0;
    if (Date.now() - last < 24 * 3600_000) return null;
    console.log("[optimizer] daily run starting");
    return await runOptimizer(db, settings);
  } catch (e) {
    console.warn("[optimizer] run failed:", e.message);
    return null;
  }
}
