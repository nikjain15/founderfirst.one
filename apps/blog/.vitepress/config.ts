import { defineConfig } from "vitepress";

// VitePress config — blog deployed under /blog/ on founderfirst.one.
// SEO/GEO defaults: canonical URLs, sitemap, OG meta, JSON-LD per post (Phase 1).
export default defineConfig({
  title: "FounderFirst Blog",
  description: "Notes from FounderFirst on building Penny — operating software for business owners.",
  base: "/blog/",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://founderfirst.one",
  },
  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    ["meta", { name: "robots", content: "index,follow" }],
    ["meta", { property: "og:site_name", content: "FounderFirst" }],
    ["meta", { property: "og:type", content: "article" }],
  ],
  themeConfig: {
    nav: [
      { text: "FounderFirst", link: "https://founderfirst.one" },
      { text: "Try Penny", link: "https://founderfirst.one/penny/demo/businessowner/" },
    ],
    sidebar: [
      {
        text: "Posts",
        items: [
          { text: "Hello, world", link: "/posts/hello-world" },
        ],
      },
    ],
    socialLinks: [],
  },
});
