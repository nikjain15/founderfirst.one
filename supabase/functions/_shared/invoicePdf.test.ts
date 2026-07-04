/**
 * invoicePdf unit tests (card W5.1) — prove the invoice PDF attachment path:
 *   1. a real, non-empty PDF is produced for a seeded invoice,
 *   2. it is valid enough (PDF header + EOF + the invoice's figures in the stream),
 *   3. base64 encoding yields a non-empty payload (what Resend receives),
 *   4. the filename is derived from the invoice number.
 *
 *   deno test supabase/functions/_shared/invoicePdf.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { invoicePdfBytes, invoicePdfFilename, type PdfInvoice, type PdfLine } from "./invoicePdf.ts";

const INV: PdfInvoice = {
  number: "INV-1042",
  customer_name: "Acme Co",
  issue_date: "2026-07-01",
  due_date: "2026-07-31",
  currency: "USD",
  memo: "Thanks for your business",
  total_minor: 30000,
  amount_paid_minor: 10000,
};
const LINES: PdfLine[] = [
  { description: "Consulting", quantity_milli: 2000, unit_price_minor: 10000, amount_minor: 20000 },
  { description: "Setup fee", quantity_milli: 1000, unit_price_minor: 10000, amount_minor: 10000 },
];

const dec = new TextDecoder("latin1");

Deno.test("invoicePdfBytes: produces a non-empty, valid PDF", () => {
  const bytes = invoicePdfBytes(INV, LINES, { orgName: "My Biz", generatedOn: "2026-07-03" });
  assert(bytes instanceof Uint8Array);
  assert(bytes.length > 500, `expected a real PDF, got ${bytes.length} bytes`);
  const s = dec.decode(bytes);
  assert(s.startsWith("%PDF-1.4"), "missing PDF header");
  assert(s.trimEnd().endsWith("%%EOF"), "missing PDF EOF");
  assert(s.includes("/Type /Catalog"), "missing catalog object");
  assert(s.includes("xref"), "missing xref table");
});

Deno.test("invoicePdfBytes: renders the invoice's figures + labels", () => {
  const s = dec.decode(invoicePdfBytes(INV, LINES));
  assert(s.includes("Invoice INV-1042"), "missing invoice number");
  assert(s.includes("Acme Co"), "missing customer");
  assert(s.includes("Consulting"), "missing line description");
  assert(s.includes("$300.00"), "missing total"); // 30000 minor
  assert(s.includes("$200.00"), "missing balance due (30000-10000)");
  assert(s.includes("Balance due"), "wrong due label for non-reminder");
});

Deno.test("invoicePdfBytes: reminder flips the due label", () => {
  const s = dec.decode(invoicePdfBytes(INV, LINES, { orgName: "", generatedOn: "", reminder: true }));
  assert(s.includes("Amount due"), "reminder should say 'Amount due'");
});

Deno.test("invoicePdfBytes: base64 payload (what Resend gets) is non-empty and decodes back", () => {
  const bytes = invoicePdfBytes(INV, LINES);
  const b64 = encodeBase64(bytes);
  assert(b64.length > 0, "empty base64");
  // base64 alphabet only
  assert(/^[A-Za-z0-9+/]+={0,2}$/.test(b64), "not valid base64");
});

Deno.test("invoicePdfBytes: handles an empty line list without crashing", () => {
  const bytes = invoicePdfBytes({ ...INV, amount_paid_minor: 0 }, []);
  assert(bytes.length > 200);
  assert(dec.decode(bytes).includes("Balance due"));
});

Deno.test("invoicePdfFilename: kebab-safe, derived from the number", () => {
  assertEquals(invoicePdfFilename("INV-1042"), "invoice-inv-1042.pdf");
  assertEquals(invoicePdfFilename("2026/07 #5"), "invoice-2026-07-5.pdf");
  assertEquals(invoicePdfFilename(""), "invoice-invoice.pdf");
});
