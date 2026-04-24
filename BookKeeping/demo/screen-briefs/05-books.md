# Screen Brief 05 — My Books

*Scoped build spec for `screens/books.js`. Read `../CLAUDE.md`, `../styles/tokens.css`, `../prompts/penny-system.md` alongside this.*

---

## What you're building

The My Books landing — 4 zones that give the user a clear financial picture without drowning them in ledger detail. Tab 3 of the 3-tab shell.

---

## Four zones, stacked

### Zone 1 — Stat card hierarchy

**Do not use three equal-width cards.** Use this hierarchy instead:

1. **Runway hero card** (full width, `background: var(--ink)`, white text) — 38px bold number + "days" label + right-aligned context text. The dominant financial signal. Values from `state.ledger.summary.runway`.
2. **Net + Books row** (`grid-template-columns: 1fr 1fr`, 22px bold) — secondary metrics beneath the hero:
   - **Net this month** — "$X,XXX" + subcopy "After $Y in expenses."
   - **Books status** — "Clean" / "5 things need a look" (never "5 items to review") + subcopy.

Never `grid-template-columns: 1fr 1fr 1fr`. Never `--fs-card-value` for the secondary row numbers (too large, causes wrapping at 375px).

### Zone 2 — Needs a look

One `.card` listing the 3 most important flagged transactions needing review. Tapping any row opens that transaction as an approval card in a sheet.

If nothing needs review: "All caught up ✓" in `--ink-3`.

### Zone 3 — Coming up

One `.card` with upcoming reminders: next quarterly tax date, invoices due to be sent, recurring payments expected.

### Zone 4 — Drill-downs

Four list items:

- P&L this month
- Expenses by category
- Income by client
- Full ledger (every transaction)

Each opens a detail view at `#/books/{slug}`. For pass 1, these can be stubbed as "coming soon" screens — the landing is the priority.

---

## Ask Penny bar

Present at the bottom of the content (above the tab bar). Text input + mic button. Submit calls `books.qa` with the question + ledger summary in context. Response renders inline below the bar as a Penny bubble.

- When the input is empty, the mic button opens `VoiceAskModal` (defined in `books.jsx`) — a fullscreen dark overlay that simulates 3s of voice recording (waveform bars + pulse rings), then transitions to "Got it — asking Penny…" for 0.8s, then picks a random question from `VOICE_PROMPTS` and calls `submitAsk(q)` directly. Do not revert to just populating the input field without submitting.
- `submitAsk` accepts an optional `overrideQ` string argument so voice can bypass the stale `askVal` closure.
- All sheets in this screen (`FlaggedSheet`, `DrilldownSheet`) use `createPortal` into `#sheet-root`. See CLAUDE.md "Bottom sheet — canonical implementation" for the required pattern.

---

## AI calls

- `books.qa` — user-asked questions, takes the question plus `state.ledger.summary` as context.
- (Optional) `books.insight` — a single proactive line at top of the screen ("You're $1,200 ahead of your best March"). Stretch for pass 1.

---

## Done when

- Runway hero card (full-width, dark) + Net/Books 2-col row render with correct values from `state.ledger.summary`.
- "Needs a look" shows 3 rows or the empty state.
- Ask Penny bar submits and renders the answer inline.
- All drill-down links navigate (even if target is a stub).

---

## Not in scope

- Full ledger view — stub.
- Charts / graphs — deferred.
- Period toggle (this month / year / custom) — stub as "This month" only.

---

## References

- `../prompts/books-qa.md`
- `../../product/19-demo-flow-brief.md §9`
