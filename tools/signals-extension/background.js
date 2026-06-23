/**
 * Signals capture — background service worker.
 *
 * One capture path: right-click "Capture to FounderFirst Signals" on selected
 * text. Works on ANY site. On click we inject a small extractor into the active
 * tab (via activeTab + scripting) that walks up from the selection to the post
 * container and pulls the author + permalink per platform (Reddit / LinkedIn /
 * Facebook / X), with a generic fallback. The captured payload is POSTed to
 * listening-intake with the shared secret from Options (never exposed to the
 * page).
 */

const DEFAULT_ENDPOINT =
  "https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/listening-intake";

const MENU_ID = "signals-capture";

async function getConfig() {
  const { endpoint, secret } = await chrome.storage.local.get(["endpoint", "secret"]);
  return { endpoint: endpoint || DEFAULT_ENDPOINT, secret: secret || "" };
}

function platformFor(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("facebook.com")) return "facebook_group";
  if (u.includes("reddit.com")) return "reddit";
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  return "web";
}

async function postCapture(payload) {
  const { endpoint, secret } = await getConfig();
  if (!secret) return { ok: false, error: "No intake secret set — open the extension Options." };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-listening-secret": secret },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true, item_id: data.item_id };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function flashBadge(ok) {
  chrome.action.setBadgeText({ text: ok ? "OK" : "X" });
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#1a7f37" : "#b3261e" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2800);
}

/**
 * Injected into the page. Reads the current selection, walks up to the nearest
 * post container, and extracts { text, author, permalink, title } using
 * platform-specific selectors with a generic fallback. Must be self-contained
 * (no outer references) — it's serialized into the tab.
 */
function extractAroundSelection() {
  const sel = window.getSelection();
  const text = (sel && sel.toString() ? sel.toString() : "").trim();
  let node = sel && sel.anchorNode ? sel.anchorNode : null;
  let el = node && node.nodeType === 3 ? node.parentElement : node;

  const CONTAINER = '[role="article"], article, [data-testid="tweet"], shreddit-post, .feed-shared-update-v2';
  let container = el;
  for (let i = 0; i < 14 && container; i++) {
    if (container.matches && container.matches(CONTAINER)) break;
    container = container.parentElement;
  }
  container = container || document.body;
  const host = location.hostname;
  const pick = (sels) => { for (const s of sels) { const n = container.querySelector(s); if (n) return n; } return null; };
  const txt = (n) => (n && n.textContent ? n.textContent.replace(/\s+/g, " ").trim().slice(0, 200) : null);
  const href = (n) => (n && n.href ? n.href.split("?")[0] : null);

  let author = null, permalink = null;
  if (host.includes("reddit.com")) {
    author = txt(pick(['a[href*="/user/"]', 'a[data-testid="post_author_link"]']));
    permalink = href(pick(['a[href*="/comments/"]']));
  } else if (host.includes("linkedin.com")) {
    author = txt(pick(['.update-components-actor__name', '.feed-shared-actor__name', "span.actor-name"]));
    permalink = href(pick(['a[href*="/feed/update/"]', 'a[href*="/posts/"]']));
  } else if (host.includes("facebook.com")) {
    author = txt(pick(['h2 a[href]', 'h3 a[href]', 'strong a[href]', 'a[role="link"][href*="/user/"]']));
    permalink = href(pick(['a[href*="/posts/"]', 'a[href*="/permalink/"]', 'a[href*="story_fbid="]', 'a[href*="/groups/"][href*="/posts/"]']));
  } else if (host.includes("x.com") || host.includes("twitter.com")) {
    const a = pick(['div[data-testid="User-Name"] a[href^="/"]', 'a[role="link"][href^="/"]']);
    const h = a && a.getAttribute("href");
    author = h ? "@" + h.split("/").filter(Boolean)[0] : null;
    permalink = href(pick(['a[href*="/status/"]']));
  } else {
    author = txt(pick(['a[rel="author"]', '[itemprop="author"]', ".author", 'a[href*="/user/"]', 'a[href*="/u/"]']));
  }
  return { text, author, permalink: permalink || location.href, title: (document.title || "").slice(0, 200) || null };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: "Capture to FounderFirst Signals", contexts: ["selection"] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  // Try to enrich with author + permalink from the page; fall back gracefully.
  let extracted = {};
  try {
    if (tab?.id != null) {
      const out = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractAroundSelection });
      extracted = (out && out[0] && out[0].result) || {};
    }
  } catch (_e) { /* restricted page — fall back to selection text only */ }

  const body = (extracted.text || info.selectionText || "").trim();
  if (!body) { flashBadge(false); return; }

  const r = await postCapture({
    platform: platformFor(tab?.url || info.pageUrl),
    external_url: extracted.permalink || tab?.url || info.pageUrl || null,
    author_handle: extracted.author || null,
    author_url: null,
    title: null,
    body,
    captured_via: "extension",
    raw: { via: "context_menu", page: info.pageUrl || tab?.url || null, title: extracted.title || null },
  });
  flashBadge(r.ok);
});
