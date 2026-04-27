/**
 * esbuild bundler for the Penny site bubble.
 *
 * Output: dist/penny-bubble.js — a single self-mounting IIFE that boots
 * itself onto window.PennyBubble + auto-mounts on DOMContentLoaded. The
 * Worker domain is read from <script data-worker="..."> or window.PENNY_BUBBLE_URL.
 *
 * Target ≤30KB gzipped (Preact + htm fits easily).
 */
import { build, context } from "esbuild";

const config = {
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "iife",
  globalName: "__PennyBubble__",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  outfile: "dist/penny-bubble.js",
  loader: { ".css": "text" },
  define: { "process.env.NODE_ENV": '"production"' },
};

if (process.argv.includes("--watch")) {
  const ctx = await context(config);
  await ctx.watch();
  console.log("watching…");
} else {
  await build(config);
  console.log("built dist/penny-bubble.js");
}
