# CSAT — Integration with Dify and the Discord bridge

The Supabase side is done (`SCHEMA-005-csat.sql`). The admin UI shows CSAT
metrics on `/admin/analytics` and inline on each ticket. Until Penny + the
Discord bridge actually call `submit_feedback`, those panels just sit at zero.

This doc spells out exactly what each surface needs to do.

---

## The RPC

Anyone (anon key OK — same trust model as `create_ticket`) can call:

```http
POST  https://ejqsfzggyfsjzrcevlnq.supabase.co/rest/v1/rpc/submit_feedback
Headers:
  apikey:        <anon key>
  Content-Type:  application/json
Body:
  {
    "p_source":           "bot_resolved" | "admin_resolved",
    "p_ticket_id":        "<uuid>" | null,
    "p_channel":          "discord" | "web" | null,
    "p_conversation_ref": "<string>" | null,
    "p_rating":           "up" | "down",
    "p_comment":          "<string>" | null,
    "p_contact_email":    "<string>" | null,
    "p_discord_user_id":  "<string>" | null
  }
```

Rules enforced by the RPC:
- `p_rating` must be `up` or `down`
- `p_source` must be `bot_resolved` or `admin_resolved`
- Must supply **either** `p_ticket_id` **or** both `p_channel` + `p_conversation_ref`
- Re-submitting from the same conversation overwrites the previous rating
  (unique index on `(ticket_id, source)` and `(channel, conversation_ref, source)`)

---

## Surface 1 · Penny resolves on her own  →  `source = "bot_resolved"`

**Where it lives:** Dify workflow.

**Trigger:** Penny's answer node finishes and confidence ≥ threshold (i.e. no
escalation). At the end of the "answer" branch, append:

1. A short follow-up message to the user: _"Did that help? React 👍 or 👎."_
2. An HTTP node (or downstream Discord/web handler) that listens for the
   reaction and posts to `submit_feedback`:

```json
{
  "p_source": "bot_resolved",
  "p_channel": "discord",
  "p_conversation_ref": "<discord thread id>",
  "p_rating": "up" | "down",
  "p_discord_user_id": "<author id>"
}
```

For the web widget the same call uses `"p_channel": "web"` and a session ID.

---

## Surface 2 · Admin resolves a ticket  →  `source = "admin_resolved"`

**Where it lives:** the Discord bridge (Python) — and the web widget when we
build that path.

**Trigger:** the bridge already polls Supabase for new admin messages and
posts them back to the Discord thread (see `discord-bridge/bridge.py`). When
the admin reply is delivered with `resolve = true`, the bridge follows the
delivered message with a short prompt:

> _"Did that solve it? React 👍 or 👎 — and reply with any thoughts."_

A reaction handler in the bridge then posts to `submit_feedback` with the
ticket id it just delivered:

```json
{
  "p_source": "admin_resolved",
  "p_ticket_id": "<ticket uuid>",
  "p_channel": "discord",
  "p_conversation_ref": "<discord thread id>",
  "p_rating": "up" | "down",
  "p_comment": "<optional text reply>",
  "p_discord_user_id": "<author id>"
}
```

---

## Visibility in the admin

- **`/admin/analytics`** — CSAT card (7-day score, up/down counts, total) and a
  recent-ratings panel that shows the last 20 with comments and a link to the
  ticket when one exists.
- **`/admin/support/:ticketId`** — green/red strip above the thread when the
  user rated that ticket.

---

## Why both sources

Bot ratings tell you the quality of Penny's answers — the only signal that
feeds back into the system prompt + KB tuning.

Admin ratings tell you the quality of your own replies — useful but secondary;
you usually know.

Keeping the two `source` values separate lets the analytics card report a
single overall score *and* break it down by who did the resolving when we
want to look closer.
