/**
 * Single source of truth for site-wide constants — company/product identity,
 * public contact, canonical URL, and social links. Import from here instead of
 * hardcoding these strings in pages/components, so a change happens in one place
 * and applies everywhere.
 *
 *   - company  : the brand/legal entity (FounderFirst)
 *   - product  : the current product (Penny — an autonomous bookkeeper)
 *   - email    : the ONLY public contact address. Never use a personal address.
 */
export const SITE = {
  company: "FounderFirst",
  product: "Penny",
  url: "https://founderfirst.one",
  /** Public contact address — used in legal pages, footer, support copy. */
  email: "founder@founderfirst.one",
  discord: "https://discord.gg/DGJdd6AEjH",
} as const;
