/**
 * Unit tests for the Conduit live-usage reporter. Network-free: fetch is a mock
 * and the gateway env is supplied per-test via an injected accessor, so this runs
 * in the deno-tests CI gate under `deno test --allow-env` with no --allow-net.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reportDecision, type ReporterFetch } from "./usageReporter.ts";

interface Capture {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal };
}

function mockFetch(): { fetch: ReporterFetch; calls: Capture[] } {
  const calls: Capture[] = [];
  const fetch: ReporterFetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, status: 202 });
  };
  return { fetch, calls };
}

function envFrom(map: Record<string, string>): (k: string) => string | undefined {
  return (k) => map[k];
}

Deno.test("env set => POSTs correct shape + bearer to /v1/decisions", async () => {
  const { fetch, calls } = mockFetch();
  await reportDecision(
    {
      useCase: "penny_categorize",
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      costUsd: 0.0012,
      latencyMs: 342,
      at: "2026-07-26T00:00:00.000Z",
    },
    {
      getEnv: envFrom({
        CONDUIT_GATEWAY_URL: "https://gateway.example.test/",
        CONDUIT_GATEWAY_TOKEN: "tok-123",
      }),
      fetch,
    },
  );

  assertEquals(calls.length, 1);
  const call = calls[0];
  // Trailing slash on the base URL is normalized, path appended once.
  assertEquals(call.url, "https://gateway.example.test/v1/decisions");
  assertEquals(call.init.method, "POST");
  assertEquals(call.init.headers.authorization, "Bearer tok-123");
  assertEquals(call.init.headers["content-type"], "application/json");

  const sent = JSON.parse(call.init.body);
  assertEquals(sent, {
    useCase: "penny_categorize",
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    costUsd: 0.0012,
    latencyMs: 342,
    at: "2026-07-26T00:00:00.000Z",
  });
});

Deno.test("optional fields are forwarded only when present", async () => {
  const { fetch, calls } = mockFetch();
  await reportDecision(
    {
      useCase: "penny_categorize",
      model: "m",
      provider: "anthropic",
      costUsd: 0,
      latencyMs: 1,
      tokensIn: 120,
      tokensOut: 45,
      gateStatus: "pass",
      at: "2026-07-26T00:00:00.000Z",
    },
    {
      getEnv: envFrom({
        CONDUIT_GATEWAY_URL: "https://gateway.example.test",
        CONDUIT_GATEWAY_TOKEN: "tok",
      }),
      fetch,
    },
  );

  const sent = JSON.parse(calls[0].init.body);
  assertEquals(sent.tokensIn, 120);
  assertEquals(sent.tokensOut, 45);
  assertEquals(sent.gateStatus, "pass");
});

Deno.test("env unset => no send, no throw (NO-OP)", async () => {
  const { fetch, calls } = mockFetch();

  // Both missing.
  await reportDecision(
    { useCase: "penny_categorize", model: "m", provider: "anthropic", costUsd: 0, latencyMs: 1 },
    { getEnv: envFrom({}), fetch },
  );
  // Only URL present.
  await reportDecision(
    { useCase: "penny_categorize", model: "m", provider: "anthropic", costUsd: 0, latencyMs: 1 },
    { getEnv: envFrom({ CONDUIT_GATEWAY_URL: "https://gateway.example.test" }), fetch },
  );
  // Only token present.
  await reportDecision(
    { useCase: "penny_categorize", model: "m", provider: "anthropic", costUsd: 0, latencyMs: 1 },
    { getEnv: envFrom({ CONDUIT_GATEWAY_TOKEN: "tok" }), fetch },
  );

  assertEquals(calls.length, 0);
});

Deno.test("a throwing/rejecting fetch never propagates", async () => {
  const throwingFetch: ReporterFetch = () => Promise.reject(new Error("network down"));
  // Must resolve without throwing.
  await reportDecision(
    { useCase: "penny_categorize", model: "m", provider: "anthropic", costUsd: 0, latencyMs: 1 },
    {
      getEnv: envFrom({
        CONDUIT_GATEWAY_URL: "https://gateway.example.test",
        CONDUIT_GATEWAY_TOKEN: "tok",
      }),
      fetch: throwingFetch,
    },
  );
});
