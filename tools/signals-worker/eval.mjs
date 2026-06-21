/**
 * Scoring model eval — compares Ollama models on the SAME scoring prompt the
 * worker uses (brain.mjs SCORE_SYSTEM), against a small hand-labeled set.
 *
 * Run: node eval.mjs            (defaults: gemma2:2b vs qwen2.5:7b-instruct-q4_K_M)
 *      node eval.mjs modelA modelB
 *
 * Reports, per model: decision accuracy vs expected promote (intent >= 55),
 * mean intent on positives vs negatives (separation), and avg latency.
 */

const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";
const THRESHOLD = 55;
const MODELS = process.argv.slice(2);
const A = MODELS[0] || "gemma2:2b";
const B = MODELS[1] || "qwen2.5:7b-instruct-q4_K_M";

// Same prompt the worker scores with (keep in sync with brain.mjs SCORE_SYSTEM).
const SCORE_SYSTEM = `You score social-media posts for a bookkeeping/accounting service that helps founders, solopreneurs, freelancers, and small-business owners.

Given a post, judge how strongly the author needs a bookkeeping/accounting solution RIGHT NOW. Reply ONLY with JSON:
{
  "intent": <integer 0-100, how strong and immediate the buying need is>,
  "pain_tags": [<short snake_case tags of the specific pain, e.g. "catch_up_bookkeeping", "hates_quickbooks", "year_end_scramble">],
  "competitor": <name of any accounting tool/bookkeeper they mention, or null>
}
Score high only for genuine, current pain or active search for help. Score low for generic chat, news, or someone offering services. Do not add any text outside the JSON.`;

// expect: true = should promote (real ICP pain), false = should NOT
const SET = [
  { expect: true,  body: "I'm 8 months behind on my bookkeeping and QuickBooks is a nightmare. Drowning before tax season — anyone know a good catch-up bookkeeper?" },
  { expect: true,  body: "We used Bench and now they've shut down. Months of uncategorized transactions and no idea who to switch to before taxes are due. Help." },
  { expect: true,  body: "Freelance designer here, my whole accounting is a messy spreadsheet and I have no clue what I owe in taxes. The 1099s are stressing me out." },
  { expect: true,  body: "Running a 6-person agency and reconciling in QuickBooks every month takes hours and I still get it wrong. Is there something simpler for service businesses?" },
  { expect: true,  body: "Need clean financials for a fundraise and I've ignored the books for most of the year. Panicking about getting everything reconciled in time." },
  { expect: true,  body: "Shopify payouts, Stripe fees and refunds make reconciling my books a nightmare every single month. Want it accurate without losing a weekend." },
  { expect: true,  body: "Honestly paying $500/mo to a bookkeeper and have no idea what I'm getting. Tempted to DIY but terrified I'll mess up my taxes. Thoughts?" },
  { expect: false, body: "I'm a bookkeeper taking on new clients this quarter! DM me if your small business needs monthly bookkeeping and catch-up work. Great rates." },
  { expect: false, body: "QuickBooks just shipped a nice new dashboard update. Honestly loving the new reports, makes my month-end so smooth. Anyone else tried it?" },
  { expect: false, body: "What's the best state to form an LLC for an online business? Trying to understand the tax implications before I register." },
  { expect: false, body: "Big news: the IRS announced new 1099-K thresholds for next year. Here's an article breaking down what it means for marketplaces." },
  { expect: false, body: "Hiring a senior React engineer for our seed-stage startup, fully remote. Comp is competitive + equity. Repost appreciated!" },
  { expect: false, body: "Just hit $10k MRR! Grateful for this community. Onwards and upwards 🚀 Happy to answer questions about our growth playbook." },
  { expect: true,  body: "Year-end is a disaster. Receipts everywhere, nothing categorized, accountant wants everything by Friday. I cannot keep doing my own books." },
];

async function scoreWith(model, body) {
  const t0 = Date.now();
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, stream: false, format: "json", options: { temperature: 0 },
      messages: [
        { role: "system", content: SCORE_SYSTEM },
        { role: "user", content: `Post:\n${body}` },
      ],
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`${model}: ollama ${res.status}`);
  const data = await res.json();
  let intent = 0, tags = [], comp = null;
  try { const p = JSON.parse(data.message?.content ?? "{}"); intent = Math.round(Number(p.intent)) || 0; tags = p.pain_tags || []; comp = p.competitor ?? null; } catch {}
  return { intent, tags, comp, ms };
}

async function runModel(model) {
  let correct = 0, posSum = 0, posN = 0, negSum = 0, negN = 0, msSum = 0;
  const rows = [];
  for (const t of SET) {
    const r = await scoreWith(model, t.body);
    const decided = r.intent >= THRESHOLD;
    const ok = decided === t.expect;
    if (ok) correct++;
    if (t.expect) { posSum += r.intent; posN++; } else { negSum += r.intent; negN++; }
    msSum += r.ms;
    rows.push({ expect: t.expect ? "YES" : "no ", intent: r.intent, ok: ok ? "✓" : "✗", snippet: t.body.slice(0, 48) });
  }
  return {
    model, accuracy: correct / SET.length,
    meanPos: posSum / posN, meanNeg: negSum / negN,
    sep: posSum / posN - negSum / negN, avgMs: Math.round(msSum / SET.length), rows,
  };
}

console.log(`Eval: ${SET.length} labeled posts, promote threshold = intent >= ${THRESHOLD}\n`);
for (const model of [A, B]) {
  process.stdout.write(`Scoring with ${model} …\n`);
  const r = await runModel(model);
  for (const row of r.rows) console.log(`  ${row.ok} expect=${row.expect} intent=${String(row.intent).padStart(3)}  ${row.snippet}`);
  console.log(`  -> accuracy ${(r.accuracy * 100).toFixed(0)}%  | mean(pos)=${r.meanPos.toFixed(0)} mean(neg)=${r.meanNeg.toFixed(0)} separation=${r.sep.toFixed(0)}  | avg ${r.avgMs}ms/post\n`);
}
