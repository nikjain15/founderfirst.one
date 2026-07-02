# FounderFirst Signals — capture extension

Internal, unpacked Chrome extension. Select a post's text on **any site**,
right-click → **Capture to FounderFirst Signals**, and it's sent into
FounderFirst Signals via the `listening-intake` edge function. Part of the
Signals system — see [../signals-worker/SOLUTION.md](../signals-worker/SOLUTION.md).

## Load it (unpacked)

1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `tools/signals-extension` folder.
3. Click the extension → **Options** (or right-click → Options). Set:
   - **Intake endpoint** — defaults to the prod function URL; change only for local testing.
   - **Intake secret** — the `LISTENING_INTAKE_SECRET` value. Read it from the
     Supabase Vault (`listening_intake_secret`) or ask the team.
4. Capture a post: select the post's text → right-click → **Capture to
   FounderFirst Signals**. The toolbar icon flashes **OK** on success, **X** on
   failure (most often: no/incorrect intake secret).

## How it works

- `background.js` injects a small extractor into the active tab (via `activeTab`
  + `scripting`) that walks up from the selection to the post container and pulls
  `{ platform, external_url, author_handle, title, body, captured_via, raw }`.
  Platform-aware selectors cover **Reddit, LinkedIn, Facebook, X/Twitter**, with
  a generic fallback for any other site.
- `background.js` holds the secret and POSTs the payload to the endpoint. The
  page never sees the secret.
- The edge function dedups on `external_url` and inserts the item as `pending`;
  the VM worker scores it next.

## Adding richer extraction for another platform

The right-click path already works everywhere via the generic fallback. To get
better author/permalink extraction on a specific site, add a branch to
`extractAroundSelection()` in `background.js` with that site's selectors — no
content script or new permissions needed.
