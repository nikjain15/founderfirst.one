# FounderFirst Design System

> The visual language behind [founderfirst.one](https://founderfirst.one). Use this guide when building any new page or component.

---

## 1. Design Principles

| Principle | What it means |
|-----------|--------------|
| **Mobile-first** | Base CSS targets phones; `min-width` breakpoints layer in tablet/desktop |
| **Content-led** | Typography does the heavy lifting — no decorative clutter |
| **One left edge** | All content shares the same `.wrap` container for visual alignment |
| **High contrast** | Dark ink on white/paper, or white on dark — always legible |
| **Minimal chrome** | Pill buttons, thin borders, generous whitespace |

---

## 2. Colour Palette

### Ink (Text & UI)

| Token | Hex | Usage |
|-------|-----|-------|
| `--ink` | `#0a0a0a` | Primary text, headings, dark backgrounds |
| `--ink-2` | `#2a2a2a` | Body text, secondary headings |
| `--ink-3` | `#5a5a5a` | Muted labels, captions, eyebrows |
| `--ink-4` | `#8a8a8a` | Placeholders, footnotes, disabled text |

### Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `--white` | `#ffffff` | Primary background |
| `--paper` | `#f6f6f4` | Alternating section background (warm off-white) |
| `--dark` | `#0a0a0a` | Dark section background |

### Lines

| Token | Hex | Usage |
|-------|-----|-------|
| `--line` | `#e8e8e5` | Borders, dividers, card outlines |
| `--line-2` | `#f0f0ed` | Subtle inner dividers |

### On Dark

| Context | Colour | Usage |
|---------|--------|-------|
| Heading | `#ffffff` | Headings on dark bg |
| Body | `#cccccc` | Body text on dark bg |
| Muted | `#888888` | Subtitles on dark bg |
| Eyebrow | `#9a9a9a` | Labels on dark bg |
| Border | `rgba(255,255,255,0.18)` | Cards/boxes on dark bg |
| Placeholder | `rgba(255,255,255,0.55)` | Form inputs on dark bg |

---

## 3. Typography

**Font:** [Inter](https://fonts.google.com/specimen/Inter) — weights 400, 500, 600, 700, 800

**Font stack:** `'Inter', Helvetica, 'Helvetica Neue', Arial, sans-serif`

### Scale

| Element | Size | Weight | Line-height | Letter-spacing |
|---------|------|--------|-------------|----------------|
| **H1** | `clamp(36px, 5.5vw, 64px)` | 700 | 1.04 | -0.028em |
| **H2** | `clamp(26px, 3.8vw, 44px)` | 700 | 1.08 | -0.022em |
| **H3** | `clamp(17px, 2vw, 21px)` | 600 | 1.25 | -0.01em |
| **Body (p)** | `clamp(15px, 1.6vw, 17px)` | 400 | 1.65 | — |
| **Eyebrow** | `11px` | 600 | — | 0.12em, uppercase |
| **Small/Note** | `11–13px` | 400–500 | — | — |

### Rules
- All headings use **negative letter-spacing** (tight tracking)
- Body text uses `--ink-2` (not pure black)
- Use `clamp()` for fluid sizing — no fixed breakpoint font changes
- Inputs must be **16px minimum** to prevent iOS zoom

---

## 4. Layout

### Container

```css
.wrap {
  max-width: 1080px;       /* --page-max */
  margin-inline: auto;
  padding-inline: clamp(24px, 6vw, 80px);  /* --page-pad-x */
}
```

Every section uses `.wrap` — content always starts from the same left edge.

### Section Padding

```css
section {
  padding-block: 72px;     /* --section-y */
}
```

### Section Backgrounds

Alternate between three backgrounds to create visual rhythm:

| Class | Background | Use for |
|-------|-----------|---------|
| `bg-white` | `#ffffff` | Primary content sections |
| `bg-paper` | `#f6f6f4` | Alternate/supporting sections |
| `bg-dark` | `#0a0a0a` | CTA, hero, or accent sections |

**Pattern:** white → paper → dark → white → paper → dark

---

## 5. Breakpoints (Mobile-First)

| Breakpoint | Target | What changes |
|-----------|--------|--------------|
| **Base** (< 481px) | Small phones | 1-col grids, stacked form, centered snapshots |
| **481px+** | Large phones | Horizontal form layout |
| **561px+** | Tablets | 2-col grids, side-by-side layouts |
| **861px+** | Desktop | 3-col grids, show diagrams, full nav |
| **900px+** | Wide desktop | Hero H1 `white-space: nowrap` |

### Usage pattern

```css
/* Base: mobile styles (no media query) */
.my-grid { grid-template-columns: 1fr; }

/* Tablet */
@media (min-width: 561px) {
  .my-grid { grid-template-columns: 1fr 1fr; }
}

/* Desktop */
@media (min-width: 861px) {
  .my-grid { grid-template-columns: repeat(3, 1fr); }
}
```

---

## 6. Components

### 6.1 Buttons

| Variant | Class | Description |
|---------|-------|-------------|
| **Primary** | `.btn` | Black bg, white text, pill shape |
| **Ghost** | `.btn .btn-ghost` | Transparent bg, black border |
| **White** | `.btn .btn-white` | White bg, black text |
| **Ghost White** | `.btn .btn-ghost-white` | Transparent bg, white border (on dark) |
| **Small** | `.btn .btn-sm` | Smaller padding (8px 14px) |

**Shared traits:**
- `border-radius: 999px` (full pill)
- `font-size: 14px`, weight 500
- Hover: `opacity: 0.82`
- Focus-visible: `2px solid` outline, 3px offset

### 6.2 FF Logo Mark

```html
<span class="ff-mark ff-mark-sm">FF</span>  <!-- 22×22 -->
<span class="ff-mark ff-mark-md">FF</span>  <!-- 28×28 -->
```

- Black rounded square, white bold text
- `border-radius: 6px`, `font-weight: 800`

### 6.3 Penny P Mark

```html
<span class="p-mark p-mark-sm">P</span>  <!-- 28×28 -->
<span class="p-mark p-mark-md">P</span>  <!-- 40×40 -->
<span class="p-mark p-mark-lg">P</span>  <!-- 56×56 -->
<span class="p-mark p-mark-xl">P</span>  <!-- 96×96 -->
```

- Black circle, white bold text
- Inverted variant: `.p-mark-inv` (white bg, black text)

### 6.4 Chat Bubble

```html
<div class="penny-bubble">
  <div class="bubble-label">PENNY</div>
  <div class="bubble-msg">Your message here.</div>
</div>
```

- White bg, `1px solid --line` border
- `border-radius: 18px 18px 18px 4px` (tail bottom-left)
- Pair with `.p-mark` on the left for chat layout

### 6.5 Checklist

```html
<div class="check-list">
  <div class="check-item">
    <span class="check-icon">✓</span>
    Item text
  </div>
</div>
```

- Dashed top border separating it from bubble content
- 18×18 black circle icon with white checkmark

### 6.6 Waitlist Form (Pill)

```html
<form class="waitlist-form" onsubmit="handleSignup(event, 'source')">
  <input type="email" placeholder="you@email.com" required />
  <button type="submit">Join the waitlist →</button>
</form>
```

- Pill shape with input + button side by side
- Stacks vertically on phones (< 481px)
- Dark variant: add class `.on-dark`
- Focus: subtle box-shadow ring

### 6.7 Cards

**Promise Card:**
```html
<div class="promise-card">
  <span class="eyebrow">LABEL</span>
  <h3>Card Title</h3>
  <div class="card-ui"><!-- inner UI mock --></div>
  <p class="card-desc">Description text.</p>
</div>
```

- `border: 1.5px solid --ink`, `border-radius: 16px`
- `background: --paper`

**Timeline Card:**
```html
<div class="timeline-card">
  <div class="eyebrow tl-eyebrow">LABEL</div>
  <div class="tl-steps">
    <div class="tl-step">
      <div class="tl-num done">✓</div>
      <div><h4>Step title</h4><p>Detail</p></div>
    </div>
    <div class="tl-step">
      <div class="tl-num next">2</div>
      <div><h4>Next step</h4><p>Detail</p></div>
    </div>
  </div>
</div>
```

### 6.8 Toast

```html
<div class="toast" id="toast" role="status" aria-live="polite">Message</div>
```

```js
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}
```

- Fixed bottom-center, pill shape
- Fades in/out with `opacity` transition

---

## 7. Section Patterns

### Hero (white bg)
- Left-aligned H1 + subtitle
- Penny chat bubble with checklist
- Centered waitlist form below

### Reasoning (paper bg)
- Eyebrow + H2 + body paragraph
- Desktop: diagram with scatter cards → arrow → unified card
- Mobile: simplified stacked version

### Meet Penny (dark bg)
- Large P mark + H2 + body text
- Grid: mark | text (stacks on mobile)

### How It Works (white bg)
- Chat conversation mock
- 3-column promise cards (1-col on mobile)

### Snapshots (paper bg)
- Step dots on a rail (timeline)
- Phone mockups with captions

### Waitlist CTA (dark bg)
- P mark + H2 + subtitle
- 3-column step tiles
- Centered waitlist form (on-dark variant)

### Confirmation (paper bg)
- Centered layout
- Badge (✓) + H1 + subtitle
- Timeline card (what happens next)

### Referral (dark bg)
- Centered layout
- Referral link box with copy button
- Share buttons (email, message)
- Progress bar (referral count)

---

## 8. Footer

**Light footer:**
```html
<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-logo"><span class="ff-mark ff-mark-sm">FF</span> FounderFirst</div>
    <nav class="footer-links"><a href="#">Home</a><a href="#">About</a></nav>
    <span class="footer-copy">© 2026 FounderFirst. All rights reserved.</span>
  </div>
</footer>
```

**Dark footer:** Add class `.site-footer-dark`

---

## 9. Accessibility

| Feature | Implementation |
|---------|---------------|
| **Focus-visible** | 2px outline on all interactive elements |
| **Reduced motion** | `prefers-reduced-motion: reduce` disables animations |
| **Decorative marks** | `aria-hidden="true"` on FF/P marks, dots, icons |
| **Toast** | `role="status"` + `aria-live="polite"` |
| **Touch targets** | Buttons ≥ 44px tap height |
| **Input font size** | 16px minimum (prevents iOS zoom) |

---

## 10. CSS Variables Reference

```css
:root {
  /* Colours */
  --ink:        #0a0a0a;
  --ink-2:      #2a2a2a;
  --ink-3:      #5a5a5a;
  --ink-4:      #8a8a8a;
  --line:       #e8e8e5;
  --line-2:     #f0f0ed;
  --paper:      #f6f6f4;
  --white:      #ffffff;
  --dark:       #0a0a0a;

  /* Typography */
  --sans:       'Inter', Helvetica, 'Helvetica Neue', Arial, sans-serif;

  /* Layout */
  --page-max:   1080px;
  --page-pad-x: clamp(24px, 6vw, 80px);
  --section-y:  72px;
}
```

---

## 11. New Page Template

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Page Title — FounderFirst</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <!-- Copy the <style> block from index.html -->
</head>
<body>

  <nav class="site-nav">
    <div class="wrap nav-inner">
      <a href="/" class="nav-logo">
        <span class="ff-mark ff-mark-md">FF</span>FounderFirst
      </a>
      <div class="nav-links">
        <a href="/#reasoning">About</a>
        <a href="/#waitlist" class="btn btn-sm">Early Access</a>
      </div>
    </div>
  </nav>

  <section style="background: var(--white);">
    <div class="wrap">
      <span class="eyebrow">Section Label</span>
      <h1>Page Heading</h1>
      <p>Body content goes here.</p>
    </div>
  </section>

  <footer class="site-footer">
    <div class="wrap footer-inner">
      <div class="footer-logo"><span class="ff-mark ff-mark-sm">FF</span> FounderFirst</div>
      <nav class="footer-links"><a href="/">Home</a></nav>
      <span class="footer-copy">© 2026 FounderFirst. All rights reserved.</span>
    </div>
  </footer>

</body>
</html>
```

---

*Last updated: April 19, 2026*
