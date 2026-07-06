# Invoicing rework — professional, viewable, own tab

> Status: **Draft for review** · 6 Jul 2026 · Owner: Nik
> Scope: make Penny invoicing look and work like a professional product (QuickBooks / Stripe / Wave
> tier) — a real invoice document you can preview, view, and send, in its own place in the nav.
> Backend already exists ([20260706070000_w4_3_invoicing_ar.sql](../../supabase/migrations/20260706070000_w4_3_invoicing_ar.sql)):
> `invoices`, `invoice_lines`, `invoice_payments`, `org_invoicing_settings` + `upsert_invoice` /
> `send_invoice` / `apply_invoice_payment` RPCs and the `invoicing` edge fn. This is mostly a
> **UI + light-schema** rework, not new plumbing.

## Why (Nik, 6 Jul)
Today's invoicing (nested under Connections → "Getting paid") is a bare data-entry form:
cramped inline inputs, no invoice number/from/bill-to on screen, **no way to view the finished
invoice**, no branding. "It doesn't create templates like it's professional, you can't view them,
and it should be in its own tab." Functionally complete, presentationally not shippable.

## What "industry standard" means here
A professional invoice product has four things we're missing:
1. **A rendered invoice document** — header (business name/logo, "INVOICE", number, status), From
   and Bill-To blocks, issue + due dates, a clean line-item table (Description · Qty · Unit · Amount),
   subtotal/tax/total, notes/terms, and a pay/print/download affordance.
2. **A viewer** — open any invoice and see that document (owner preview + the customer's view).
3. **Business identity** — the "From" block: legal name, address, email, logo, payment terms,
   default currency. Today `org_invoicing_settings` only has enable/nudge/next-seq.
4. **Discoverability** — its own home in the nav, not buried three clicks into Connections.

## Slices (ship in order, each its own PR, each verified via the app-e2e screenshot artifact)

### Slice 1 — Invoice document + viewer (highest value; "you can't view them")
- New `InvoiceView` component: renders one invoice as a professional document from
  `invoices` + `invoice_lines` (+ business profile once Slice 3 lands; until then use `org.name`).
- Fetch a single invoice with its lines: add `get_invoice(p_org, p_invoice_id)` RPC returning the
  header + ordered lines (RLS: `can_access_org`), or reuse the list + a `list_invoice_lines` read.
- From the invoices table, each row opens the viewer. Viewer has **Print / Download PDF** (browser
  print stylesheet first; a server PDF can come later) and the existing Send / Record-payment / Void
  actions moved onto the document.
- Pure additive; no write-path change.

### Slice 2 — Professional builder
- Rebuild `InvoiceForm` as a document-style editor: grouped Bill-To + dates, a real line-item
  **table with column headers** (Description · Qty · Unit price · Amount-per-line, live), a totals
  block, memo/terms. Live preview toggles to the Slice-1 document.
- No new fields beyond what `upsert_invoice` already takes (plus Slice 3's profile).

### Slice 3 — Business profile (branding)
- Extend `org_invoicing_settings` (additive migration, Management-API path): `business_legal_name`,
  `address`, `contact_email`, `logo_url`, `payment_terms`, `default_currency`, `tax_rate` (optional).
  A small settings panel to edit it. The document header + terms read from here.
- Logo: store in a Supabase storage bucket; keep it optional (fall back to wordmark).

### Slice 4 — Nav / IA (Nik: "should be in another tab")
Two options — **recommend (b)**:
- (a) A top-level **Invoicing** owner tab.
- (b) A top-level **Money** tab grouping **Invoicing** (getting paid) + **Bills** (paying) as
  sub-tabs — keeps the owner's top nav small (APP_PRINCIPLES §1: new features nest under a job) and
  puts money-in and money-out side by side. Connections keeps bank/import/share only.
  Leave a redirect from the old Connections → "Getting paid" entry.

## Guardrails
- All writes stay behind the `invoicing` edge fn (never post to the ledger from the component).
- Money formatted only at the edge (`money.ts`); currency respected.
- Tokens only, responsive width ladder, `.eyebrow`+`.page-title` for the new tab.
- Copy centralized in `COPY.invoicing` (CENTRAL-1 gate).
- Each slice: full green CI + verified from the deployed bundle / e2e screenshot before merge.

## Open question for Nik
Slice 4 nav: **Invoicing as its own tab, or a "Money" tab grouping Invoicing + Bills?** (I lean
Money-tab.) Everything else can proceed on this plan.
