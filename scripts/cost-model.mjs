#!/usr/bin/env node
/**
 * FounderFirst cost model. docs/COST.md.
 *
 * The headline this is built to make visible: the cheapest call is the one that is
 * never made. Transaction categorization resolves most volume on a deterministic
 * rule plus a vendor prior, with ZERO model spend, and only the residue reaches the
 * difficulty cascade (Haiku -> Sonnet -> Opus). Any cost model that starts at "which
 * model" has already skipped the decision that matters most.
 *
 * WHY A SCRIPT AND NOT A TABLE IN A DOC. This parses `DEFAULT_PRICES` out of
 * `packages/inference/src/core.ts`, so a reprice moves every figure. That property
 * is not theoretical: the Opus row in that table was $15/$75 until 2026-08-02, which
 * is Opus-3-era pricing, and it fed ai_decisions. Correcting one line moved
 * everything here.
 *
 * WHAT IS MEASURED, ESTIMATED, AND ASSUMED:
 *
 *   MEASURED from source   every per-million-token price, and the three tier model
 *                          ids from the categorize cascade. Parsed, not retyped.
 *   ESTIMATED              token counts, via characters / 4. An approximation.
 *   ASSUMED                the deterministic-resolution rate, the escalation rates,
 *                          prompt and reply sizes, and monthly transaction volume.
 *
 * The deterministic rate is the single most important assumption in this file and
 * the least well evidenced. It is called out in docs/COST.md rather than buried.
 *
 * Usage:
 *   node scripts/cost-model.mjs           print the model
 *   node scripts/cost-model.mjs --json    machine-readable
 */
import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = pathResolve(ROOT, "packages/inference/src/core.ts");
const CATEGORIZE = pathResolve(ROOT, "supabase/functions/categorize/index.ts");

/** Characters per token. Rough English-prose constant, the largest error source. */
export const CHARS_PER_TOKEN = 4;

/**
 * The categorize funnel. Every one of these is an ASSUMPTION about behaviour.
 *
 * `deterministic` is the share of transactions resolved by rule + vendor prior with
 * no model call at all. The code says this is "the common path" and that bulk
 * transactions "never reach here"; 0.80 is a conservative reading of that, not a
 * measurement. It is also the number the whole model is most sensitive to.
 *
 * The escalation rates are shares OF THE MODEL-ROUTED residue, not of all traffic.
 */
export const FUNNEL = {
  deterministic: 0.8,
  escalateToReasoning: 0.2,
  escalateToHardest: 0.05,
};

/** Prompt and reply shape for one categorization. ASSUMED. */
export const SHAPE = { promptChars: 2_400, replyChars: 600 };

/** Transactions ingested per org per month. ASSUMED. */
export const TXNS_PER_MONTH = 4_000;

const die = (m) => {
  console.error(`cost-model: ${m}`);
  process.exit(2);
};

/** Parse the price table out of source rather than restating it. */
export function readPrices(src = readFileSync(CORE, "utf8")) {
  const block = src.match(/export const DEFAULT_PRICES[^{]*\{([\s\S]*?)\n\};/);
  if (!block) die("DEFAULT_PRICES did not parse from core.ts. The source moved; fix this script.");
  const out = {};
  const re = /"([^"]+)":\s*\{\s*inputPerMTok:\s*([\d.]+),\s*outputPerMTok:\s*([\d.]+)\s*\}/g;
  let m;
  while ((m = re.exec(block[1]))) out[m[1]] = { in: Number(m[2]), out: Number(m[3]) };
  if (!Object.keys(out).length) die("DEFAULT_PRICES parsed to nothing.");
  return out;
}

/** Parse the three cascade tiers out of the categorize function's defaults. */
export function readTiers(src = readFileSync(CATEGORIZE, "utf8")) {
  const out = {};
  for (const m of src.matchAll(
    /(cheap|reasoning|hardest):\s*\{[^}]*?\?\?\s*"([^"]+)"/g,
  )) {
    out[m[1]] = m[2];
  }
  for (const t of ["cheap", "reasoning", "hardest"]) {
    if (!out[t]) die(`tier "${t}" did not parse from categorize/index.ts.`);
  }
  return out;
}

const tokens = (chars) => Math.ceil(chars / CHARS_PER_TOKEN);

