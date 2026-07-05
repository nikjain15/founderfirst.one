// CI-safe unit test for the SEC-1 server-side MFA gate (FIX 2).
// Pure, network-free — the Supabase client is stubbed.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aalFromJwt, mfaSatisfied } from "./mfaGate.ts";

// minimal JWT: header.payload.signature, payload base64url-encoded.
function jwtWithAal(aal: string | null): string {
  const payload = aal === null ? {} : { sub: "u1", aal };
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_");
  return `h.${b64}.s`;
}

// stub matching the .rpc("org_requires_mfa") shape used by mfaSatisfied.
function stubSvc(required: boolean) {
  return { rpc: (_fn: string, _args: unknown) => Promise.resolve({ data: required, error: null }) };
}

Deno.test("aalFromJwt reads the aal claim", () => {
  assertEquals(aalFromJwt(jwtWithAal("aal2")), "aal2");
  assertEquals(aalFromJwt(jwtWithAal("aal1")), "aal1");
  assertEquals(aalFromJwt(jwtWithAal(null)), null);
  assertEquals(aalFromJwt("not-a-jwt"), null);
});

Deno.test("non-required org: any session may write (opt-in preserved)", async () => {
  assertEquals(await mfaSatisfied(stubSvc(false), jwtWithAal("aal1"), "org"), true);
});

Deno.test("required org: aal1 blocked, aal2 allowed", async () => {
  const svc = stubSvc(true);
  assertEquals(await mfaSatisfied(svc, jwtWithAal("aal1"), "org"), false);
  assertEquals(await mfaSatisfied(svc, jwtWithAal("aal2"), "org"), true);
  assertEquals(await mfaSatisfied(svc, jwtWithAal(null), "org"), false);
});
