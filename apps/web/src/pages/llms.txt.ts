import type { APIRoute } from "astro";
import { extractFaqs } from "@ff/content";
import { getHomepage } from "../lib/content";
import { posts } from "../blog/posts";
import { SITE } from "../lib/site";

// AI-engine digest, generated from the content single source of truth so it
// can never drift from the live copy. Served at /llms.txt.
export const GET: APIRoute = async () => {
  const page = await getHomepage();
  const faqs = extractFaqs(page);

  const body = [
    "# FounderFirst",
    "",
    `> ${page.seo.description}`,
    "",
    "## Key facts",
    ...page.seo.keyFacts.map((f) => `- ${f}`),
    "",
    "## FAQ",
    ...faqs.flatMap((f) => [`### ${f.question}`, f.answer, ""]),
    "## Articles",
    ...posts.map((p) => `- ${p.title}: ${SITE.url}/blog/${p.slug}/ — ${p.description}`),
    "",
    "## Links",
    `- Home: ${SITE.url}/`,
    `- Compare: ${SITE.url}/compare/`,
    `- Rescue (bookkeeper shut down? Penny picks up your books): ${SITE.url}/rescue/`,
    `- Blog: ${SITE.url}/blog/`,
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
