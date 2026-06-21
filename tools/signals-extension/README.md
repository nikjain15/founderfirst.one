# FounderFirst Signals — capture extension

Internal, unpacked Chrome extension. Adds a **→ Signals** button to each post in
a Facebook group; clicking it sends the post into FounderFirst Signals via the
`listening-intake` edge function. Part of the Signals system — see
`SIGNALS_SOLUTION.md`.

## Load it (unpacked)

1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `tools/signals-extension` folder.
3. Click the extension → **Options** (or right-click → Options). Set:
   - **Intake endpoint** — defaults to the prod function URL; change only for local testing.
   - **Intake secret** — the `LISTENING_INTAKE_SECRET` value (ask the team).
4. Capture a post, either way:
   - **Right-click (reliable):** select the post's text → right-click → **Capture
     to FounderFirst Signals**. The toolbar icon flashes **OK** on success.
   - **Per-post button (best-effort):** on a Facebook group, posts may show a
     **→ Signals** pill (top-right). Facebook re-renders aggressively and can
     strip it, so prefer right-click.

## How it works

- `content-facebook.js` extracts `{ platform, external_url, author_handle,
  author_url, title, body, posted_at, captured_via, raw }` from each post.
- `background.js` holds the secret and POSTs the payload to the endpoint. The
  page never sees the secret.
- The edge function dedups on `external_url` and inserts the item as `pending`;
  the VM worker scores it next.

## Adding another community

Copy `content-facebook.js` to e.g. `content-linkedin.js`, rewrite `extractPost()`
for that site's markup, and add a `content_scripts` entry in `manifest.json`
matching the site. The payload shape and `background.js` stay the same.
