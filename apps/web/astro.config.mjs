import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Static site (SSG) — SEO/GEO-safe HTML, React only for interactive islands.
export default defineConfig({
  site: "https://founderfirst.one",
  integrations: [react()],
  server: { port: 5178 },
  devToolbar: { enabled: false },
});
