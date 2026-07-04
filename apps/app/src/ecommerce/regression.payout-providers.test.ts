/**
 * REG scenario — W4.1-B payout-provider registry ⇄ parser contract.
 *
 * Finding lineage (docs/AUDIT.md → F11 / PENNY-UX-8): W4.1 shipped PayPal /
 * Square / Amazon as disabled "coming soon" tiles — registry rows existed with
 * no parser behind them. W4.1-B closes that by making the tiles LIVE, and the
 * enablement rule became: connector row status='available' AND a parser
 * registered in PAYOUT_PARSERS (PayoutUpload.tsx derives tiles from these two
 * registries, never a hardcoded provider list — CENTRAL-2).
 *
 * This scenario guards the contract both ways so it can't silently drift:
 *   1. every commerce connector seeded 'available' HAS a report parser — an
 *      available row without a parser would render a dead tile (rubric §9:
 *      no dead buttons);
 *   2. every registered parser IS a seeded commerce connector — a parser for an
 *      unregistered key would be rejected by post_ecommerce_payout's
 *      unknown_provider guard at post time (a dead END of flow);
 *   3. the per-payout idempotency anchor (`ext:<provider>:payout:<id>`) is
 *      deterministic per provider — the property the RPC's unique
 *      (org_id, idempotency_key) collision relies on to make re-import a no-op.
 *
 * Reads the kernel seed JSON straight from supabase/seeds/kernel (the committed
 * source of truth the registry deploys from) — same fs pattern as nav.test.ts.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { componentsFromRows, hasPayoutParser, PAYOUT_PARSERS, parsePayoutCsv } from "./payouts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(__dirname, "../../../../supabase/seeds/kernel/connectors.json");

interface ConnectorSeedRow { key: string; category: string; status: string; capabilities: string[] }
const connectors: ConnectorSeedRow[] = JSON.parse(readFileSync(SEED, "utf8")).rows;
const commerce = connectors.filter((c) => c.category === "commerce");

describe("REG W4.1-B: commerce registry ⇄ parser contract", () => {
  it("seeds all five major providers as commerce connectors", () => {
    expect(commerce.map((c) => c.key).sort()).toEqual(["amazon", "paypal", "shopify", "square", "stripe"]);
  });

  it("every commerce connector seeded 'available' has a report parser (no dead tiles)", () => {
    const available = commerce.filter((c) => c.status === "available");
    expect(available.length).toBeGreaterThan(0);
    for (const c of available) {
      expect(hasPayoutParser(c.key), `available connector '${c.key}' has no parser — its tile would be dead`).toBe(true);
      expect(c.capabilities).toContain("report_import");
    }
  });

  it("every registered parser is a seeded commerce connector (post RPC would reject the rest)", () => {
    const keys = new Set(commerce.map((c) => c.key));
    for (const parserKey of Object.keys(PAYOUT_PARSERS)) {
      expect(keys.has(parserKey), `parser '${parserKey}' has no connector seed row — posting would fail unknown_provider`).toBe(true);
    }
  });

  it("the idempotency anchor is deterministic per provider (re-import is a no-op upstream)", () => {
    for (const key of Object.keys(PAYOUT_PARSERS)) {
      const c = componentsFromRows(key as keyof typeof PAYOUT_PARSERS, "po_reg", "2026-06-30", "USD", [
        { kind: "sale", amountMinor: 1000 },
      ]);
      expect(`ext:${c.provider}:payout:${c.payoutId}`).toBe(`ext:${key}:payout:po_reg`);
    }
  });

  it("split polarity invariant holds for EVERY provider: fees and refunds reduce the net", () => {
    // provider-agnostic property the whole card protects — checked through the
    // shared math every parser feeds
    for (const key of Object.keys(PAYOUT_PARSERS) as (keyof typeof PAYOUT_PARSERS)[]) {
      const saleOnly = componentsFromRows(key, "p", "2026-06-30", "USD", [{ kind: "sale", amountMinor: 10000 }]);
      const withCosts = componentsFromRows(key, "p", "2026-06-30", "USD", [
        { kind: "sale", amountMinor: 10000 },
        { kind: "fee", amountMinor: 300 },
        { kind: "refund", amountMinor: 1500 },
      ]);
      expect(withCosts.netMinor).toBe(saleOnly.netMinor - 300 - 1500);
      expect(withCosts.grossMinor).toBe(withCosts.feesMinor + withCosts.refundsMinor + withCosts.netMinor);
    }
  });

  it("an unregistered provider is rejected at parse time (never a silent empty split)", () => {
    expect(() =>
      parsePayoutCsv("etsy" as never, "x", "2026-06-30", "USD", { headers: ["type", "amount"], rows: [] }),
    ).toThrow(/no report parser/);
  });
});
