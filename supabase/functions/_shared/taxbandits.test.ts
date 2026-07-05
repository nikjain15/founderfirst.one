/**
 * Network-free tests for the TaxBandits 1099-NEC client (EFILE-A1 spike).
 * Every provider call is mocked; the pure mappers are exercised directly. These
 * pin the TRUST GATE: payload maps from the W2.5 roll-up, TIN-match gates send,
 * a reject is ingested (never swallowed), and no-creds → dry-run (no fake
 * success).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAuthJws,
  buildNecPayload,
  buildTinMatchPayload,
  classifyAck,
  classifyTinMatch,
  formatEin,
  formatSsn,
  getAccessToken,
  type NecSummaryRow,
  readTaxBanditsConfig,
  type VendorFiling,
} from "./taxbandits.ts";

function row(over: Partial<NecSummaryRow> = {}): NecSummaryRow {
  return {
    vendor_id: "11111111-1111-1111-1111-111111111111",
    vendor_name: "Acme Contracting",
    is_1099_eligible: true,
    w9_on_file: true,
    tax_id_type: "ein",
    tax_id_last4: "6789",
    reportable_minor: 250000, // $2,500
    excluded_minor: 0,
    payment_count: 3,
    threshold_minor: 60000, // $600
    meets_threshold: true,
    ...over,
  };
}

// ── env / creds ───────────────────────────────────────────────────────────────
Deno.test("readTaxBanditsConfig: absent creds → null (dry-run signal, not error)", () => {
  assertEquals(readTaxBanditsConfig({ get: () => undefined }), null);
});
Deno.test("readTaxBanditsConfig: partial creds → null (half-configured must not look live)", () => {
  const env = new Map([["TAXBANDITS_CLIENT_ID", "x"], ["TAXBANDITS_CLIENT_SECRET", "y"]]);
  assertEquals(readTaxBanditsConfig({ get: (k) => env.get(k) }), null);
});
Deno.test("readTaxBanditsConfig: full creds default to SANDBOX urls", () => {
  const env = new Map([
    ["TAXBANDITS_CLIENT_ID", "cid"],
    ["TAXBANDITS_CLIENT_SECRET", "sec"],
    ["TAXBANDITS_USER_TOKEN", "tok"],
  ]);
  const cfg = readTaxBanditsConfig({ get: (k) => env.get(k) })!;
  assert(cfg.authUrl.includes("testoauth"));
  assert(cfg.apiBase.includes("testapi"));
});

// ── TIN formatting ────────────────────────────────────────────────────────────
Deno.test("formatEin / formatSsn dash the 9-digit TIN", () => {
  assertEquals(formatEin("123456789"), "12-3456789");
  assertEquals(formatSsn("123456789"), "123-45-6789");
});

// ── payload maps from the roll-up ────────────────────────────────────────────
Deno.test("buildNecPayload maps a threshold-meeting vendor from the summary", () => {
  const filings = new Map<string, VendorFiling>([[
    row().vendor_id,
    { vendor_id: row().vendor_id, full_tin: "123456789", is_business: true, business_name: "Acme LLC", address1: "1 St", city: "Austin", state: "TX", zip: "78701" },
  ]]);
  const { request, included, notReady } = buildNecPayload(2025, { businessName: "Payer Co", ein: "987654321" }, [row()], filings);
  assertEquals(included, [row().vendor_id]);
  assertEquals(notReady, []);
  assertEquals(request.ReturnData.length, 1);
  assertEquals(request.ReturnData[0].NECFormData.B1NEC, 2500); // $2,500 from 250000 minor
  assertEquals(request.ReturnData[0].Recipient.TIN, "12-3456789");
  assertEquals(request.ReturnHeader.Business.EIN, "98-7654321");
});

Deno.test("buildNecPayload skips below-threshold vendors (not required filings)", () => {
  const under = row({ meets_threshold: false, reportable_minor: 10000 });
  const { included, skippedBelowThreshold } = buildNecPayload(2025, { businessName: "P" }, [under], new Map());
  assertEquals(included, []);
  assertEquals(skippedBelowThreshold, [under.vendor_id]);
});

Deno.test("buildNecPayload flags not-ready (missing TIN/address/W9) — nothing looks file-ready when it isn't", () => {
  const { notReady, request } = buildNecPayload(2025, { businessName: "P" }, [row({ w9_on_file: false })], new Map());
  assertEquals(notReady.length, 1);
  assert(notReady[0].reasons.includes("missing_tin"));
  assert(notReady[0].reasons.includes("missing_address"));
  assert(notReady[0].reasons.includes("no_w9_on_file"));
  // dry-run payload still builds, but TIN is null (never synthesized).
  assertEquals(request.ReturnData[0].Recipient.TIN, null);
});

// ── TIN match gating ─────────────────────────────────────────────────────────
Deno.test("buildTinMatchPayload excludes vendors without a full TIN (can't match what you don't have)", () => {
  const withTin = row();
  const noTin = row({ vendor_id: "22222222-2222-2222-2222-222222222222", vendor_name: "NoTIN Co" });
  const filings = new Map<string, VendorFiling>([[withTin.vendor_id, { vendor_id: withTin.vendor_id, full_tin: "123456789" }]]);
  const { request, missingTin } = buildTinMatchPayload([withTin, noTin], filings);
  assertEquals(request.Recipients.length, 1);
  assertEquals(missingTin, [noTin.vendor_id]);
});

Deno.test("classifyTinMatch: only explicit MATCH counts; MISMATCH/pending block", () => {
  const resp = {
    RequestId: "req-1",
    Recipients: [
      { RecordId: "a", TINMatchStatus: "MATCHED" },
      { RecordId: "b", TINMatchStatus: "TIN_MISMATCH" },
      { RecordId: "c", TINMatchStatus: "PENDING" },
    ],
  };
  const r = classifyTinMatch(resp);
  assertEquals(r.matched, ["a"]);
  assertEquals(r.mismatched.sort(), ["b", "c"]);
  assertEquals(r.requestId, "req-1");
});

// ── ack classification — reject is NEVER swallowed ───────────────────────────
Deno.test("classifyAck: top-level Errors → rejected (not success)", () => {
  const r = classifyAck({ StatusCode: 200, SubmissionId: "s1", Errors: [{ Code: "R001", Message: "bad EIN" }] });
  assertEquals(r.outcome, "rejected");
  assertEquals(r.errors.length, 1);
});
Deno.test("classifyAck: per-record Errors → rejected", () => {
  const r = classifyAck({ StatusCode: 200, SubmissionId: "s1", ReturnData: [{ RecordId: "x", Errors: [{ Message: "TIN mismatch" }] }] });
  assertEquals(r.outcome, "rejected");
});
Deno.test("classifyAck: non-2xx status → error, never accepted", () => {
  assertEquals(classifyAck({ StatusCode: 400 }).outcome, "error");
  assertEquals(classifyAck({ StatusCode: 500, SubmissionId: "s" }).outcome, "error");
});
Deno.test("classifyAck: Status REJECTED surfaced as rejected", () => {
  assertEquals(classifyAck({ StatusCode: 200, SubmissionId: "s", Status: "REJECTED" }).outcome, "rejected");
});
Deno.test("classifyAck: created (200 + SubmissionId, no terminal status) = submitted, NOT accepted", () => {
  assertEquals(classifyAck({ StatusCode: 200, SubmissionId: "s" }).outcome, "submitted");
});
Deno.test("classifyAck: explicit ACCEPTED → accepted", () => {
  assertEquals(classifyAck({ StatusCode: 200, SubmissionId: "s", Status: "ACCEPTED" }).outcome, "accepted");
});
Deno.test("classifyAck: empty/garbage response → error, never accepted", () => {
  assertEquals(classifyAck(null).outcome, "error");
  assertEquals(classifyAck({}).outcome, "error");
});

// ── auth JWS + token exchange (mocked fetch) ─────────────────────────────────
Deno.test("buildAuthJws produces a 3-part HS256 JWS with the right claims", async () => {
  const cfg = { clientId: "cid", clientSecret: "sec", userToken: "utok", authUrl: "x", apiBase: "y" };
  const jws = await buildAuthJws(cfg, 1516239022);
  const parts = jws.split(".");
  assertEquals(parts.length, 3);
  const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  assertEquals(payload, { iss: "cid", sub: "cid", aud: "utok", iat: 1516239022 });
});

Deno.test("getAccessToken returns the token on 200", async () => {
  const cfg = { clientId: "c", clientSecret: "s", userToken: "u", authUrl: "https://auth", apiBase: "y" };
  const fake = ((_url: string) => Promise.resolve(new Response(JSON.stringify({ StatusCode: 200, AccessToken: "AT" }), { status: 200 }))) as typeof fetch;
  assertEquals(await getAccessToken(cfg, fake, () => 1), "AT");
});

Deno.test("getAccessToken throws (fail-loud) on a non-200 / missing token — never silently succeeds", async () => {
  const cfg = { clientId: "c", clientSecret: "s", userToken: "u", authUrl: "https://auth", apiBase: "y" };
  const fake = (() => Promise.resolve(new Response(JSON.stringify({ StatusCode: 401 }), { status: 401 }))) as typeof fetch;
  let threw = false;
  try { await getAccessToken(cfg, fake, () => 1); } catch { threw = true; }
  assert(threw, "expected auth failure to throw, not return a token");
});
