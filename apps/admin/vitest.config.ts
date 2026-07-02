import { defineConfig } from "vitest/config";

// Unit tests for pure admin logic (build-loop status derivation). Node env — the
// tested modules are DOM-free. Mirrors apps/app/vitest.config.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
