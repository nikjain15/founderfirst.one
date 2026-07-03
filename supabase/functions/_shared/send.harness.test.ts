/**
 * [W5.3] send.harness.test.ts — CI-safe proof that the transactional email send
 * path (sendEmail in _shared/send.ts) actually builds and dispatches correctly.
 *
 * Until now "email works" was verified in code only — no test exercised the real
 * Resend POST + email_log write. This harness stubs global `fetch` (so it NEVER
 * hits the real Resend endpoint or any real inbox) and a duck-typed Supabase
 * client, then asserts, for representative emails:
 *
 *   • the correct Resend payload is built (endpoint, auth header, from, to/bcc,
 *     subject, html, text) — subject/heading tokens filled from vars,
 *   • single-recipient → normal `to`; multi-recipient → BCC (privacy) with `to`
 *     set to our own From,
 *   • a Resend error response is handled (ok=false, failed counted) and logged,
 *   • a missing RESEND_API_KEY short-circuits (no fetch) and logs `failed`,
 *   • exactly one email_log row is written per Resend call, with the right
 *     status / resend_id / recipient_count.
 *
 * Covered templates: signals_digest (built-in digest, BCC path), changelog_nudge
 * (built-in nudge, single recipient), and a generic custom template with an
 * admin-authored body (the invoice-style "send arbitrary copy" path).
 *
 * This file does NOT import a live network or DB — it is safe to run in CI:
 *   deno test supabase/functions/_shared/send.harness.test.ts
 *
 * For a REAL deliverability check against a live inbox, see the manual live-send
 * procedure in scripts/email-livesend.md (gated; never runs in CI).
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FALLBACK, sendEmail, type TemplateRow } from "./send.ts";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Records the outgoing Resend request and returns a canned response. */
function stubFetch(
  response: { status: number; body: unknown },
): { restore: () => void; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    const h = init?.headers;
    if (h && typeof h === "object" && !Array.isArray(h)) {
      for (const [k, v] of Object.entries(h)) headers[k] = String(v);
    }
    calls.push({
      url,
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return Promise.resolve(
      new Response(JSON.stringify(response.body), { status: response.status }),
    );
  }) as typeof fetch;
  return { restore: () => (globalThis.fetch = original), calls };
}

interface LoggedRow {
  email_key: string;
  subject: string;
  recipient_count: number;
  trigger: string;
  status: string;
  resend_id: string | null;
  error: string | null;
}

/**
 * Minimal Supabase-shaped stub. sendEmail() calls:
 *   supa.from("email_brand").select("*").eq("id",true).maybeSingle()   → brand
 *   supa.from("email_templates").select("*").eq(...).maybeSingle()      → template
 *   supa.from("email_log").insert(row)                                  → log
 * We return no brand/template rows (forces the code-side FALLBACK, which is what
 * a wiped table must still send with) and record every email_log insert.
 */
function stubSupa(opts: { template?: TemplateRow } = {}): {
  supa: unknown;
  logs: LoggedRow[];
} {
  const logs: LoggedRow[] = [];
  const supa = {
    from(table: string) {
      if (table === "email_log") {
        return {
          insert(row: LoggedRow) {
            logs.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      // email_brand / email_templates select chain → maybeSingle
      const data = table === "email_templates" && opts.template
        ? opts.template
        : null;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data }),
      };
      return chain;
    },
  };
  return { supa, logs };
}

/** Run body with RESEND_API_KEY / NOTIFY_FROM set, then restore env. */
async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = Deno.env.get(k);
    if (v === undefined) Deno.env.delete(k);
    else Deno.env.set(k, v);
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

const RESEND_URL = "https://api.resend.com/emails";
const FROM = "FounderFirst <founder@founderfirst.one>";

// ---------------------------------------------------------------------------
// 1. Single-recipient nudge — builds the correct payload, normal To, logs sent
// ---------------------------------------------------------------------------

