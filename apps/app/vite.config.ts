import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Unified authed SPA served at founderfirst.one/app/ (a subdomain app.founderfirst.one
// is a later DNS flip — ARCHITECTURE.md §12.5). Client-side routed from index.html.
export default defineConfig({
  base: "/app/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5176,
    open: "/app/",
  },
});
