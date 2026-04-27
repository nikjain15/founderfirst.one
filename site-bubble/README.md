# Penny site bubble

A floating Penny chat widget for **founderfirst.one**. Backed by Claude (live LLM, not scripted), answers only from the site's own content, logs every conversation to Supabase, and captures any email or phone the visitor shares.

## What it is

| Piece | Path | What it does |
|---|---|---|
| Bubble UI | `bubble/` | Self-mounting Preact + htm widget. Bundled to a single ~15KB gzipped JS file. Lives in a Shadow DOM so host-page styles can't reach it. |
| Worker | `worker/` | Cloudflare Worker. Three endpoints: `GET /bubble.js`, `POST /chat`, `POST /waitlist`. |
| System prompt | `worker/penny-site-system.md` | The base prompt the model sees on every turn. |
| Site content | `worker/src/site-content.ts` | The bundled ground truth Penny is allowed to speak from. |
| Schema | `supabase/schema.sql` | Two tables (`penny_site_chats`, `penny_site_leads`) + RLS + 90-day retention helper. |
| Tests | `tests/` | `node --test` — regex extractors, CTA decision tree, JSON parse shapes. |

## Architecture in one paragraph

The Worker serves `bubble.js` from the same origin so the site only needs one `<script defer>` line. When a visitor types, the bubble POSTs to `/chat`; the Worker logs the user turn to Supabase, runs email/phone regex (logs to `penny_site_leads` if found), injects `<site_content>` and `<session_state>` into the system prompt, calls Claude Haiku 4.5, applies the CTA decision tree as a runtime safety net over whatever the model chose, logs Penny's turn, and returns `{ reply, sessionState }`. Sessions live in `sessionStorage` (fresh per tab — matches Penny demo settled decision 23). RLS denies all access for anon/authenticated; only the service-role key the Worker holds can read or write.

## Deploy

### 1. Supabase

Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. Re-run-safe.

Get from the project settings:
- `SUPABASE_URL` (e.g. `https://abcd.supabase.co`)
- `SUPABASE_SERVICE_KEY` (service-role key — **never** expose client-side)

### 2. Worker

```bash
cd site-bubble/worker
npm install
wrangler login

# KV for site-content cache
wrangler kv:namespace create SITE_CACHE
# paste the returned id into wrangler.toml

# Secrets
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY

# Build the bubble first — wrangler bundles it into the worker.
cd ../bubble && npm install && npm run build

# Deploy
cd ../worker && wrangler deploy
```

Wrangler will print a URL like `https://penny-site-bubble.<acct>.workers.dev`. Add a Cloudflare custom domain (recommended: `bubble.founderfirst.one`) so the script tag stays clean.

### 3. Mount on every page

Add **one** line to the shared layout / each HTML page:

```html
<script defer src="https://bubble.founderfirst.one/bubble.js"></script>
```

The Worker domain is auto-detected from the script's own `src` — you don't need to configure it twice. To override (e.g. preview deploys), pass `data-worker`:

```html
<script defer src=".../bubble.js" data-worker="https://bubble-staging.founderfirst.one"></script>
```

**founderfirst.one CSP update.** The current CSP blocks foreign scripts. Add to `<meta http-equiv="Content-Security-Policy" …>` in `index.html`:

- `script-src` … add `https://bubble.founderfirst.one`
- `connect-src` … add `https://bubble.founderfirst.one`

The site uses no shared `_layouts/` partial today, so the script tag must be added to each HTML page (`index.html`, `penny/cpa/index.html`, `penny/businessowner/index.html`, etc.). Future pages need the line added too — consider migrating to a Jekyll `_layouts/default.html` to centralize this.

## Tests

```bash
cd site-bubble
npm test
```

Covers:
- Email + phone extraction across +1, dashes, parens, dots, plus-addressing.
- Buying-signal and soft-decline regex.
- CTA decision tree — every branch.
- Model-JSON parser — fenced, bare, malformed, edge cases (10 samples).

## Updating Penny's knowledge

Penny only speaks to what's in [`worker/src/site-content.ts`](worker/src/site-content.ts). When the marketing site changes, update that file and redeploy:

```bash
cd site-bubble/worker && wrangler deploy
```

The KV cache TTL is 15 minutes, so existing visitors stop seeing stale content within that window without any action.

## Out of scope

- Visitor authentication (anonymous sessions only).
- Admin dashboard for reading logs (query Supabase directly).
- Multi-language (English only).
- Live site crawl (we use a bundled snapshot — tighter control over what Penny "knows").
