/**
 * vendor-inference — copy the @ff/inference Deno-facing files into
 * supabase/functions/_shared/inference/ so Supabase Edge functions import shared
 * inference code from WITHIN supabase/functions/ (the repo's proven pattern —
 * cf. _shared/email.ts, _shared/send.ts), never across the repo root.
 *
 * Why vendor at all: `supabase functions deploy` bundles a function's Deno import
 * graph, and outside-`supabase/functions/` imports are not reliably bundled across
 * CLI versions. The single source of truth stays packages/inference/src; this is a
 * GENERATED mirror, regenerated here and drift-checked in CI (`pnpm check:vendor`).
 *
 * Run: `pnpm vendor:inference` (writes) — mirrors the vendor-demo pattern.
 * The checker (scripts/check-inference-vendor.ts) imports buildVendored() and
 * fails the build if the on-disk copy doesn't match a fresh generation.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..");

const HEADER = (source: string): string =>
  `// GENERATED FILE — do not edit by hand.
// Source: ${source}
// Regenerate with \`pnpm vendor:inference\`; drift is guarded by \`pnpm check:vendor\`.
// Vendored so Supabase Edge (Deno) deploys bundle inference code from within
// supabase/functions/ — the single source of truth is packages/inference/src.

`;

export interface VendoredFile {
  /** Path relative to repo root. */
  relPath: string;
  content: string;
}

/** Produce the exact vendored file contents from the canonical sources. Pure —
 *  used by both the writer (below) and the drift checker. */
export function buildVendored(): VendoredFile[] {
  const core = readFileSync(resolve(ROOT, "packages/inference/src/core.ts"), "utf8");
  // judge.ts imports core with no extension (bundler style); Deno needs ".ts".
  let judge = readFileSync(resolve(ROOT, "packages/inference/src/judge.ts"), "utf8");
  judge = judge.replace('from "./core"', 'from "./core.ts"');
  // The adapter imports core + judge one level up in the package; in the vendored
  // layout they sit alongside it.
  let denoAdapter = readFileSync(resolve(ROOT, "packages/inference/src/adapters/deno.ts"), "utf8");
  denoAdapter = denoAdapter
    .replace('from "../core.ts"', 'from "./core.ts"')
    .replace('from "../judge.ts"', 'from "./judge.ts"');

  return [
    {
      relPath: "supabase/functions/_shared/inference/core.ts",
      content: HEADER("packages/inference/src/core.ts") + core,
    },
    {
      relPath: "supabase/functions/_shared/inference/judge.ts",
      content: HEADER("packages/inference/src/judge.ts") + judge,
    },
    {
      relPath: "supabase/functions/_shared/inference/deno.ts",
      content: HEADER("packages/inference/src/adapters/deno.ts") + denoAdapter,
    },
  ];
}

function main(): void {
  for (const f of buildVendored()) {
    const abs = resolve(ROOT, f.relPath);
    const dir = dirname(abs);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(abs, f.content);
    console.info(`✓ vendored ${f.relPath}`);
  }
  console.info("✓ inference vendored into supabase/functions/_shared/inference/");
}

// Only write when run directly, not when imported by the checker.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
