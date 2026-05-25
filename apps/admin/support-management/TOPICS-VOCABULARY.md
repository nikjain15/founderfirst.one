# Support topic vocabulary

Tickets get a free-form `topic` string in the database, but in practice the
admin UI restricts to this list. The list is mirrored in
[`apps/admin/src/lib/topics.ts`](../src/lib/topics.ts) — keep them in sync.

| Topic              | When to use                                                                 |
|--------------------|------------------------------------------------------------------------------|
| `billing`          | Pricing, payments, invoices, refunds, plan changes                          |
| `bug`              | Something is broken — error messages, wrong output, crashes                 |
| `integration`      | Stripe, QuickBooks, Xero, bank connections, anything that talks to a 3rd-party |
| `how-to`           | Usage questions — "how do I…", "where is the X button"                      |
| `feature-request`  | "It would be nice if Penny could…" — wishes, missing capabilities           |
| `account`          | Login, profile, password, account deletion, email change                    |
| `other`            | Doesn't fit cleanly into the above. Watch this bucket — if it grows, split it. |

## Adding a new topic

When `other` starts collecting >20% of tickets in a given week, that's the
signal to introduce a new bucket. Steps:

1. Add it to `TOPICS` in `apps/admin/src/lib/topics.ts`.
2. Append it to this table.
3. Update the Dify classify prompt (in `SYSTEM-PROMPT.md` or wherever the
   Haiku classify node lives) so the bot knows about the new bucket and
   when to assign it.

No DB change needed — `topic` is a free-form column.

## Dify integration

The Dify classify step should output a `topic` value from this list, and the
escalation HTTP node should pass it as `p_topic` to `create_ticket`:

```jsonc
// create_ticket payload (only the topic-relevant bit shown)
{
  // …all existing fields…
  "p_topic": "billing"   // one of the seven values above
}
```

If the classifier isn't sure, omit `p_topic` entirely — the ticket lands
"untagged" and you can set it from the admin UI.
