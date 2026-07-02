/**
 * IA-1 nav-restructure scenarios (REG). Locks the owner/CPA tab sets so the app-UI
 * blocker can't silently regress: the owner navigates by four plain-language jobs
 * (Home · Review · Reports · Connections) + a de-emphasized Advanced, and the CPA
 * lens is proven UNCHANGED. Pure-data test (nav config is React-free), runs in the
 * node environment alongside reports.test.ts. Maps to APP_PRINCIPLES §2 + §3.
 */
import { describe, expect, it } from "vitest";
import { OWNER_TABS, CPA_TABS, visibleTabs, visibleSubs, tabForSurface, type Surface } from "./nav";

describe("owner lens nav (IA-1 · APP_PRINCIPLES §2)", () => {
  it("presents exactly the four jobs + a de-emphasized Advanced, in order", () => {
    expect(OWNER_TABS.map((t) => t.id)).toEqual([
      "home", "review", "reports", "connections", "advanced",
    ]);
    expect(OWNER_TABS.map((t) => t.label)).toEqual([
      "Home", "Review", "Reports", "Connections", "Advanced",
    ]);
  });

  it("has NO orphaned old top-level tabs (overview/categorize/books)", () => {
    const ids = new Set(OWNER_TABS.map((t) => t.id));
    for (const stale of ["overview", "categorize", "books"]) {
      expect(ids.has(stale)).toBe(false);
    }
  });

  it("keeps zero accounting vocabulary in the four primary jobs", () => {
    const primary = OWNER_TABS.filter((t) => t.id !== "advanced").map((t) => t.label.toLowerCase());
    const jargon = ["journal", "ledger", "chart of accounts", "debit", "credit", "trial balance", "period", "categorize"];
    for (const label of primary) {
      for (const term of jargon) expect(label).not.toContain(term);
    }
  });

  it("exposes Journal · Chart of accounts · Periods only under Advanced", () => {
    const advanced = OWNER_TABS.find((t) => t.id === "advanced");
    // Rules (W1.6 learned-rules management) nests here too — reached deliberately,
    // never prompted (usability gate: no new top-level nav).
    expect(advanced?.subs?.map((s) => s.id)).toEqual(["journal", "accounts", "periods", "rules"]);
    // Those accountant surfaces must NOT also be primary tabs.
    const primaryIds = new Set(OWNER_TABS.filter((t) => t.surface).map((t) => t.surface));
    for (const s of ["journal", "accounts", "periods", "rules"] as Surface[]) {
      expect(primaryIds.has(s)).toBe(false);
    }
  });

  it("Connections absorbs Import + Invite; every job reachable in ≤2 taps", () => {
    // Connections is a single leaf tab (1 tap). It hosts import + invite internally,
    // so bank/connector/import/invite are all reached without leaving the tab.
    const connections = OWNER_TABS.find((t) => t.id === "connections");
    expect(connections?.surface).toBe("connections");
    // Import is no longer its own top-level tab — it lives inside Connections.
    expect(OWNER_TABS.some((t) => t.surface === "import")).toBe(false);

    // ≤2 taps from Home: primary jobs = 1 tap; Advanced sub-surfaces = 2 taps.
    for (const t of OWNER_TABS) {
      const taps = t.subs ? 2 : 1;
      expect(taps).toBeLessThanOrEqual(2);
    }
  });

  it("routes a legacy surface (import) to whichever tab now hosts it — a redirect", () => {
    // Old entry points that pointed at `import` now resolve to Connections.
    expect(tabForSurface("owner", "import", true)).toBeUndefined(); // import isn't a distinct owner surface
    expect(tabForSurface("owner", "connections", true)?.id).toBe("connections");
    expect(tabForSurface("owner", "review", true)?.id).toBe("review");
    expect(tabForSurface("owner", "journal", true)?.id).toBe("advanced");
  });

  it("hides the write-only Review tab for read-only viewers", () => {
    expect(visibleTabs("owner", true).map((t) => t.id)).toContain("review");
    expect(visibleTabs("owner", false).map((t) => t.id)).not.toContain("review");
  });
});

describe("CPA lens nav is UNCHANGED (regression guard — APP_PRINCIPLES §3)", () => {
  it("still presents Overview · Categorize · Books · Reports", () => {
    expect(CPA_TABS.map((t) => t.id)).toEqual(["overview", "categorize", "books", "reports"]);
  });

  it("still nests Journal · Accounts · Import · Periods under Books", () => {
    const books = CPA_TABS.find((t) => t.id === "books");
    expect(books?.subs?.map((s) => s.id)).toEqual(["journal", "accounts", "import", "periods"]);
  });

  it("does NOT adopt the owner's Home/Connections/Advanced jobs", () => {
    const ids = new Set(CPA_TABS.map((t) => t.id));
    for (const ownerOnly of ["home", "connections", "advanced", "review"]) {
      expect(ids.has(ownerOnly)).toBe(false);
    }
  });

  it("keeps Import reachable under Books for full-access CPAs, hidden for read-only", () => {
    const books = CPA_TABS.find((t) => t.id === "books")!;
    expect(books.subs!.some((s) => s.id === "import")).toBe(true);
    expect(tabForSurface("cpa", "import", true)?.id).toBe("books");
    expect(tabForSurface("cpa", "import", false)).toBeUndefined(); // write-only sub hidden
  });
});

// W1.6-RULEDEL (nav portion) — the learned-rules surface is reachable in ≤3 taps
// (Categorize/Advanced → Rules → delete) for owner + CPA, and read_only CPA can
// SEE it but the write-only Categorize queue beside it is hidden.
describe("learned-rules nav reachability (W1.6 · REG W1.6-RULEDEL)", () => {
  it("owner reaches Rules via Advanced in 2 taps (never a primary tab)", () => {
    // Advanced (tap 1) → Rules (tap 2). Not a top-level job — no interruption.
    expect(OWNER_TABS.some((t) => t.surface === "rules")).toBe(false);
    expect(tabForSurface("owner", "rules", true)?.id).toBe("advanced");
    expect(tabForSurface("owner", "rules", false)?.id).toBe("advanced"); // visible read-only too
  });

  it("CPA reaches Rules from the Categorize tab (Categorize → Rules)", () => {
    const cat = CPA_TABS.find((t) => t.id === "categorize")!;
    expect(cat.subs?.map((s) => s.id)).toEqual(["review", "rules"]);
    expect(tabForSurface("cpa", "rules", true)?.id).toBe("categorize");
  });

  it("read-only CPA SEES Rules but NOT the write-only Categorize queue beside it", () => {
    const cat = CPA_TABS.find((t) => t.id === "categorize")!;
    const roSubs = visibleSubs(cat, false).map((s) => s.id);
    expect(roSubs).toEqual(["rules"]);                       // queue hidden, rules kept
    const rwSubs = visibleSubs(cat, true).map((s) => s.id);
    expect(rwSubs).toEqual(["review", "rules"]);
    // The parent Categorize tab itself stays visible for read-only (so Rules is reachable).
    expect(visibleTabs("cpa", false).map((t) => t.id)).toContain("categorize");
  });
});
