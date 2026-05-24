import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Admin SPA served at founderfirst.one/admin/. Everything routes client-side
// from index.html — the GH Pages 404 fallback below handles deep-link refreshes.
export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    open: "/admin/",
  },
});
