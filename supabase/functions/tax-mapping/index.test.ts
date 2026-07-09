/**
 * tax-mapping handler tests. Network-free: exercises the exact gate + dispatch
 * decisions the handler makes (MFA gate, required-field validation, RPC forwarding)
 * through a spy Supabase client, mirroring cpa-close/index.test.ts. The CPA-role
 * gate (can_edit_tax_map_as) and line-integrity check live in the RPC itself
 * (pgTAP-covered, tax_mapping_engine_test.sql §5/§5b) — not re-tested here.
 *
 *   deno test supabase/functions/tax-mapping/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mfaSatisfied } from "../_shared/mfaGate.ts";

const ORG = "00000000-0000-0000-0000-0000000000b1";

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
      if (fn === "set_account_tax_line") return Promise.resolve({ data: "new-map-id", error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

/** The handler's set_line branch, verbatim in shape: MFA gate, then validate,
 *  then forward to the RPC with the actor taken from the verified JWT — never
 *  the body. Returns the HTTP-ish outcome so tests can assert status + calls. */
async function runSetLine(
  svc: ReturnType<typeof spySvc>,
  jwt: string,
  actorFromJwt: string,
  body: { org_id?: string; account_id?: string; form_code?: string; line_key?: string },
) {
  const orgId = String(body?.org_id ?? "");
  if (!orgId) return { status: 400, error: "bad_org" };
  if (!(await mfaSatisfied(svc, jwt, orgId))) return { status: 403, error: "mfa_required" };
  const accountId = String(body?.account_id ?? "");
  const formCode = String(body?.form_code ?? "");
  const lineKey = String(body?.line_key ?? "");
  if (!accountId) return { status: 400, error: "bad_account" };
  if (!formCode) return { status: 400, error: "bad_form" };
  if (!lineKey) return { status: 400, error: "bad_line" };
  await svc.rpc("set_account_tax_line", {
    p_actor: actorFromJwt, p_org: orgId, p_account_id: accountId, p_form_code: formCode, p_line_key: lineKey,
  });
  return { status: 200 };
}

Deno.test("MFA-required org + aal1 CPA → set_line rejected 403, NO write", async () => {
  const svc = spySvc(true);
  const out = await runSetLine(svc, jwtWithAal("aal1"), "u1", {
    org_id: ORG, account_id: "a1", form_code: "SchC", line_key: "l1",
  });
  assertEquals(out.status, 403);
  assertEquals(out.error, "mfa_required");
  assertEquals(svc.calls.some((c) => c.fn === "set_account_tax_line"), false);
});

Deno.test("MFA-required org + aal2 CPA → set_line allowed, RPC called with JWT actor", async () => {
  const svc = spySvc(true);
  const out = await runSetLine(svc, jwtWithAal("aal2"), "u1", {
    org_id: ORG, account_id: "a1", form_code: "SchC", line_key: "l1",
  });
  assertEquals(out.status, 200);
  const call = svc.calls.find((c) => c.fn === "set_account_tax_line");
  assertEquals(call?.args.p_actor, "u1");
  assertEquals(call?.args.p_account_id, "a1");
});

Deno.test("non-MFA org → unaffected even at aal1 (opt-in preserved)", async () => {
  const svc = spySvc(false);
  const out = await runSetLine(svc, jwtWithAal("aal1"), "u1", {
    org_id: ORG, account_id: "a1", form_code: "SchC", line_key: "l1",
  });
  assertEquals(out.status, 200);
});

Deno.test("gate reads aal from the JWT, not a body actor — no bypass", async () => {
  const svc = spySvc(true);
  const out = await runSetLine(svc, jwtWithAal("aal1"), "attacker-supplied-id", {
    org_id: ORG, account_id: "a1", form_code: "SchC", line_key: "l1",
  });
  assertEquals(out.status, 403);
  assertEquals(svc.calls.some((c) => c.fn === "set_account_tax_line"), false);
});

Deno.test("missing org_id → 400 before any MFA check or write", async () => {
  const svc = spySvc(true);
  const out = await runSetLine(svc, jwtWithAal("aal2"), "u1", { account_id: "a1", form_code: "SchC", line_key: "l1" });
  assertEquals(out.status, 400);
  assertEquals(out.error, "bad_org");
  assertEquals(svc.calls.length, 0);
});

Deno.test("missing line_key → 400, no write (a client cannot clear-by-omission)", async () => {
  const svc = spySvc(false);
  const out = await runSetLine(svc, jwtWithAal("aal2"), "u1", { org_id: ORG, account_id: "a1", form_code: "SchC" });
  assertEquals(out.status, 400);
  assertEquals(out.error, "bad_line");
  assertEquals(svc.calls.some((c) => c.fn === "set_account_tax_line"), false);
});

Deno.test("missing account_id → 400, no write", async () => {
  const svc = spySvc(false);
  const out = await runSetLine(svc, jwtWithAal("aal2"), "u1", { org_id: ORG, form_code: "SchC", line_key: "l1" });
  assertEquals(out.status, 400);
  assertEquals(out.error, "bad_account");
});
