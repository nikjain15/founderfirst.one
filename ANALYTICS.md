# Analytics — FounderFirst & Penny

*Last updated: 25 April 2026*

Single reference for every analytics tool wired into founderfirst.one and the Penny demo. If you add a new public page, follow the rules at the bottom.

---

## What's running, where

| Tool | Purpose | Property / Key | Where it's installed |
|---|---|---|---|
| **Google Analytics 4** | Site-wide traffic, sessions, sources, geography, realtime | Measurement ID `G-FLF1HF4ZK2` · Stream `FounderFirst Web` · Stream ID `14585540883` · URL `https://founderfirst.one` | All public HTML pages on founderfirst.one (see file list below) |
| **PostHog** | Product analytics, autocapture, exception tracking, identified-user funnels for the Penny demo | Project key `phc_twJyxBZQzLrzNoKBG52uKwFtVDL6pb3ixyYPabjBh2Qw` · Host `https://us.i.posthog.com` | Root `index.html` (FounderFirst homepage) and the Penny demo bundle (`BookKeeping/demo/util/analytics.js` → built into `penny/demo/` and `tools/penny-demo-v5/`) |

The two tools are complementary, not redundant. GA4 answers "how many people, from where, on what." PostHog answers "what did each person do, did they convert, did anything throw."

---

## Google Analytics 4

### Setup (done 25 Apr 2026)

1. Created GA4 property `FounderFirst` under the Google account, US Pacific time, USD.
2. Created Web stream `FounderFirst Web` for `https://founderfirst.one`. Enhanced measurement ON (page views, scrolls, outbound clicks, site search, video, file downloads, form interactions).
3. Pasted the gtag.js snippet into every public HTML page (see list below).
4. Updated CSP `<meta>` headers on the three pages that set one to allow Google's domains.
5. Committed + pushed to `main`. GitHub Pages rebuilt. Verified the tag is live on the deployed homepage via `curl`.

### The snippet (must appear immediately after `<title>` on every public page)

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-FLF1HF4ZK2"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-FLF1HF4ZK2');
</script>
```

### CSP additions required when a page sets a `<meta http-equiv="Content-Security-Policy">`

| Directive | Add |
|---|---|
| `script-src` | `https://www.googletagmanager.com` |
| `connect-src` | `https://www.google-analytics.com https://*.analytics.google.com https://*.google-analytics.com https://www.googletagmanager.com` |
| `img-src` | `https://www.google-analytics.com https://*.google-analytics.com` |

### Files updated

- [index.html](index.html) — root homepage (CSP updated)
- [penny/businessowner/index.html](penny/businessowner/index.html) (CSP updated)
- [penny/cpa/index.html](penny/cpa/index.html) (CSP updated)
- [penny/demo/index.html](penny/demo/index.html)
- [penny/demo/cpa/index.html](penny/demo/cpa/index.html)
- [penny/demo/color-comparison.html](penny/demo/color-comparison.html)
- [tools/penny-demo-v5/index.html](tools/penny-demo-v5/index.html)
- [tools/penny-demo-v5/cpa/index.html](tools/penny-demo-v5/cpa/index.html)
- [tools/penny-demo-v5/color-comparison.html](tools/penny-demo-v5/color-comparison.html)

### Verification

- `curl https://founderfirst.one/ | grep gtag` returns the script tag and config call.
- GA4 → **Reports → Realtime** shows live visits within ~30s of a real browser hit.
- The "Data collection isn't active" banner on the Stream details page clears within ~24h once data flows.

### Pending — connect GA MCP server (next session)

Goal: query GA4 data directly from Claude Code via the [google-analytics-mcp](https://github.com/googleanalytics/google-analytics-mcp) server. Steps when we pick it up:

1. Create / pick a Google Cloud project. Enable the **Google Analytics Data API**.
2. Create a service account, generate a JSON key, download it.
3. In GA4 → Admin → Property → Property Access Management, add the service account email as **Viewer**.
4. Install the MCP server (`uvx google-analytics-mcp` or per repo README).
5. Add to Claude Code config (`~/.claude/settings.json` or via `claude mcp add`). Point it at the JSON key path and the GA4 property ID.
6. Test by asking Claude to pull realtime users or a 7-day report.

---

## PostHog

### Setup

PostHog was wired before GA4. It serves two roles:

1. **FounderFirst homepage** ([index.html](index.html)) — autocapture for clicks/forms, identified-only person profiles, exception autocapture, manual `posthog.capture()` calls for key CTAs.
2. **Penny demo** ([BookKeeping/demo/util/analytics.js](BookKeeping/demo/util/analytics.js)) — wraps PostHog with a typed `track()` helper, fires events for onboarding steps, approval-card actions, capture flows. Built into the `penny/demo/` and `tools/penny-demo-v5/` bundles. Setup history is logged in [BookKeeping/demo/implementation/posthog-setup-report.md](BookKeeping/demo/implementation/posthog-setup-report.md).

### Init pattern (homepage)

```js
window.FF_CONFIG = {
  posthogKey:  'phc_twJyxBZQzLrzNoKBG52uKwFtVDL6pb3ixyYPabjBh2Qw',
  posthogHost: 'https://us.i.posthog.com',
};
posthog.init(cfg.posthogKey, {
  api_host:                cfg.posthogHost,
  autocapture:             true,
  capture_pageview:        false,         // we fire pageviews manually
  enableExceptionAutocapture: true,
  person_profiles:         'identified_only',
});
```

`capture_pageview: false` is intentional — pageviews are fired manually so SPA-style transitions in the demo don't double-count.

### CSP entries already in place

`script-src https://cdn.jsdelivr.net` (loads `posthog-js`), `connect-src https://us.i.posthog.com https://us-assets.i.posthog.com`.

---

## Privacy & data flow

- **No PII in event properties.** Don't pass email, full name, or auth tokens to GA4 or PostHog event params. PostHog person profiles are `identified_only` — anonymous visitors stay anonymous.
- **GA4 Redact data** is enabled for email (default). URL query keys redaction is currently inactive — revisit if any page ever puts an email in a query string.
- **AI training on user data is opt-in only** (settled decision in [CLAUDE.md](CLAUDE.md) §2). PostHog is product analytics, not a training source.

---

## Rules for new public HTML pages

If you add a new page that will be served on founderfirst.one:

1. Drop the GA4 gtag snippet (above) immediately after `<title>`.
2. If the page has a CSP `<meta>`, add the directives in the CSP table above.
3. PostHog is only on pages that need product analytics — the homepage and the Penny demo. Static marketing pages can stay GA-only.
4. Update [CLAUDE.md](CLAUDE.md) §2 row "Analytics" only if the policy itself changes.
5. Commit, push to `main`, wait for the Pages deploy, verify with `curl founderfirst.one/<new-path> | grep gtag`.
