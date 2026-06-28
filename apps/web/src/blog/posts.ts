/**
 * Blog posts — Astro renders these to static HTML at build time so AI crawlers
 * and search engines get fully-extractable content + BlogPosting JSON-LD (the
 * SEO/GEO goal). Body is a sequence of typed blocks so articles can mix prose
 * with real product visuals, stats, pull-quotes and callouts — not a text dump.
 */
export type Block =
  | { h: string }
  | { p: string }
  | { quote: string }
  | { callout: { title: string; text: string } }
  | { stats: Array<{ value: string; label: string }> }
  | { visual: "glance" | "operate-vs-penny" | "readonly" };

export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;        // ISO — drives dateModified/datePublished GEO signal
  readMins: number;
  tag: string;
  /** Cover visual shown in the post hero + the /blog featured card. One per post. */
  hero: "glance" | "safe";
  /** Scannable summary shown as a "Key takeaways" callout at the top of the post. */
  takeaways: string[];
  body: Block[];
}

export const posts: Post[] = [
  {
    slug: "is-ai-bookkeeping-safe",
    title: "Is AI bookkeeping safe?",
    description:
      "Yes — when it's built right. A safe AI bookkeeper has read-only access, can never move your money, encrypts your data end to end, and stays yours to export or delete anytime.",
    date: "2026-06-28",
    readMins: 5,
    tag: "Guides",
    hero: "safe",
    takeaways: [
      "Yes — a well-built AI bookkeeper is safe. What matters is how it connects to your accounts.",
      "Read-only by design: it can see and sort your transactions but can never move a cent.",
      "Your data is encrypted in transit and at rest — the same rails your bank uses.",
      "Your books stay yours — exportable or deletable anytime, with no lock-in.",
    ],
    body: [
      { p: "Handing your finances to software is a fair thing to be careful about. The honest answer: yes, AI bookkeeping is safe — when it's built the right way. What makes it safe isn't the AI itself. It's how the software connects to your accounts, what it's allowed to do, and how it treats your data." },
      { stats: [
        { value: "Read-only", label: "it can sort, never move money" },
        { value: "Encrypted", label: "in transit and at rest" },
        { value: "Yours", label: "export or delete anytime" },
      ] },
      { h: "Read-only access — it can't touch your money" },
      { p: "A safe AI bookkeeper connects to Stripe, your bank, and your cards with read-only access. It can see and categorize every transaction, but it can never send a payment, move funds, or change a balance. The permission to move money is one it's never given. Penny works this way by design — it watches and sorts, and your money stays entirely in your hands." },
      { visual: "readonly" },
      { h: "Your data is encrypted — and it stays yours" },
      { p: "Your financial data is encrypted in transit and at rest, on the same security rails your bank uses. And it stays yours: you can export your books or delete them whenever you want. No lock-in, no holding your records hostage. Safe bookkeeping means you can always walk away with everything." },
      { h: "Can an AI bookkeeper get things wrong?" },
      { p: "It can — any system can. The difference is what happens next. A good autonomous bookkeeper shows its work: every transaction it categorizes is there for you to see, and a few times a week it asks a one-tap question when it's unsure — \"business or personal?\" You stay in the loop on the judgment calls while the repetitive sorting runs itself. Nothing is hidden, and nothing is final without you." },
      { quote: "Safe doesn't mean hands-off. It means you can see everything — and nothing can touch your money." },
      { h: "What to check before you trust any AI bookkeeper" },
      { p: "Three questions tell you most of what you need to know. Does it connect with read-only access, or can it move money? Is your data encrypted, and can you export or delete it anytime? And can you see how every transaction was categorized? When the answer to all three is yes, your books are in safe hands." },
      { callout: { title: "The short version", text: "AI bookkeeping is safe when the software has read-only access, can never move your money, encrypts your data end to end, and lets you take your records with you. That's how Penny is built — it watches and sorts, but your money never leaves your control." } },
    ],
  },
  {
    slug: "what-is-an-autonomous-ai-bookkeeper",
    title: "What is an autonomous AI bookkeeper?",
    description:
      "An autonomous AI bookkeeper keeps your books done for you — categorizing every transaction, chasing late invoices, and staying CPA-ready 24/7, with read-only access that can never move your money.",
    date: "2026-06-20",
    readMins: 5,
    tag: "Guides",
    hero: "glance",
    takeaways: [
      "An autonomous AI bookkeeper does the books for you — it's not a tool you operate.",
      "It categorizes every transaction, chases late invoices, and stays CPA-ready 24/7.",
      "Read-only by design — it can see and sort transactions but can never move money.",
      "No year-end scramble: clean, receipt-matched books every day, not just in April.",
    ],
    body: [
      { p: "Most founders don't want to do bookkeeping. They want it done. An autonomous AI bookkeeper is software that does the books for you — not a tool you operate, and not a monthly hand-off to a human service. It connects to the accounts your business already runs on and keeps your records clean continuously." },
      { stats: [
        { value: "24/7", label: "always watching your accounts" },
        { value: "100%", label: "transactions categorized" },
        { value: "$0", label: "for your first 3 months" },
      ] },
      { h: "How it's different from QuickBooks or Xero" },
      { p: "QuickBooks and Xero are ledgers you operate: you (or a bookkeeper) still do the data entry, set the rules, and reconcile. An autonomous bookkeeper like Penny watches Stripe, your bank, and your cards and categorizes each transaction the moment it lands — the way your CPA needs it — so the books are current without anyone maintaining them." },
      { visual: "operate-vs-penny" },
      { h: "What it actually does, day to day" },
      { p: "It sorts every transaction, surfaces your real profit (not just revenue), and chases late invoices with friendly reminders in your voice. A few times a week it may ask a one-tap question — \"business or personal?\" — and it remembers your answer next time." },
      { visual: "glance" },
      { quote: "The best bookkeeping is the kind you never have to think about." },
      { h: "Is it safe?" },
      { p: "A well-built autonomous bookkeeper connects with read-only access: it can see and sort transactions but can never move a cent. Data is encrypted in transit and at rest, on the same rails your bank uses, and your books stay yours — exportable or deletable anytime." },
      { visual: "readonly" },
      { h: "Why it matters at tax time" },
      { p: "Because the books are categorized and receipt-matched every day, there's no year-end scramble. Your accountant gets clean, CPA-ready records on demand — every day of the year, not just in April." },
      { callout: { title: "The short version", text: "An autonomous AI bookkeeper turns bookkeeping from a recurring chore into something that simply runs — accurately, safely, and continuously — so you can spend your time on the business instead of the books." } },
    ],
  },
];

export const getPost = (slug: string) => posts.find((p) => p.slug === slug);

/** Flatten a post's prose to plain text for llms.txt / search snippets. */
export function postText(p: Post): string {
  return p.body
    .map((b) =>
      "p" in b ? b.p : "h" in b ? b.h : "quote" in b ? b.quote : "callout" in b ? b.callout.text : "",
    )
    .filter(Boolean)
    .join(" ");
}
