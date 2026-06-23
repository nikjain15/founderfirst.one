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
  "role": <"needs_help" | "offering_services" | "hiring" | "other" — is the author ASKING for bookkeeping/accounting help, SELLING such services, RECRUITING / posting a job, or none of these?>
}
Score intent HIGH only when role is "needs_help" with genuine, current pain or an active search for help. Score 0 when role is "offering_services" or "hiring", or for news, ads, or generic chat. Do not add any text outside the JSON.`;

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
  return { intent, pain_tags, competitor, geo, role };
}

// ---- Outreach drafting (managed — Anthropic) -------------------------------

export async function draft({ post, painTags, competitor, channel }, voiceBody) {
  if (!cfg.anthropicKey) throw new Error("draft: ANTHROPIC_API_KEY not set");

  const channelRule = channel === "email"
    ? "This is a cold email. Open with their specific problem; keep it under 90 words; one clear, low-pressure next step."
    : "This is a reply in a public/community thread. Be genuinely helpful about THEIR problem first; no hard pitch; mention we can help only if it fits naturally. Under 80 words.";

  const system = `${voiceBody ? `Brand voice guide:\n${voiceBody}\n\n` : ""}You draft short, problem-driven outreach for FounderFirst, a bookkeeping/accounting service. Never hard-sell. Write only the message body — no subject line, no preamble, no quotes.`;

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

export const brainConfig = cfg;

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}
