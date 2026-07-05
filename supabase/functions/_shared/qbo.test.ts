/**
 * CONN-2 — prove the `intuit_tid` response header is captured on both the
 * success and error path of a QBO API call (Intuit's recommended support-trace
 * field). Network is stubbed (globalThis.fetch); no live QBO calls.
 *
 *   deno test --allow-env supabase/functions/_shared/qbo.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { intuitTid, qboQuery, INTUIT_TID_HEADER } from "./qbo.ts";

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
  const restore = stubFetch(500, "trace-error-9", { Fault: "boom" });
  try {
    let seen: string | null = null;
    let threw: Error | null = null;
    try {
      await qboQuery("123", "select * from Account", "tok", (tid) => { seen = tid; });
    } catch (e) {
      threw = e as Error;
    }
    assertEquals(seen, "trace-error-9");
    assertEquals(threw !== null, true);
    assertEquals(threw!.message.includes("trace-error-9"), true);
  } finally { restore(); }
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
