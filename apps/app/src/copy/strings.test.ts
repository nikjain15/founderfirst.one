/**
 * Strings catalog integrity (card CENTRAL-1). The catalog is the single source of
 * owner/CPA-facing copy; these tests keep it honest and on brand (VOICE.md).
 */
import { describe, expect, it } from "vitest";
import { COPY } from "./strings";

// Recursively collect every string this catalog can render — resolving function
// leaves with representative args so their output is checked too.
function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") { out.push(node); return out; }
  if (typeof node === "function") {
    // Call with a spread of harmless args; catalog fns take (number|string|bool).
    let r: unknown;
    try { r = (node as (...a: unknown[]) => unknown)(1, "x", true); } catch { return out; }
    // Fn may return a string or an { before, after, … } fragment object.
    if (typeof r === "string") out.push(r);
    else if (r && typeof r === "object") {
      for (const v of Object.values(r as Record<string, unknown>)) {
        if (typeof v === "string") out.push(v);
      }
    }
    return out;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) collectStrings(v, out);
  }
  return out;
}

describe("apps/app strings catalog (CENTRAL-1)", () => {
  const all = collectStrings(COPY);

  it("is non-trivial (the whole app's copy lives here)", () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it("contains no exclamation marks (VOICE.md hard rule — machine-enforced)", () => {
    const offenders = all.filter((s) => s.includes("!"));
    expect(offenders).toEqual([]);
  });

  it("never names the underlying technology (VOICE.md)", () => {
    const banned = /\b(chatgpt|openai|anthropic|claude|gpt-4|llm)\b/i;
    const offenders = all.filter((s) => banned.test(s));
    expect(offenders).toEqual([]);
  });

  it("uses American English spellings (no British variants) in owner copy", () => {
    // A light guard on the common ones VOICE.md calls out.
    const british = /\b(categorised|organised|colour|behaviour|analyse|cancelled)\b/i;
    const offenders = all.filter((s) => british.test(s));
    expect(offenders).toEqual([]);
  });

  it("keeps the nav labels stable (IA-1 owner nav — no drift)", () => {
    // These exact labels are asserted by ledger/nav.test.ts; catch drift here too.
    expect(COPY.tabs.home).toBe("Home");
    expect(COPY.tabs.review).toBe("Review");
    expect(COPY.tabs.reports).toBe("Reports");
    expect(COPY.tabs.connections).toBe("Connections");
    expect(COPY.tabs.advanced).toBe("Advanced");
  });
});
