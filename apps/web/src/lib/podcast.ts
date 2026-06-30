import { postAudio, type BlogPost } from "@ff/content";
import { getBlogPosts } from "./blog";

/**
 * Podcast episodes = published blog posts that carry an audio block. The blog
 * post IS the show notes; the audio block is the episode. Single source of
 * truth (no separate episode store), resolved at build time like the blog.
 */
export interface Episode {
  slug: string;
  title: string;
  description: string;
  date: string;        // ISO
  blogPath: string;    // /blog/<slug> — show notes
  audioUrl: string;
  seconds: number | null;
  bytes: number | null;
}

export async function getPodcastEpisodes(): Promise<Episode[]> {
  const posts = await getBlogPosts();
  const eps: Episode[] = [];
  for (const p of posts as BlogPost[]) {
    const a = postAudio(p);
    if (!a) continue;
    eps.push({
      slug: p.slug,
      title: p.title,
      description: p.description,
      date: p.date,
      blogPath: `/blog/${p.slug}`,
      audioUrl: a.url,
      seconds: a.seconds,
      bytes: a.bytes,
    });
  }
  return eps.sort((x, y) => (x.date < y.date ? 1 : -1));
}

/** "12:34" / "1:02:03" from seconds (for the page + <itunes:duration>). */
export function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
