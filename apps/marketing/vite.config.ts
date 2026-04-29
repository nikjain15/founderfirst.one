import { defineConfig } from "vite";
import { resolve } from "node:path";

// Multi-page setup. Each entry becomes a real HTML file at build time —
// no SPA, no client-side routing. /confirmed/ is a real page, not a div toggle.
export default defineConfig({
  appType: "mpa",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index:     resolve(__dirname, "index.html"),
        confirmed: resolve(__dirname, "confirmed/index.html"),
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