export function computeModel() {
  const prices = readPrices();
  const tiers = readTiers();

  const inTok = tokens(SHAPE.promptChars);
  const outTok = tokens(SHAPE.replyChars);
  const perCall = (model) => {
    const p = prices[model];
    if (!p) die(`no price for "${model}" (a categorize tier). Add it to DEFAULT_PRICES.`);
    return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
  };

  const cost = {
    cheap: perCall(tiers.cheap),
    reasoning: perCall(tiers.reasoning),
    hardest: perCall(tiers.hardest),
  };

  // Volumes. Escalation rates are shares of the model-routed residue.
  const total = TXNS_PER_MONTH;
  const free = Math.round(total * FUNNEL.deterministic);
  const routed = total - free;
  const toHardest = Math.round(routed * FUNNEL.escalateToHardest);
  const toReasoning = Math.round(routed * FUNNEL.escalateToReasoning) - toHardest;
  const toCheap = routed - toReasoning - toHardest;

  // An escalated transaction pays for the rungs below it too: the cascade tries
  // cheap first, then reasoning, then hardest. Counting only the final rung would
  // understate every escalation.
  const monthly =
    toCheap * cost.cheap +
    toReasoning * (cost.cheap + cost.reasoning) +
    toHardest * (cost.cheap + cost.reasoning + cost.hardest);

  // Two counterfactuals, both real decisions someone could make.
  const noDeterministic = // every transaction reaches the cascade
    monthly / (routed / total);
  const allHardest = total * cost.hardest; // pin the top tier, no cascade

  return {
    tiers,
    inTok,
    outTok,
    perCall: cost,
    volumes: { total, free, routed, toCheap, toReasoning, toHardest },
    monthly,
    noDeterministic,
    allHardest,
    perTxnAllIn: monthly / total,
  };
}

const usd = (n) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(2)}`);

function main() {
  const r = computeModel();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    return;
  }
  const v = r.volumes;

  console.log("\nFounderFirst cost model — transaction categorization");
  console.log("===================================================");
  console.log("Prices parsed from packages/inference/src/core.ts;");
  console.log("tier model ids from supabase/functions/categorize/index.ts.\n");
  console.log(`Per categorization: ~${r.inTok} in, ~${r.outTok} out\n`);
  console.log("| Tier | Model | Per call |");
  console.log("|---|---|---|");
  console.log(`| cheap | ${r.tiers.cheap} | ${usd(r.perCall.cheap)} |`);
  console.log(`| reasoning | ${r.tiers.reasoning} | ${usd(r.perCall.reasoning)} |`);
  console.log(`| hardest | ${r.tiers.hardest} | ${usd(r.perCall.hardest)} |`);

  console.log(`\nFunnel, ${v.total} transactions/month:`);
  console.log(`  resolved deterministically  ${String(v.free).padStart(5)}  (${(v.free / v.total * 100).toFixed(0)}%)  NO MODEL CALL`);
  console.log(`  cheap tier only             ${String(v.toCheap).padStart(5)}`);
  console.log(`  escalated to reasoning      ${String(v.toReasoning).padStart(5)}`);
  console.log(`  escalated to hardest        ${String(v.toHardest).padStart(5)}`);

  console.log(`\n  as built                       ${usd(r.monthly)}/month  (${usd(r.perTxnAllIn)} per transaction, all in)`);
  console.log(`  if nothing resolved by rule    ${usd(r.noDeterministic)}/month`);
  console.log(`  if every txn ran on ${r.tiers.hardest}  ${usd(r.allHardest)}/month`);
  console.log(`\n  the deterministic path saves   ${usd(r.noDeterministic - r.monthly)}/month`);
  console.log(`  the cascade saves a further    ${usd(r.allHardest - r.noDeterministic)}/month`);

  console.log("\nAn escalated transaction is charged for the rungs below it too: the");
  console.log("cascade tries cheap, then reasoning, then hardest. Counting only the");
  console.log("final rung would understate every escalation.");
  console.log("\nPrices and tier ids are read from source. Token counts are ESTIMATED");
  console.log("(chars/4); the deterministic rate, escalation rates, prompt/reply sizes");
  console.log("and volume are ASSUMED. The deterministic rate dominates the answer.\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
