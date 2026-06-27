import { createClient } from "@supabase/supabase-js";
import { createBlogClient, blogPostText, type BlogPost } from "@ff/content";
import { posts as seedPosts } from "../blog/posts";

/**
 * Resolve blog posts at build time: prefer published rows from Supabase (the
 * single source of truth), fall back to the local seed (posts.ts) until the
 * blog_posts migration is applied or if a fetch fails — the build never breaks.
 * Astro bakes the result into static HTML + BlogPosting JSON-LD.
 */
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export async function getBlogPosts(): Promise<BlogPost[]> {
  if (!url || !anon) return seedPosts;
  try {
    const client = createBlogClient(createClient(url, anon));
    const live = await client.getLivePosts();
    return live.length ? live : seedPosts;
  } catch {
    return seedPosts;
  }
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const all = await getBlogPosts();
  return all.find((p) => p.slug === slug) ?? null;
}

export { blogPostText, type BlogPost };
