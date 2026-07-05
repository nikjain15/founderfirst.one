/**
 * Ledger navigation config — the single source of truth for the per-lens tab sets
 * (APP_PRINCIPLES §2 owner, §3 CPA). Kept as pure data (no React) so the nav can be
 * unit-tested in the node environment and so both lenses project from ONE table
 * instead of each hand-rolling a tab list that could drift.
 *
 * Tab labels come from the strings catalog (COPY.tabs) — the single source of
 * user-facing copy (card CENTRAL-1) — not inline literals.
 */
import { COPY } from "../copy";

// Which navigation a lens presents. Owner = plain-language jobs; CPA = accounting
// workflow. The panels underneath are identical — only the nav differs.
export type Nav = "owner" | "cpa";

// Every leaf surface the workspace can show. Both navs route to a subset of these.
export type Surface =
  | "overview" | "review" | "reports" | "connections"
  | "journal" | "accounts" | "import" | "periods" | "rules" | "reconcile" | "filing";

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
  { id: "home", label: COPY.tabs.home, surface: "overview" },
  { id: "review", label: COPY.tabs.review, writeOnly: true, surface: "review" },
  { id: "reports", label: COPY.tabs.reports, surface: "reports" },
  { id: "connections", label: COPY.tabs.connections, surface: "connections" },
  {
    // Learned rules live under Advanced for the owner — reachable, never prompted
    // (W1.6 usability gate: no new top-level nav, no interruption).
    id: "advanced", label: COPY.tabs.advanced, subs: [
      { id: "journal", label: COPY.tabs.journal },
      { id: "accounts", label: COPY.tabs.chartOfAccounts },
      { id: "reconcile", label: COPY.tabs.reconcile },
      { id: "periods", label: COPY.tabs.periods },
      { id: "rules", label: COPY.tabs.rules },
      // The return worksheet (RV2-A1) — an owner can SEE their return take shape,
      // nested under Advanced (not a new top-level job) per APP_PRINCIPLES §2.
      { id: "filing", label: COPY.tabs.filing },
    ],
  },
];

// ── CPA lens (APP_PRINCIPLES §3) — the accounting-workflow nav, unchanged. Kept
//    exactly as it was so the CPA projection does not regress while the owner lens
//    is restructured (IA-1 touches the owner nav only).
export const CPA_TABS: NavTab[] = [
  { id: "overview", label: COPY.tabs.overview, surface: "overview" },
  {
    // Categorize is now a parent so "Categorize → Rules" is one tap over (W1.6).
    // The Categorize queue itself is write-only (read-only CPAs can't approve),
    // but Rules is visible to read-only CPAs too (they can SEE, not delete) — so
    // the parent tab is NOT writeOnly; only the queue sub is.
    id: "categorize", label: COPY.tabs.categorize, subs: [
      { id: "review", label: COPY.tabs.categorize, writeOnly: true },
      { id: "rules", label: COPY.tabs.rules },
    ],
  },
  {
    id: "books", label: COPY.tabs.books, subs: [
      { id: "journal", label: COPY.tabs.journal },
      { id: "accounts", label: COPY.tabs.accounts },
      { id: "import", label: COPY.tabs.import, writeOnly: true },
      { id: "reconcile", label: COPY.tabs.reconcile },
      { id: "periods", label: COPY.tabs.periods },
    ],
  },
  { id: "reports", label: COPY.tabs.reports, surface: "reports" },
  // Filing (RV2-A1) — "review the return before filing" is a core CPA job, so it is a
  // top-level workflow tab in the CPA lens (owners reach the same surface via Advanced).
  { id: "filing", label: COPY.tabs.filing, surface: "filing" },
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

/**
 * Map a requested surface to one the current viewer can actually reach.
 *
 * The CPA practice queue routes uncategorized→`review` and unreconciled→`import`,
 * but both of those tabs are WRITE-ONLY (a read_only engagement can't categorize or
 * import). For a read_only CPA those surfaces are hidden, so a raw deep-link would
 * land nowhere and the "View" button would silently do nothing. Read_only CPAs must
 * still be able to open the client's books to LOOK at the item — the write-path
 * refuses the mutation server-side regardless (ARCHITECTURE §4.3). So when the exact
 * surface isn't visible, fall back to `journal`: the read-only ledger view where the
 * uncategorized entry / imported rows are visible. Returns undefined only if nothing
 * in the lens is reachable at all.
 */
export function reachableSurface(nav: Nav, surface: Surface, canWrite: boolean): Surface | undefined {
  if (tabForSurface(nav, surface, canWrite)) return surface;
  if (tabForSurface(nav, "journal", canWrite)) return "journal";
  const first = visibleTabs(nav, canWrite)[0];
  return first?.surface ?? first?.subs?.[0]?.id;
}
