/**
 * check-magic-fontsize — guard against re-inlining a px value that already
 * has an exact flat design-system token (weekly audit PR #301, design_system
 * P2: "~56 font-size:NNpx that duplicate --fs-*" across apps/admin + apps/web).
 *
 * tokens.css defines several FLAT (non-clamp) font-size tokens — --fs-tiny
 * (10px), --fs-eyebrow (11px), --fs-micro (12px), --fs-label (13px),
 * --fs-ui (15px) — plus --fs-input, which is `max(16px, --fs-data-row)` and
 * --fs-data-row never exceeds 14px, so --fs-input is *effectively* a flat
 * 16px on form controls. A literal font-size at one of these exact values
 * is a byte-for-byte no-op swap to the token — there is no ambiguity or
 * clamp-range judgment call, unlike the wider magic-px sweep (ADMIN-DS-PX-1
 * fixed the mechanical exact-match cases; still-inline sizes with no exact
 * flat-token match, e.g. 14px/18px/22px, are a separate follow-up that needs
 * a token-design decision, not a mechanical fix — this guard does not flag
 * those).
 *
 * 16px is only flagged on input-like selectors (input/select/textarea, or a
 * class name containing "-input") — a bare 16px elsewhere (e.g. a wordmark
 * or heading) has no flat non-input token yet, so flagging it would be a
 * false positive pushing an unrelated naming decision onto this guard.
 *
 * Run: `pnpm check:magic-fontsize` (or `tsx scripts/check-magic-fontsize.ts`).
 * CI: .github/workflows/centralization.yml, alongside check:css-vars.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCAN_DIRS = [
  resolve(ROOT, "apps/admin/src"),
  resolve(ROOT, "apps/web/src"),
  resolve(ROOT, "apps/app/src"),
];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const SCAN_EXTS = [".css", ".astro"];

// Exact-match flat tokens — always safe regardless of element type.
const FLAT_TOKENS: Record<string, string> = {
  "10": "--fs-tiny",
  "11": "--fs-eyebrow",
  "12": "--fs-micro",
  "13": "--fs-label",
  "15": "--fs-ui",
};
// --fs-input resolves to a flat 16px, but only on input-like controls —
// elsewhere 16px has no flat non-input token yet.
const INPUT_SELECTOR = /(^|[\s,>+~.#:])(input|select|textarea)(?=[\s,{.:#\[]|$)|-input\b/;

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...listFiles(resolve(dir, entry.name)));
    } else if (entry.isFile() && SCAN_EXTS.some((e) => entry.name.endsWith(e))) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

type Violation = { file: string; line: number; selector: string; value: string; token: string };

/** Every `selector { ...declarations... }` rule in a stylesheet (or an .astro <style> block). */
function findViolations(css: string, file: string): Violation[] {
  const violations: Violation[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css)) !== null) {
    const [, rawSelector, body] = m;
    const selector = rawSelector.trim();
    // Skip @-rules (media queries, keyframes headers, etc.) — not a real selector.
    if (selector.startsWith("@")) continue;
    const fsRe = /font-size\s*:\s*(10|11|12|13|15|16)px\b/g;
    let fm: RegExpExecArray | null;
    while ((fm = fsRe.exec(body)) !== null) {
      const value = fm[1];
      if (value === "16") {
        if (!INPUT_SELECTOR.test(selector)) continue;
        violations.push({ file, line: 0, selector, value, token: "--fs-input" });
      } else {
        violations.push({ file, line: 0, selector, value, token: FLAT_TOKENS[value] });
      }
    }
    if (violations.length && violations[violations.length - 1].line === 0) {
      violations[violations.length - 1].line = css.slice(0, m.index).split("\n").length;
    }
  }
  return violations;
}

function main(): void {
  const violations: Violation[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of listFiles(dir)) {
      violations.push(...findViolations(readFileSync(file, "utf8"), file));
    }
  }

  if (violations.length > 0) {
    console.error("check:magic-fontsize FAILED — literal px matches an existing flat token:\n");
    for (const v of violations) {
      console.error(
        `  ${relative(ROOT, v.file)}:${v.line}  "${v.selector}"` +
          `  font-size: ${v.value}px  →  use var(${v.token})`
      );
    }
    console.error(
      "\nEvery font-size that exactly equals a flat design-system token must use the" +
        " token, not the literal px (packages/design-system/tokens.css). Sizes with no" +
        " exact flat-token match are not flagged here — see ADMIN-DS-PX-1 in BACKLOG.md."
    );
    process.exit(1);
  }

  console.log("check:magic-fontsize OK — no literal font-size duplicates a flat token.");
}

main();
