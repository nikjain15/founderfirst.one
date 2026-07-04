/**
 * Internal admin console — nav + access-gate scenarios (card IA-3, Phase 0).
 * Pure-data, React-free (the app's vitest runs in the node environment), so this
 * locks the console IA and the staff gate without a DOM:
 *   - the console mirrors the live admin's four primary jobs + Overview home;
 *   - exactly ONE tab is live-wired this phase (the rest are parallel-run
 *     placeholders that link to the still-authoritative founderfirst.one/admin);
 *   - a non-staff result is denied the console; a staff result sees it.
 * Coverage delta for ledger row IA-3 (docs/plans/ia-3-admin-console-migration.md §6).
 */
import { describe, expect, it } from "vitest";
import {
  CONSOLE_TABS, DEFAULT_CONSOLE_TAB, consoleView, isConsoleTab, isTabLive, type ConsoleTabId,
} from "./nav";
import { COPY } from "../copy";
import { SITE } from "@ff/site";

describe("admin console nav (IA-3 · mirrors the live admin IA)", () => {
  it("presents Overview + the four admin jobs, in order", () => {
    expect(CONSOLE_TABS.map((t) => t.id)).toEqual([
      "overview", "support", "audience", "analytics", "penny",
    ]);
  });

  it("mirrors the live admin's four primary tab labels exactly (no drift)", () => {
    // Support · Audience · Analytics · Penny — the founderfirst.one/admin nav.
    expect(COPY.console.tabs.support).toBe("Support");
    expect(COPY.console.tabs.audience).toBe("Audience");
    expect(COPY.console.tabs.analytics).toBe("Analytics");
    expect(COPY.console.tabs.penny).toBe("Penny");
  });

  it("has a label for every tab id", () => {
    for (const t of CONSOLE_TABS) {
      expect(COPY.console.tabs[t.id]).toBeTruthy();
    }
  });

  it("lands on Overview, and Overview is the ONE live-wired tab this phase", () => {
    expect(DEFAULT_CONSOLE_TAB).toBe("overview");
    expect(isTabLive("overview")).toBe(true);
    const live = CONSOLE_TABS.filter((t) => t.live).map((t) => t.id);
    expect(live).toEqual(["overview"]);
  });

  it("keeps every admin-job tab a parallel-run placeholder (not fake-live)", () => {
    for (const id of ["support", "audience", "analytics", "penny"] as ConsoleTabId[]) {
      expect(isTabLive(id)).toBe(false);
    }
  });

  it("recognizes valid tab ids and rejects unknown ones", () => {
    expect(isConsoleTab("overview")).toBe(true);
    expect(isConsoleTab("settings")).toBe(false);
    expect(isConsoleTab("nope")).toBe(false);
  });
});

describe("admin console access gate (IA-3 · staff-only)", () => {
  it("denies the console to a non-staff session", () => {
    expect(consoleView(false)).toBe("denied");
  });

  it("shows the console to a platform-staff session", () => {
    expect(consoleView(true)).toBe("console");
  });
});

describe("admin console — additive parallel-run (never break the live admin)", () => {
  it("links placeholders to the live founderfirst.one/admin (single source of truth)", () => {
    expect(SITE.adminUrl).toBe("https://founderfirst.one/admin");
    // The placeholder copy names the live admin as still authoritative.
    expect(COPY.console.placeholder.body("Support")).toContain("live");
  });

  it("copy carries no exclamation marks and never names the tech (VOICE.md)", () => {
    const strings = [
      COPY.console.title, COPY.console.sub, COPY.console.staffChip,
      COPY.console.overview.breakGlassNote, COPY.console.placeholder.body("Analytics"),
      COPY.console.denied.body,
    ];
    for (const s of strings) {
      expect(s).not.toContain("!");
      expect(s).not.toMatch(/\b(chatgpt|openai|anthropic|claude|gpt-4|llm)\b/i);
    }
  });
});
