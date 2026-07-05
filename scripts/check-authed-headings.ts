/**
 * check-authed-headings — guard the PENNY-UX-9 (authed IA/design) regression class.
 *
 * The authed-surface standard (packages/design-system/README.md → "Authed
 * surfaces", CLAUDE.md → "No hardcoding") is: every authed page leads with
 * `.eyebrow` + `.page-title` (+ optional `.page-sub`) from
 * packages/design-system/components/typography.css — NEVER a *bare* <h1>.
 *
 * A bare <h1> — one WITHOUT `className="page-title"` (or a class list containing
 * `page-title`) — inherits the public billboard scale (the browser default /
 * marketing <h1> is sized up to 64px) and breaks the restrained authed heading
 * ladder platform-wide. The build stays green; only the page silently renders a
 * giant heading. This is the same silent-drift family as check:css-vars and
 * check:app-strings (LEARNINGS rule 14 — guard the silent failure modes).
 *
 * This script scans every .tsx under apps/app/src and fails if any <h1> does not
 * carry the `page-title` class. `.page-title` is the ONLY sanctioned h1 styling
 * on an authed surface; anything else is a bare (billboard) h1.
 *
 * Run: `pnpm check:authed-headings` (or `tsx scripts/check-authed-headings.ts`).
 * CI: .github/workflows/centralization.yml, alongside check:css-vars /
 * check:app-strings — same authed-conformance guard family.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const APP_SRC = resolve(ROOT, "apps/app/src");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...listTsx(resolve(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      out.push(resolve(dir, entry.name));
    }
  }
  return out;
}

type Bad = { file: string; line: number; text: string };

/**
 * Blank out comment bodies (JSX `{/* … *​/}`, block `/* … *​/`, and line `//…`)
 * while preserving newlines, so a `<h1>` mentioned inside a comment (e.g. the
 * "never a bare <h1>" note in Login.tsx) doesn't register as a real tag. Line
 * numbers stay accurate because only the comment interior is replaced.
 */
function stripComments(text: string): string {
  return text
    // Block and JSX-wrapped block comments — keep newlines inside.
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    // Line comments — to end of line (won't touch // inside strings/URLs enough
    // to matter for an <h1> scan; conservative and newline-safe by construction).
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/** Every <h1 …> opening tag whose class list does NOT include `page-title`. */
function findBareH1(raw: string, file: string): Bad[] {
  const bad: Bad[] = [];
  const text = stripComments(raw);
  // Match an <h1 opening tag and capture its attributes up to the closing `>`.
  const re = /<h1(\s[^>]*)?>/g;
  const lineOf = (idx: number) => text.slice(0, idx).split("\n").length;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const attrs = m[1] ?? "";
    // Sanctioned only if a className contains the `page-title` token. We look for
    // `page-title` as a whole class token inside any className/class attribute.
    const classMatch = attrs.match(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/);
    const classList = classMatch ? (classMatch[1] ?? classMatch[2] ?? classMatch[3] ?? "") : "";
    const hasPageTitle = /(^|\s)page-title(\s|$)/.test(classList);
    if (!hasPageTitle) {
      bad.push({ file, line: lineOf(m.index), text: m[0] });
    }
  }
  return bad;
}

function main(): void {
  const files = listTsx(APP_SRC);
  const bad: Bad[] = [];
  let h1s = 0;
  for (const file of files) {
    const src = stripComments(readFileSync(file, "utf8"));
    const found = findBareH1(readFileSync(file, "utf8"), file);
    // Count total real h1s for the OK summary line (bare + sanctioned).
    const total = (src.match(/<h1(\s[^>]*)?>/g) ?? []).length;
    h1s += total;
    bad.push(...found);
  }

  if (bad.length > 0) {
    console.error("check:authed-headings FAILED — bare <h1> on authed surfaces:\n");
    for (const b of bad) {
      console.error(`  ${relative(ROOT, b.file)}:${b.line}  ${b.text.trim()}`);
    }
    console.error(
      '\nEvery authed <h1> must carry className="page-title" (the restrained authed' +
        " heading scale) and be preceded by an .eyebrow. A bare <h1> inherits the" +
        " public billboard scale (up to 64px). Lead the page with .eyebrow +" +
        " .page-title from packages/design-system/components/typography.css."
    );
    process.exit(1);
  }

  console.log(
    `check:authed-headings OK — ${h1s} <h1> across ${files.length} files` +
      ` all carry .page-title (no bare billboard headings).`
  );
}

main();
