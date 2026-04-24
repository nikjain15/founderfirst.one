# Screen Brief 06 — Avatar Menu

*Scoped build spec for `screens/avatar-menu.js`. Read `../CLAUDE.md`, `../styles/tokens.css`, `../prompts/penny-system.md` alongside this.*

---

## What you're building

The avatar menu drill-down — Profile, Memory, Preferences. Reached by tapping the ⋮ on the Penny header. This is NOT a tab; it's a full-screen overlay at `#/menu`.

---

## Top-level menu

Three rows, each a full-tap `.card`:

- **Profile** → `#/menu/profile`
- **Memory** → `#/menu/memory`
- **Preferences** → `#/menu/preferences`

Plus a footer link: "Export my data" and "Cancel my account" (styled as `.btn-ghost`, bottom of screen).

---

## Profile

Editable fields:

- First name, last name
- Business name
- Entity type (drop-down — see entity-change flow below)
- Industry (drop-down)
- Primary bank
- CPA contact (name + email — optional)

Each field has an inline "edit" affordance. Save is autosave on blur.

**Entity change flow** (legal honesty, internal state only):

If the user changes entity type after onboarding, show a confirm sheet:

> "Changing entity type updates how Penny tracks your books. If you're making this change with the IRS too, you'll need to file the right form (Form 2553 for S-Corp election, for example). I'll handle the books; your CPA handles the IRS side."

Two buttons: "I got it — update Penny" / "Never mind."

### Memory

Read-only list of things Penny has learned:

- Recurring vendors + their learned categories
- Known clients + their labels
- Rules the user has confirmed (e.g. "Always categorize Adobe as Software")
- Notes the user has told Penny ("Bright Co runs late")

Each row has a small "forget this" link.

### Preferences

Toggleable settings:

- Check-in time (reuses the step 6 picker from onboarding)
- Notification delivery ("Real-time" / "Daily digest" — never "Instant" / "Batch" per settled decision)
- Face ID / passcode lock (toggle; stub)
- AI training on my data (toggle; default off)

---

## AI calls

None. This screen is static content editing.

---

## Done when

- All three drill-downs reachable from the menu.
- Entity change shows the confirm sheet.
- Memory list has at least 3 example rows (pull from seeded state).
- Preferences toggles persist to state.

---

## Not in scope

- Real Face ID integration — stub.
- Real cancel / export flow — stub with a toast "Demo only — this would trigger the real flow."

---

## References

- `../../product/19-demo-flow-brief.md §10`
