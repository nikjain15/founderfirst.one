/**
 * DEV-ONLY in-memory mock of the Site-content RPCs, so the editor can be
 * driven without a database or auth. Enabled by VITE_CONTENT_MOCK=1.
 * Delete this file + its references once local/real Supabase is wired.
 */
import type { PageSummaryRow, ContentVersionRow } from "./supabase";

// DEV-ONLY by construction: import.meta.env.DEV is false in production builds,
// so the mock + its auth bypass can never reach a deployed admin.
export const CONTENT_MOCK = import.meta.env.DEV && import.meta.env.VITE_CONTENT_MOCK === "1";

const HOME_PAYLOAD = {
  slug: "/", surface: "marketing",
  seo: {
    title: "FounderFirst — bookkeeping that runs itself",
    description: "Penny is your autonomous 24/7 bookkeeper. Clean books, real profit, chased invoices.",
    keyFacts: [
      "Penny is an autonomous 24/7 bookkeeper for small business owners.",
      "Penny connects with read-only access and can never move your money.",
      "Keeps books clean and CPA-ready every day of the year.",
    ],
  },
  sections: [
    { type: "hero", position: 0, data: {
      headline: "Bookkeeping that runs itself.",
      sub: "Meet Penny — your autonomous 24/7 bookkeeper. She sorts every transaction, chases late invoices, and keeps you CPA-ready. You just run the business.",
      ctaLabel: "Claim 3 months free",
      cards: [
        { label: "Stripe payout", sub: "Revenue", value: "+$4,820" },
        { label: "Terra Wholesale", sub: "Cost of goods", value: "-$1,240" },
        { label: "Card · Fuel", sub: "Auto-categorized", value: "-$64" },
      ],
    } },
    { type: "features", position: 1, data: {
      headline: "Penny handles the books and the chasing — so you can focus on your business.",
      items: [
        { icon: "chart", title: "Know your real profit", body: "Not just revenue — what you actually keep, updated as the money moves." },
        { icon: "bell", title: "Never chase a payment", body: "Penny sends friendly reminders on late invoices, in your voice." },
        { icon: "shield", title: "Always CPA-ready", body: "Clean, categorized books with receipts matched — every day of the year." },
      ],
    } },
    { type: "faq", position: 2, data: {
      headline: "Questions founders ask",
      entries: [
        { question: "Can Penny move my money?", answer: "No. Penny connects with read-only access — she can never move a cent or touch your accounts." },
        { question: "Do I have to switch accounting software?", answer: "No. Penny keeps your books CPA-ready and exports in your usual format." },
      ],
    } },
  ],
};

let store: ContentVersionRow[] = [{
  id: "v1", version: 1, payload: HOME_PAYLOAD, notes: "Seeded homepage v1 (mock)",
  is_live: true, created_at: new Date().toISOString(), created_by: null, created_by_email: "you@founderfirst.one",
}];

export const mockContent = {
  listContentPages: async (): Promise<PageSummaryRow[]> => [{
    slug: "/", surface: "marketing",
    version: Math.max(...store.map((v) => v.version)),
    is_live: store.some((v) => v.is_live),
    updated_at: store[0].created_at,
  }],
  listPageVersions: async (): Promise<ContentVersionRow[]> => [...store].sort((a, b) => b.version - a.version),
  createPageVersion: async (_slug: string, _surface: string, payload: unknown, notes?: string): Promise<string> => {
    const v: ContentVersionRow = {
      id: `v${store.length + 1}`, version: store.length + 1, payload, notes: notes ?? null,
      is_live: false, created_at: new Date().toISOString(), created_by: null, created_by_email: "you@founderfirst.one",
    };
    store = [v, ...store];
    return v.id;
  },
  setLivePage: async (id: string): Promise<void> => {
    store = store.map((v) => ({ ...v, is_live: v.id === id }));
  },
};
