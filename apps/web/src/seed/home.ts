import type { Page } from "@ff/content";

/**
 * Build-time fallback for the homepage — used until the content migration is
 * applied and the real `content_pages` row exists. Same shape Astro renders
 * from in production; on-voice, CPA-ready copy (no "taxes" framing).
 */
export const homeSeed: Page = {
  slug: "/",
  surface: "marketing",
  seo: {
    title: "FounderFirst — bookkeeping that runs itself",
    description:
      "Penny is your autonomous 24/7 bookkeeper. Clean books, real profit, and chased invoices — so you can focus on your business.",
    keyFacts: [
      "Penny is an autonomous 24/7 bookkeeper for small business owners.",
      "Penny connects with read-only access and can never move your money.",
      "Keeps books clean and CPA-ready every day of the year.",
      "Join 100+ founders on the waitlist; first 3 months free.",
    ],
  },
  sections: [
    {
      type: "hero",
      position: 0,
      data: {
        headline: "Operating software for business.",
        sub: "Meet Penny — your 24/7 autonomous bookkeeper.",
        ctaLabel: "Claim 3 months free",
        image: "/hero.jpg",
        cards: [
          { label: "Stripe payout", sub: "Revenue", value: "+$4,820" },
          { label: "Terra Wholesale", sub: "Cost of goods", value: "−$1,240" },
          { label: "Card · Fuel", sub: "Auto-categorized", value: "−$64" },
        ],
      },
    },
    {
      type: "features",
      position: 1,
      data: {
        headline:
          "Penny handles the books and the chasing — so you can focus on your business.",
        items: [
          { icon: "chart", title: "Know your real profit", body: "Not just revenue — what you actually keep, updated as the money moves." },
          { icon: "bell", title: "Never chase a payment", body: "Penny sends friendly reminders on late invoices, in your voice." },
          { icon: "shield", title: "Always CPA-ready", body: "Clean, categorized books with receipts matched — every day of the year." },
        ],
      },
    },
    {
      type: "showcase",
      position: 3,
      data: {
        headline: "See exactly what Penny does.",
        sub: "Connect your accounts once. Here's what runs on autopilot from day one.",
        rows: [
          { eyebrow: "Sort", kind: "sort", title: "Every transaction, sorted for you.", body: "Penny watches Stripe, your bank, and your cards and categorizes each one the moment it lands — no spreadsheets, no catch-up." },
          { eyebrow: "Profit", kind: "profit", title: "See what you actually keep.", body: "Not just revenue — your real profit, broken down and updated as the money moves." },
          { eyebrow: "Get paid", kind: "getpaid", title: "Late invoices, chased politely.", body: "Penny sends friendly, on-brand reminders in your voice, so you get paid without the awkward follow-up." },
          { eyebrow: "CPA-ready", kind: "cpa", title: "No scramble at tax time.", body: "Clean, categorized, receipt-matched books — CPA-ready every day of the year, not just in April." },
        ],
      },
    },
    {
      type: "tryPenny",
      position: 4,
      data: {
        eyebrow: "Try Penny",
        headline: "See Penny work — for real, right now.",
        ownerSub: "Connect an account and Penny starts watching. She categorizes every transaction and shows you a card. You confirm with a tap — she remembers it next time.",
        cpaSub: "Keep QuickBooks or Xero — nothing to migrate. Penny does the data entry your client always forgets and queues it for you. You review, approve, and export in your usual format.",
      },
    },
    {
      type: "trust",
      position: 5,
      data: {
        headline: "Built on trust, not faith.",
        sub: "Penny connects to the accounts your business runs on, so we hold ourselves to a simple standard: read-only by design, encrypted throughout, and your data always stays yours.",
        items: [
          { icon: "lock", title: "Penny can never move your money.", body: "Read-only access — she reads and sorts transactions, but can't touch a cent." },
          { icon: "shield", title: "Locked down end to end.", body: "Bank-level encryption in transit and at rest, on the same rails your bank uses." },
          { icon: "user", title: "Your books belong to you.", body: "Never sold or shared. Export or delete everything anytime." },
        ],
        footnote: "100+ founders already on the waitlist — keeping their books on autopilot before launch.",
      },
    },
    {
      type: "steps",
      position: 7,
      data: {
        headline: "Want Penny watching your books?",
        sub: "Drop your email — we'll save your spot and cover your first 3 months of bookkeeping.",
        steps: [
          { num: "01", title: "Drop your email", body: "Takes 10 seconds. That's the whole sign-up." },
          { num: "02", title: "3 months on us", body: "Your first 3 months are free when your spot opens — no card needed." },
          { num: "03", title: "Refer & stack months", body: "Each founder you refer adds a free month — up to 12 total." },
        ],
        ctaLabel: "Claim 3 months free",
        note: "No spam. No pressure. Unsubscribe anytime.",
      },
    },
    {
      type: "faq",
      position: 6,
      data: {
        headline: "Questions, answered.",
        entries: [
          { question: "What is Penny?", answer: "Penny is an autonomous AI bookkeeper from FounderFirst. She connects to your Stripe, bank, and card accounts and keeps your books done for you, 24/7 — categorizing every transaction, chasing late invoices, and keeping you CPA-ready." },
          { question: "How is Penny different from QuickBooks or Xero?", answer: "QuickBooks and Xero are tools you have to operate. Penny does the bookkeeping for you — she categorizes transactions, follows up on unpaid invoices, and keeps your books clean and CPA-ready, with nothing to migrate." },
          { question: "Is my financial data safe?", answer: "Yes. Penny connects with read-only access, so she can see your transactions but can never move money. Your data is encrypted in transit and at rest, on the same rails your bank uses." },
          { question: "How much does Penny cost?", answer: "Your first 3 months are free, and you can stack up to 12 free months by referring other founders. Paid pricing is shared as we open access to the waitlist." },
          { question: "When can I start?", answer: "Join the waitlist and we'll save your spot. We're onboarding founders in batches now and will reach out when yours opens." },
        ],
      },
    },
  ],
};
