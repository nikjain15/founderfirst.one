/**
 * evals/run.ts — a small, self-contained runner for the deterministic floor gates.
 *
 * It imports the REAL gate functions from the inference package (no reimplementation)
 * and runs them against a labeled JSONL dataset, then prints precision / recall / F1
 * for the blocking gates (safety, privacy) and pass/fail accuracy for the structural
 * gates (valid_format, source_exists, math).
 *
 * "Positive" = the gate correctly BLOCKS a bad answer (pass === false). So:
 *   TP = bad answer we blocked, FP = good answer we wrongly blocked,
 *   FN = bad answer we let through, TN = good answer we let through.
 *
 * No network, no DB, no production paths. Run: `pnpm eval:gates`
 * (or `tsx evals/run.ts`). Exits non-zero if any gate misclassifies a labeled case,
 * so it can be wired into CI once the golden set is trusted.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  safetyPrefilter,
  privacyGate,
  validFormatGate,
  sourceExistsGate,
  mathGate,
} from "../packages/inference/src/judge";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Row {
  id: string;
  gate: "safety" | "privacy" | "valid_format" | "source_exists" | "math";
  answer?: string;
  answerJson?: unknown;
  context?: { sourceIds?: string[] } | null;
  expectPass: boolean;
}

/** Run the real gate for a row → did it PASS the answer (true) or block it (false)? */
function runGate(r: Row): boolean {
  switch (r.gate) {
    case "safety":
      return safetyPrefilter(r.answer ?? "").pass;
    case "privacy":
      return privacyGate(r.answer ?? "").pass;
    case "valid_format":
      return validFormatGate(r.answer ?? "", r.answerJson).pass;
    case "source_exists":
      return sourceExistsGate(r.answerJson, r.context ?? null).pass;
    case "math":
      return mathGate(r.answerJson).pass;
  }
}

function loadRows(): Row[] {
  const raw = readFileSync(resolve(__dirname, "dataset.jsonl"), "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row);
}

function prf(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function main(): void {
  const rows = loadRows();
  const byGate = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byGate.has(r.gate)) byGate.set(r.gate, []);
    byGate.get(r.gate)!.push(r);
  }

  let misclassified = 0;
  console.info(`evals/run — ${rows.length} labeled cases across ${byGate.size} gates\n`);

  for (const [gate, gateRows] of byGate) {
    let tp = 0,
      fp = 0,
      fn = 0,
      tn = 0;
    for (const r of gateRows) {
      const pass = runGate(r);
      const correct = pass === r.expectPass;
      if (!correct) {
        misclassified++;
        console.error(`  ✗ [${gate}] ${r.id}: expected pass=${r.expectPass}, got ${pass}`);
      }
      // positive class = "correctly blocked a bad answer"
      if (!r.expectPass && !pass) tp++;
      else if (r.expectPass && !pass) fp++;
      else if (!r.expectPass && pass) fn++;
      else tn++;
    }
    const acc = (tp + tn) / gateRows.length;
    if (gate === "safety" || gate === "privacy") {
      const { precision, recall, f1 } = prf(tp, fp, fn);
      console.info(
        `  ${gate.padEnd(13)} n=${gateRows.length}  precision=${pct(precision)}  recall=${pct(recall)}  F1=${pct(f1)}  acc=${pct(acc)}`,
      );
    } else {
      console.info(`  ${gate.padEnd(13)} n=${gateRows.length}  accuracy=${pct(acc)}`);
    }
  }

  if (misclassified > 0) {
    console.error(`\n✗ evals: ${misclassified} labeled case(s) misclassified.`);
    process.exit(1);
  }
  console.info(`\n✓ evals: all deterministic gates match their labels.`);
}

main();
