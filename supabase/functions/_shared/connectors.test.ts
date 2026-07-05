/**
 * Connector wiring tests (sandbox-only; never hits a provider network).
 *
 * Run:  deno test --allow-env supabase/functions/_shared/connectors.test.ts
 *
 * Covers the env → secret/URL reconciliation that broke the Connections page:
 *   1. Plaid picks the right secret per PLAID_ENV (sandbox/production) with a
 *      bare-PLAID_SECRET fallback.
 *   2. QBO/Xero authorize-URL builders emit the right client_id + redirect_uri +
 *      scopes (well-formed connect URL, no consent needed to assert this).
 */
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { plaidSecret } from "./plaid.ts";
import { authorizeUrl as qboAuthorizeUrl, QBO_SCOPE, QBO_AUTHORIZE } from "./qbo.ts";
import { authorizeUrl as xeroAuthorizeUrl, XERO_SCOPE, XERO_AUTHORIZE } from "./xero.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("plaidSecret: sandbox env selects PLAID_SECRET_SANDBOX", () => {
  withEnv(
    {
      PLAID_ENV: "sandbox",
      PLAID_SECRET_SANDBOX: "sbx-key",
      PLAID_SECRET_PRODUCTION: "prod-key",
      PLAID_SECRET: undefined,
    },
    () => assertEquals(plaidSecret(), "sbx-key"),
  );
});

Deno.test("plaidSecret: production env selects PLAID_SECRET_PRODUCTION", () => {
  withEnv(
    {
      PLAID_ENV: "production",
      PLAID_SECRET_SANDBOX: "sbx-key",
      PLAID_SECRET_PRODUCTION: "prod-key",
      PLAID_SECRET: undefined,
    },
    () => assertEquals(plaidSecret(), "prod-key"),
  );
});

Deno.test("plaidSecret: default (unset PLAID_ENV) behaves as sandbox", () => {
  withEnv(
    {
      PLAID_ENV: undefined,
      PLAID_SECRET_SANDBOX: "sbx-key",
      PLAID_SECRET_PRODUCTION: "prod-key",
      PLAID_SECRET: undefined,
    },
    () => assertEquals(plaidSecret(), "sbx-key"),
  );
});

Deno.test("plaidSecret: falls back to bare PLAID_SECRET when env-specific absent", () => {
  withEnv(
    {
      PLAID_ENV: "sandbox",
      PLAID_SECRET_SANDBOX: undefined,
      PLAID_SECRET_PRODUCTION: undefined,
      PLAID_SECRET: "legacy-key",
    },
    () => assertEquals(plaidSecret(), "legacy-key"),
  );
});

Deno.test("plaidSecret: production env WITHOUT a production secret FAILS LOUD (never falls back to a bare/sandbox PLAID_SECRET)", () => {
  // Incident guard: a bare PLAID_SECRET is, per our deploy history, the SANDBOX
  // secret. If an operator flips PLAID_ENV=production but forgets to set
  // PLAID_SECRET_PRODUCTION, silently using the sandbox key against
  // production.plaid.com is a real incident. Must throw, not return sandbox creds.
  withEnv(
    {
      PLAID_ENV: "production",
      PLAID_SECRET_SANDBOX: "sbx-key",
      PLAID_SECRET_PRODUCTION: undefined,
      PLAID_SECRET: "sbx-key", // legacy single-secret deploy = the sandbox key
    },
    () => assertThrows(() => plaidSecret(), Error, "PLAID_SECRET_PRODUCTION"),
  );
});

Deno.test("plaidSecret: production env WITH the production secret returns it and never the fallback", () => {
  withEnv(
    {
      PLAID_ENV: "production",
      PLAID_SECRET_SANDBOX: "sbx-key",
      PLAID_SECRET_PRODUCTION: "prod-key",
      PLAID_SECRET: "sbx-key",
    },
    () => assertEquals(plaidSecret(), "prod-key"),
  );
});

Deno.test("QBO authorizeUrl: correct endpoint, client_id, redirect_uri, scope, state", () => {
  withEnv(
    {
      QBO_CLIENT_ID: "qbo-client-123",
      QBO_REDIRECT_URI: "https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/qbo-callback",
    },
    () => {
      const url = new URL(qboAuthorizeUrl("state-abc"));
      assertEquals(`${url.origin}${url.pathname}`, QBO_AUTHORIZE);
      assertEquals(url.searchParams.get("client_id"), "qbo-client-123");
      assertEquals(url.searchParams.get("response_type"), "code");
      assertEquals(
        url.searchParams.get("redirect_uri"),
        "https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/qbo-callback",
      );
      assertEquals(url.searchParams.get("scope"), QBO_SCOPE);
      assertEquals(url.searchParams.get("state"), "state-abc");
    },
  );
});

Deno.test("Xero authorizeUrl: correct endpoint, client_id, redirect_uri, %20-scope, state", () => {
  withEnv(
    {
      XERO_CLIENT_ID: "xero-client-123",
      XERO_REDIRECT_URI: "https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/xero-callback",
    },
    () => {
      const raw = xeroAuthorizeUrl("state-xyz");
      // Scope must be %20-delimited (not '+') or Xero rejects it as invalid_scope.
      assert(!raw.includes("scope=") || !/scope=[^&]*\+/.test(raw), "scope must not contain '+'");
      const url = new URL(raw);
      assertEquals(`${url.origin}${url.pathname}`, XERO_AUTHORIZE);
      assertEquals(url.searchParams.get("client_id"), "xero-client-123");
      assertEquals(url.searchParams.get("response_type"), "code");
      assertEquals(
        url.searchParams.get("redirect_uri"),
        "https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/xero-callback",
      );
      // URL parsing decodes %20 back to spaces — assert the full granular scope set.
      assertEquals(url.searchParams.get("scope"), XERO_SCOPE);
      assert(XERO_SCOPE.includes("accounting.banktransactions.read"));
      assertEquals(url.searchParams.get("state"), "state-xyz");
    },
  );
});
