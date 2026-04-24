import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for the Penny demo.
// - React via JSX transform, no fast-refresh quirks to configure.
// - `public/` holds prompts/ and config/ so they are served as static URLs
//   (fetched at runtime by worker-client.js and screen components).
// - Build target is modern evergreen browsers — the demo is for prospective
//   users clicking a link, not legacy support.

export default defineConfig({
  plugins: [react()],
  base: "/penny/demo/",
  build: {
    target: "es2020",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: "index.html",
        cpa:  "cpa/index.html",
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // The deployed Worker only allows CORS from founderfirst.one, so a
    // direct fetch from localhost would be blocked. Proxy the Worker
    // path through Vite in dev so the browser sees a same-origin call.
    proxy: {
      "/v1/messages": {
        target: "https://penny-api.nikjain1588.workers.dev",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
