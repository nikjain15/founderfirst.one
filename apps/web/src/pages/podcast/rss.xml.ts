import type { APIRoute } from "astro";
import { SITE, PODCAST } from "@ff/site";
import { getPodcastEpisodes, fmtDuration } from "../../lib/podcast";

// /podcast/rss.xml — the real podcast feed. Submit this URL once to Apple
// Podcasts Connect / Spotify; they poll it and pull new episodes automatically.
// Built statically from the same episodes the /podcast page shows.
const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export const GET: APIRoute = async () => {
  const eps = await getPodcastEpisodes();
  const rfc822 = (iso: string) => new Date(`${iso}T09:00:00Z`).toUTCString();

  const items = eps.map((e) => `
    <item>
      <title>${xmlEscape(e.title)}</title>
      <description>${xmlEscape(e.description)}</description>
      <link>${SITE.url}${e.blogPath}</link>
      <guid isPermaLink="false">${xmlEscape(e.slug)}</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <enclosure url="${xmlEscape(e.audioUrl)}"${e.bytes ? ` length="${e.bytes}"` : ""} type="audio/mpeg"/>
      ${e.seconds ? `<itunes:duration>${fmtDuration(e.seconds)}</itunes:duration>` : ""}
      <itunes:summary>${xmlEscape(e.description)}</itunes:summary>
      <itunes:explicit>${PODCAST.explicit ? "true" : "false"}</itunes:explicit>
    </item>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(PODCAST.title)}</title>
    <link>${PODCAST.link}</link>
    <language>${PODCAST.language}</language>
    <description>${xmlEscape(PODCAST.description)}</description>
    <copyright>© ${new Date().getFullYear()} ${xmlEscape(SITE.company)}</copyright>
    <atom:link href="${PODCAST.feedUrl}" rel="self" type="application/rss+xml"/>
    <itunes:author>${xmlEscape(PODCAST.author)}</itunes:author>
    <itunes:summary>${xmlEscape(PODCAST.description)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:owner><itunes:name>${xmlEscape(PODCAST.ownerName)}</itunes:name><itunes:email>${PODCAST.ownerEmail}</itunes:email></itunes:owner>
    <itunes:image href="${PODCAST.cover}"/>
    <itunes:category text="${xmlEscape(PODCAST.category)}"><itunes:category text="${xmlEscape(PODCAST.subcategory)}"/></itunes:category>
    <itunes:explicit>${PODCAST.explicit ? "true" : "false"}</itunes:explicit>${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
