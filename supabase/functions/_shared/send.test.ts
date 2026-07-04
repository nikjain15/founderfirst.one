/**
 * send.ts attachment-path unit tests (card W5.1) — prove that when sendEmail is
 * given `attachments`, the Resend POST body carries them in Resend's shape
 * (filename + base64 content + content_type), and that empty/malformed ones are
 * dropped so a bad attachment can never brick a send. Resend + the DB are stubbed
 * (globalThis.fetch + a fake supabase client) so this is a pure payload assertion.
 *
 *   deno test --allow-env supabase/functions/_shared/send.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sendEmail, type Attachment } from "./send.ts";

// Minimal supabase stub: template/brand lookups return nothing (send.ts falls back
// to code FALLBACK copy), email_log inserts are swallowed.
const fakeSupa = {
  from() {
    return {
      select() { return this; },
      eq() { return this; },
      maybeSingle() { return Promise.resolve({ data: null }); },
      insert() { return Promise.resolve({ error: null }); },
    };
  },
};

async function capturePayload(attachments?: Attachment[]): Promise<any> {
  const realFetch = globalThis.fetch;
  let captured: any = null;
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(new Response(JSON.stringify({ id: "re_test" }), { status: 200 }));
  }) as typeof fetch;
  const prevKey = Deno.env.get("RESEND_API_KEY");
  Deno.env.set("RESEND_API_KEY", "re_dummy");
  try {
    const res = await sendEmail({
      supa: fakeSupa, key: "invoice_sent", to: ["c@example.com"],
      trigger: "admin", vars: { number: "INV-1", customer: "C", amount: "$1.00", due: "2026-07-31" },
      attachments,
    });
    assert(res.ok, "send should succeed against the stubbed Resend");
    return captured;
  } finally {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) Deno.env.delete("RESEND_API_KEY");
    else Deno.env.set("RESEND_API_KEY", prevKey);
  }
}

Deno.test("sendEmail: attaches a PDF in Resend's shape", async () => {
  const body = await capturePayload([
    { filename: "invoice-inv-1.pdf", content: "JVBERi0xLjQK", contentType: "application/pdf" },
  ]);
  assert(Array.isArray(body.attachments), "attachments missing from payload");
  assertEquals(body.attachments.length, 1);
  assertEquals(body.attachments[0].filename, "invoice-inv-1.pdf");
  assert(body.attachments[0].content.length > 0, "empty base64 content");
  assertEquals(body.attachments[0].content_type, "application/pdf");
});

Deno.test("sendEmail: no attachments key when none given (HTML body unchanged)", async () => {
  const body = await capturePayload();
  assertEquals("attachments" in body, false, "should omit attachments when none");
  assert(typeof body.html === "string" && body.html.length > 0, "HTML body must still render");
});

Deno.test("sendEmail: drops empty/malformed attachments", async () => {
  const body = await capturePayload([
    { filename: "", content: "abc" } as Attachment,
    { filename: "ok.pdf", content: "" } as Attachment,
    { filename: "good.pdf", content: "JVBER" },
  ]);
  assertEquals(body.attachments.length, 1);
  assertEquals(body.attachments[0].filename, "good.pdf");
});
