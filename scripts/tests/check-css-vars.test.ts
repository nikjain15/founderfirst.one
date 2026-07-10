/**
 * Unit + fixture tests for scripts/check-css-vars.ts — the guard born from
 * the PENNY-UX-2 finding (LEARNINGS rule 14): an unresolved `var(--x)` with
 * no fallback silently degrades (radius→0, color→transparent) instead of
 * erroring, so a broken guard here re-opens exactly that hole. Run: `pnpm test:guards`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDefinitions, parseUsages, findUnresolvedCssVars } from "../check-css-vars.ts";

test("parseDefinitions: extracts --name: declarations from a stylesheet", () => {
  const css = `
    :root {
      --ink: #28323f;
      --fs-sm: 13px;
    }
    .card { --local-radius: 8px; }
  `;
  const defs = parseDefinitions(css);
  assert.equal(defs.has("--ink"), true);
  assert.equal(defs.has("--fs-sm"), true);
  assert.equal(defs.has("--local-radius"), true);
  assert.equal(defs.size, 3);
});

test("parseDefinitions: a bare property VALUE that mentions -- is not a definition", () => {
  const defs = parseDefinitions(".x { content: '--not-a-var'; }");
  assert.equal(defs.size, 0);
});

test("parseUsages: flags no-fallback references and records line numbers", () => {
  const text = "line1\n.card { color: var(--ink); }\n";
  const usages = parseUsages(text, "fixture.css");
  assert.equal(usages.length, 1);
  assert.equal(usages[0].name, "--ink");
  assert.equal(usages[0].hasFallback, false);
  assert.equal(usages[0].line, 2);
});

test("parseUsages: a var() with an explicit fallback is marked hasFallback", () => {
  const usages = parseUsages(".x { border-radius: var(--r-sm, 4px); }", "fixture.css");
  assert.equal(usages.length, 1);
  assert.equal(usages[0].hasFallback, true);
});

/** Build a scratch repo shape: packages/design-system/tokens.css + apps/fixture/src. */
function makeFixtureRoot(): { tokensPath: string; appSrc: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "check-css-vars-"));
  mkdirSync(join(root, "packages/design-system"), { recursive: true });
  mkdirSync(join(root, "apps/fixture/src"), { recursive: true });
  return {
    tokensPath: join(root, "packages/design-system/tokens.css"),
    appSrc: join(root, "apps/fixture/src"),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("findUnresolvedCssVars: reproduces the exact PENNY-UX-2 regression (undefined var, no fallback)", () => {
  const { tokensPath, appSrc, cleanup } = makeFixtureRoot();
  try {
    writeFileSync(tokensPath, ":root { --ink: #28323f; }\n");
    writeFileSync(
      join(appSrc, "styles.css"),
      ".card { border-radius: var(--r-sm); }\n" // --r-sm defined nowhere — the PENNY-UX-2 shape
    );

    const { unresolved, checked } = findUnresolvedCssVars(tokensPath, appSrc);
    assert.equal(checked, 1);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].name, "--r-sm");
  } finally {
    cleanup();
  }
});

test("findUnresolvedCssVars: a var with an explicit fallback is never flagged", () => {
  const { tokensPath, appSrc, cleanup } = makeFixtureRoot();
  try {
    writeFileSync(tokensPath, ":root { --ink: #28323f; }\n");
    writeFileSync(join(appSrc, "styles.css"), ".card { border-radius: var(--r-sm, 4px); }\n");

    const { unresolved } = findUnresolvedCssVars(tokensPath, appSrc);
    assert.equal(unresolved.length, 0);
  } finally {
    cleanup();
  }
});

test("findUnresolvedCssVars: a var defined in tokens.css resolves cleanly", () => {
  const { tokensPath, appSrc, cleanup } = makeFixtureRoot();
  try {
    writeFileSync(tokensPath, ":root { --ink: #28323f; --r-sm: 4px; }\n");
    writeFileSync(join(appSrc, "styles.css"), ".card { border-radius: var(--r-sm); }\n");

    const { unresolved } = findUnresolvedCssVars(tokensPath, appSrc);
    assert.equal(unresolved.length, 0);
  } finally {
    cleanup();
  }
});

test("findUnresolvedCssVars: a var defined locally in an app stylesheet also resolves", () => {
  const { tokensPath, appSrc, cleanup } = makeFixtureRoot();
  try {
    writeFileSync(tokensPath, ":root { --ink: #28323f; }\n");
    mkdirSync(join(appSrc, "styles"), { recursive: true });
    writeFileSync(join(appSrc, "styles/local.css"), ":root { --local-radius: 4px; }\n");
    writeFileSync(join(appSrc, "styles.css"), ".card { border-radius: var(--local-radius); }\n");

    const { unresolved } = findUnresolvedCssVars(tokensPath, appSrc);
    assert.equal(unresolved.length, 0);
  } finally {
    cleanup();
  }
});

test("findUnresolvedCssVars: an inline var() reference in a .tsx component is checked too", () => {
  const { tokensPath, appSrc, cleanup } = makeFixtureRoot();
  try {
    writeFileSync(tokensPath, ":root { --ink: #28323f; }\n");
    writeFileSync(
      join(appSrc, "Widget.tsx"),
      `export const Widget = () => <div style={{ color: "var(--missing-accent)" }} />;\n`
    );

    const { unresolved } = findUnresolvedCssVars(tokensPath, appSrc);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].name, "--missing-accent");
  } finally {
    cleanup();
  }
});
