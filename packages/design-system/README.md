# @ff/design-system

Single source of truth for FounderFirst design tokens and reusable CSS components.

Consumed by:
- `apps/marketing` — founderfirst.one
- `apps/blog` — founderfirst.one/blog
- (future) `apps/demo` — founderfirst.one/penny/demo/{businessowner,cpa}

## Usage

```ts
import "@ff/design-system/tokens.css";
import "@ff/design-system/components/p-mark.css";
import "@ff/design-system/components/penny-bubble.css";
```

## Rules

- **Never redeclare tokens** (`--ink`, `--paper`, `--r-pill`, etc.) in app stylesheets. Edit them here.
- **Never copy a component** out of this package. If you need a variant, add a modifier class here.
- App-specific styles (page layout, section spacing, marketing-only flourishes) live in the app, not here.

## Phase 0 contents

Phase 0 ships the foundation:
- `tokens.css` — colors, type scale, radii, layout
- `components/p-mark.css` — Penny "P" badge (sm/md/lg/xl, inverted)
- `components/penny-bubble.css` — chat bubble + check-list

Remaining components migrate in Phase 1 alongside the marketing section ports:
`ff-mark`, `button`, `waitlist-form`, plus typography defaults.
