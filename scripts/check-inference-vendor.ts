/**
 * check-inference-vendor — fail the build if the vendored Deno copy of
 * @ff/inference (supabase/functions/_shared/inference/) has drifted from the
 * canonical source (packages/inference/src/). Guards the "edited core.ts but
 * forgot to re-vendor" footgun — the same silent-failure class as check:css
 * (LEARNINGS rule 14).
 *
 * Run: `pnpm check:vendor` (or `tsx scripts/check-inference-vendor.ts`).
 * Fix drift with `pnpm vendor:inference`.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildVendored, ROOT } from "./vendor-inference.ts";

function main(): void {
  const problems: string[] = [];
  for (const f of buildVendored()) {
    const abs = resolve(ROOT, f.relPath);
    if (!existsSync(abs)) {
      problems.push(`MISSING  ${f.relPath}`);
      continue;
    }
    if (readFileSync(abs, "utf8") !== f.content) {
      problems.push(`STALE    ${f.relPath}`);
    }
  }

  if (problems.length > 0) {
    console.error(`\n✗ Vendored inference is out of sync — ${problems.length} file(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error("\nThe Supabase Edge copy drifted from packages/inference/src.");
    console.error("Run `pnpm vendor:inference` and commit the result.\n");
    process.exit(1);
  }

  console.info("✓ Vendored inference matches packages/inference/src.");
}

main();
