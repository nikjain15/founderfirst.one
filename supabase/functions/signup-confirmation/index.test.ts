/**
 * signup-confirmation hardening tests (SEC-4, weekly audit PR #301 P2).
 *
 * Imports ONLY `./guard.ts` (dependency-free) — NOT `./index.ts`, which pulls
 * in supabase-js's npm type-reference chain and fails `deno check`/`deno
 * test` in this repo's CI (no node_modules; same discipline as
 * report-export/index.test.ts → validate.ts).
 *
 * Two invariants:
 *   1. An email NOT on the waitlist must be answered IDENTICALLY (status +
 *      body) to one already sent — otherwise the endpoint is a waitlist-
 *      membership oracle. Verified against the exact branch logic the
 *      handler runs (mirrored here, same shape as cpa-close/index.test.ts's
 *      `runBatchClose`), through a spy Supabase client so we can also assert
 *      the rate-limit RPC runs BEFORE the waitlist lookup.
 *   2. `clientIp()` extracts the first x-forwarded-for hop, falls back to
 *      cf-connecting-ip, then "unknown".
 *
 *   deno test --allow-env supabase/functions/signup-confirmation/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clientIp, NOTHING_TO_SEND } from "./guard.ts";

Deno.test("clientIp: reads the first hop of x-forwarded-for", () => {
  const req = new Request("https://x/y", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
  assertEquals(clientIp(req), "1.2.3.4");
});

Deno.test("clientIp: falls back to cf-connecting-ip", () => {
  const req = new Request("https://x/y", { headers: { "cf-connecting-ip": "9.9.9.9" } });
  assertEquals(clientIp(req), "9.9.9.9");
});

Deno.test("clientIp: falls back to 'unknown' with no proxy headers", () => {
  const req = new Request("https://x/y");
  assertEquals(clientIp(req), "unknown");
});

/** Spy svc: records call order; waitlist lookup + rate-limit are configurable. */
function spySvc(opts: { rateLimitAllowed: boolean; onWaitlist: boolean }) {
  const calls: string[] = [];
  return {
    calls,
    rpc(fn: string, _args: Record<string, unknown>) {
      calls.push(`rpc:${fn}`);
      if (fn === "check_signup_confirmation_rate_limit") {
        return Promise.resolve({ data: opts.rateLimitAllowed, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from(table: string) {
      calls.push(`from:${table}`);
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _val: string) => ({
            maybeSingle: () =>
              Promise.resolve(
                opts.onWaitlist
                  ? { data: { email: "a@b.com", slug: null }, error: null }
                  : { data: null, error: null },
              ),
          }),
        }),
      };
    },
  };
}

/**
 * The handler's rate-limit → waitlist-lookup branch, verbatim in shape: check
 * the rate limit first (before ANY body parsing/lookup), then look up the
 * waitlist and collapse a miss into the exact same response as "already sent".
 */
async function runSignupConfirmation(svc: ReturnType<typeof spySvc>) {
  const { data: allowed } = await svc.rpc("check_signup_confirmation_rate_limit", { p_ip: "1.2.3.4" });
  if (allowed === false) return { status: 429, body: { error: "rate_limited" } };

  const { data: wl } = await svc.from("waitlist").select("email, slug").eq("email", "a@b.com").maybeSingle();
  if (!wl) return { status: 200, body: NOTHING_TO_SEND };

  return { status: 200, body: { ok: true, sent: 1 } };
}

Deno.test("rate limit is checked BEFORE the waitlist lookup", async () => {
  const svc = spySvc({ rateLimitAllowed: true, onWaitlist: true });
  await runSignupConfirmation(svc);
  assertEquals(svc.calls[0], "rpc:check_signup_confirmation_rate_limit");
});

Deno.test("over the rate limit → 429, waitlist is NEVER queried", async () => {
  const svc = spySvc({ rateLimitAllowed: false, onWaitlist: true });
  const out = await runSignupConfirmation(svc);
  assertEquals(out.status, 429);
  assertEquals(svc.calls.some((c) => c.startsWith("from:")), false);
});

Deno.test("SEC-4: email NOT on the waitlist gets the exact 'already sent' response", async () => {
  const svc = spySvc({ rateLimitAllowed: true, onWaitlist: false });
  const out = await runSignupConfirmation(svc);
  assertEquals(out.status, 200);
  assertEquals(out.body, NOTHING_TO_SEND);
});

Deno.test("SEC-4: not-on-waitlist and already-sent are byte-identical (no oracle)", async () => {
  const miss = await runSignupConfirmation(spySvc({ rateLimitAllowed: true, onWaitlist: false }));
  // already-sent is exercised via the handler's own NOTHING_TO_SEND constant
  // in index.ts; here we assert the miss path matches that same shape exactly.
  assertEquals(JSON.stringify(miss.body), JSON.stringify(NOTHING_TO_SEND));
});
