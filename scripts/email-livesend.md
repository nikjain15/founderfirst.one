# Manual email live-send check (W5.3)

**Purpose:** the CI harness (`supabase/functions/_shared/send.harness.test.ts`)
proves the send path *builds and dispatches* correctly with `fetch`/DB stubbed.
It does **not** prove real-world *deliverability* (DNS, SPF/DKIM/DMARC, Resend
domain verification, inbox placement). This is the one-time-per-change manual
step that does.

> **Gating — read first.** This procedure is **manual only**. It is deliberately
> not wired into any CI workflow and hits a real Resend account. Never point it
> at a real user's inbox. Use a mailbox you control (e.g. `founder@` or a
> Resend-verified test address). It is a Nik step because it needs the live
> `RESEND_API_KEY`.

## Option A — through the deployed `email-test` edge function (recommended)

`email-test` already routes through the exact production `sendEmail()` path
(`trigger='test'`, so it's logged in `email_log`). This is the highest-fidelity
check because it exercises the deployed function, the live DB templates/brand,
and the live Resend key.

1. Mint a super-admin session JWT (see LEARNINGS / the admin-welcome note in
   MEMORY for the `generate_link` → `verify` flow). `tester@` is rejected for
   super-admin-only actions; use a real super-admin.
2. Send one built-in template to yourself:

   ```bash
   curl -sS -X POST "$SUPABASE_URL/functions/v1/email-test" \
     -H "Authorization: Bearer $ADMIN_JWT" \
     -H "Content-Type: application/json" \
     -d '{"key":"changelog_nudge","to":"YOUR_TEST_INBOX@example.com"}'
   ```

3. **Confirm deliverability, not just a 200:**
   - the JSON response has `ok:true`, `sent:1`, and a `resendIds:[...]` value;
   - the email actually **lands in the inbox** (not spam) within ~1 min;
   - subject/heading tokens are filled (no stray `{count}` left);
   - `email_log` has a new `status='sent'` row with that `resend_id`;
   - open it → an `email_events` open row links back via `resend_id`.

## Option B — a throwaway local `sendEmail()` call (no deploy)

Use only if you need to test an un-deployed change to the send path. Run against
your own inbox, with a real key, from a scratch file (never commit it):

```ts
// scratch/livesend.ts — DO NOT COMMIT. Run: deno run --allow-net --allow-env scratch/livesend.ts
import { sendEmail } from "../supabase/functions/_shared/send.ts";
// Minimal real Supabase client OR a stub that no-ops the email_log insert.
const res = await sendEmail({
  supa: /* real @supabase/supabase-js client */ null as any,
  key: "changelog_nudge",
  to: ["YOUR_TEST_INBOX@example.com"],
  trigger: "test",
  vars: { count: 1, updateword: "update", thingword: "thing" },
});
console.log(res); // expect { ok:true, sent:1, resendIds:[<id>] }
```

Requires `RESEND_API_KEY` (and `NOTIFY_FROM`) in the env. `--allow-net` is what
lets it reach Resend — that flag is exactly what CI omits, which is why the
harness can never accidentally send.

## Pass criteria

- Real email received in a controlled inbox, correctly rendered, not in spam.
- `email_log` row `status='sent'` with a `resend_id`.
- Open/click tracked in `email_events`.

If any of these fail, the code-level harness will still be green — that gap is
precisely why this manual step exists.
