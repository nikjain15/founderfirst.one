/**
 * PENNY-UX-9 design-conformance ledger (REG). The second, post-Wave-2 pass over
 * the authed IA (APP_PRINCIPLES §2/§3) asserts the founderfirst.one/admin standard
 * as code invariants, so a future edit can't silently reintroduce a billboard <h1>
 * or an inline hex on an authed surface. Complements nav.test.ts (which locks the
 * per-lens tab SETS) — this locks the per-page DESIGN pattern.
 *
 * Source-scanning test (no DOM) — mirrors the CI guards check:authed-headings +
 * check:css-vars, kept here too so the app suite fails locally before CI.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url)); // apps/app/src
const SKIP = new Set(["node_modules", "dist"]);

function walk(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      out.push(...walk(`${dir}/${e.name}`, ext));
    } else if (e.name.endsWith(ext) && !e.name.endsWith(".test.ts") && !e.name.endsWith(".test.tsx")) {
      out.push(`${dir}/${e.name}`);
    }
  }
  return out;
}

/** Blank out comment interiors (JSX/block/line) so `<h1>` or `#fff` mentioned in a
 *  comment doesn't count as real code. Newline-preserving for accurate reporting. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

describe("PENNY-UX-9 authed design conformance (APP_PRINCIPLES §2/§3 · /admin standard)", () => {
  const tsx = walk(SRC, ".tsx");

  it("has no bare <h1> — every authed heading carries .page-title", () => {
    const offenders: string[] = [];
    for (const file of tsx) {
      const text = stripComments(readFileSync(file, "utf8"));
      const re = /<h1(\s[^>]*)?>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const attrs = m[1] ?? "";
        const cls = attrs.match(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/);
        const list = cls ? (cls[1] ?? cls[2] ?? cls[3] ?? "") : "";
        if (!/(^|\s)page-title(\s|$)/.test(list)) {
          offenders.push(`${file.replace(SRC, "")}: ${m[0]}`);
        }
      }
    }
    expect(offenders, `bare <h1> (billboard scale) on authed surfaces:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("inlines no hex colors in components or app CSS — all color from tokens.css", () => {
    const offenders: string[] = [];
    for (const file of [...tsx, ...walk(SRC, ".css")]) {
      const text = stripComments(readFileSync(file, "utf8"));
      // A COLOR hex appears in a styling context: as a CSS value (`prop: #hex`) or
      // inside a JSX style value. Requiring a preceding `:` (optionally spaced)
      // filters out non-color hashes — URL fragments (`href="#foo"`) and ticket
      // refs in strings (`"ticket #1234"`), which are never in a `:` value slot.
      const re = /:\s*#([0-9a-fA-F]{3,8})\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if ([3, 4, 6, 8].includes(m[1].length)) {
          offenders.push(`${file.replace(SRC, "")}: #${m[1]}`);
        }
      }
    }
    expect(offenders, `inline hex on authed surfaces (use a tokens.css var):\n${offenders.join("\n")}`).toEqual([]);
  });
});
