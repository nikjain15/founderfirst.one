import { describe, it, expect } from "vitest";
import { loadConfig, assertLiveRunAllowed } from "../src/config.ts";

describe("soak config — prod fence", () => {
  it("applies safe CI-smoke defaults from an empty env", () => {
    const cfg = loadConfig({});
    expect(cfg.supabaseUrl).toBe("");
    expect(cfg.target).toBe("");
    expect(cfg.concurrency).toBeGreaterThan(0);
    expect(cfg.totalEntries).toBeGreaterThan(0);
  });

  it("refuses a live run without SOAK_TARGET=sandbox", () => {
    const cfg = loadConfig({ SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k", SOAK_FIXTURE_PREFIX: "soak-x-" });
    expect(() => assertLiveRunAllowed(cfg)).toThrow(/sandbox/);
  });

  it("refuses a live run without a namespaced fixture prefix", () => {
    const cfg = loadConfig({ SOAK_TARGET: "sandbox", SUPABASE_URL: "u", SUPABASE_SERVICE_ROLE_KEY: "k" });
    expect(() => assertLiveRunAllowed(cfg)).toThrow(/FIXTURE_PREFIX/);
  });

  it("refuses a live run without credentials", () => {
    const cfg = loadConfig({ SOAK_TARGET: "sandbox", SOAK_FIXTURE_PREFIX: "soak-x-" });
    expect(() => assertLiveRunAllowed(cfg)).toThrow(/SUPABASE_URL/);
  });

  it("allows a live run when fully and explicitly configured for sandbox", () => {
    const cfg = loadConfig({
      SOAK_TARGET: "sandbox",
      SOAK_FIXTURE_PREFIX: "soak-20260704-",
      SUPABASE_URL: "https://sandbox.example",
      SUPABASE_SERVICE_ROLE_KEY: "svc",
    });
    expect(() => assertLiveRunAllowed(cfg)).not.toThrow();
  });
});
