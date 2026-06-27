import type { APIRoute } from "astro";
import { extractFaqs } from "@ff/content";
import { getHomepage } from "../lib/content";
import { posts } from "../blog/posts";

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
    ...posts.map((p) => `- ${p.title}: https://founderfirst.one/blog/${p.slug}/ — ${p.description}`),
    "",
    "## Links",
    "- Home: https://founderfirst.one/",
    "- Compare: https://founderfirst.one/compare/",
    "- Blog: https://founderfirst.one/blog/",
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
