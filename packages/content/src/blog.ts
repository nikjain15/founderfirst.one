/**
 * Blog content model — admin-editable posts, same pattern as pages (client.ts).
 *
 * A blog post's payload is the full typed document (title, description, dated,
 * tagged, takeaways[], body block sequence) validated by Zod before it's stored
 * or rendered. Astro reads the live posts at build (with a code seed fallback);
 * the admin editor drafts + publishes versions through is_admin()-gated RPCs.
 *
 * Block mirrors apps/web/src/blog/posts.ts so the renderer + BlogPosting JSON-LD
 * keep working unchanged.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BlogBlock = z.union([
  z.object({ h: z.string() }),
  z.object({ p: z.string() }),
  z.object({ quote: z.string() }),
  z.object({ callout: z.object({ title: z.string(), text: z.string() }) }),
  z.object({ stats: z.array(z.object({ value: z.string(), label: z.string() })) }),
  z.object({ visual: z.enum(["glance", "operate-vs-penny", "readonly"]) }),
  // Branded audio player (Penny's spoken voice) — also the podcast episode source.
  // seconds + bytes power <itunes:duration> + the RSS <enclosure length>.
  z.object({ audio: z.string(), seconds: z.number().nullable().optional(), bytes: z.number().nullable().optional() }),
]);
export type BlogBlock = z.infer<typeof BlogBlock>;

/** The audio of a post, if it has a player block — this is what makes it a podcast episode. */
export function postAudio(p: BlogPost): { url: string; seconds: number | null; bytes: number | null } | null {
  const b = p.body.find((x): x is { audio: string; seconds?: number | null; bytes?: number | null } => "audio" in x);
  return b ? { url: b.audio, seconds: b.seconds ?? null, bytes: b.bytes ?? null } : null;
}

export const BlogPost = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  date: z.string(), // ISO
  readMins: z.number(),
  tag: z.string(),
  /** Cover visual shown in the post hero + the /blog featured card. One per post. */
  hero: z.enum(["glance", "safe"]).default("glance"),
  takeaways: z.array(z.string()).default([]),
  body: z.array(BlogBlock).default([]),
});
export type BlogPost = z.infer<typeof BlogPost>;

export interface BlogSummary { slug: string; title: string; date: string; version: number; is_live: boolean; updated_at: string; }
export interface BlogVersionRow { id: string; version: number; payload: unknown; notes: string | null; is_live: boolean; created_at: string; created_by_email: string | null; }

export interface BlogClient {
  /** Published posts (newest first) — Zod-validated. Anon-safe, used by Astro. */
  getLivePosts(): Promise<BlogPost[]>;
  /** Published post for a slug, or null. Anon-safe. */
  getLivePost(slug: string): Promise<BlogPost | null>;

  /** Admin: one row per post slug (editor index). */
  listPosts(): Promise<BlogSummary[]>;
  /** Admin: version history for a slug, newest first. */
  listPostVersions(slug: string): Promise<BlogVersionRow[]>;
  /** Admin: save a new (non-live) draft. Validated before send. */
  draftPost(slug: string, payload: BlogPost, notes?: string): Promise<string>;
  /** Admin: promote a version to live (one live per slug). */
  publishPost(versionId: string): Promise<void>;
}

export function createBlogClient(supabase: SupabaseClient): BlogClient {
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`[@ff/content] ${fn}: ${error.message}`);
    return data as T;
  };
  const parseRows = (rows: Array<{ payload: unknown }> | null) =>
    (rows ?? []).map((r) => BlogPost.parse(r.payload));

  return {
    async getLivePosts() {
      const rows = await call<Array<{ payload: unknown }>>("list_live_blog_posts", {});
      return parseRows(rows);
    },
    async getLivePost(slug) {
      const rows = await call<Array<{ payload: unknown }>>("get_live_blog_post", { p_slug: slug });
      if (!rows?.length) return null;
      return BlogPost.parse(rows[0].payload);
    },
    listPosts: () => call<BlogSummary[]>("list_blog_posts", {}),
    listPostVersions: (slug) => call<BlogVersionRow[]>("list_blog_post_versions", { p_slug: slug }),
    draftPost: (slug, payload, notes) =>
      call<string>("create_blog_post_version", {
        p_slug: slug, p_payload: BlogPost.parse(payload), p_notes: notes ?? null,
      }),
    publishPost: (versionId) => call<void>("set_live_blog_post", { p_id: versionId }),
  };
}

/** Flatten a post's prose to plain text for llms.txt / search snippets. */
export function blogPostText(p: BlogPost): string {
  return p.body
    .map((b) =>
      "p" in b ? b.p : "h" in b ? b.h : "quote" in b ? b.quote : "callout" in b ? b.callout.text : "",
    )
    .filter(Boolean)
    .join(" ");
}
