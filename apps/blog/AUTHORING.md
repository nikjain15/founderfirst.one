# Blog authoring guide

This file is for blog authors. It ships in the repo (not gitignored) so
contributors can read it.

## Where posts live

```
apps/blog/posts/<slug>.md
```

Filename = URL slug. `apps/blog/posts/penny-launch-notes.md` becomes
`founderfirst.one/blog/posts/penny-launch-notes/`.

## Post template

Copy this when starting a new post:

```markdown
---
title: A specific, search-friendly title (50-60 chars)
description: 1-2 sentence summary that will appear in search snippets and OG previews. ~150 chars.
date: 2026-04-29
author: Nik Jain
ogImage: /blog/og/<slug>.png        # optional — generate via /og route or upload to public/
tags: [bookkeeping, ai, founders]   # optional, used for related posts later
---

# Title repeated as H1

Lead paragraph: who this is for, what they'll learn. Keep it tight — the
first 150 chars often become the snippet on Google + LLM summarizers.

## Section heading

Body. Plain markdown — code blocks, lists, links, all work.

```ts
// Code blocks render with syntax highlighting via Shiki.
const example = "well-typed";
```

### Sub-heading

VitePress supports callouts:

::: tip
This is a tip callout.
:::

::: warning
This is a warning callout.
:::

## Embedding video

Don't commit `.mp4` files. Host on a CDN (Cloudflare Stream / Mux /
Bunny.net) or YouTube/Vimeo, then embed:

```html
<video controls preload="metadata" poster="/blog/posters/penny-demo.jpg">
  <source src="https://cdn.example.com/penny-demo.mp4" type="video/mp4" />
</video>
```

For SEO/GEO: prefer self-hosted with a poster image and on-page transcript
when reach matters less than ranking. YouTube embeds when the goal is
distribution.

## Closing CTA

End with a single CTA line linking to `/#waitlist` or
`/penny/demo/businessowner/` — the post's job is to drive one of those
two actions.
```

## Frontmatter fields explained

| Field | Required | What it does |
|---|---|---|
| `title` | yes | `<title>` tag, OG title, sidebar entry |
| `description` | yes | meta description, OG description, search snippet |
| `date` | yes | publish date (used for RSS, ordering, last-updated logic) |
| `author` | no, defaults to "Nik Jain" | byline |
| `ogImage` | no, falls back to a default | absolute path to image, served from `apps/blog/public/` |
| `tags` | no | for future related-posts feature |

## SEO checklist (per post)

- [ ] Title is unique across the site and includes the search term
- [ ] Description is 130-160 characters; includes the search term
- [ ] H1 matches the title (don't have a different H1)
- [ ] At least one internal link to `/` or `/penny/demo/businessowner/`
- [ ] OG image is 1200x630, < 200 KB, has the post title rendered on it
- [ ] Slug is short, lowercase, hyphenated, no stop words

## GEO (LLM crawler) considerations

- LLMs prefer plain HTML with stable structure. VitePress builds to static
  HTML — already good.
- Avoid putting key facts inside `<script>` blocks; they're often skipped.
- Use real `<h2>` / `<h3>` headings, not styled `<div>`s.
- If the post answers a specific question, include the question verbatim
  as a heading. LLMs often quote those headings.
- Add a short FAQ section at the end of pillar posts. LLMs cite FAQs.

## Robots + crawlers

We allow all crawlers including:
- `GPTBot` (OpenAI)
- `ClaudeBot` (Anthropic)
- `PerplexityBot`
- `Googlebot`, `Bingbot`

The blog ships its own sitemap at `/blog/sitemap.xml`. Submit to:
- [Google Search Console](https://search.google.com/search-console)
- [Bing Webmaster Tools](https://www.bing.com/webmasters)
- [IndexNow](https://www.indexnow.org/) for instant submission to Bing

## Local preview

```bash
pnpm --filter @ff/blog dev   # http://localhost:5175/blog/
```

Edits hot-reload. Run before pushing — VitePress catches broken links and
malformed frontmatter at build time, but it's faster to see them in dev.

## Pre-push check

```bash
pnpm --filter @ff/blog build  # validates the whole blog
```

If this fails, the deploy will fail. Fix locally first.

## When you push

Posts go live when the PR merges to `main` (workflow on push to main →
build → deploy). No separate publish step.
