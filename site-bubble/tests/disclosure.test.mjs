/**
 * Guards the widget's in-chat privacy disclosure (LEARNINGS #8: retention has
 * a privacy cost — disclose it, and offer erasure). Found stale by the weekly
 * audit (PR #301): the disclosure said only "saved to help Penny get better",
 * with no retention length or erasure path.
 *
 * Also guards against `bubble/src/index.js` (source) and
 * `worker/src/bubble-js.ts` (the built bundle the Worker actually serves)
 * drifting apart — exactly the class of bug found in this same audit pass
 * for `system-prompt.ts` vs `penny-site-system.md` (a generated file going
 * stale relative to its source because a rebuild step was skipped).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const source = readFileSync(resolve(root, "bubble/src/index.js"), "utf8");
const bundled = readFileSync(resolve(root, "worker/src/bubble-js.ts"), "utf8");

function extractDisclosure(text) {
  const match = text.match(/penny-privacy["'][^>]*>([\s\S]*?)<\/div>/);
  return match ? match[1] : null;
}

test("widget discloses a retention length", () => {
  const disclosure = extractDisclosure(source);
  assert.ok(disclosure, "could not find the .penny-privacy disclosure block");
  assert.match(disclosure, /\d+\s*days/, "disclosure must state how long conversations are kept");
});

test("widget discloses an erasure path", () => {
  const disclosure = extractDisclosure(source);
  assert.match(disclosure, /mailto:|founder@founderfirst\.one/, "disclosure must offer a way to request deletion");
});

test("widget disclosure has no exclamation marks (VOICE.md)", () => {
  const disclosure = extractDisclosure(source);
  assert.ok(!disclosure.includes("!"), "VOICE.md forbids exclamation marks");
});

test("built worker bundle carries the same disclosure copy as the source (no stale rebuild)", () => {
  assert.ok(
    bundled.includes("auto-deleted after 90 days"),
    "worker/src/bubble-js.ts is out of sync with bubble/src/index.js — rerun `npm run build` in bubble/ then `npm run sync` in worker/"
  );
});
