/**
 * API Direct provider — pay-per-request, unified social search.
 * Docs: https://apidirect.io/docs  ·  Auth: header X-API-Key.
 *
 * One mapper behind the normalizer (SIGNALS_SOLUTION.md §B): every platform
 * returns the same core fields (title, url, date, author, source, domain,
 * snippet), so search() maps any of them into the common intake shape. Swapping
 * to Bright Data / Octolens later = another file like this; nothing else changes.
 */

const BASE = process.env.APIDIRECT_BASE || "https://apidirect.io/v1";
const KEY = () => process.env.API_DIRECT_KEY || "";

// sig platform -> API Direct resource path + the array key it returns results in.
const RESOURCE = {
  reddit:   { path: "reddit/posts",   key: "posts"  },
  twitter:  { path: "twitter/posts",  key: "posts"  },
  linkedin: { path: "linkedin/posts", key: "posts"  },
  facebook: { path: "facebook/posts", key: "posts"  },
  youtube:  { path: "youtube/videos", key: "videos" },
};

export function apiDirectSupports(platform) {
  return Object.prototype.hasOwnProperty.call(RESOURCE, platform);
}

/**
 * Search one platform for a query. Returns normalized intake items
 * ({platform, external_url, author_handle, author_url, title, body,
 *   posted_at, captured_via:'api_direct', raw}). Throws on HTTP error.
 */
export async function searchApiDirect(platform, query, { page = 1, sortBy = "relevance" } = {}) {
  if (!KEY()) throw new Error("apidirect: API_DIRECT_KEY not set");
  const r = RESOURCE[platform];
  if (!r) throw new Error(`apidirect: unsupported platform ${platform}`);

  const u = new URL(`${BASE}/${r.path}`);
  u.searchParams.set("query", String(query).slice(0, 500));
  u.searchParams.set("page", String(page));
  u.searchParams.set("sort_by", sortBy);

  const res = await fetch(u, { headers: { "X-API-Key": KEY() } });
  if (!res.ok) throw new Error(`apidirect ${platform} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const items = Array.isArray(data[r.key]) ? data[r.key]
    : Array.isArray(data.posts) ? data.posts
    : Array.isArray(data.results) ? data.results
    : [];
  return items.map((p) => normalize(platform, p));
}

function normalize(platform, p) {
  let posted_at = null;
  if (p.date) { const d = new Date(p.date); if (!isNaN(d.getTime())) posted_at = d.toISOString(); }
  return {
    platform,
    external_url:  p.url || null,
    author_handle: p.author || null,
    author_url:    null,                       // unified shape doesn't include it
    title:         p.title || null,
    body:          p.snippet || p.body || p.text || p.description || null,
    posted_at,
    captured_via:  "api_direct",
    raw:           p,                           // keep everything (subreddit, upvotes, sentiment…)
  };
}
