/**
 * Internal admin-console navigation (card IA-3, Phase 0 scaffold). Pure data, so
 * it can be asserted React-free (nav.test.ts) the way the owner/CPA lens nav is.
 *
 * The console mirrors the founderfirst.one/admin IA one-for-one — the SAME four
 * primary jobs + a ⚙️ Settings menu (apps/admin/ADMIN_PRINCIPLES.md: jobs-not-
 * tools, 4–5 fixed tabs). This scaffold ships the shell and gate; per the
 * migration plan (docs/plans/ia-3-admin-console-migration.md §3) exactly ONE
 * read-only tab (Overview) is wired to real data to prove the React-Query rail,
 * and the four admin-mirror tabs are honest parallel-run placeholders that link
 * to the still-authoritative live admin. Additive: founderfirst.one/admin is
 * untouched and stays live.
 */

/** Every console tab id. `overview` is the live-wired module; the four job tabs
 *  mirror the live admin IA and are parallel-run placeholders in this phase. */
export type ConsoleTabId = "overview" | "support" | "audience" | "analytics" | "penny";

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
  { id: "support", live: false },
  { id: "audience", live: false },
  { id: "analytics", live: false },
  { id: "penny", live: false },
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
