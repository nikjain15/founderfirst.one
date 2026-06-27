import type { APIRoute } from "astro";
import { posts } from "../blog/posts";

// Sitemap, served at /sitemap.xml. List the public, indexable pages here as the
// site grows (kept manual — the @astrojs/sitemap integration crashes on our
// endpoint routes).
const SITE = "https://founderfirst.one";
const PAGES = ["/", "/compare/", "/blog/", ...posts.map((p) => `/blog/${p.slug}/`)];

export const GET: APIRoute = () => {
  const urls = PAGES.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
