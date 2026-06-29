/**
 * Signals VM pull-worker.
 *
 * Runs always-on on the VM. No inbound ports: it PULLS work from Supabase using
 * the service-role key, scores locally with Ollama, drafts promoted leads with
 * the managed model, and writes results back via the service_role-only RPCs.
 *
 * Each cycle:
 *   1. Embed any ICP examples missing an embedding.
 *   2. Claim a batch of pending items (atomic: flips them to 'scoring').
 *   3. For each: keyword prefilter -> embed + relevance -> LLM intent score ->
 *      promote (or archive). Promoted leads get a brand-voice draft.
 *
 * Config via env (see .env.example). Run: `node index.mjs` (loop) or
 * `node index.mjs --once` (single cycle, for testing).
 *
 * See SIGNALS_SOLUTION.md §3 / §7.
 */

import { createClient } from "@supabase/supabase-js";
import { embed, score, draft, brainConfig } from "./brain.mjs";
import { searchApiDirect } from "./providers/apidirect.mjs";
import { maybeRunOptimizer, runOptimizer } from "./optimizer.mjs";

const env = (k, d) => process.env[k] ?? d;

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_KEY  = env("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const REL_THRESHOLD    = Number(env("REL_THRESHOLD", "0.55"));   // promote floor: relevance
const REL_FLOOR        = Number(env("REL_FLOOR", "0.30"));       // below this + no keyword -> archive pre-LLM
const INTENT_THRESHOLD = Number(env("INTENT_THRESHOLD", "55"));  // promote floor: intent
const BATCH            = Number(env("BATCH", "20"));            // items scored per cycle
const POLL_SECONDS     = Number(env("POLL_INTERVAL_SECONDS", "60"));
const PAGES_PER_POLL   = Number(env("PAGES_PER_POLL", "2"));    // result pages fetched per source poll

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// pgvector accepts a "[v1,v2,...]" string literal; PostgREST passes it through
// and Postgres casts it to vector for the RPC param.
const toVector = (arr) => `[${arr.join(",")}]`;

let cachedVoice = null;
let cachedPersona = null;
let cachedKeywords = null;
let cachedExcludes = null;
let cachedSettings = null;

// Scoring thresholds + geo mode, editable from the admin Scoring tab
// (sig_settings). Falls back to the .env values if the table/row is missing.
async function getSettings() {
  if (cachedSettings) return cachedSettings;
  const s = {
    relevance_threshold: REL_THRESHOLD,
    relevance_floor:     REL_FLOOR,
    intent_threshold:    INTENT_THRESHOLD,
    geo_mode:            "hard_us",   // 'hard_us' | 'us_preferred' | 'off'
  };
  const numeric = new Set(["relevance_threshold", "relevance_floor", "intent_threshold"]);
  const { data, error } = await db.from("sig_settings").select("key,value");
  if (error) { console.warn("settings unavailable, using env defaults:", error.message); }
  else for (const r of data ?? []) {
    if (!(r.key in s)) continue;
    s[r.key] = numeric.has(r.key) ? Number(r.value) : r.value;
  }
  cachedSettings = s;
  return cachedSettings;
}

// hard_us: geo must be 'us'. us_preferred: anything not clearly non-US. off: any.
function geoPasses(geo, mode) {
  if (mode === "off") return true;
  if (mode === "us_preferred") return geo !== "non_us";
  return geo === "us"; // hard_us (default)
}

async function getVoice() {
  if (cachedVoice !== null) return cachedVoice;
  const { data, error } = await db.rpc("get_live_voice");
  if (error) { console.warn("voice unavailable:", error.message); cachedVoice = ""; return ""; }
  cachedVoice = data?.[0]?.body ?? "";
  return cachedVoice;
}

// Live Signals outreach task note (surface='signals'). Empty string -> draft()
// falls back to its baked-in SIGNALS_PERSONA_BASE.
async function getPersona() {
  if (cachedPersona !== null) return cachedPersona;
  const { data, error } = await db.rpc("get_live_outreach_persona", { p_surface: "signals" });
  if (error) { console.warn("persona unavailable:", error.message); cachedPersona = ""; return ""; }
  cachedPersona = data?.[0]?.body ?? "";
  return cachedPersona;
}

async function getPainKeywords() {
  if (cachedKeywords) return cachedKeywords;
  // service_role bypasses RLS, so we can read the table directly.
  const { data, error } = await db.from("sig_keywords").select("term,kind,enabled");
  if (error) { console.warn("keywords unavailable:", error.message); return []; }
  cachedKeywords = (data ?? [])
    .filter((k) => k.enabled && k.kind === "pain")
    .map((k) => k.term.toLowerCase());
  return cachedKeywords;
}

// Negative/exclude terms — recruiter, agency, job-board, promo spam. An item
// matching one is archived before any embedding or LLM call (cheapest kill).
async function getExcludeKeywords() {
  if (cachedExcludes) return cachedExcludes;
  const { data, error } = await db.from("sig_keywords").select("term,kind,enabled");
  if (error) { console.warn("exclude keywords unavailable:", error.message); return []; }
  cachedExcludes = (data ?? [])
    .filter((k) => k.enabled && k.kind === "exclude")
    .map((k) => k.term.toLowerCase());
  return cachedExcludes;
}

async function embedPendingExamples() {
  const { data, error } = await db.rpc("sig_unembedded_examples", { p_limit: 100 });
  if (error) { console.warn("examples fetch failed:", error.message); return; }
  for (const ex of data ?? []) {
    try {
      const v = await embed(ex.body);
      const { error: e2 } = await db.rpc("sig_set_example_embedding", {
        p_id: ex.id, p_embedding: toVector(v),
      });
      if (e2) console.warn("set example embedding failed:", e2.message);
      else console.log(`embedded ICP example ${ex.id}`);
    } catch (e) { console.warn(`embed example ${ex.id} failed:`, e.message); }
  }
}

async function processItem(item, painKeywords, excludeKeywords, settings) {
  const text = [item.title, item.body].filter(Boolean).join("\n\n");
  const lower = text.toLowerCase();
  const keywordHit = painKeywords.some((kw) => lower.includes(kw));

  // 0. Negative prefilter: recruiter/agency/job/promo spam never enters scoring.
  const excludeHit = excludeKeywords.find((kw) => lower.includes(kw));
  if (excludeHit) {
    await submit(item.id, null, 0, [], null, false, "unknown", "other");
    console.log(`archived ${item.id} (exclude="${excludeHit}")`);
    return;
  }

  // 1. Embedding + relevance vs ICP reference set.
  let relevance = null;
  try {
    const v = await embed(text);
    const { data, error } = await db.rpc("sig_relevance", { p_embedding: toVector(v) });
    if (error) throw new Error(error.message);
    relevance = data == null ? null : Number(data);
  } catch (e) {
    console.warn(`relevance failed for ${item.id}:`, e.message);
  }

  // 2. Cheap prefilter: clearly off-topic AND no keyword -> archive without LLM.
  if (!keywordHit && relevance != null && relevance < settings.relevance_floor) {
    await submit(item.id, relevance, 0, [], null, false, "unknown", "other");
    console.log(`archived ${item.id} (prefilter, rel=${relevance?.toFixed(2)})`);
    return;
  }

  // 3. LLM intent score (also returns geo + role, both free on the local model).
  let scored;
  try { scored = await score(item); }
  catch (e) {
    console.warn(`score failed for ${item.id}:`, e.message);
    // Leave it scored-but-unpromoted so a later run can retry via re-claim if desired.
    await submit(item.id, relevance ?? 0, 0, [], null, false, "unknown", "other");
    return;
  }

  // A keyword hit always clears relevance. Otherwise require the relevance
  // threshold — but if we have no ICP examples yet (relevance null), let the
  // LLM intent score decide on its own (the scoring prompt is domain-specific,
  // so off-topic posts score low anyway).
  const relOk  = keywordHit || (relevance == null ? true : relevance >= settings.relevance_threshold);
  const roleOk = scored.role === "needs_help";          // not a seller / recruiter
  const geoOk  = geoPasses(scored.geo, settings.geo_mode);
  const promote = relOk && roleOk && geoOk && scored.intent >= settings.intent_threshold;

  const leadId = await submit(
    item.id, relevance ?? 0, scored.intent, scored.pain_tags, scored.competitor,
    promote, scored.geo, scored.role, scored.contact_name, scored.contact_company,
  );
  console.log(
    `scored ${item.id}: intent=${scored.intent} rel=${relevance?.toFixed?.(2) ?? "n/a"} ` +
    `geo=${scored.geo} role=${scored.role} promote=${promote}` +
    (!promote && roleOk && relOk && scored.intent >= settings.intent_threshold && !geoOk
      ? ` (dropped: geo gate ${settings.geo_mode})` : ""),
  );

  // 4. Draft promoted leads in brand voice (managed model).
  if (promote && leadId) {
    try {
      const voice = await getVoice();
      const persona = await getPersona();
      const message = await draft(
        { post: text, painTags: scored.pain_tags, competitor: scored.competitor },
        voice,
        persona,
      );
      const { error } = await db.rpc("sig_set_lead_draft", {
        p_lead_id: leadId, p_draft: message, p_model: brainConfig.draftModel,
      });
      if (error) console.warn(`set draft failed for ${leadId}:`, error.message);
      else console.log(`drafted lead ${leadId}`);
    } catch (e) { console.warn(`draft failed for ${leadId}:`, e.message); }
  }
}

async function submit(itemId, relevance, intent, painTags, competitor, promote, geo = null, role = null, contactName = null, contactCompany = null) {
  const { data, error } = await db.rpc("sig_submit_score", {
    p_item_id: itemId,
    p_relevance: relevance,
    p_intent: intent,
    p_pain_tags: painTags,
    p_competitor: competitor,
    p_model: brainConfig.scoreModel,
    p_promote: promote,
    p_geo: geo,
    p_role: role,
    p_contact_name: contactName,
    p_contact_company: contactCompany,
  });
  if (error) { console.warn(`submit_score failed for ${itemId}:`, error.message); return null; }
  return data; // lead_id when promoted, else null
}

// Automated collection: poll each due API Direct source, ingest results as
// pending (dedup on URL via sig_ingest_item). Skipped entirely if no key set.
async function pollApiDirect() {
  if (!process.env.API_DIRECT_KEY) return;
  const { data: sources, error } = await db.rpc("sig_due_sources");
  if (error) { console.warn("due_sources failed:", error.message); return; }
  if (!sources?.length) return;

  for (const s of sources) {
    try {
      let fetched = 0, ingested = 0;
      // Fetch a few pages per poll for more volume; "recent" surfaces fresh pain.
      for (let page = 1; page <= Math.max(1, PAGES_PER_POLL); page++) {
        const items = await searchApiDirect(s.platform, s.query, { page, sortBy: "recent" });
        if (!items.length) break;   // no more results
        fetched += items.length;
        for (const it of items) {
          const { data: id, error: e } = await db.rpc("sig_ingest_item", {
            p_platform: it.platform, p_external_url: it.external_url,
            p_author_handle: it.author_handle, p_author_url: it.author_url,
            p_title: it.title, p_body: it.body, p_posted_at: it.posted_at,
            p_captured_via: "api_direct", p_raw: it.raw, p_source_id: s.id,
          });
          if (!e && id) ingested++;
        }
      }
      console.log(`polled ${s.platform} "${s.query}": ${fetched} fetched, ${ingested} new`);
    } catch (e) {
      console.warn(`poll source ${s.id} (${s.platform}) failed:`, e.message);
    }
    // Mark polled regardless, so a flaky source respects its cadence and
    // doesn't get hammered every 60s cycle.
    await db.rpc("sig_mark_source_polled", { p_id: s.id });
  }
}

async function cycle() {
  await pollApiDirect();
  await embedPendingExamples();
  const painKeywords = await getPainKeywords();
  const excludeKeywords = await getExcludeKeywords();
  const settings = await getSettings();

  const { data: items, error } = await db.rpc("sig_claim_pending", { p_limit: BATCH });
  if (error) { console.warn("claim failed:", error.message); return 0; }
  if (!items?.length) return 0;

  console.log(`claimed ${items.length} item(s)`);
  for (const item of items) {
    try { await processItem(item, painKeywords, excludeKeywords, settings); }
    catch (e) { console.warn(`process ${item.id} crashed:`, e.message); }
  }
  return items.length;
}

async function main() {
  console.log(`signals-worker starting (score=${brainConfig.scoreModel}, embed=${brainConfig.embedModel}, draft=${brainConfig.draftModel})`);

  // Force a single optimizer run and exit (for testing / manual trigger).
  if (process.argv.includes("--optimize")) {
    const r = await runOptimizer(db, await getSettings());
    console.log("optimizer report:", JSON.stringify(r, null, 2));
    return;
  }
  if (process.argv.includes("--once")) { const n = await cycle(); console.log(`done, processed ${n}`); return; }

  for (;;) {
    try {
      const n = await cycle();
      // Refresh caches occasionally so keyword/voice edits propagate.
      if (n === 0) { cachedKeywords = null; cachedExcludes = null; cachedVoice = null; cachedPersona = null; cachedSettings = null; }
      // Daily self-improvement pass (self-gated to once / 24h).
      await maybeRunOptimizer(db, await getSettings());
    } catch (e) { console.error("cycle error:", e.message); }
    await sleep(POLL_SECONDS * 1000);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
main().catch((e) => { console.error("fatal:", e); process.exit(1); });
