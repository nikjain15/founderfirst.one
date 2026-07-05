/**
 * Single source of truth for site-wide constants — company/product identity,
 * public contact, canonical URL, and social links. Import from `@ff/site`
 * instead of hardcoding these strings in pages/components, so a change happens
 * in one place and applies everywhere (CLAUDE.md / LEARNINGS #13 guardrail).
 *
 *   - company  : the brand/legal entity (FounderFirst)
 *   - product  : the current product (Penny — an autonomous bookkeeper)
 *   - url      : canonical origin (with scheme)
 *   - host     : bare host (no scheme), for prose / path-joined display
 *   - email    : the ONLY public contact address. Never use a personal address.
 */
export const SITE = {
  company: "FounderFirst",
  product: "Penny",
  url: "https://founderfirst.one",
  host: "founderfirst.one",
  /** Public contact address — used in legal pages, footer, support copy. */
  email: "founder@founderfirst.one",
  discord: "https://discord.gg/DGJdd6AEjH",
  /**
   * The live internal admin surface (founderfirst.one/admin). During the IA-3
   * parallel-run, the in-product console at penny.founderfirst.one/admin mirrors
   * it module by module and links back here for surfaces not yet mirrored.
   */
  adminUrl: "https://founderfirst.one/admin",
} as const;

/**
 * Podcast identity — single source for the /podcast page header AND the
 * /podcast/rss.xml feed (Apple Podcasts / Spotify read these channel tags).
 * Every published post with an audio block becomes an episode of this show.
 */
export const PODCAST = {
  title: "Penny by FounderFirst",
  description:
    "Short, warm explainers on bookkeeping without the busywork — autonomous bookkeeping, clean books, and running a business without the back-office grind. Hosted in Penny's voice.",
  author: SITE.company,
  ownerName: SITE.company,
  ownerEmail: SITE.email,
  language: "en-us",
  category: "Business",
  subcategory: "Entrepreneurship",
  explicit: false,
  link: `${SITE.url}/podcast`,
  feedUrl: `${SITE.url}/podcast/rss.xml`,
  cover: `${SITE.url}/podcast/cover.png`, // 3000×3000 square (Apple requires 1400–3000px)
} as const;
