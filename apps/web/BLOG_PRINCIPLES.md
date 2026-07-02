# Blog principles — FounderFirst

How every FounderFirst blog post is written, structured, and shipped. Distilled
from building the first posts. Read this before adding or editing a post so the
blog stays consistent. Pairs with [VOICE.md](../../VOICE.md) (how we sound) and
the design system (how we look).

> **Producing a podcast episode?** Episodes are `Podcast`-tagged blog posts with
> their own rules on top of this file (inline-player hero, script/voice, audio,
> publishing) — see [PODCAST_PRINCIPLES.md](PODCAST_PRINCIPLES.md).

> **The test for any post:** would a calm, knowledgeable bookkeeper publish this
> to help a busy business owner — and could a search engine *or an AI answer*
> lift the answer straight off the page? If not, rewrite it.

---

## 1. Where blog content lives — DB-first

- **Source of truth = the Supabase `blog_posts` table** (one versioned JSONB
  payload per slug, one row `is_live = true`). Astro reads live rows at build
  via the `list_live_blog_posts()` / `get_live_blog_post()` RPCs.
- **`apps/web/src/blog/posts.ts` is the code seed + fallback only.** It is
  *ignored* once the DB has any live row. Keep it in sync with the DB anyway —
  it's the version-controlled, reviewable copy and the build's safety net
  (one concept, one source of truth).
- **The Zod schema in `packages/content/src/blog.ts` is the contract.** It
  validates every payload and **strips unknown keys** — so any new field must be
  added to the schema *and* `posts.ts` *and* the renderer, or it silently
  vanishes.
- Editors publish/version through the `/admin` Blog CMS (is_admin-gated RPCs,
  audited). Migrations are **not** auto-applied — apply seed SQL manually via the
  Supabase dashboard SQL editor or the Management API query endpoint
  (`POST /v1/projects/{ref}/database/query`). Never `supabase db push` for one
  post — it applies *all* pending migrations (LEARNINGS rule 3).

## 2. Post structure — typed blocks, not a text dump

A post is a sequence of typed blocks so prose mixes with real product visuals.
Allowed blocks (see `posts.ts` / `blog.ts`):

- `{ p }` — paragraph · `{ h }` — section heading (h2)
- `{ quote }` — pull-quote · `{ callout: { title, text } }` — dark emphasis box
- `{ stats: [{ value, label }] }` — 3-up stat band
- `{ visual: "glance" | "operate-vs-penny" | "readonly" }` — inline product figure

Required fields: `slug`, `title`, `description`, `date` (ISO), `readMins`, `tag`,
`hero`, `takeaways[]`, `body[]`.

- **Open with the answer.** First paragraph and `description` must answer the
  title's question directly (GEO/answer-box bait). Don't bury the lede.
- **4-ish `takeaways`** — scannable, each a complete claim. They render as the
  "Key takeaways" box and double as the AI-extractable summary.
- **Lead with a visual or stat early**, then alternate prose with `h` headings.
  Headings should read as the questions a buyer actually types.
- Reuse existing block types where possible — they already have tested render
  paths and design-system styling. Add a new block type only deliberately
  (schema + `posts.ts` type + both renderers).

## 3. Every post gets its OWN hero visual

- The `hero` field picks the cover shown in the post hero **and** the `/blog`
  card. Each post must carry a **distinct, on-topic** visual — never reuse one
  hero across unrelated topics.
- Heroes are real-UI components built from design-system tokens, not stock art
  or glyphs. Current set: `glance` (`PennyGlance` — the books/real-profit card),
  `safe` (`PennySafe` — the read-only/"can't move a cent" card).
- **New topic → build a new hero component** (mirror an existing one's token
  usage), add its key to the `hero` enum in `blog.ts` + `posts.ts`, and wire it
  in both `[slug].astro` and `index.astro`. Default is `glance`.

## 4. Consistent layout

- `/blog` renders every post in **one shared image+text row format** — no
  special-cased "featured" card. Newest first (`date` desc).
- Each post page uses the same hero template (copy left, visual right, brand-tint
  band) → posts look like siblings, only the cover changes.
- Stacks to one column at ≤ 700px. Test the full width ladder (see
  [RESPONSIVE.md](../admin/RESPONSIVE.md)); `scrollWidth > innerWidth` must be
  false at every width.

## 5. Voice — follow VOICE.md, with one blog exception

- Warm, declarative, short sentences, American English, **no exclamation marks**,
  no banned phrases/customer-service filler. Lead with the feeling, then the fact.
- Always describe Penny in the positive; never frame it as a migration/switch.
- **Naming competitors:** the "never name a competitor" rule is for *Penny the
  chatbot*. **Blog posts may name QuickBooks / Xero / Pilot etc.** for SEO
  comparison (the live posts and `/compare` already do) — but always frame the
  comparison positively, never disparage the other tool.
- **Never name the underlying model/tech** (Claude, ChatGPT, Anthropic). The
  brand is FounderFirst; the product is Penny.

## 6. SEO / GEO — non-negotiables

- `BlogPosting` JSON-LD is auto-emitted per post (`headline`, `description`,
  `articleBody`, `datePublished`/`dateModified`, publisher). Keep `date` real and
  accurate — it's a freshness signal.
- `description` = front-loaded, answers the query, ≤ ~160 useful chars.
- New posts must land in `sitemap.xml` (automatic from live posts) so Google/Bing
  discover them. Verify after deploy.
- **Topic strategy: buyer-intent + comparison.** Target real queries; complement
  `/compare` (the feature grid), don't duplicate it. Deep-link to `/compare`,
  `/#waitlist`, and related posts.
- Use no hardcoded site constants — pull URL/email/brand from `SITE`
  (`apps/web/src/lib/site.ts`). Design values from tokens only (no inline hex/px).

## 7. Ship checklist

1. Write the post in `posts.ts` (set a unique `hero`), and add a matching
   idempotent seed migration under `supabase/migrations/`.
2. Build it: `pnpm -C apps/web build` passes; grep the built HTML to confirm the
   right hero + content render (no node_modules in a fresh worktree → `pnpm
   install` first, ~seconds when cached).
3. Apply the seed to prod (dashboard SQL editor / Management API) **before** the
   deploy build runs — the build reads the DB, so the row must be live first.
4. PR → merge to `main` → `pages.yml` rebuilds `/blog` from the DB.
5. Verify on the live site: post page `200`, hero correct, `BlogPosting` JSON-LD
   present, listed on `/blog`, in `sitemap.xml`. (Cloudflare caches — hard-refresh.)

---

*Last updated: 2026-06-28. Built from the first two posts
(`what-is-an-autonomous-ai-bookkeeper`, `is-ai-bookkeeping-safe`).*
