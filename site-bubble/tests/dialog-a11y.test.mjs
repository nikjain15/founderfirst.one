/**
 * Guards the widget dialog's keyboard accessibility (weekly audit PR #301,
 * site-bubble P2): the `.penny-panel` had no Escape-to-close and no focus
 * trap, so keyboard users had no way to dismiss it without a mouse, and Tab
 * could wander into the host page behind a widget with no backdrop of its
 * own.
 *
 * Also guards `bubble/src/index.js` (source) against drifting from
 * `worker/src/bubble-js.ts` (the built bundle the Worker actually serves) —
 * the same drift class the audit flagged for the stale-bundle P1 and the
 * disclosure P2 (see disclosure.test.mjs). The bundled check is a substring
 * check, not a syntax match, because `npm run build` minifies the source
 * (strips whitespace, renames locals) but always preserves string literals.
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

test("dialog closes on Escape", () => {
  assert.match(source, /key === "Escape"/, "onPanelKeyDown must check e.key === \"Escape\"");
  assert.match(source, /closePanel\(\)/, "Escape must call the same close path as the × button");
});

test("dialog traps Tab focus among its own focusable elements", () => {
  assert.match(source, /key !== "Tab"/, "onPanelKeyDown must handle Tab");
  assert.match(source, /shiftKey/, "Tab handling must branch on Shift+Tab (backward) vs Tab (forward)");
  assert.match(source, /getRootNode\(\)\.activeElement/, "must read activeElement via the shadow root, not document");
});

test("the dialog container wires the keyboard handler", () => {
  assert.match(source, /penny-panel[\s\S]{0,120}onKeyDown=\$\{onPanelKeyDown\}/, "role=\"dialog\" .penny-panel must have onKeyDown wired");
});

test("built bundle (worker/src/bubble-js.ts) isn't stale relative to source's Escape/focus-trap code", () => {
  assert.ok(
    bundled.includes("Escape") && bundled.includes("Tab"),
    "worker/src/bubble-js.ts is missing the Escape/Tab handling present in bubble/src/index.js — " +
      "rebuild via `npm run deploy` (or `npm run sync`) in site-bubble/worker before merging"
  );
});
