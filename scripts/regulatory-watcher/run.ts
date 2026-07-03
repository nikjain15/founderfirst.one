/**
 * regulatory-watcher — the LOOP-2 scheduled routine (Roadmap principle 3c).
 *
 * A tax-law / deadline change becomes ONE reviewed, effective-dated, cited
 * seed-diff PR flagged `decision-needed` — never a code sweep, never a self-merge.
 *
 * Modes:
 *   --replay <name>   Deterministic: load a fixture (scripts/regulatory-watcher/
 *                     fixtures/<name>.json = {state, signals}), run detect(), print
 *                     the resulting seed-diff + PR body. Used by CI + the acceptance
 *                     test. `--replay obbba-1099` is the canonical case.
 *   --scan            Live: read the source registry, extract signals (fetch layer),
 *                     diff against the committed seed state, and — if `--open-pr` —
 *                     write a branch + open a draft decision-needed PR via `gh`.
 *                     No detection ⇒ log only, exit 0 (false-positive-safe).
 *   --open-pr         With --scan: actually create the PR (default is dry-run: print).
 *   --season          Force seasonal cadence (include seasonal_daily sources); the
 *                     workflow passes this Jan–Apr.
 *
 * The routine NEVER merges and NEVER deploys. Its only write is a branch + draft PR.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { detect } from "./detect.js";
import { newSeedRows, prBody, prTitle } from "./pr.js";
import type { LawChangeSignal, SeedDiff, SeedState, WatchedSource } from "./types.js";
import { extractSignals } from "./fetch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SEED_FILE = resolve(ROOT, "supabase/seeds/kernel/filing_obligations.json");
const SOURCES_FILE = resolve(__dirname, "sources.json");

function log(msg: string): void {
  process.stdout.write(`[reg-watcher] ${msg}\n`);
}

/** The committed filing_obligations seed as the current state to diff against. */
function loadSeedState(): SeedState {
  const seed = JSON.parse(readFileSync(SEED_FILE, "utf8")) as { rows: SeedState["filing_obligations"] };
  return { filing_obligations: seed.rows };
}

function loadSources(season: boolean): WatchedSource[] {
  const all = (JSON.parse(readFileSync(SOURCES_FILE, "utf8")) as { rows: WatchedSource[] }).rows;
  return all.filter((s) => s.cadence === "weekly" || (season && s.cadence === "seasonal_daily"));
}

/** Drop any signal for an obligation the source is not authorised to govern
 *  (false-positive guard — a source can only speak to its `governs` keys). */
function scopeSignals(signals: LawChangeSignal[], sources: WatchedSource[]): LawChangeSignal[] {
  const bySource = new Map(sources.map((s) => [s.id, s]));
  return signals.filter((sig) => {
    const src = bySource.get(sig.source_id);
    if (!src) return false;
    if (!src.governs.includes(sig.obligation_key)) {
      log(`dropped signal from ${sig.source_id}: not authorised to govern '${sig.obligation_key}'`);
      return false;
    }
    return true;
  });
}

function printResult(diffs: SeedDiff[], skipped: number): void {
  if (diffs.length === 0) {
    log(`no law change detected (${skipped} signal(s) inspected, all no-ops/already-applied). No PR — log only.`);
    return;
  }
  log(`${diffs.length} change(s) detected → seed-diff PR would be drafted (decision-needed):`);
  log(prTitle(diffs));
  process.stdout.write("\n" + prBody(diffs, { detectedAt: new Date().toISOString().slice(0, 10), sources: 0 }) + "\n");
}

/** Replay a fixture through the pure detector — deterministic, no network. */
function runReplay(name: string): number {
  const fx = JSON.parse(
    readFileSync(resolve(__dirname, "fixtures", `${name}.json`), "utf8"),
  ) as { state: SeedState; signals: LawChangeSignal[] };
  const { diffs, skipped } = detect(fx.state, fx.signals);
  log(`replay '${name}': ${diffs.length} diff(s), ${skipped.length} skipped.`);
  for (const s of skipped) log(`  skipped ${s.signal.obligation_key}: ${s.reason}`);
  printResult(diffs, skipped.length);
  return diffs.length > 0 ? 0 : 0; // replay is informational; the test asserts shape
}

/** Append superseding rows to the seed file, regenerate the loader, and open a
 *  draft decision-needed PR. Only called with --open-pr. */
function openPr(diffs: SeedDiff[]): void {
  const branch = `loop/reg-watcher-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
  const seed = JSON.parse(readFileSync(SEED_FILE, "utf8")) as { rows: unknown[]; _meta: unknown };
  seed.rows = [...seed.rows, ...newSeedRows(diffs)];
  writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2) + "\n", "utf8");

  // Regenerate the idempotent loader so CI (check:kernel-seed) stays green.
  execFileSync("pnpm", ["seed:kernel"], { cwd: ROOT, stdio: "inherit" });

  const bodyFile = resolve(mkdtempSync(resolve(tmpdir(), "regwatch-")), "body.md");
  writeFileSync(bodyFile, prBody(diffs, { detectedAt: new Date().toISOString().slice(0, 10), sources: 0 }));

  const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, stdio: "inherit" });
  git(["checkout", "-b", branch]);
  git(["add", "supabase/seeds/kernel/filing_obligations.json", "supabase/seeds/kernel/_generated.sql", "supabase/seed.sql"]);
  git(["commit", "-m", prTitle(diffs) + "\n\nAuto-drafted by LOOP-2 regulatory watcher. decision-needed.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"]);
  git(["push", "-u", "origin", branch]);
  execFileSync(
    "gh",
    ["pr", "create", "--draft", "--base", "main", "--head", branch, "--title", prTitle(diffs), "--body-file", bodyFile, "--label", "decision-needed"],
    { cwd: ROOT, stdio: "inherit" },
  );
  log("draft decision-needed PR opened. A human reviews + merges — the watcher never self-merges.");
}

async function runScan(season: boolean, openPrFlag: boolean): Promise<number> {
  const sources = loadSources(season);
  log(`scanning ${sources.length} source(s)${season ? " (seasonal cadence)" : ""}...`);
  const raw = await extractSignals(sources);
  const signals = scopeSignals(raw, sources);
  const state = loadSeedState();
  const { diffs, skipped } = detect(state, signals);
  for (const s of skipped) log(`  skipped ${s.signal.obligation_key}: ${s.reason}`);
  if (diffs.length === 0) {
    printResult(diffs, skipped.length);
    return 0; // false-positive-safe: no PR
  }
  if (openPrFlag) {
    openPr(diffs);
  } else {
    log("dry-run (no --open-pr) — would draft this decision-needed PR:");
    printResult(diffs, skipped.length);
  }
  return 0;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const season = argv.includes("--season");
  const openPrFlag = argv.includes("--open-pr");
  const replayIdx = argv.indexOf("--replay");
  if (replayIdx !== -1) {
    process.exit(runReplay(argv[replayIdx + 1] ?? "obbba-1099"));
  }
  if (argv.includes("--scan")) {
    process.exit(await runScan(season, openPrFlag));
  }
  log("usage: regulatory-watcher --replay <name> | --scan [--season] [--open-pr]");
  process.exit(2);
}

main().catch((e) => {
  process.stderr.write(`[reg-watcher] FATAL ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
