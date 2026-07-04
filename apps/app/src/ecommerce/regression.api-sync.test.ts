/**
 * REG scenario — W4.1-C/D Square + PayPal API-sync registry ⇄ mapping contract.
 *
 * Finding lineage (docs/AUDIT.md → payout providers, W4.1-C/D): the API pull path
 * must post the EXACT same split as the file-import path and collapse to a single
 * ledger entry per provider payout. The correctness property the whole card rests
 * on is exactly-once: an API-pulled payout and the same payout uploaded via CSV
 * share ONE `ext:<provider>:payout:<id>` key, so post_ecommerce_payout's unique
 * (org_id, idempotency_key) makes the second ingest a no-op.
 *
 * This scenario guards, and cannot silently drift:
 *   1. every commerce connector that declares the `api_sync` capability HAS an
 *      API mapping (square/paypal only) — a capability with no code path would be
 *      a dead "Sync now" action (rubric §9: no dead buttons);
 *   2. the api_sync providers are exactly the sandbox-wired pair (square, paypal)
 *      — Stripe/Shopify/Amazon stay file-import until their own API card lands;
 *   3. ⭐ the API and CSV paths derive the SAME idempotency anchor + the SAME
 *      split for the same payout, to the cent (the exactly-once guarantee).
 *
 * Reads the kernel seed JSON (the committed registry source of truth), same fs
 * pattern as regression.payout-providers.test.ts.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../import/csv";
import { parsePayoutCsv } from "./payouts";
import {
  paypalPayoutToComponents,
  squarePayoutToComponents,
  type ApiSyncProvider,
  type PayPalTransactionApi,
  type SquarePayoutApi,
  type SquarePayoutEntryApi,
} from "./apiSync";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = resolve(__dirname, "../../../../supabase/seeds/kernel/connectors.json");

interface ConnectorSeedRow { key: string; category: string; status: string; capabilities: string[] }
const connectors: ConnectorSeedRow[] = JSON.parse(readFileSync(SEED, "utf8")).rows;
const commerce = connectors.filter((c) => c.category === "commerce");

// The providers this card wires to a read-only sandbox API.
const API_SYNC_PROVIDERS: ApiSyncProvider[] = ["square", "paypal"];

describe("REG W4.1-C/D: api_sync registry ⇄ mapping contract", () => {
  it("declares api_sync on exactly the sandbox-wired providers (square + paypal)", () => {
    const declared = commerce.filter((c) => c.capabilities.includes("api_sync")).map((c) => c.key).sort();
    expect(declared).toEqual(["paypal", "square"]);
  });

  it("every api_sync connector is 'available' and also keeps report_import (no capability regressions)", () => {
    for (const key of API_SYNC_PROVIDERS) {
      const row = commerce.find((c) => c.key === key)!;
      expect(row, `${key} must be a seeded commerce connector`).toBeTruthy();
      expect(row.status).toBe("available");
      expect(row.capabilities).toContain("report_import");
      expect(row.capabilities).toContain("payout_split");
    }
  });

  it("Stripe/Shopify/Amazon are NOT api_sync yet (file-import until their own card)", () => {
    for (const key of ["stripe", "shopify", "amazon"]) {
      const row = commerce.find((c) => c.key === key)!;
      expect(row.capabilities).not.toContain("api_sync");
    }
  });

  it("⭐ Square: API pull and CSV upload of the same payout collapse to one post", () => {
    const payout: SquarePayoutApi = { id: "PO-REG", created_at: "2026-06-30T00:00:00Z", amount_money: { amount: 18179, currency: "USD" } };
    const entries: SquarePayoutEntryApi[] = [
      { type: "CHARGE", gross_amount_money: { amount: 8800 }, fee_amount_money: { amount: -255 } },
      { type: "CHARGE", gross_amount_money: { amount: 13025 }, fee_amount_money: { amount: -378 } },
      { type: "REFUND", gross_amount_money: { amount: -3000 }, fee_amount_money: { amount: 87 } },
      { type: "ADJUSTMENT", gross_amount_money: { amount: -100 }, fee_amount_money: { amount: 0 } },
    ];
    const api = squarePayoutToComponents(payout, entries).components;
    const csvText = [
      `Payout ID,Type,Gross Amount,Fees,Net Amount`,
      `PO-REG,Charge,88.00,-2.55,85.45`,
      `PO-REG,Charge,130.25,-3.78,126.47`,
      `PO-REG,Refund,-30.00,0.87,-29.13`,
      `PO-REG,Adjustment,-1.00,0,-1.00`,
    ].join("\n");
    const csv = parsePayoutCsv("square", "PO-REG", "2026-06-30", "USD", parseCsv(csvText)).components;
    expect(api.payoutId).toBe(csv.payoutId); // same ext:square:payout:PO-REG key
    expect(api.netMinor).toBe(csv.netMinor);
    expect(api.grossMinor).toBe(csv.grossMinor);
    expect(api.feesMinor).toBe(csv.feesMinor);
    expect(api.refundsMinor).toBe(csv.refundsMinor);
    expect(api.adjustMinor).toBe(csv.adjustMinor);
  });

  it("⭐ PayPal: API pull and CSV upload of the same batch share id + split", () => {
    const txns: PayPalTransactionApi[] = [
      { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "50.00", currency_code: "USD" }, fee_amount: { value: "-1.80" } } },
      { transaction_info: { transaction_event_code: "T0006", transaction_amount: { value: "120.00" }, fee_amount: { value: "-3.78" } } },
      { transaction_info: { transaction_event_code: "T1107", transaction_amount: { value: "-20.00" }, fee_amount: { value: "0.70" } } },
      { transaction_info: { transaction_event_code: "T0400", transaction_amount: { value: "-145.12" }, fee_amount: { value: "0" } } },
    ];
    const api = paypalPayoutToComponents("BATCH-REG", "2026-06-30", "USD", txns).components;
    const csvText = [
      `Type,Gross,Fee,Net`,
      `Website Payment,50.00,-1.80,48.20`,
      `Website Payment,120.00,-3.78,116.22`,
      `Refund,-20.00,0.70,-19.30`,
      `General Withdrawal,-145.12,0,-145.12`,
    ].join("\n");
    const csv = parsePayoutCsv("paypal", "BATCH-REG", "2026-06-30", "USD", parseCsv(csvText)).components;
    expect(api.payoutId).toBe(csv.payoutId);
    expect(api.netMinor).toBe(csv.netMinor);
    expect(api.grossMinor).toBe(csv.grossMinor);
    expect(api.feesMinor).toBe(csv.feesMinor);
  });
});
