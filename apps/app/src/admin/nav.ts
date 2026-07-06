/**
 * Internal admin-console navigation (card IA-3, Phase 0 scaffold). Pure data, so
 * it can be asserted React-free (nav.test.ts) the way the owner/CPA lens nav is.
 *
 * The console mirrors the founderfirst.one/admin IA one-for-one — the SAME four
 * primary jobs + a ⚙️ Settings menu (apps/admin/ADMIN_PRINCIPLES.md: jobs-not-
 * tools, 4–5 fixed tabs). The shell + gate shipped in the scaffold; slice 1
 * (docs/plans/ia-3-admin-console-migration.md §3) wires the FIRST admin-mirror
 * tab — Support — to the SAME `list_tickets` RPC the live admin inbox reads (one
 * source of truth, no fork), alongside the Overview home. The remaining
 * admin-mirror tabs stay honest parallel-run placeholders that link to the
 * still-authoritative live admin. Additive: founderfirst.one/admin is untouched
 * and stays live.
 */

/** Every console tab id. `overview` + `support` are live-wired; the rest mirror
 *  the live admin IA and are parallel-run placeholders in this phase. */
export type ConsoleTabId = "overview" | "support" | "audience" | "analytics" | "penny" | "audit";

export interface ConsoleTab {
  id: ConsoleTabId;
  /** true = wired to real data in this phase; false = parallel-run placeholder. */
  live: boolean;
}

/**
 * Tab order mirrors the live admin's primary nav (Support · Audience · Analytics
 * · Penny), preceded by an Overview home that is the one live-wired module this
 * phase. Labels come from COPY (centralization gate), not from here.
 */
export const CONSOLE_TABS: ConsoleTab[] = [
  { id: "overview", live: true },
  { id: "support", live: true },   // wired to the live admin's list_tickets
  { id: "audience", live: true },  // waitlist via staff_list_waitlist
  { id: "analytics", live: true }, // at-a-glance counts via staff_platform_stats
  { id: "penny", live: true },     // live content surfaces via staff_list_content
  { id: "audit", live: true },     // platform audit log via staff_list_admin_audit
];

/** The tab landed on first. */
export const DEFAULT_CONSOLE_TAB: ConsoleTabId = "overview";

export const isConsoleTab = (id: string): id is ConsoleTabId =>
  CONSOLE_TABS.some((t) => t.id === id);

/** True when a tab renders live data (vs a parallel-run placeholder) this phase. */
export const isTabLive = (id: ConsoleTabId): boolean =>
  CONSOLE_TABS.find((t) => t.id === id)?.live ?? false;

/**
 * The console's access decision, factored out of the component so it can be
 * asserted without a DOM. The DATABASE is the real control (is_platform_staff());
 * this only picks which view the shell shows once we know the answer.
 *   - a non-staff (or absent) result → the "Staff only" wall.
 *   - a staff result → the console.
 */
export type ConsoleView = "console" | "denied";
export const consoleView = (isStaff: boolean): ConsoleView =>
  isStaff ? "console" : "denied";

/**
 * The /admin ROUTE decision, factored out of the AdminRoute wrapper so the
 * fail-closed invariant is asserted without a DOM. The route gate must never
 * render the console until the is_platform_staff() check has RESOLVED true:
 *   - while the check is loading   → "loading" (never the console — fail closed)
 *   - if the check errors          → "error"   (never conflated with "not staff",
 *                                                and never the console)
 *   - resolved, non-staff/absent   → "denied"
 *   - resolved staff               → "console"
 * The DATABASE (is_platform_staff() in every staff RPC) is the real control; a
 * fail-open here would still expose no tenant data, but must not flash the shell.
 */
export type AdminRouteState = { isLoading: boolean; isError: boolean; isStaff: boolean };
export type AdminRouteView = "loading" | "error" | "console" | "denied";
export const adminRouteView = ({ isLoading, isError, isStaff }: AdminRouteState): AdminRouteView =>
  isLoading ? "loading" : isError ? "error" : consoleView(isStaff);
