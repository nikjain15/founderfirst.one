# Screen Brief 07 — Invoice Designer

*Scoped build spec for `screens/invoice.js`. Read `../CLAUDE.md`, `../styles/tokens.css`, `../prompts/penny-system.md` alongside this.*

---

## What you're building

The invoice designer — accessible from `#/invoice`, reached via the "New invoice" tile in My Books (Zone 5). Full-fidelity designer per decision D80 (pixel-perfect, no shortcuts).

---

## Two panes (stacked on mobile, side-by-side on web stretch)

### Pane 1 — Details

Fields:

- Client (dropdown + "add new")
- Line items (multi-row: description, qty, rate; totals auto-calc)
- Date, due date
- Notes / payment terms
- Payment method accepted (ticklist from `industries.json.paymentMethods` based on user's industry)

### Pane 2 — Live preview

Rendered invoice — looks print-ready. Updates as user types.

Branding section at top of preview: business name, logo (optional upload), address. All pulled from `state.persona` / profile.

---

## Actions

- **Send** — opens sheet with recipient email + optional message. Stub: toast "Invoice sent to [email]."
- **Save as draft** — toast "Saved as draft."
- **Download PDF** — stub: toast "PDF downloaded."
- **Set up recurring** — opens recurring config sheet with: frequency grid (Weekly/Monthly/Quarterly/Annually), first send date picker, upcoming sends preview (next 3 dates), "Schedule [freq] invoices" button. On confirm: 1.2s "Scheduling…" → toast "Recurring [freq] invoice scheduled ✓" → sheet closes.
- **Payment plans** (D79) — stretch. "Split into 2 / 3 / 4 payments" preset offered at invoice creation.

---

## AI calls

None. Invoice generation is deterministic formatting. If Penny needs to comment on the invoice ("Looks like Bright Co — usually pays in 14 days"), that's a thread message, not an invoice screen message.

---

## Done when

- All fields editable.
- Live preview updates in real time.
- Send / draft / download show toasts. Recurring scheduler fully functional with date preview.

---

## Not in scope

- Real PDF generation.
- Real email sending.
- Payment plan UI — stub.

---

## References

- `../../product/19-demo-flow-brief.md §14`