Deno.test("changelog_nudge: single recipient builds correct Resend payload + logs sent", async () => {
  const fetchStub = stubFetch({ status: 200, body: { id: "re_nudge_1" } });
  const { supa, logs } = stubSupa();
  try {
    await withEnv({ RESEND_API_KEY: "test_key", NOTIFY_FROM: FROM }, async () => {
      const res = await sendEmail({
        supa,
        key: "changelog_nudge",
        to: ["admin@founderfirst.one"],
        trigger: "cron",
        vars: { count: 3, updateword: "updates", thingword: "things" },
        ctaHref: "https://founderfirst.one/admin/whats-new",
      });

      assertEquals(res.ok, true);
      assertEquals(res.sent, 1);
      assertEquals(res.failed, 0);
      assertEquals(res.resendIds, ["re_nudge_1"]);
    });

    // exactly one Resend call, to the right endpoint with bearer auth
    assertEquals(fetchStub.calls.length, 1);
    const call = fetchStub.calls[0];
    assertEquals(call.url, RESEND_URL);
    assertEquals(call.headers["Authorization"], "Bearer test_key");
    assertEquals(call.headers["Content-Type"], "application/json");

    // single recipient → normal To (no BCC), correct From
    assertEquals(call.body.from, FROM);
    assertEquals(call.body.to, ["admin@founderfirst.one"]);
    assertEquals(call.body.bcc, undefined);

    // subject token {count} filled from vars (FALLBACK subject: "{count} {updateword} ready to send")
    assertEquals(call.body.subject, "3 updates ready to send");
    // html + text present and carry the filled heading
    assertStringIncludes(String(call.body.html), "digest is ready for you");
    assert(String(call.body.text).length > 0);

    // one email_log row, status sent, resend_id linked
    assertEquals(logs.length, 1);
    assertEquals(logs[0].email_key, "changelog_nudge");
    assertEquals(logs[0].status, "sent");
    assertEquals(logs[0].recipient_count, 1);
    assertEquals(logs[0].resend_id, "re_nudge_1");
    assertEquals(logs[0].trigger, "cron");
    assertEquals(logs[0].error, null);
  } finally {
    fetchStub.restore();
  }
});

// ---------------------------------------------------------------------------
// 2. Multi-recipient digest — BCC privacy path, To = our own From
// ---------------------------------------------------------------------------

Deno.test("signals_digest: multiple recipients use BCC (privacy) with To=From", async () => {
  const fetchStub = stubFetch({ status: 200, body: { id: "re_digest_1" } });
  const { supa, logs } = stubSupa();
  try {
    await withEnv({ RESEND_API_KEY: "test_key", NOTIFY_FROM: FROM }, async () => {
      const res = await sendEmail({
        supa,
        key: "signals_digest",
        to: ["a@x.com", "b@x.com", "c@x.com"],
        trigger: "cron",
        vars: { n: 3, leadword: "leads", topIntent: 92 },
        ctaHref: "https://founderfirst.one/admin/audience#signals",
      });
      assertEquals(res.ok, true);
      assertEquals(res.sent, 3);
    });

    assertEquals(fetchStub.calls.length, 1);
    const call = fetchStub.calls[0];
    // BCC holds the real recipients; To is our own From so recipients can't see each other
    assertEquals(call.body.to, [FROM]);
    assertEquals(call.body.bcc, ["a@x.com", "b@x.com", "c@x.com"]);
    assertEquals(call.body.subject, "3 new leads · top intent 92");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].recipient_count, 3);
    assertEquals(logs[0].status, "sent");
  } finally {
    fetchStub.restore();
  }
});

// ---------------------------------------------------------------------------
// 3. Generic custom template with an admin body (the invoice-style copy path)
// ---------------------------------------------------------------------------

Deno.test("generic custom template: admin body renders + dispatches to a single recipient", async () => {
  // Mirrors what an admin "custom email" / invoice-style notice looks like: a
  // template row with an authored `body` (no code buildBody).
  const template: TemplateRow = {
    email_key: "invoice_sent",
    eyebrow: "FounderFirst",
    subject: "Invoice {invoiceNo} for {customer}",
    preheader: "Your invoice is ready.",
    heading: "Invoice {invoiceNo}",
    intro: "",
    cta_label: "View invoice",
    footer: "Thanks for your business, {customer}.",
    body: "Hi {customer},\n\nInvoice {invoiceNo} for {amount} is attached.\n\nDue {dueDate}.",
  };
  const fetchStub = stubFetch({ status: 200, body: { id: "re_inv_1" } });
  const { supa, logs } = stubSupa({ template });
  try {
    await withEnv({ RESEND_API_KEY: "test_key", NOTIFY_FROM: FROM }, async () => {
      const res = await sendEmail({
        supa,
        key: "invoice_sent",
        to: ["customer@acme.com"],
        trigger: "admin",
        vars: {
          invoiceNo: "INV-1042",
          customer: "Acme Co",
          amount: "$2,400.00",
          dueDate: "2026-08-01",
        },
        ctaHref: "https://penny.founderfirst.one/invoices/1042",
      });
      assertEquals(res.ok, true);
      assertEquals(res.sent, 1);
    });

    const call = fetchStub.calls[0];
    assertEquals(call.body.subject, "Invoice INV-1042 for Acme Co");
    assertEquals(call.body.to, ["customer@acme.com"]);
    // admin body tokens filled + HTML-escaped into paragraphs
    assertStringIncludes(String(call.body.html), "Invoice INV-1042 for $2,400.00");
    assertStringIncludes(String(call.body.html), "Hi Acme Co");
    // plain-text alternative also carries the filled copy
    assertStringIncludes(String(call.body.text), "INV-1042");

    assertEquals(logs.length, 1);
    assertEquals(logs[0].email_key, "invoice_sent");
    assertEquals(logs[0].status, "sent");
  } finally {
    fetchStub.restore();
  }
});

