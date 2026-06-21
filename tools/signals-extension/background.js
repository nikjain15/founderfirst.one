/**
 * Signals capture — background service worker.
 *
 * The content script extracts a post and sends it here; we POST it to the
 * listening-intake edge function with the shared secret. Endpoint + secret are
 * configured once in the Options page and live in chrome.storage.local. The
 * secret never touches the page context (content scripts can't read it).
 */

const DEFAULT_ENDPOINT =
  "https://ejqsfzggyfsjzrcevlnq.supabase.co/functions/v1/listening-intake";

async function getConfig() {
  const { endpoint, secret } = await chrome.storage.local.get(["endpoint", "secret"]);
  return { endpoint: endpoint || DEFAULT_ENDPOINT, secret: secret || "" };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "signals:capture") return false;

  (async () => {
    const { endpoint, secret } = await getConfig();
    if (!secret) {
      sendResponse({ ok: false, error: "No intake secret set. Open the extension Options." });
      return;
    }
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-listening-secret": secret,
        },
        body: JSON.stringify(msg.payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        sendResponse({ ok: false, error: data.error || `HTTP ${res.status}` });
        return;
      }
      sendResponse({ ok: true, item_id: data.item_id });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true; // keep the message channel open for the async response
});
