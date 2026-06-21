/**
 * Signals capture — background service worker.
 *
 * Two capture paths, both POST to the listening-intake edge function with the
 * shared secret (configured once in Options, stored in chrome.storage.local —
 * never exposed to the page):
 *
 *   1. Right-click "Capture to FounderFirst Signals" on selected text — the
 *      reliable path. Works regardless of the site's DOM (Facebook re-renders
 *      and strips injected buttons, so the per-post button is best-effort only).
 *   2. The content-script "→ Signals" button (message type "signals:capture").
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

// Brief badge feedback on the toolbar icon.
function flashBadge(ok) {
  chrome.action.setBadgeText({ text: ok ? "OK" : "X" });
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#1a7f37" : "#b3261e" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2800);
}

// (Re)create the right-click menu on install/update.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Capture to FounderFirst Signals",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  const body = (info.selectionText || "").trim();
  if (!body) { flashBadge(false); return; }
  const r = await postCapture({
    platform: platformFor(tab?.url || info.pageUrl),
    external_url: tab?.url || info.pageUrl || null,
    author_handle: null,
    title: null,
    body,
    captured_via: "extension",
    raw: { captured_from: info.pageUrl || tab?.url || null, via: "context_menu" },
  });
  flashBadge(r.ok);
});

// The in-page "→ Signals" button (best-effort) sends here.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "signals:capture") return false;
  postCapture(msg.payload).then(sendResponse);
  return true;
});
