/**
 * Ledger navigation config — the single source of truth for the per-lens tab sets
 * (APP_PRINCIPLES §2 owner, §3 CPA). Kept as pure data (no React) so the nav can be
 * unit-tested in the node environment and so both lenses project from ONE table
 * instead of each hand-rolling a tab list that could drift.
 */

// Which navigation a lens presents. Owner = plain-language jobs; CPA = accounting
// workflow. The panels underneath are identical — only the nav differs.
export type Nav = "owner" | "cpa";

// Every leaf surface the workspace can show. Both navs route to a subset of these.
export type Surface =
  | "overview" | "review" | "reports" | "connections"
  | "journal" | "accounts" | "import" | "periods";

export type SubTab = { id: Surface; label: string; writeOnly?: boolean };

// A primary tab: either a direct surface (leaf), or a parent with a sub-strip.
// writeOnly tabs render only when the viewer has write access.
export type NavTab = {
  id: string;
  label: string;
  writeOnly?: boolean;
  surface?: Surface;   // leaf tab → renders this surface directly
  subs?: SubTab[];     // parent tab → nested sub-strip
};

// ── Owner lens (APP_PRINCIPLES §2) — Home · Review · Reports · Connections, plus a
//    de-emphasized Advanced (the accountant-grade ledger). Zero accounting
//    vocabulary in the four primary jobs; Journal/CoA/Periods live under Advanced.
export const OWNER_TABS: NavTab[] = [
  { id: "home", label: "Home", surface: "overview" },
  { id: "review", label: "Review", writeOnly: true, surface: "review" },
  { id: "reports", label: "Reports", surface: "reports" },
  { id: "connections", label: "Connections", surface: "connections" },
  {
    id: "advanced", label: "Advanced", subs: [
      { id: "journal", label: "Journal" },
      { id: "accounts", label: "Chart of accounts" },
      { id: "periods", label: "Periods" },
    ],
  },
];

// ── CPA lens (APP_PRINCIPLES §3) — the accounting-workflow nav, unchanged. Kept
//    exactly as it was so the CPA projection does not regress while the owner lens
//    is restructured (IA-1 touches the owner nav only).
export const CPA_TABS: NavTab[] = [
  { id: "overview", label: "Overview", surface: "overview" },
  { id: "categorize", label: "Categorize", writeOnly: true, surface: "review" },
  {
    id: "books", label: "Books", subs: [
      { id: "journal", label: "Journal" },
      { id: "accounts", label: "Accounts" },
      { id: "import", label: "Import", writeOnly: true },
      { id: "periods", label: "Periods" },
    ],
  },
  { id: "reports", label: "Reports", surface: "reports" },
];

export const NAV_TABS: Record<Nav, NavTab[]> = { owner: OWNER_TABS, cpa: CPA_TABS };

/** Visible primary tabs for a lens, hiding write-only tabs for read-only viewers. */
export function visibleTabs(nav: Nav, canWrite: boolean): NavTab[] {
  return NAV_TABS[nav].filter((t) => !t.writeOnly || canWrite);
}

/** Visible sub-tabs of a parent tab, hiding write-only subs for read-only viewers. */
export function visibleSubs(tab: NavTab | undefined, canWrite: boolean): SubTab[] {
  return (tab?.subs ?? []).filter((s) => !s.writeOnly || canWrite);
}

/**
 * Resolve which primary tab OWNS a surface — the "redirect" map that lets an old
 * entry point (e.g. Import, which used to be its own tab) keep working: it now
 * lands on whichever tab hosts that surface (Connections). Returns undefined if no
 * visible tab in this lens exposes the surface.
 */
export function tabForSurface(nav: Nav, surface: Surface, canWrite: boolean): NavTab | undefined {
  const tabs = visibleTabs(nav, canWrite);
  return tabs.find((t) => t.surface === surface)
    ?? tabs.find((t) => visibleSubs(t, canWrite).some((s) => s.id === surface));
}
