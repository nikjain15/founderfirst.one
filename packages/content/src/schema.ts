/**
 * Content model — the single source of truth for all FounderFirst copy.
 *
 * These Zod schemas are the contract shared by:
 *   - the Supabase `content_*` tables (shape mirrored 1:1),
 *   - Astro at build time (reads published content → static HTML + JSON-LD + llms.txt),
 *   - the admin editor at runtime (draft → validate → publish).
 *
 * Pattern mirrors the existing Penny prompt/voice surfaces: every page/section is
 * versioned, has an active/live toggle, and an activity feed.
 *
 * Phase 0 DRAFT — review before the Phase 1 migration. Field names map directly to
 * planned columns; section `data` shapes are the homepage block types from GAME_PLAN §9.
 */
import { z } from "zod";

/* ── Surfaces a piece of content can belong to ───────────────────────── */
export const Surface = z.enum(["marketing", "blog", "product"]);
export type Surface = z.infer<typeof Surface>;

/* ── SEO + GEO metadata (generated into <head>, JSON-LD, llms.txt) ────── */
export const SeoMeta = z.object({
  title: z.string().max(70),
  description: z.string().max(160),
  ogImage: z.string().url().optional(),
  canonical: z.string().url().optional(),
  /** Short factual statements used to build llms.txt + structured data. */
  keyFacts: z.array(z.string()).default([]),
});
export type SeoMeta = z.infer<typeof SeoMeta>;

/* ── Section block types (homepage + reusable) ───────────────────────────
   Discriminated union on `type`. `data` carries the on-voice copy. New block
   types are added here once and become editable in admin automatically. */
const baseSection = { id: z.string().uuid().optional(), position: z.number().int() };

export const HeroSection = z.object({
  ...baseSection,
  type: z.literal("hero"),
  data: z.object({
    headline: z.string(),
    sub: z.string(),
    ctaLabel: z.string(),
    image: z.string().optional(),
    /** Optional inline text link under the sub (e.g. "See how Penny works"). */
    link: z.object({ label: z.string(), href: z.string() }).optional(),
    /** Overlay transaction-card mock rows (the photo-hero device). */
    cards: z.array(z.object({ label: z.string(), sub: z.string(), value: z.string() })).default([]),
  }),
});

export const FeaturesSection = z.object({
  ...baseSection,
  type: z.literal("features"),
  data: z.object({
    headline: z.string(),
    items: z.array(z.object({ icon: z.string(), title: z.string(), body: z.string() })),
  }),
});

export const ComparisonSection = z.object({
  ...baseSection,
  type: z.literal("comparison"),
  data: z.object({
    scatterLabel: z.string(),
    scatter: z.array(z.object({ source: z.string(), value: z.string() })),
    unifiedLabel: z.string(),
    profitLabel: z.string(),
    profitValue: z.string(),
    profitMeta: z.string(),
    rows: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
});

export const StepsSection = z.object({
  ...baseSection,
  type: z.literal("steps"),
  data: z.object({
    headline: z.string(),
    sub: z.string(),
    steps: z.array(z.object({ num: z.string(), title: z.string(), body: z.string() })),
    /** When set, renders an inline signup form below the steps (final waitlist). */
    ctaLabel: z.string().optional(),
    note: z.string().optional(),
  }),
});

export const CtaSection = z.object({
  ...baseSection,
  type: z.literal("cta"),
  data: z.object({ headline: z.string(), sub: z.string(), ctaLabel: z.string(), note: z.string() }),
});

export const FaqSection = z.object({
  ...baseSection,
  type: z.literal("faq"),
  data: z.object({
    headline: z.string(),
    /** Q&A pairs — embedded so the page versions atomically. Source for
        FAQPage JSON-LD + llms.txt. */
    entries: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  }),
});

/** Thin accent strip under the hero — "Today · sorted by Penny" proof ribbon. */
export const ProofSection = z.object({
  ...baseSection,
  type: z.literal("proof"),
  data: z.object({
    label: z.string(),
    items: z.array(z.object({ source: z.string(), value: z.string() })),
  }),
});

/** Zigzag image↔text feature showcase (replaces the flat features grid as the
    deep "what Penny does" section). Each row alternates side automatically.
    `kind` selects a lightweight on-brand mock when no image is supplied. */
export const ShowcaseSection = z.object({
  ...baseSection,
  type: z.literal("showcase"),
  data: z.object({
    headline: z.string(),
    sub: z.string().optional(),
    rows: z.array(z.object({
      eyebrow: z.string().optional(),
      title: z.string(),
      body: z.string(),
      kind: z.enum(["sort", "profit", "getpaid", "cpa"]),
      image: z.string().optional(),
    })),
  }),
});

/** "Built on trust, not faith" — security/credibility trio. */
export const TrustSection = z.object({
  ...baseSection,
  type: z.literal("trust"),
  data: z.object({
    headline: z.string(),
    sub: z.string().optional(),
    items: z.array(z.object({ icon: z.string(), title: z.string(), body: z.string() })),
    /** Small reassurance line under the cards (e.g. waitlist proof). */
    footnote: z.string().optional(),
  }),
});

export const TryPennySection = z.object({
  ...baseSection,
  type: z.literal("tryPenny"),
  data: z.object({
    eyebrow: z.string(),
    headline: z.string(),
    ownerSub: z.string(),  // copy shown for the business-owner view
    cpaSub: z.string(),    // copy shown for the CPA view
  }),
});

export const Section = z.discriminatedUnion("type", [
  HeroSection, FeaturesSection, ComparisonSection, StepsSection, CtaSection, FaqSection, TryPennySection,
  ProofSection, ShowcaseSection, TrustSection,
]);
export type Section = z.infer<typeof Section>;

/* ── A page = identity + SEO + ordered sections ──────────────────────── */
export const Page = z.object({
  id: z.string().uuid().optional(),
  slug: z.string(),                 // "/", "/confirmed", …
  surface: Surface,
  seo: SeoMeta,
  sections: z.array(Section),
});
export type Page = z.infer<typeof Page>;

/** A single FAQ Q&A — embedded in a FaqSection; extracted to build
    FAQPage JSON-LD + llms.txt. */
export const FaqEntry = z.object({ question: z.string(), answer: z.string() });
export type FaqEntry = z.infer<typeof FaqEntry>;

/* Email copy is NOT modelled here — it lives in the existing `email_templates`
   table (single source of truth, edited in admin EmailHub). Modelling it here
   too would duplicate the concept. See GAME_PLAN §6. */

/* ── Versioning envelope — wraps ANY of the above content kinds ───────────
   Mirrors prompt/voice: every edit is a version; one is active/live; the
   activity feed is the audit trail surfaced in admin. */
export const ContentKind = z.enum(["page", "faq"]);
export const Version = z.object({
  id: z.string().uuid(),
  kind: ContentKind,
  /** FK to the page/faq/email this version belongs to. */
  refId: z.string().uuid(),
  /** Validated payload — one of Page | Faq | EmailTemplate. */
  payload: z.unknown(),
  isActive: z.boolean(),            // the published/live version
  author: z.string(),               // admin id (audit)
  createdAt: z.string(),            // ISO — also the GEO `dateModified` signal
  note: z.string().optional(),      // change note → activity feed
});
export type Version = z.infer<typeof Version>;
