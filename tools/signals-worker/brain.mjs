/**
 * The Signals "brain" — one swappable interface, two implementations.
 *
 *   embed(text)        -> number[]            (Ollama, local, free)
 *   score(item)        -> { intent, pain_tags, competitor }   (Ollama, local)
 *   draft(ctx, voice)  -> string              (managed, Anthropic — quality)
 *
 * Scoring + embeddings run locally on the VM (cheap, high-volume, low-stakes).
 * Drafting is customer-facing, so it uses the managed model with the live
 * brand voice. Swap either by changing env — nothing else in the worker cares.
 *
 * See SIGNALS_SOLUTION.md §3 (the brain interface).
 */

const cfg = {
  ollamaUrl:    process.env.OLLAMA_URL    || "http://localhost:11434",
  embedModel:   process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
  scoreModel:   process.env.OLLAMA_SCORE_MODEL || "gemma2:2b",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  draftModel:   process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
};

// ---- Embeddings (Ollama) ---------------------------------------------------

export async function embed(text) {
  const res = await fetch(`${cfg.ollamaUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.embedModel, prompt: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`embed: ollama ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!Array.isArray(data.embedding)) throw new Error("embed: no embedding in response");
  return data.embedding;
}

// ---- Intent scoring (Ollama, strict JSON) ----------------------------------

const SCORE_SYSTEM = `You score social-media posts for a US-based bookkeeping/accounting service that helps founders, solopreneurs, freelancers, and small-business owners.

Judge how strongly the AUTHOR personally needs a bookkeeping/accounting solution RIGHT NOW. Reply ONLY with JSON:
{
  "intent": <integer 0-100, strength and immediacy of the author's own buying need>,
  "pain_tags": [<short snake_case tags of the specific pain, e.g. "catch_up_bookkeeping", "hates_quickbooks", "year_end_scramble">],
  "competitor": <name of any accounting tool/bookkeeper they mention, or null>,
  "geo": <"us" | "non_us" | "unknown" — infer from currency ("$", USD), US tax terms (IRS, 1099, W-2, W-9, Schedule C, EIN, sales tax, S-corp, LLC), or US state/city names => "us"; "£"/"€"/"₹", HMRC, GST, VAT, BAS, ABN, non-US locations, or non-English text => "non_us"; no signal => "unknown">,
  "role": <"needs_help" | "offering_services" | "hiring" | "other">,
  "contact_name": <the author's real personal name if stated or strongly implied (a sign-off like "- Sam", "I'm Maria here", or a handle that clearly reads as a real name like "John Carter"), else null. Do NOT invent a name from a generic username you can't read as one>,
  "contact_company": <the name of the author's OWN business/company if stated or reasonably implied (e.g. "running my shop Brightline Co", "at my agency Foo"), else null. This is THEIR company — never the accounting tool/competitor they mention>
}
ROLE — read carefully:
- "needs_help": the author is a BUSINESS OWNER / founder / freelancer / solopreneur who needs bookkeeping or accounting for THEIR OWN business — INCLUDING looking for, seeking, wanting to hire, or asking for recommendations for a bookkeeper or bookkeeping service. A buyer searching for a provider is needs_help.
- "offering_services": the author SELLS bookkeeping/accounting services (promoting their own firm, rates, or an ad).
- "hiring": ONLY a formal EMPLOYMENT job posting for a W-2/payroll employee (salary, benefits, "join our team"). "Looking for a bookkeeper" by an owner is NOT hiring — it's needs_help.
- "other": anything else — INCLUDING a bookkeeper / accountant / CPA / tax pro discussing their own practice, pricing, software, or their CLIENTS. These are industry peers, NOT our customers, even if they describe a "catch-up" or a messy client.

Examples:
- "I got a 3-year catch-up opportunity and put together a flat-rate proposal for a law firm..." => role "other" (the author is the bookkeeper pricing client work), intent 0.
- "Attention business owners: our firm offers affordable bookkeeping, DM for rates." => role "offering_services", intent 0.
- "Looking for a bookkeeper for my small business — any recommendations?" => role "needs_help", high intent.
- "Seeking bookkeeper recommendations in the Bay Area for my LLC." => role "needs_help".
- "We're hiring a full-time staff bookkeeper, $65k + benefits, join our team." => role "hiring", intent 0.
- "QuickBooks keeps crashing and I can't reconcile my own small business — better option?" => role "needs_help".

Score intent HIGH only when role is "needs_help" with genuine, current pain or an active search for help. Score 0 for every other role, and for news, ads, or generic chat. Do not add any text outside the JSON.`;

