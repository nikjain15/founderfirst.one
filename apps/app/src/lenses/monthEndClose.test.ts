/**
 * Firm-level month-end close — client-side copy + config contract (card RV2-C1).
 * The batch close, readiness, and cross-tenant isolation are server-authoritative
 * and covered by the SQL/REG scenario (rv2_c1_cpa_month_end_close_test.sql). Here
 * we lock the pieces that live in the browser: every blocker/result label resolves
 * to non-empty copy (no row/banner can render blank), the copy obeys VOICE.md (no
 * exclamation marks), and the SLA threshold is a config default, not a magic
 * number baked into a component.
 */
import { describe, expect, it } from "vitest";
import { COPY } from "../copy";
import { CONFIG_DEFAULTS } from "../copy/config";

const C = COPY.monthEnd;

describe("month-end close copy contract", () => {
  const BLOCKERS = ["uncategorized", "unreconciled", "pending_review", "open_flags"] as const;

  it("every blocker kind resolves to a non-empty label", () => {
    for (const k of BLOCKERS) expect(C.blocker[k], k).toBeTruthy();
  });

  it("the mode toggle and headings are present", () => {
    for (const s of [C.modeQueue, C.modeClose, C.eyebrow, C.title, C.intro]) {
      expect(s).toBeTruthy();
    }
  });

  it("count/result strings render for singular and plural", () => {
    expect(C.closeSelected(1)).toContain("1");
    expect(C.closeSelected(3)).toContain("3");
    expect(C.resultClosed(1)).toContain("1");
    expect(C.resultClosed(2)).toContain("2");
    expect(C.docBadge(1)).toContain("1");
  });

  it("obeys VOICE.md — no exclamation marks in any month-end string", () => {
    const strings: string[] = [];
    for (const v of Object.values(C)) {
      if (typeof v === "string") strings.push(v);
      else if (typeof v === "function") {
        try { const r = (v as (...a: unknown[]) => unknown)(2, "x"); if (typeof r === "string") strings.push(r); } catch { /* labelled fns */ }
      } else if (v && typeof v === "object") {
        for (const s of Object.values(v)) if (typeof s === "string") strings.push(s);
      }
    }
    for (const s of strings) expect(s, s).not.toContain("!");
  });
});

describe("close SLA config", () => {
  it("close_sla_days is a config default (not a magic number in code)", () => {
    expect(CONFIG_DEFAULTS.close_sla_days).toBeGreaterThan(0);
    // Must match the platform_config seed in the migration (baked-fallback rule).
    expect(CONFIG_DEFAULTS.close_sla_days).toBe(10);
  });
});
