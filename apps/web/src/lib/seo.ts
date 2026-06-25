import { extractFaqs, type Page } from "@ff/content";

/**
 * GEO/SEO structured data, generated from the SAME content the page renders —
 * so JSON-LD can never drift from the copy. Emitted as <script type="ld+json">.
 */
export function buildJsonLd(page: Page, siteUrl: string) {
  const graph: unknown[] = [
    {
      "@type": "Organization",
      "@id": `${siteUrl}#org`,
      name: "FounderFirst",
      url: siteUrl,
      description: page.seo.description,
    },
    {
      "@type": "SoftwareApplication",
      name: "Penny",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Autonomous 24/7 bookkeeper for small business owners — clean books, real profit, chased invoices, CPA-ready.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "First 3 months free" },
      publisher: { "@id": `${siteUrl}#org` },
    },
  ];

  const faqs = extractFaqs(page);
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}
