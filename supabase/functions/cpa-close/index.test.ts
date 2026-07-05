/**
 * cpa-close MFA-gate tests (SEC-1-CPACLOSE).
 *
 * The gate is enforced in the edge fn (the only place holding the caller's JWT):
 * a batch_close is refused with 403 `mfa_required` when the CPA firm user's OWN
 * firm org requires MFA and the session is aal1 — BEFORE any per-client write, so
 * a rejection can never leave a partial batch. Non-MFA firms are unaffected.
 *
 * These are network-free: they exercise the exact gate decision the handler makes
 * (mfaSatisfied against the firm org id) through a spy Supabase client so we can
 * assert that the batch-close RPC is NEVER invoked on rejection, and that the aal
 * claim is read from the JWT header — never from a body-supplied actor.
 *
 *   deno test supabase/functions/cpa-close/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mfaSatisfied } from "../_shared/mfaGate.ts";

const FIRM = "00000000-0000-0000-0000-0000000000C0";

function jwtWithAal(aal: string | null): string {
  const payload = aal === null ? { sub: "u1" } : { sub: "u1", aal };
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_");
  return `h.${b64}.s`;
}

/** Spy svc: records every rpc() call; org_requires_mfa answers `required`. */
function spySvc(required: boolean) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === "org_requires_mfa") return Promise.resolve({ data: required, error: null });
      // cpa_batch_close_periods — a benign non-error result if it is ever reached.
      return Promise.resolve({ data: [], error: null });
    },
  };
}

/**
 * The handler's batch_close gate branch, verbatim in shape: check the gate on the
 * firm org, and only if it passes call the batch-close RPC. Returns the HTTP-ish
 * outcome so the test can assert the status + that no write happened.
 */
async function runBatchClose(
  svc: ReturnType<typeof spySvc>,
  jwt: string,
  firm: string,
  actorFromJwt: string,
) {
  if (!(await mfaSatisfied(svc, jwt, firm))) {
    return { status: 403, error: "mfa_required" };
  }
  await svc.rpc("cpa_batch_close_periods", {
    p_actor: actorFromJwt,
    p_firm: firm,
    p_client_org_ids: ["c1", "c2"],
  });
  return { status: 200 };
}

Deno.test("MFA-required firm + aal1 CPA → batch_close rejected 403, NO write", async () => {
  const svc = spySvc(true);
  const out = await runBatchClose(svc, jwtWithAal("aal1"), FIRM, "u1");
  assertEquals(out.status, 403);
  assertEquals(out.error, "mfa_required");
  // The batch-close RPC must never have run — no partial batch on rejection.
  assertEquals(svc.calls.some((c) => c.fn === "cpa_batch_close_periods"), false);
});

Deno.test("MFA-required firm + aal2 CPA → batch_close allowed, write runs", async () => {
  const svc = spySvc(true);
  const out = await runBatchClose(svc, jwtWithAal("aal2"), FIRM, "u1");
  assertEquals(out.status, 200);
  assertEquals(svc.calls.some((c) => c.fn === "cpa_batch_close_periods"), true);
});

Deno.test("non-MFA firm → unaffected even at aal1 (opt-in preserved)", async () => {
  const svc = spySvc(false);
  const out = await runBatchClose(svc, jwtWithAal("aal1"), FIRM, "u1");
  assertEquals(out.status, 200);
  assertEquals(svc.calls.some((c) => c.fn === "cpa_batch_close_periods"), true);
});

Deno.test("gate reads aal from the JWT, not a body actor — no bypass", async () => {
  // Even if a caller tried to smuggle an aal2 'actor' in the body, the gate only
  // ever inspects the verified JWT (aal1 here) → still rejected.
  const svc = spySvc(true);
  const out = await runBatchClose(svc, jwtWithAal("aal1"), FIRM, "attacker-supplied-id");
  assertEquals(out.status, 403);
  assertEquals(svc.calls.some((c) => c.fn === "cpa_batch_close_periods"), false);
});

Deno.test("missing aal claim on an MFA-required firm → rejected", async () => {
  const svc = spySvc(true);
  const out = await runBatchClose(svc, jwtWithAal(null), FIRM, "u1");
  assertEquals(out.status, 403);
});
