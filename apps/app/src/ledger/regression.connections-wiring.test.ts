/**
 * PENNY-UX-10 regression — the Connections restructure must not un-wire any handler.
 *
 * The declutter pass regrouped the Connections mega-scroll into four clusters
 * (get-data-in · sell-channels · money-in/out · sharing). That is layout/hierarchy
 * only: every connect / upload / toggle surface, and the callback props that fire
 * their handlers, must stay present. This source-scan test locks that invariant so a
 * future edit (or a bad merge of this one) can't silently drop a surface or its
 * wiring — the exact "⛔ MUST NOT break any existing functionality" gate on the card.
 *
 * It reads the Ledger.tsx source (where the owner Connections view is defined) and
 * asserts each handler-bearing sub-component is still rendered inside `Connections`
 * with the callback prop that carries its action. No DOM — a static contract.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LEDGER = fileURLToPath(new URL("./Ledger.tsx", import.meta.url));
const src = readFileSync(LEDGER, "utf8");

/** Isolate the `Connections` component body so we assert on IT, not the whole file
 *  (e.g. ImportFlow is also rendered under the Advanced `import` surface). */
function connectionsBody(text: string): string {
  const start = text.indexOf("function Connections(");
  expect(start, "Connections component must exist in Ledger.tsx").toBeGreaterThan(-1);
  // Its body ends at the next top-level `// ── Overview` banner (the following fn).
  const end = text.indexOf("// ── Overview", start);
  expect(end, "could not bound the Connections component body").toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("PENNY-UX-10 · Connections handlers stay wired after the declutter", () => {
  const body = connectionsBody(src);

  it("renders the four grouped clusters (no new top-level nav)", () => {
    for (const cluster of ["clusterGetData", "clusterSellChannels", "clusterMoney", "clusterSharing"]) {
      expect(body, `Connections is missing the ${cluster} cluster`).toContain(`COPY.connections.${cluster}`);
    }
  });

  it("keeps every connect / import / upload / toggle surface rendered", () => {
    for (const surface of [
      "CatchUpFlow",   // catch-up guided import
      "ImportFlow",    // CSV upload + bank/software connect + opening balances
      "PayoutUpload",  // payout split (Stripe/Shopify/PayPal/Square/Amazon)
      "Invoicing",     // getting paid (invoice) + bill-tracking-style toggle
      "Bills",         // paying bills / AP tracking toggle
      "InviteCpa",     // share with accountant
    ]) {
      expect(body, `Connections no longer renders <${surface}>`).toContain(`<${surface}`);
    }
  });

  it("preserves the action callbacks that fire the handlers", () => {
    // CatchUpFlow — completion + reconcile routing.
    expect(body).toMatch(/<CatchUpFlow[^>]*onDone=/s);
    expect(body).toMatch(/<CatchUpFlow[^>]*onReconcile=/s);
    // ImportFlow — the import-committed callback (routes to the journal + refreshes).
    expect(body).toMatch(/<ImportFlow[^>]*onDone=\{onImported\}/s);
    // Share-with-accountant — the owner-only invite affordance is still gated on onInvite.
    expect(body).toContain("onInvite ? (");
    expect(body).toMatch(/<InviteCpa\s+orgId=\{orgId\}/);
  });

  it("passes canWrite through so read-only viewers are still gated server-side + in UI", () => {
    for (const surface of ["PayoutUpload", "Invoicing", "Bills"]) {
      expect(body, `<${surface}> lost its canWrite prop`).toMatch(new RegExp(`<${surface}[^>]*canWrite=\\{canWrite\\}`, "s"));
    }
  });
});
