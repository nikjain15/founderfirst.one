/**
 * CONN-2 — prove the `intuit_tid` response header is captured on both the
 * success and error path of a QBO API call (Intuit's recommended support-trace
 * field). Network is stubbed (globalThis.fetch); no live QBO calls.
 *
 *   deno test --allow-env supabase/functions/_shared/qbo.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { intuitTid, qboQuery, INTUIT_TID_HEADER, mapQboAccountType, revokeToken, QBO_CONFIG_DEFAULTS } from "./qbo.ts";

// A fast cfg (no real waits) for the retry/backoff tests.
const FAST = { ...QBO_CONFIG_DEFAULTS, qbo_backoff_base_ms: 0, qbo_backoff_max_ms: 0, qbo_max_retries: 3 };

/** Queue-driven fetch stub: pops one scripted response per call. */
function stubFetchSeq(seq: Array<{ status: number; tid?: string | null; body?: unknown }>) {
  const realFetch = globalThis.fetch;
  let i = 0;
  const calls: Array<{ url: string; auth: string | null }> = [];
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get("Authorization");
    calls.push({ url: String(url), auth });
    const step = seq[Math.min(i, seq.length - 1)];
    i++;
    const headers = new Headers();
    if (step.tid) headers.set(INTUIT_TID_HEADER, step.tid);
    return Promise.resolve(new Response(JSON.stringify(step.body ?? {}), { status: step.status, headers }));
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = realFetch; }, count: () => i, calls };
}

function stubFetch(status: number, tid: string | null, body: unknown) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, _init?: RequestInit) => {
    const headers = new Headers();
    if (tid) headers.set(INTUIT_TID_HEADER, tid);
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
  }) as typeof fetch;
  return () => { globalThis.fetch = realFetch; };
}

Deno.test("intuitTid: reads the header off a Response", () => {
  const res = new Response(null, { headers: { [INTUIT_TID_HEADER]: "trace-123" } });
  assertEquals(intuitTid(res), "trace-123");
  assertEquals(intuitTid(new Response(null)), null);
});

Deno.test("qboQuery success path: tid is forwarded to onTid", async () => {
  const restore = stubFetch(200, "trace-success-1", { QueryResponse: {} });
  try {
    let seen: string | null = null;
    await qboQuery("123", "select * from Account", "tok", (tid) => { seen = tid; });
    assertEquals(seen, "trace-success-1");
  } finally { restore(); }
});

Deno.test("qboQuery error path: tid is forwarded to onTid AND included in the thrown error", async () => {
  // 500 now retries; with FAST cfg (0 backoff) it exhausts then throws.
  const s = stubFetchSeq([{ status: 500, tid: "trace-error-9", body: { Fault: "boom" } }]);
  try {
    let seen: string | null = null;
    let threw: Error | null = null;
    try {
      await qboQuery("123", "select * from Account", "tok", { onTid: (tid) => { seen = tid; }, cfg: FAST });
    } catch (e) {
      threw = e as Error;
    }
    assertEquals(seen, "trace-error-9");
    assertEquals(threw !== null, true);
    assertEquals(threw!.message.includes("trace-error-9"), true);
  } finally { s.restore(); }
});

Deno.test("qboQuery: a missing intuit_tid header reports null, never throws", async () => {
  const restore = stubFetch(200, null, { QueryResponse: {} });
  try {
    let called = false;
    let seen: string | null = "unset";
    await qboQuery("123", "select * from Account", "tok", (tid) => { called = true; seen = tid; });
    assertEquals(called, true);
    assertEquals(seen, null);
  } finally { restore(); }
});

// ── IQ-1: retry + backoff on 429/5xx ─────────────────────────────────────────
Deno.test("IQ-1 429 → backoff → success: retries the throttled call then returns", async () => {
  const s = stubFetchSeq([
    { status: 429, tid: "t1" },
    { status: 429, tid: "t2" },
    { status: 200, tid: "t3", body: { QueryResponse: { Account: [] } } },
  ]);
  try {
    const out = await qboQuery("123", "select * from Account", "tok", { cfg: FAST });
    assertEquals(s.count(), 3);                 // two 429s + one success
    assertEquals(out.QueryResponse.Account.length, 0);
  } finally { s.restore(); }
});

Deno.test("IQ-1 backoff is BOUNDED: exhausts qbo_max_retries then throws (no infinite loop)", async () => {
  const s = stubFetchSeq([{ status: 503 }]); // always 5xx
  try {
    let threw = false;
    try { await qboQuery("123", "q", "tok", { cfg: FAST }); } catch { threw = true; }
    assertEquals(threw, true);
    // initial attempt + qbo_max_retries retries = 1 + 3 = 4 fetches, then gives up.
    assertEquals(s.count(), FAST.qbo_max_retries + 1);
  } finally { s.restore(); }
});

// ── IQ-1: reactive refresh-on-401 ────────────────────────────────────────────
Deno.test("IQ-1 401 → refresh → retry: one 401 triggers a single refresh then succeeds with the new token", async () => {
  const s = stubFetchSeq([
    { status: 401 },                                            // stale access token
    { status: 200, body: { QueryResponse: { Account: [] } } },  // succeeds after refresh
  ]);
  try {
    let refreshCount = 0;
    await qboQuery("123", "q", "old-tok", {
      cfg: FAST,
      refresh: async () => { refreshCount++; return "new-tok"; },
    });
    assertEquals(refreshCount, 1);                     // refreshed exactly once
    assertEquals(s.count(), 2);
    assertEquals(s.calls[1].auth, "Bearer new-tok");   // retry used the fresh token
  } finally { s.restore(); }
});

Deno.test("IQ-1 401 refresh is NOT a loop: a second 401 after refresh fails fast (no repeated refresh)", async () => {
  const s = stubFetchSeq([{ status: 401 }]); // always 401, even after refresh
  try {
    let refreshCount = 0;
    let threw = false;
    try {
      await qboQuery("123", "q", "old-tok", { cfg: FAST, refresh: async () => { refreshCount++; return "new-tok"; } });
    } catch { threw = true; }
    assertEquals(threw, true);
    assertEquals(refreshCount, 1);   // refreshed once, then gave up — no refresh loop
    assertEquals(s.count(), 2);      // original + one post-refresh retry
  } finally { s.restore(); }
});

// ── IQ-1: revoke ─────────────────────────────────────────────────────────────
Deno.test("IQ-1 revokeToken: POSTs to Intuit, true on 200, false on failure", async () => {
  const ok = stubFetchSeq([{ status: 200 }]);
  try { assertEquals(await revokeToken("rt"), true); } finally { ok.restore(); }
  const bad = stubFetchSeq([{ status: 400 }]);
  try { assertEquals(await revokeToken("rt"), false); } finally { bad.restore(); }
});

// ── IQ-1: unknown classification does NOT silently become 'expense' ──────────
Deno.test("IQ-1 mapQboAccountType: known classifications map correctly", () => {
  assertEquals(mapQboAccountType("Asset"), "asset");
  assertEquals(mapQboAccountType("Liability"), "liability");
  assertEquals(mapQboAccountType("Equity"), "equity");
  assertEquals(mapQboAccountType("Revenue"), "income");
  assertEquals(mapQboAccountType("Expense"), "expense");
});

Deno.test("IQ-1 mapQboAccountType: an UNKNOWN classification returns null (never silent 'expense')", () => {
  assertEquals(mapQboAccountType("SomethingNew"), null);
  assertEquals(mapQboAccountType(""), null);
  assertEquals(mapQboAccountType(undefined as unknown as string), null);
});
