/**
 * Default-shaped content factories — used by the admin editor to create new
 * pages and append new sections that already satisfy the Zod schema.
 */
import type { Page, Section, Surface } from "./schema";

export const SECTION_TYPES = [
  "hero", "features", "proof", "showcase", "trust", "comparison", "tryPenny", "steps", "cta", "faq",
] as const;

export function emptySection(type: (typeof SECTION_TYPES)[number], position: number): Section {
  switch (type) {
    case "hero":
      return { type, position, data: { headline: "", sub: "", ctaLabel: "Claim 3 months free", cards: [] } };
    case "features":
      return { type, position, data: { headline: "", items: [] } };
    case "proof":
      return { type, position, data: { label: "", items: [] } };
    case "showcase":
      return { type, position, data: { headline: "", rows: [] } };
    case "trust":
      return { type, position, data: { headline: "", items: [] } };
    case "comparison":
      return { type, position, data: { scatterLabel: "", scatter: [], unifiedLabel: "", profitLabel: "", profitValue: "", profitMeta: "", rows: [] } };
    case "tryPenny":
      return { type, position, data: { eyebrow: "Try Penny", headline: "", ownerSub: "", cpaSub: "" } };
    case "steps":
      return { type, position, data: { headline: "", sub: "", steps: [] } };
    case "cta":
      return { type, position, data: { headline: "", sub: "", ctaLabel: "Claim 3 months free", note: "" } };
    case "faq":
      return { type, position, data: { headline: "", entries: [] } };
  }
}

export function emptyPage(slug: string, surface: Surface = "marketing"): Page {
  return {
    slug,
    surface,
    seo: { title: "", description: "", keyFacts: [] },
    sections: [emptySection("hero", 0), emptySection("cta", 1)],
  };
}
