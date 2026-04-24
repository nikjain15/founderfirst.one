# Screen Brief 02 — Penny Thread

*Scoped build spec for `screens/thread.js`. Read `../CLAUDE.md`, `../styles/tokens.css`, `../prompts/penny-system.md` alongside this.*

---

## What you're building

The Penny conversation thread — the home screen after onboarding. Renders the greeting, the card queue, and ambient messages. Tab 1 of the 3-tab shell.

Two distinct entry states: **first-time** (just finished onboarding) and **returning** (user came back after a gap). Both share the same layout; they differ in the greeting copy and queue behavior.

---

## Layout

```
┌──────────────────────────────┐
│  P  Penny              ⋮     │   ← header (avatar + status line + avatar menu)
│     online · watching your   │
│     accounts                 │
├──────────────────────────────┤
│                              │
│   [Penny greeting bubble]    │   ← generated live by renderPenny
│                              │
│   [First approval card]      │   ← rendered by screens/card.js
│                              │
│   [Follow-up Penny bubble]   │   ← if queue continues
│                              │
│   ...                        │
│                              │
├──────────────────────────────┤
│   💬 Ask Penny anything      │   ← ask bar (chat bubble SVG, not search icon)
├──────────────────────────────┤
│   Penny  |  Add  |  My Books │   ← tab bar
└──────────────────────────────┘
```

---

## AI calls

Two intents used on this screen:

1. `thread.greeting` — called once on mount. Generates the opening bubble(s). Context: `{ mode: "first-time-greeting" | "returning-welcome", persona, queueLength, lastSeenHours }`.
2. `thread.idle` — called when the queue is empty. Context: `{ mode: "queue-empty" | "idle-check-in" }`.

The approval cards themselves call `card.approval` — that's handled inside `screens/card.js`, not here.

---

## Behavior

- On mount, call `thread.greeting`. Render bubbles sequentially with a 300ms stagger (feels typed).
- After greeting, render the first card from `state.cardQueue`.
- **NOW separator:** the active approval card zone has a `::before` pseudo-element (via `.approval-card-wrap`) rendering "NOW" in 9px semibold `--ink-4` above it. Visually anchors where the user is in the thread.
- **Confirmed slug:** when a card is confirmed, it collapses to a paper pill (`background: var(--paper)`, `border-radius: 10px`, `padding: 11px 14px`). Not a border-bottom row. Slug shows: vendor · amount · ✓.
- When the queue is empty, call `thread.idle` with `mode: "queue-empty"` and render that line.
- **Ask bar:** wrapped in `.thread-ask-inner` pill (`background: var(--paper)`, `border: 1.5px solid var(--line)`, `border-radius: var(--r-pill)`). Icon is a chat/compose speech bubble SVG — never a search/magnifying glass. The bar submits a question to `books.qa` and opens `#/books`.
- The avatar menu (⋮) opens `#/menu`.

---

## Done when

- Thread renders at 375px.
- Greeting streams in one bubble at a time, not all at once.
- Confirming a card collapses it and advances the queue.
- Empty state shows "That's it for now. I'll keep watching." (generated, not hard-coded).
- Header uses `.p-mark-sm.p-mark--online` (8×8px pulse dot) and the "online · watching your accounts" status line.

---

## Not in scope

- The approval card itself — see `03-card.md`.
- The avatar menu — see `06-avatar-menu.md`.
- The ask bar's full Q&A behavior — stub for now; full handling lives in My Books.

---

## References

- `../prompts/thread-ambient.md`
- `../../product/19-demo-flow-brief.md §6`
