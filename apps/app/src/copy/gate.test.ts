/**
 * The centralization gate itself must not silently rot (card CENTRAL-1). CI runs
 * scripts/check-app-strings.ts against the real tree, which — once centralized —
 * always passes, so a WEAK gate (one that misses a newly-added literal) would go
 * unnoticed and the "zero inline copy" guarantee would be fake.
 *
 * These tests pin the gate's teeth: the dodges a developer would actually use to
 * slip copy past it (multi-line JSX text, single-quoted attributes) MUST be
 * caught, and real code (TS generics, JSX expressions, className) MUST NOT be.
 */
import { describe, expect, it } from "vitest";
import { scanSource } from "../../../../scripts/check-app-strings";

const whys = (src: string) => scanSource(src).map((v) => v.why);
const texts = (src: string) => scanSource(src).map((v) => v.text);

describe("check-app-strings gate soundness (CENTRAL-1)", () => {
  it("catches single-line JSX text copy", () => {
    expect(texts("<h1>Sign in</h1>")).toContain("Sign in");
  });

  it("catches MULTI-LINE JSX text copy (the obvious dodge)", () => {
    const src = ["<p>", "  Welcome back to your books", "</p>"].join("\n");
    expect(texts(src)).toContain("Welcome back to your books");
    expect(whys(src)).toContain("JSX text literal (multi-line)");
  });

  it("catches single-quoted human-facing attributes", () => {
    expect(whys("<input placeholder='Search transactions' />"))
      .toContain("attribute copy literal");
    expect(whys("<button aria-label='Close the menu'>x</button>"))
      .toContain("attribute copy literal");
  });

  it("catches double-quoted human-facing attributes", () => {
    expect(whys('<input placeholder="Search transactions" />'))
      .toContain("attribute copy literal");
  });

  it("does NOT flag TS generics spanning a newline", () => {
    const src = ["const [v, setV] = useState<", "  string", ">(\"\");"].join("\n");
    expect(scanSource(src)).toEqual([]);
  });

  it("does NOT flag arrow-function bodies after a `>`-terminated line", () => {
    const src = ["items.map((r) =>", "  doThing(r)", ")"].join("\n");
    expect(scanSource(src)).toEqual([]);
  });

  it("does NOT flag JSX expressions or technical attributes", () => {
    expect(scanSource('<span className="confidence">{pct}%</span>')).toEqual([]);
    expect(scanSource("<div>{n > 0 ? a : b}</div>")).toEqual([]);
  });
});
