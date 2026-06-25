import { createClient } from "@supabase/supabase-js";
import { createContentClient, type Page } from "@ff/content";
import { homeSeed } from "../seed/home";

/**
 * Resolve a page's content at build time: prefer the published row from
 * Supabase (the single source of truth), fall back to the local seed until the
 * content migration is applied. Astro bakes the result into static HTML, so the
 * published copy is what crawlers (and AI engines) see.
 */
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export async function getPage(slug: string, fallback: Page): Promise<Page> {
  if (!url || !anon) return fallback;
  try {
    const client = createContentClient(createClient(url, anon));
    const published = await client.getPublishedPage(slug);
    return published ?? fallback;
  } catch {
    return fallback; // never let a content fetch break the build
  }
}

export const getHomepage = () => getPage("/", homeSeed);
