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
const BATCH            = Number(env("BATCH", "10"));
const POLL_SECONDS     = Number(env("POLL_INTERVAL_SECONDS", "60"));

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// pgvector accepts a "[v1,v2,...]" string literal; PostgREST passes it through
// and Postgres casts it to vector for the RPC param.
const toVector = (arr) => `[${arr.join(",")}]`;

let cachedVoice = null;
let cachedKeywords = null;

async function getVoice() {
  if (cachedVoice !== null) return cachedVoice;
  const { data, error } = await db.rpc("get_live_voice");
  if (error) { console.warn("voice unavailable:", error.message); cachedVoice = ""; return ""; }
  cachedVoice = data?.[0]?.body ?? "";
  return cachedVoice;
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

async function processItem(item, painKeywords) {
  const text = [item.title, item.body].filter(Boolean).join("\n\n");
  const lower = text.toLowerCase();
  const keywordHit = painKeywords.some((kw) => lower.includes(kw));

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
  if (!keywordHit && relevance != null && relevance < REL_FLOOR) {
    await submit(item.id, relevance, 0, [], null, false);
    console.log(`archived ${item.id} (prefilter, rel=${relevance?.toFixed(2)})`);
    return;
  }

  // 3. LLM intent score.
  let scored;
  try { scored = await score(item); }
  catch (e) {
    console.warn(`score failed for ${item.id}:`, e.message);
    // Leave it scored-but-unpromoted so a later run can retry via re-claim if desired.
    await submit(item.id, relevance ?? 0, 0, [], null, false);
    return;
  }

  // A keyword hit always clears relevance. Otherwise require the relevance
  // threshold — but if we have no ICP examples yet (relevance null), let the
  // LLM intent score decide on its own (the scoring prompt is domain-specific,
  // so off-topic posts score low anyway).
  const relOk = keywordHit || (relevance == null ? true : relevance >= REL_THRESHOLD);
  const promote = relOk && scored.intent >= INTENT_THRESHOLD;

  const leadId = await submit(item.id, relevance ?? 0, scored.intent, scored.pain_tags, scored.competitor, promote);
  console.log(`scored ${item.id}: intent=${scored.intent} rel=${relevance?.toFixed?.(2) ?? "n/a"} promote=${promote}`);

  // 4. Draft promoted leads in brand voice (managed model).
  if (promote && leadId) {
    try {
      const voice = await getVoice();
      const message = await draft(
        { post: text, painTags: scored.pain_tags, competitor: scored.competitor, channel: "on_platform" },
        voice,
      );
      const { error } = await db.rpc("sig_set_lead_draft", {
        p_lead_id: leadId, p_draft: message, p_model: brainConfig.draftModel,
      });
      if (error) console.warn(`set draft failed for ${leadId}:`, error.message);
      else console.log(`drafted lead ${leadId}`);
    } catch (e) { console.warn(`draft failed for ${leadId}:`, e.message); }
  }
}

async function submit(itemId, relevance, intent, painTags, competitor, promote) {
  const { data, error } = await db.rpc("sig_submit_score", {
    p_item_id: itemId,
    p_relevance: relevance,
    p_intent: intent,
    p_pain_tags: painTags,
    p_competitor: competitor,
    p_model: brainConfig.scoreModel,
    p_promote: promote,
  });
  if (error) { console.warn(`submit_score failed for ${itemId}:`, error.message); return null; }
  return data; // lead_id when promoted, else null
}

async function cycle() {
  await embedPendingExamples();
  const painKeywords = await getPainKeywords();

  const { data: items, error } = await db.rpc("sig_claim_pending", { p_limit: BATCH });
  if (error) { console.warn("claim failed:", error.message); return 0; }
  if (!items?.length) return 0;

  console.log(`claimed ${items.length} item(s)`);
  for (const item of items) {
    try { await processItem(item, painKeywords); }
    catch (e) { console.warn(`process ${item.id} crashed:`, e.message); }
  }
  return items.length;
}

async function main() {
  const once = process.argv.includes("--once");
  console.log(`signals-worker starting (score=${brainConfig.scoreModel}, embed=${brainConfig.embedModel}, draft=${brainConfig.draftModel})`);
  if (once) { const n = await cycle(); console.log(`done, processed ${n}`); return; }

  for (;;) {
    try {
      const n = await cycle();
      // Refresh caches occasionally so keyword/voice edits propagate.
      if (n === 0) { cachedKeywords = null; cachedVoice = null; }
    } catch (e) { console.error("cycle error:", e.message); }
    await sleep(POLL_SECONDS * 1000);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
main().catch((e) => { console.error("fatal:", e); process.exit(1); });