export async function score(item) {
  const content = [item.title, item.body].filter(Boolean).join("\n\n").slice(0, 6000);
  const res = await fetch(`${cfg.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.scoreModel,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        { role: "system", content: SCORE_SYSTEM },
        { role: "user", content: `Post:\n${content}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`score: ollama ${res.status} ${await res.text()}`);
  const data = await res.json();
  let parsed;
  try { parsed = JSON.parse(data.message?.content ?? "{}"); }
  catch { throw new Error("score: model did not return valid JSON"); }

  const intent = clampInt(parsed.intent, 0, 100);
  const pain_tags = Array.isArray(parsed.pain_tags)
    ? parsed.pain_tags.filter((t) => typeof t === "string").slice(0, 8)
    : [];
  const competitor = typeof parsed.competitor === "string" && parsed.competitor.trim()
    ? parsed.competitor.trim().slice(0, 80)
    : null;
  const geo = ["us", "non_us", "unknown"].includes(parsed.geo) ? parsed.geo : "unknown";
  const role = ["needs_help", "offering_services", "hiring", "other"].includes(parsed.role)
    ? parsed.role : "other";
  const cleanStr = (v, max) =>
    typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null"
      ? v.trim().slice(0, max) : null;
  const contact_name = cleanStr(parsed.contact_name, 120);
  const contact_company = cleanStr(parsed.contact_company, 120);
  return { intent, pain_tags, competitor, geo, role, contact_name, contact_company };
}

// ---- Outreach drafting (managed — Anthropic) -------------------------------

export async function draft({ post, painTags, competitor, channel }, voiceBody) {
  if (!cfg.anthropicKey) throw new Error("draft: ANTHROPIC_API_KEY not set");

  const channelRule = channel === "email"
    ? "This is a cold email. Open on THEIR specific situation; give one genuinely useful pointer; under 90 words; end with one low-pressure next step."
    : "This is a reply in a public/community thread. Lead with real help on THEIR exact problem. Mention FounderFirst in at most ONE sentence, only if it fits naturally — otherwise not at all. Under 80 words.";

  const system = `${voiceBody ? `Brand voice guide:\n${voiceBody}\n\n` : ""}You draft short, problem-driven outreach for FounderFirst, a bookkeeping/accounting service for US founders, freelancers, and small businesses.

Rules:
- Reference a SPECIFIC detail from their post so it's obviously not a template.
- Open with a concrete, useful insight about their exact problem — never flattery, never "congrats" or "sounds like you've built something real".
- Never hard-sell. No "we help businesses like yours", no feature lists.
- Don't claim to be a fellow founder or invent facts about them.
- Plain, human, specific. Write ONLY the message body — no subject, preamble, or quotes.`;

  const user = `Draft an outreach message for this person.
Channel rule: ${channelRule}
Their pain: ${painTags?.length ? painTags.join(", ") : "bookkeeping/accounting"}${competitor ? `\nTool they mention: ${competitor}` : ""}

Their post:
${post.slice(0, 4000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cfg.anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.draftModel,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`draft: anthropic ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text) throw new Error("draft: empty response");
  return text;
}

// ---- Generic completion (managed — Anthropic) -----------------------------
// Used by the daily sourcing optimizer to generate candidate queries.
export async function generate(system, user, { maxTokens = 700 } = {}) {
  if (!cfg.anthropicKey) throw new Error("generate: ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cfg.anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.draftModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`generate: anthropic ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

export const brainConfig = cfg;

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}
