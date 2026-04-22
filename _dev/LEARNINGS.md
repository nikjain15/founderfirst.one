# Engineering Learnings & Reference

> Running log of bugs hit, why they happened, and how to prevent them.
> Add to this any time something breaks in a non-obvious way.

---

## Table of Contents
1. [Content Security Policy (CSP)](#1-content-security-policy-csp)
2. [Git Workflow](#2-git-workflow)
3. [GitHub Pages Gotchas](#3-github-pages-gotchas)

---

## 1. Content Security Policy (CSP)

### What is CSP?
A meta tag (or HTTP header) that tells the browser exactly which external resources the page is allowed to load or contact. If something isn't listed, the browser blocks it **silently** — no visible error, just a blank page or broken feature.

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src  'self' 'unsafe-inline' https://cdn.example.com;
  style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src    https://fonts.gstatic.com;
  connect-src https://my-api.workers.dev blob:;
  img-src     'self' data: blob:;
  base-uri    'self';
  form-action 'self'
" />
```

### Directive cheat-sheet

| You're adding… | Directive to update |
|---|---|
| `fetch()` or `XMLHttpRequest` to a URL | `connect-src <url>` |
| `<script src="...">` from a CDN | `script-src <cdn-domain>` |
| Inline `<script>` blocks | `script-src 'unsafe-inline'` |
| Google Fonts stylesheet link | `style-src https://fonts.googleapis.com` |
| Google Fonts actual font files | `font-src https://fonts.gstatic.com` |
| `fetch(blob:...)` (e.g. bundler inlining scripts) | `connect-src blob:` |
| `new Worker(blob:...)` | `worker-src blob:` |
| `<img src="data:...">` or canvas toDataURL | `img-src data:` |
| Supabase client calls | `connect-src https://<project>.supabase.co` |

### Always use the full `https://` scheme
```
# WRONG — no scheme, some browsers treat as relative path
connect-src my-api.workers.dev

# RIGHT
connect-src https://my-api.workers.dev
```

### Bugs we actually hit in this project

#### Bug 1 — Blank demo pages (April 2026)
**Symptom:** `founderfirst.one/penny/businessowner/` and `/penny/cpa/` loaded completely blank.  
**Root cause:** The bundler uses `fetch(blob:...)` to inline JSX/Babel component scripts before Babel transpiles them. `blob:` was missing from `connect-src` so every fetch was silently blocked → React never mounted.  
**Fix:** Added `blob:` to `connect-src` in both demo `index.html` files.

#### Bug 2 — Email signups silently failing (April 2026)
**Symptom:** Waitlist form appeared to submit but nothing was saved to Supabase.  
**Root cause:** The main `index.html` CSP had stale entries (`penny-api...workers.dev`, `api.anthropic.com`) in `connect-src` but was **missing** the Supabase project URL that the page actually calls.  
**Fix:** Replaced `connect-src` with `https://ejqsfzggyfsjzrcevlnq.supabase.co`.

#### Bug 3 — Missing `https://` scheme (April 2026)
**Symptom:** Same as Bug 1/2 — requests blocked in certain browsers.  
**Root cause:** `connect-src penny-api.nikjain1588.workers.dev` written without scheme.  
**Fix:** Always write the full `https://` scheme in every CSP value.

### The golden rule
> **Update the CSP in the same commit as adding the fetch/load.**  
> If you add a new `fetch()`, new CDN script, or new API call and don't update CSP, it will work locally (because localhost is often exempt) and break on the live site.

### How to debug a CSP block
1. Open DevTools → Console. CSP violations show as red errors like:  
   `Refused to connect to 'https://...' because it violates the Content Security Policy directive: "connect-src ..."`
2. Copy the blocked URL, identify which directive it belongs to (table above), add it.
3. If the page is totally blank with no console errors, check the Network tab — blocked requests show as `(blocked:csp)`.

---

## 2. Git Workflow

### Why pushes keep getting rejected
The GitHub Actions `deploy-log.yml` workflow auto-commits a log entry to `_dev/DEPLOY_LOG.md` on every push. This means by the time your next push arrives, remote is already 1 commit ahead.

**Fix pattern — always:**
```bash
git pull --rebase && git push
```

Never just `git push` cold after a previous push. The rebase keeps history clean (no merge commits).

### Stash pattern when pull fails mid-work
```bash
git stash          # save uncommitted work
git pull --rebase  # get remote commits
git stash pop      # restore your work
git add -A && git commit -m "..." && git push
```

---

## 3. GitHub Pages Gotchas

### Cache delay on deploy
GitHub Pages serves through Fastly CDN with a `max-age=600` (10 min) cache. After a push:
- New files appear in ~30–60 seconds
- Updated/deleted files can take up to 10 minutes to propagate
- Old URLs may still return 200 while new URLs return 404 during this window

**Don't panic** — wait 1–2 minutes and recheck before debugging.

### Renaming files/folders — update ALL references
When renaming a route (e.g. `penny/demo` → `penny/businessowner`), grep the entire repo before touching anything:

```bash
grep -rn "old-path" . --include="*.html" --include="*.js" --include="*.md" --include="*.yml" | grep -v ".git/"
```

Files to check in this repo:
- `index.html` — nav links
- `_dev/worker/inject-claude.js` — build script paths
- `_dev/stress-tests/*.js` — test file paths
- `_dev/stress-tests/stress-test-guide.md` — documented URLs
- Any GitHub Actions workflow referencing file paths

### GitHub Pages doesn't support redirects
There is no built-in redirect from old URL → new URL on GitHub Pages (no `.htaccess`, no `_redirects` file). If external links point to old URLs, they will 404. Options:
- Add a stub `index.html` at the old path that does a JS `window.location` redirect
- Use a custom domain with Cloudflare in front (supports Page Rules / Redirect Rules)
