import { defineConfig } from "vitest/config";

// CI-safe smoke tests for the soak harness. Pure, DB-free, network-free — the
// concurrency/idempotency assertions run against the in-memory model (model.ts),
// so the guarantee is proven in CI without a Postgres or any credentials.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
