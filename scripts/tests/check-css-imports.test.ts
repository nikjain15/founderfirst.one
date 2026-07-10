/**
 * Unit + fixture tests for scripts/check-css-imports.ts — the guard born from
 * PR #66 (LEARNINGS rule 14): a 0-byte or missing `@import`ed CSS partial is
 * silently skipped by the bundler, so a broken guard here is exactly the kind
 * of silent failure the guard exists to prevent. Run: `pnpm test:guards`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseImports,
  isRelativeCssImport,
  findCssImportProblems,
} from "../check-css-imports.ts";

test("parseImports: extracts double-quoted, single-quoted, and url() forms", () => {
  const css = `
    @import "./a.css";
    @import './b.css';
    @import url("./c.css");
    @import url(./d.css);
  `;
  assert.deepEqual(parseImports(css), ["./a.css", "./b.css", "./c.css", "./d.css"]);
});

test("parseImports: returns nothing when there is no @import", () => {
  assert.deepEqual(parseImports(".foo { color: red; }"), []);
});

test("isRelativeCssImport: accepts relative .css paths", () => {
  assert.equal(isRelativeCssImport("./content.css"), true);
  assert.equal(isRelativeCssImport("../shared/signals.css"), true);
});

test("isRelativeCssImport: rejects non-.css, absolute URL, root-absolute, and bare package specifiers", () => {
  assert.equal(isRelativeCssImport("tailwindcss"), false);
  assert.equal(isRelativeCssImport("https://fonts.googleapis.com/css"), false);
  assert.equal(isRelativeCssImport("http://example.com/x.css"), false);
  assert.equal(isRelativeCssImport("/absolute/x.css"), false);
  assert.equal(isRelativeCssImport("@ff/design-system/tokens.css"), false);
});

/** Build a scratch dir under apps/<name>/src the way the real repo is laid out. */
function makeFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "check-css-imports-"));
  mkdirSync(join(root, "apps/fixture/src/styles"), { recursive: true });
  return root;
}

test("findCssImportProblems: reproduces the exact PR #66 regression (0-byte partial)", () => {
  const root = makeFixtureRoot();
  try {
    writeFileSync(
      join(root, "apps/fixture/src/styles/styles.css"),
      `@import "./content.css";\n`
    );
    writeFileSync(join(root, "apps/fixture/src/styles/content.css"), ""); // truncated to 0 bytes

    const { problems, checked } = findCssImportProblems(root, ["apps"]);
    assert.equal(checked, 1);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^0 BYTES.*content\.css/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findCssImportProblems: flags a missing @import target", () => {
  const root = makeFixtureRoot();
  try {
    writeFileSync(
      join(root, "apps/fixture/src/styles/styles.css"),
      `@import "./gone.css";\n`
    );

    const { problems, checked } = findCssImportProblems(root, ["apps"]);
    assert.equal(checked, 0); // never resolved, so never counted as "checked"
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^MISSING.*gone\.css/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findCssImportProblems: a healthy import chain reports zero problems", () => {
  const root = makeFixtureRoot();
  try {
    writeFileSync(
      join(root, "apps/fixture/src/styles/styles.css"),
      `@import "./content.css";\n@import "tailwindcss";\n`
    );
    writeFileSync(
      join(root, "apps/fixture/src/styles/content.css"),
      ".content { color: var(--ink); }\n"
    );

    const { problems, checked } = findCssImportProblems(root, ["apps"]);
    assert.equal(problems.length, 0);
    assert.equal(checked, 1); // the bare "tailwindcss" import is skipped, not counted
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
