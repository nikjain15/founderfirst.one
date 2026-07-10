/**
 * check-input-font-size — guard against the recurring iOS-zoom regression
 * (weekly audit PR #301, apps/app P2: Bills-form inputs).
 *
 * `--fs-body` (clamp(15px, 1.6vw, 17px)) floors at 15px — below the 16px
 * RESPONSIVE.md rule 6 floor ("inputs >= 16px font-size, prevents iOS
 * auto-zoom on focus"). Every input/select/textarea must size off
 * `--fs-input` (max(16px, ...)) instead. The Bills-form rules were copy-
 * pasted with `--fs-body` and, separately, the same copy-paste recurred the
 * same day in new Invoicing-form CSS — this is a silent-drift class (an
 * input renders fine, just floors 1px low on some viewports; nothing
 * crashes, so it recurs unnoticed, per LEARNINGS rule 14).
 *
 * This script finds every CSS rule whose selector targets an input-like
 * element (`input`, `select`, `textarea`) and fails if its declaration block
 * sets `font-size: var(--fs-body)`.
 *
 * Run: `pnpm check:input-font-size` (or `tsx scripts/check-input-font-size.ts`).
 * CI: .github/workflows/centralization.yml, alongside check:css-vars.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCAN_DIRS = [resolve(ROOT, "apps/app/src"), resolve(ROOT, "apps/admin/src")];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const INPUT_SELECTOR = /(^|[\s,>+~.#:])(input|select|textarea)(?=[\s,{.:#\[]|$)/;

function listCssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...listCssFiles(resolve(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

type Violation = { file: string; line: number; selector: string };

/** Every `selector { ...declarations... }` rule in a stylesheet. */
function findViolations(css: string, file: string): Violation[] {
  const violations: Violation[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css)) !== null) {
    const [, rawSelector, body] = m;
    const selector = rawSelector.trim();
    if (!INPUT_SELECTOR.test(selector)) continue;
    if (/font-size\s*:\s*var\(\s*--fs-body\s*\)/.test(body)) {
      const line = css.slice(0, m.index).split("\n").length;
      violations.push({ file, line, selector });
    }
  }
  return violations;
}

function main(): void {
  const violations: Violation[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of listCssFiles(dir)) {
      violations.push(...findViolations(readFileSync(file, "utf8"), file));
    }
  }

  if (violations.length > 0) {
    console.error("check:input-font-size FAILED — input-like elements sized off --fs-body:\n");
    for (const v of violations) {
      console.error(`  ${relative(ROOT, v.file)}:${v.line}  "${v.selector}"`);
    }
    console.error(
      "\n--fs-body floors at 15px (RESPONSIVE.md rule 6 requires >= 16px on inputs to" +
        " prevent iOS focus-zoom). Use --fs-input instead."
    );
    process.exit(1);
  }

  console.log("check:input-font-size OK — no input/select/textarea rule uses --fs-body.");
}

main();
