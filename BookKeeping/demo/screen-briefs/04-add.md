# Screen Brief 04 — Add Tab

*Scoped build spec for `screens/add.js`. Read `../CLAUDE.md`, `../styles/tokens.css`, `../prompts/penny-system.md` alongside this.*

---

## What you're building

The merged Add tab — capture modes + integrations + data actions in one place. Tab 2 of the 3-tab shell.

Replaces the "Connect" tab from the v4 demo. Anything that used to live in Connect (add a bank, connect payroll, import CSV) now lives here.

---

## Three sections, stacked

### Section 1 — Quick capture

**Hero tile (full width):**
- **Just tell me** — horizontal layout (icon left, label + subtitle right), `border: 1.5px solid var(--ink)`, `border-radius: var(--r-card)`, semibold label. Opens a text input. On submit, calls `capture.parse` and shows the returned card inline for one-tap confirm.

**Secondary row (3-column grid below hero):**
- **Photo** — camera button (stub opens file picker)
- **Voice note** — mic button (stub records and stubs a transcript)
- **Upload file** — file picker (CSV, PDF)

Never use emoji as tile icons — always stroke SVG. Never use a 4-equal-column layout at 375px.

### Section 2 — Connected accounts

List of current connections (banks, payment platforms, payroll). From `state.connections`. Each row: provider icon, name, last-sync time, "Manage" link. Primary CTA at top: "+ Add a new connection" → opens search of providers.

### Section 3 — Data actions

Three rows:

- **Import your old books** — opens import flow (stub: drag-drop + "we'll figure out the columns").
- **Export** — opens export sheet (CSV, QBO, PDF) + "Share with CPA" section (email input, optional note, "Send export link" button). Pre-fills CPA email from `persona.cpaEmail` if set.
- **Connect your email** — Gmail and Outlook options with **neutral initial badges** (`background: var(--paper)`, `border: 1.5px solid var(--line)`, `color: var(--ink-2)`, `fontWeight: var(--fw-bold)`). Never use third-party brand colors — no red for Gmail, no blue for Outlook. OAuth stub (1.8s spinner → connected state). Never "Forward receipts by email" — email ingestion address is not exposed to the user.

---

## AI calls

Only `capture.parse` is invoked on this screen — when the user submits a "Just tell me" note. The parsed card follows the same approval flow as thread cards (render via `screens/card.js` component).

---

## Done when

- All three sections render at 375px.
- "Just tell me" parses text and shows an approval card inline.
- Each connection row shows correct icon and last-sync time.
- "+ Add a new connection" opens a provider search sheet (can be a simple static list for pass 1).

---

## Not in scope

- Real OAuth — every provider "connects" instantly in the demo.
- Real CSV parsing — stub with a "we imported 42 transactions" toast.

---

## Token discipline — enforced (23 Apr 2026)

All JSX inline styles in this screen must comply with the design token rules in `../CLAUDE.md → Design token discipline`. Quick checklist:

- `"var(--white)"` not `"#fff"` — for all white backgrounds and text
- `fontWeight: "var(--fw-semibold)"` not `fontWeight: 600` — for all font-weight values
- `borderRadius: "var(--r-card)"` not `borderRadius: 12` — for standard card corners
- `borderRadius: "var(--r-card-emph)"` not `borderRadius: 14` — for hero tile / sheet corners
- `borderRadius: "var(--r-pill)"` not `borderRadius: 999` — for pill buttons and inputs
- Sheet scrim: `rgba(10,10,10,0.18)` — not 0.4 or 0.35
- Section labels: `<p className="eyebrow" style={{ margin:"0 0 12px" }}>` — not inline style blocks
- Provider and email badges: `var(--paper)` / `var(--line)` / `var(--ink-2)` — no brand colors

---

## References

- `../prompts/capture-parse.md`
- `../../product/19-demo-flow-brief.md §8`
- `../CLAUDE.md → Design token discipline` — required reading before building
