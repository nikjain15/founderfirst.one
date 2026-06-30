import { defineConfig } from "vitest/config";

// Unit tests for pure logic (ledger reports). Node environment — no DOM needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
