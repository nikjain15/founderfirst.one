/**
 * Internal admin console — Support tab wiring (card IA-3, slice 1).
 *
 * Coverage delta for ledger row `ia3-console` (slice 1). The app's vitest runs in
 * the node environment (no DOM), so these lock the load-bearing invariants of the
 * Support tab without a renderer:
 *   1. the tab reads the SAME `list_tickets` RPC the live founderfirst.one/admin
 *      inbox reads — ONE source of truth, not a forked/duplicate data path;
 *   2. the console's Support ticket shape mirrors the live admin's TicketRow
 *      (no schema drift between the two surfaces);
 *   3. the console renders only inside the staff gate (consoleView), and the
 *      Support tab is honestly live-wired (not a fake placeholder);
 *   4. no bare <h1> anywhere in the console shell (authed-header standard — the
 *      title is `.page-title`, never a billboard <h1>).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CONSOLE_TABS, consoleView, isTabLive } from "./nav";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");

// ── 1 + 2 · the Support hook reads the admin's list_tickets RPC ───────────────
describe("console Support tab · reads the SAME source as the live admin inbox", () => {
  it("names the live admin's list_tickets RPC — one source of truth, no fork", () => {
    const api = read("../staff/api.ts");
    // The console must call the SAME RPC the admin inbox calls
    // (apps/admin/src/lib/supabase.ts → listTickets → rpc("list_tickets")).
    expect(api).toContain('rpc("list_tickets"');
    expect(api).toContain("p_status");
    // And must NOT define its own tickets table read / duplicate query path.
    expect(api).not.toMatch(/from\(["']support_tickets["']\)/);
  });

  it("mirrors the live admin's TicketRow shape (status/priority/channel unions)", () => {
    const api = read("../staff/api.ts");
    for (const field of [
      "status", "priority", "channel", "subject", "first_message",
      "contact_email", "contact_discord", "topic", "created_at",
      "updated_at", "message_count",
    ]) {
      expect(api).toContain(field);
    }
    expect(api).toContain('"open" | "in_progress" | "resolved" | "closed"');
  });
});

// ── 3 · gate + honest live-wiring ─────────────────────────────────────────────
describe("console Support tab · staff-gated and honestly live (not a stub)", () => {
  it("is one of the live-wired tabs this slice", () => {
    expect(isTabLive("support")).toBe(true);
    expect(CONSOLE_TABS.find((t) => t.id === "support")?.live).toBe(true);
  });

  it("renders only inside the staff gate (non-staff is denied the whole console)", () => {
    expect(consoleView(false)).toBe("denied");
    expect(consoleView(true)).toBe("console");
  });
});

// ── 4 · no bare <h1> in the console shell (authed-header standard) ─────────────
describe("console shell · authed-header standard (never a bare <h1>)", () => {
  it("uses .page-title, not an unclassed <h1> billboard", () => {
    const shell = read("./AdminConsole.tsx");
    // The one <h1> present must carry the .page-title class (design-system rule).
    const h1s = shell.match(/<h1[^>]*>/g) ?? [];
    for (const tag of h1s) {
      expect(tag).toContain('className="page-title"');
    }
  });
});
