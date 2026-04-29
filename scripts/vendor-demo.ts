/**
 * vendor-demo — copy Penny demo build artifacts into the marketing app's public/ tree.
 *
 * Source layout (committed):
 *   vendor/penny-demo/
 *     ├─ businessowner/   → served at /penny/demo/businessowner/
 *     └─ cpa/             → served at /penny/demo/cpa/
 *
 * Destination:
 *   apps/marketing/public/penny/demo/{businessowner,cpa}/
 *
 * Phase 0: stub only. The real implementation lands in Phase 4 (deploy swap).
 * Until then, the legacy /penny/demo/ folder at the repo root continues to serve prod.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC = resolve(ROOT, "vendor/penny-demo");
const DEST = resolve(ROOT, "apps/marketing/public/penny/demo");

function main(): void {
  console.info("[vendor-demo] Phase 0 stub.");
  console.info(`  source:      ${SRC}`);
  console.info(`  destination: ${DEST}`);

  if (!existsSync(SRC)) {
    console.info("  source missing — that is expected in Phase 0; demo still served from legacy /penny/demo/.");
    return;
  }

  console.info("  TODO (Phase 4): rm -rf DEST, cp -R SRC/{businessowner,cpa} DEST/, verify integrity.");
}

main();