// ---------------------------------------------------------------------------
// 4. Resend error response is handled + logged failed (deliverability failure)
// ---------------------------------------------------------------------------

Deno.test("Resend 4xx error: reported failed and logged with error detail", async () => {
  const fetchStub = stubFetch({
    status: 422,
    body: { name: "validation_error", message: "invalid to field" },
  });
  const { supa, logs } = stubSupa();
  try {
    await withEnv({ RESEND_API_KEY: "test_key", NOTIFY_FROM: FROM }, async () => {
      const res = await sendEmail({
        supa,
        key: "changelog_nudge",
        to: ["bad@"],
        trigger: "cron",
        vars: { count: 1, updateword: "update", thingword: "thing" },
      });
      assertEquals(res.ok, false);
      assertEquals(res.sent, 0);
      assertEquals(res.failed, 1);
      assertEquals(res.resendIds, []);
    });

    assertEquals(logs.length, 1);
    assertEquals(logs[0].status, "failed");
    assertEquals(logs[0].resend_id, null);
    assert(logs[0].error !== null);
    assertStringIncludes(String(logs[0].error), "validation_error");
  } finally {
    fetchStub.restore();
  }
});

// ---------------------------------------------------------------------------
// 5. Missing RESEND_API_KEY short-circuits — no network call, logs failed
// ---------------------------------------------------------------------------

Deno.test("missing RESEND_API_KEY: no fetch, returns failed, logs resend_key_missing", async () => {
  const fetchStub = stubFetch({ status: 200, body: { id: "should_not_be_called" } });
  const { supa, logs } = stubSupa();
  try {
    await withEnv({ RESEND_API_KEY: undefined, NOTIFY_FROM: FROM }, async () => {
      const res = await sendEmail({
        supa,
        key: "changelog_nudge",
        to: ["admin@founderfirst.one"],
        trigger: "cron",
        vars: { count: 1, updateword: "update", thingword: "thing" },
      });
      assertEquals(res.ok, false);
      assertEquals(res.failed, 1);
      assertEquals(res.detail, "resend_key_missing");
    });

    // never touched the network
    assertEquals(fetchStub.calls.length, 0);
    assertEquals(logs.length, 1);
    assertEquals(logs[0].status, "failed");
    assertStringIncludes(String(logs[0].error), "resend_key_missing");
  } finally {
    fetchStub.restore();
  }
});

// ---------------------------------------------------------------------------
// 6. Chunking — >50 recipients split into multiple Resend calls + log rows
// ---------------------------------------------------------------------------

Deno.test("chunking: 51 recipients → 2 Resend calls (50 BCC + 1 To), 2 log rows", async () => {
  const fetchStub = stubFetch({ status: 200, body: { id: "re_chunk" } });
  const { supa, logs } = stubSupa();
  try {
    const recipients = Array.from({ length: 51 }, (_, i) => `u${i}@x.com`);
    await withEnv({ RESEND_API_KEY: "test_key", NOTIFY_FROM: FROM }, async () => {
      const res = await sendEmail({
        supa,
        key: "signals_digest",
        to: recipients,
        trigger: "cron",
        vars: { n: 51, leadword: "leads", topIntent: 88 },
      });
      assertEquals(res.ok, true);
      assertEquals(res.sent, 51);
    });

    assertEquals(fetchStub.calls.length, 2);
    // First chunk = 50 recipients → BCC (multi-recipient privacy path).
    assertEquals((fetchStub.calls[0].body.bcc as string[]).length, 50);
    // Second chunk = 1 recipient → normal To, no BCC (single-recipient path).
    assertEquals(fetchStub.calls[1].body.bcc, undefined);
    assertEquals((fetchStub.calls[1].body.to as string[]).length, 1);
    assertEquals(logs.length, 2);
    assertEquals(logs[0].recipient_count, 50);
    assertEquals(logs[1].recipient_count, 1);
  } finally {
    fetchStub.restore();
  }
});

// ---------------------------------------------------------------------------
// 7. FALLBACK sanity — a wiped email_templates table still sends correct copy
// ---------------------------------------------------------------------------

Deno.test("FALLBACK copy exists for every built-in key the harness relies on", () => {
  for (const key of ["signals_digest", "changelog_nudge", "changelog_digest"]) {
    assert(FALLBACK[key], `missing FALLBACK for ${key}`);
    assert(FALLBACK[key].subject.length > 0);
  }
});
