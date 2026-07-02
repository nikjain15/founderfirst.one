# CSAT — Integration with the Worker brain and the Discord bridge

All of this is **live**: the Supabase side (migrations), the admin surfaces in
`/admin/analytics` + `/admin/support/:ticketId`, and the bridge's Discord-side
CSAT prompts + reaction handling. (Dify, named in earlier drafts, was replaced
by the Cloudflare Worker brain.) This doc spells out the architecture and
what's left for non-Discord channels.

---

## Architecture (Discord — what's live now)

```
Penny answers in Discord ──► bridge sends answer
                            ──► bridge sends CSAT prompt + seeds 👍/👎
                                                │
              User taps a reaction ◄────────────┘
                            │
                            ▼
              bridge.on_raw_reaction_add
                            │
                            ▼
              POST /rest/v1/rpc/submit_feedback
                source: "bot_resolved"
                conversation_ref: <discord channel id>
```

```
Admin replies in /admin/support/:ticketId (resolve=true)
                            │
                            ▼
              support_messages row created (author=admin)
                            │
                            ▼
              bridge poller → fetch_undelivered_admin_messages
                            │
                            ▼
              bridge posts admin embed to Discord
                            │
                            ▼
              IF ticket_status = "resolved":
                bridge sends CSAT prompt + seeds 👍/👎
                                │
              User reacts  ◄────┘
                            │
                            ▼
              POST submit_feedback
                source: "admin_resolved"
                ticket_id: <uuid>
```

Both flows use the same in-memory map (`csat_prompt_map`) keyed on the
Discord message id of the prompt. The reaction handler dispatches on the
`source` stored alongside the ticket/conversation refs.

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

## Why the bridge owns Discord CSAT (not Dify)

Dify doesn't see Discord reactions — only the bridge does. The bridge
already owns the Discord I/O surface (sending messages, polling Supabase,
delivering admin replies), so adding reaction handling is one event handler
and one HTTP call. Routing through Dify for this would mean an extra hop
that buys nothing.

For the **web widget** (when we build it), Dify *can* own CSAT natively —
emit the prompt as a message, add up/down buttons, and route the click to
an HTTP node that POSTs `submit_feedback` with `source: "bot_resolved"` and
`channel: "web"`. The RPC accepts that shape today.

---

## Gating (current behavior)

- **Bot CSAT**: prompt fires after *every* Penny reply. Some are escalation
  messages where "did that help?" is a slightly weird question — those
  prompts just sit ignored. Acceptable noise for v1. We can refine by
  having Dify emit a sentinel that the bridge strips and uses to gate
  prompting.
- **Admin CSAT**: prompt fires only when the admin marked the ticket
  *resolved*. In-progress replies stay quiet — user is mid-conversation.

---

## Failure modes (designed)

- Bridge can't reach Supabase → reaction is logged but never recorded.
  Idempotent retry not implemented — feedback is "best effort" and we
  don't want a flaky network to break the bridge.
- Bridge restarts → `csat_prompt_map` resets (in-memory only). Reactions
  on old prompts are dropped silently. This is fine: the prompt is
  ephemeral, the rating window is hours not days.
- User reacts with something other than 👍/👎 → ignored.
