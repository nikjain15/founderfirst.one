/**
 * Signals capture — Facebook group content script.
 *
 * Injects a "→ Signals" button onto each post in a Facebook group. On click it
 * extracts the post's text, author, profile link, and permalink, then hands the
 * payload to the background worker (which holds the secret and POSTs it).
 *
 * Facebook's markup is obfuscated and changes often, so selectors are
 * best-effort with fallbacks. This is the FIRST community template; other
 * platforms get their own content script following the same shape:
 *   extractPost(article) -> { platform, external_url, author_handle, author_url,
 *                             title, body, posted_at, captured_via, raw }
 * then sendCapture(payload).
 */

(() => {
  const TAG = "data-ff-signals";

  function groupName() {
    // og:title is usually the group name; fall back to document title.
    const og = document.querySelector('meta[property="og:title"]');
    return (og?.getAttribute("content") || document.title || "Facebook group").trim();
  }

  function extractPost(article) {
    // Author: aria-label on the article is often "Post by <Name>".
    let author = null;
    const aria = article.getAttribute("aria-label") || "";
    const m = aria.match(/^Post by (.+)$/i) || aria.match(/^(.+)'s post$/i);
    if (m) author = m[1].trim();

    // Author profile link (first link to a user/profile inside the header).
    let authorUrl = null;
    const profileLink = article.querySelector(
      'a[href*="/user/"], a[href*="/profile.php"], h2 a[href*="facebook.com/"], h3 a[href*="facebook.com/"], h4 a[href*="facebook.com/"]'
    );
    if (profileLink) {
      authorUrl = profileLink.href.split("?")[0];
      if (!author) author = (profileLink.textContent || "").trim() || null;
    }

    // Post body: FB tags the message container a couple of ways.
    let body = null;
    const msg =
      article.querySelector('[data-ad-comet-preview="message"]') ||
      article.querySelector('[data-ad-preview="message"]') ||
      article.querySelector('[data-testid="post_message"]');
    if (msg) body = (msg.innerText || "").trim();
    if (!body) {
      // Fallback: the article's own text, minus obvious chrome.
      body = (article.innerText || "").trim().slice(0, 5000);
    }

    // Permalink: the timestamp link points at the post.
    let url = null;
    const permalink = article.querySelector(
      'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="], a[href*="/groups/"][href*="/permalink/"]'
    );
    if (permalink) url = permalink.href.split("?")[0];

    return {
      platform: "facebook_group",
      external_url: url,
      author_handle: author,
      author_url: authorUrl,
      title: null,
      body,
      posted_at: null,
      captured_via: "extension",
      raw: { group: groupName(), captured_from: location.href },
    };
  }

  function sendCapture(payload, btn) {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Sending…";
    chrome.runtime.sendMessage({ type: "signals:capture", payload }, (resp) => {
      if (chrome.runtime.lastError) {
        flash(btn, "Error", false);
      } else if (resp?.ok) {
        flash(btn, "✓ Captured", true);
      } else {
        flash(btn, resp?.error ? "✕ " + resp.error.slice(0, 24) : "✕ Failed", false);
      }
      setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
        btn.className = "ff-signals-btn";
      }, 2600);
    });
  }

  function flash(btn, text, ok) {
    btn.textContent = text;
    btn.className = "ff-signals-btn " + (ok ? "ff-signals-ok" : "ff-signals-err");
  }

  function decorate(article) {
    if (article.getAttribute(TAG)) return;
    article.setAttribute(TAG, "1");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ff-signals-btn";
    btn.textContent = "→ Signals";
    btn.title = "Capture this post to FounderFirst Signals";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const payload = extractPost(article);
      if (!payload.body && !payload.title) {
        flash(btn, "✕ No text found", false);
        setTimeout(() => { btn.textContent = "→ Signals"; btn.className = "ff-signals-btn"; }, 2000);
        return;
      }
      sendCapture(payload, btn);
    });

    // Position relative to the article so the button floats top-right.
    if (getComputedStyle(article).position === "static") {
      article.style.position = "relative";
    }
    article.appendChild(btn);
  }

  function scan() {
    document.querySelectorAll('div[role="article"]').forEach(decorate);
  }

  // Initial pass + observe the infinite-scroll feed for new posts.
  scan();
  const obs = new MutationObserver(() => {
    // Debounce-ish: schedule a single scan on the next frame.
    if (obs._scheduled) return;
    obs._scheduled = true;
    requestAnimationFrame(() => { obs._scheduled = false; scan(); });
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
