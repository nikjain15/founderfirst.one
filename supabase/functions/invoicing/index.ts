/**
 * invoicing — the invoice lifecycle write-path + AR nudges (card W4.3).
 *
 * Owners create invoices, send them (via the EXISTING email infra — no new
 * provider), take payments, and let Penny send gentle AR reminders. Modular /
 * opt-in: off by default (org_invoicing_settings.enabled), toggled here.
 *
 * Ops (all POST):
 *   settings  { op, org_id, enabled?, nudges_enabled? }           → { settings }
 *   upsert    { op, org_id, invoice_id?, customer_name, customer_email?,
 *               due_date?, issue_date?, currency?, memo?,
 *               revenue_account_id?, lines:[{description,quantity_milli?,unit_price_minor}] }
 *                                                                  → { invoice }
 *   send      { op, org_id, invoice_id }   posts Dr AR / Cr Rev, emails the customer
 *                                                                  → { invoice, emailed }
 *   pay       { op, org_id, invoice_id, amount_minor, paid_date?, method? }
 *               posts Dr Cash / Cr AR                              → { invoice }
 *   void      { op, org_id, invoice_id, memo? }  reverses the accrual (append-only)
 *                                                                  → { invoice }
 *   nudge     { op, org_id }  send reminders to overdue opt-in invoices at the
 *               config cadence (invoice_nudge_cadence_days), honoring throttle
 *                                                                  → { nudged }
 *
 * Everything funnels through SECURITY DEFINER RPCs granted to service_role only
 * (ISOTEST); the actor is the JWT-verified caller (never the body). The ledger
 * posting (AR/revenue/cash) lives entirely in the RPCs — this fn never touches
 * journal tables directly. Email reuses _shared/send.ts sendEmail() (Resend), so
 * there is one send path + one log for every FounderFirst email.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendEmail } from "../_shared/send.ts";
import type { Brand } from "../_shared/email.ts";
import { escapeHtml } from "../_shared/email.ts";
import { invoicePdfBytes, invoicePdfFilename, type PdfLine } from "../_shared/invoicePdf.ts";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://penny.founderfirst.one";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUDGE_KEY_DEFAULT = "invoice_nudge_cadence_days";

function statusForPgError(code?: string): number {
  if (code === "42501") return 403;
  if (code === "P0002" || code === "no_data_found") return 404;
  if (code === "23505") return 409;
  if (code === "23514" || code === "22023" || code === "23503" || code === "22P02" || code === "restrict_violation") return 422;
  return 400;
}

function money(minor: number, ccy = "USD"): string {
  const v = (Math.abs(minor) / 100).toFixed(2);
  return `${ccy === "USD" ? "$" : ccy + " "}${v}`;
}

interface InvoiceLine { description: string; quantity_milli: number; unit_price_minor: number; amount_minor: number; }
interface InvoiceRow {
  id: string; number: string; customer_name: string; customer_email: string | null;
  issue_date: string; due_date: string; currency: string; memo: string | null;
  total_minor: number; amount_paid_minor: number;
}

/** The line-items table for the invoice email body (safe HTML, brand-styled). */
function invoiceBody(inv: InvoiceRow, lines: InvoiceLine[], brand: Brand, reminder: boolean): string {
  const rows = lines.map((l) => {
    const qty = (l.quantity_milli / 1000).toString();
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${brand.line ?? "#e5e5e5"};color:${brand.ink2};font-size:15px;font-family:${brand.font};">${escapeHtml(l.description)}</td>
      <td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid ${brand.line ?? "#e5e5e5"};color:${brand.ink3};font-size:15px;font-family:${brand.font};white-space:nowrap;">${qty} × ${money(l.unit_price_minor, inv.currency)}</td>
      <td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid ${brand.line ?? "#e5e5e5"};color:${brand.ink2};font-size:15px;font-family:${brand.font};white-space:nowrap;">${money(l.amount_minor, inv.currency)}</td>
    </tr>`;
  }).join("");
  const balance = inv.total_minor - inv.amount_paid_minor;
  const balanceRow = inv.amount_paid_minor > 0
    ? `<tr><td colspan="2" align="right" style="padding:10px 0 0;color:${brand.ink3};font-size:14px;font-family:${brand.font};">Paid to date</td>
        <td align="right" style="padding:10px 0 0 12px;color:${brand.ink3};font-size:14px;font-family:${brand.font};white-space:nowrap;">−${money(inv.amount_paid_minor, inv.currency)}</td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
    ${rows}
    <tr><td colspan="2" align="right" style="padding:12px 0 0;color:${brand.ink2};font-size:15px;font-weight:600;font-family:${brand.font};">Total</td>
        <td align="right" style="padding:12px 0 0 12px;color:${brand.ink2};font-size:15px;font-weight:600;font-family:${brand.font};white-space:nowrap;">${money(inv.total_minor, inv.currency)}</td></tr>
    ${balanceRow}
    <tr><td colspan="2" align="right" style="padding:10px 0 0;color:${brand.ink};font-size:17px;font-weight:700;font-family:${brand.font};">${reminder ? "Amount due" : "Balance due"}</td>
        <td align="right" style="padding:10px 0 0 12px;color:${brand.ink};font-size:17px;font-weight:700;font-family:${brand.font};white-space:nowrap;">${money(balance, inv.currency)}</td></tr>
  </table>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await svc.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const op = String(body?.op ?? "");
  const orgId = String(body?.org_id ?? "");
  if (!UUID_RE.test(orgId)) return json({ error: "bad_org" }, 400);

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await svc.rpc(fn, { p_actor: user.id, p_org: orgId, ...args });
    if (error) return { error, data: null };
    return { error: null, data };
  };
  const fail = (error: { message: string; code?: string }) =>
    json({ error: error.message, code: error.code }, statusForPgError(error.code));

  try {
    switch (op) {
      case "settings": {
        const r = await rpc("set_invoicing_settings", {
          p_enabled: typeof body.enabled === "boolean" ? body.enabled : null,
          p_nudges_enabled: typeof body.nudges_enabled === "boolean" ? body.nudges_enabled : null,
        });
        if (r.error) return fail(r.error);
        return json({ settings: r.data });
      }

      case "upsert": {
        if (!Array.isArray(body.lines) || body.lines.length < 1) return json({ error: "no_lines" }, 400);
        const invoiceId = body.invoice_id ? String(body.invoice_id) : null;
        if (invoiceId && !UUID_RE.test(invoiceId)) return json({ error: "bad_invoice" }, 400);
        const r = await rpc("upsert_invoice", {
          p_lines: body.lines,
          p_customer_name: String(body.customer_name ?? ""),
          p_customer_email: body.customer_email ?? null,
          p_due_date: body.due_date ?? null,
          p_issue_date: body.issue_date ?? null,
          p_currency: body.currency ?? null,
          p_memo: body.memo ?? null,
          p_revenue_account_id: body.revenue_account_id ?? null,
          p_invoice_id: invoiceId,
        });
        if (r.error) return fail(r.error);
        return json({ invoice: r.data });
      }

      case "send": {
        const invoiceId = String(body.invoice_id ?? "");
        if (!UUID_RE.test(invoiceId)) return json({ error: "bad_invoice" }, 400);
        // 1. post to the ledger + flip status (authoritative; must succeed first).
        const r = await rpc("send_invoice", { p_invoice_id: invoiceId });
        if (r.error) return fail(r.error);
        const inv = r.data as InvoiceRow;
        // 2. THEN email — a mail failure must not un-post the books.
        const emailed = await emailInvoice(svc, orgId, inv, false);
        return json({ invoice: inv, emailed });
      }

      case "pay": {
        const invoiceId = String(body.invoice_id ?? "");
        if (!UUID_RE.test(invoiceId)) return json({ error: "bad_invoice" }, 400);
        const amount = Number(body.amount_minor);
        if (!Number.isFinite(amount) || amount <= 0) return json({ error: "bad_amount" }, 400);
        const r = await rpc("apply_invoice_payment", {
          p_invoice_id: invoiceId, p_amount_minor: amount,
          p_paid_date: body.paid_date ?? null, p_method: body.method ?? null,
        });
        if (r.error) return fail(r.error);
        return json({ invoice: r.data });
      }

      case "void": {
        const invoiceId = String(body.invoice_id ?? "");
        if (!UUID_RE.test(invoiceId)) return json({ error: "bad_invoice" }, 400);
        const r = await rpc("void_invoice", { p_invoice_id: invoiceId, p_memo: body.memo ?? null });
        if (r.error) return fail(r.error);
        return json({ invoice: r.data });
      }

      case "nudge": {
        // Cadence is DATA — read it from platform_config (never a magic number).
        const { data: cfg } = await svc.rpc("get_effective_behavior_config", { p_org: orgId });
        const cadence = Number((cfg as Record<string, unknown> | null)?.[NUDGE_KEY_DEFAULT] ?? 7) || 7;
        const { data: due, error: dueErr } = await svc.rpc("invoices_due_nudge", {
          p_org: orgId, p_cadence_days: cadence,
        });
        if (dueErr) return fail(dueErr);
        let nudged = 0;
        for (const inv of (due as InvoiceRow[] ?? [])) {
          const ok = await emailInvoice(svc, orgId, inv, true);
          if (ok) {
            await svc.rpc("mark_invoice_nudged", { p_actor: user.id, p_org: orgId, p_invoice_id: inv.id });
            nudged++;
          }
        }
        return json({ nudged, cadence });
      }

      default:
        return json({ error: "bad_op" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});

/**
 * Render + send an invoice (or a reminder) to the customer via the shared email
 * infra. Returns true on a successful send, false otherwise (never throws — a
 * mail failure must not roll back the ledger). No new provider: sendEmail POSTs
 * Resend behind the same shell + log path as every FounderFirst email.
 */
async function emailInvoice(
  svc: any, orgId: string, inv: InvoiceRow, reminder: boolean,
): Promise<boolean> {
  if (!inv.customer_email) return false;
  const { data: lines } = await svc.from("invoice_lines")
    .select("description, quantity_milli, unit_price_minor, amount_minor")
    .eq("invoice_id", inv.id).eq("org_id", orgId).order("position", { ascending: true });
  const lineList = (lines ?? []) as unknown as InvoiceLine[];
  const balance = inv.total_minor - inv.amount_paid_minor;
  const vars = {
    number: inv.number,
    customer: inv.customer_name,
    amount: money(balance, inv.currency),
    due: inv.due_date,
  };

  // Attach the invoice as a PDF (W5.1). Built here from the SAME invoice + lines
  // the HTML body renders, so the attachment can never disagree with the email.
  // A PDF/base64 failure must NOT block the send — fall back to HTML-only.
  let attachments;
  try {
    const bytes = invoicePdfBytes(
      {
        number: inv.number,
        customer_name: inv.customer_name,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        currency: inv.currency,
        memo: inv.memo,
        total_minor: inv.total_minor,
        amount_paid_minor: inv.amount_paid_minor,
      },
      lineList as unknown as PdfLine[],
      { orgName: "", generatedOn: new Date().toISOString().slice(0, 10), reminder },
    );
    attachments = [{
      filename: invoicePdfFilename(inv.number),
      content: encodeBase64(bytes),
      contentType: "application/pdf",
    }];
  } catch (_e) {
    attachments = undefined;
  }

  const result = await sendEmail({
    supa: svc,
    key: reminder ? "invoice_nudge" : "invoice_sent",
    to: [inv.customer_email],
    trigger: reminder ? "cron" : "admin",
    vars,
    attachments,
    ctaHref: `${APP_URL}/i/${inv.id}`,
    buildBody: (brand) => invoiceBody(inv, lineList, brand, reminder),
    buildText: () =>
      `${reminder ? "Reminder: invoice" : "Invoice"} ${inv.number} for ${inv.customer_name}\n` +
      `Amount due: ${money(balance, inv.currency)} (due ${inv.due_date}).\n` +
      `View and pay: ${APP_URL}/i/${inv.id}`,
  });
  return result.ok && result.sent > 0;
}
