# FounderFirst

**Operating software for business owners.**

You focus on your business. We handle what runs behind it.

---

## What We're Building

FounderFirst builds the back-office tools that founders wish existed — starting with the biggest pain point: the books.

You started a business to do the work. Not to chase receipts, chase payments, or untangle a spreadsheet on a Sunday. Money moves across Stripe, your bank, your card — and the financial picture you need to make real decisions ends up spread across five different places. Every tool out there was built for accountants, not founders.

So we built something different.

---

## Penny — Our First Product

**Your autonomous 24/7 bookkeeper.**

No setup. No spreadsheets. Clean books, real profit, tax-ready.

Connect Stripe, your bank, your card — anywhere money moves. Penny categorizes every transaction. You confirm with one tap.

**What Penny gives you:**

- **Know what you're actually making.** Real profit, updated as the money moves — not just revenue.
- **Never chase a late payment again.** Penny sends professional reminders to late-paying clients, so you don't have to.
- **No scramble come tax season.** Books stay clean and CPA-ready, year round.

**For business owners:** No spreadsheets. No chasing receipts. Just clean books.

**For CPAs:** Every transaction categorized. Every receipt attached.

---

## Try the Demo

Penny is live as an interactive demo. Two views, both clickable:

- **[Business owner view →](https://founderfirst.one/penny/demo/)** — the mobile experience. Onboarding, the Penny conversation thread, one-tap approval cards, capture (photo / voice / upload / "just tell me"), My Books, and the invoice designer.
- **[CPA view →](https://founderfirst.one/penny/demo/cpa/)** — what your accountant sees: client work queue, P&L, cash flow, learned rules, and a chat surface to ask Penny questions about the books.

The demo runs on real Claude responses through a Cloudflare Worker — so what you see is the actual product voice and intelligence, not canned screens.

---

## Early Access

Penny is in early access. **3 months on us** for waitlist members — and each founder you refer adds a free month, up to 12 total.

We're opening in small batches. **[Join the waitlist →](https://founderfirst.one)**

---

## About

FounderFirst is built by [Nik Jain](https://github.com/nikjain15) — three-time founder, Forbes 30 Under 30 Asia.

The mission is simple: give business owners the back-office support that used to only exist inside bigger companies.

---

## Engineering guardrails

**Responsive standard** — every page, tab, and component must render correctly at any viewport width from 320px to 1920px+. Full rules in [apps/admin/RESPONSIVE.md](apps/admin/RESPONSIVE.md). Quick version:

1. Fluid first (`clamp`, `min`, `max`, `flex-wrap`, `grid auto-fit`); breakpoints only when a layout must change shape.
2. No hardcoded pixel widths in horizontal layouts — use `minmax(0, …)` so tracks can shrink.
3. Touch targets ≥ 44×44 px (`min-height: var(--tap-min)`).
4. Tables go inside `.table-wrap` for horizontal scroll + edge-fade affordance.
5. Inputs ≥ 16px font-size (prevents iOS auto-zoom).
6. Fixed-position elements (Penny bubble, cookie banner) must not cover CTAs at any width.

**Width-ladder test before merging any new UI:** 320 · 360 · 375 · 414 · 480 · 540 · 640 · 768 · 834 · 1024 · 1280 · 1440 · 1920. At each, `document.documentElement.scrollWidth > innerWidth` must be `false`.

**Design tokens** — all color, spacing, radius, and font-size come from [packages/design-system/tokens.css](packages/design-system/tokens.css). Never inline hex values or magic px.

**Blog** — every blog post follows [apps/web/BLOG_PRINCIPLES.md](apps/web/BLOG_PRINCIPLES.md): DB-first publishing, typed content blocks, a unique on-topic hero per post, uniform `/blog` layout, [VOICE.md](VOICE.md) tone, and the SEO/GEO + ship checklist. Read it before adding or editing a post.

---

*© 2026 FounderFirst. All rights reserved.*
