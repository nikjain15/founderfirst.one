# FounderFirst Design System
## Stripe-Inspired Blog Styling Guide

This document ensures all blog posts maintain **consistent, professional styling** across the entire site. All styles are stored in `assets/styles.css` and applied automatically to every post.

---

## Typography

### Headings
- **H1 (Post Title)**: Merriweather serif, 2.6rem, 700 weight, #1a1f36
  - Line height: 1.25
  - Letter spacing: -0.02em

- **H2 (Section Headers)**: Merriweather serif, 1.7rem, 700 weight, #1a1f36
  - Margin: 2.5rem top, 1rem bottom
  - Line height: 1.35

- **H3 (Subsections)**: Inter sans-serif, 1.1rem, 600 weight, #1a1f36
  - Margin: 1.5rem top, 0.75rem bottom

### Body Text
- **Paragraph**: Inter sans-serif, 1.05rem, #425466
  - Line height: 1.8
  - Letter spacing: 0.1px
  - Margin bottom: 1.25rem

- **Strong/Bold**: #1a1f36, 600 weight
- **Links**: #635bff with underline animation on hover

---

## Colors (Stripe Palette)
| Element | Color | Hex |
|---------|-------|-----|
| Primary Text | Dark Blue-Gray | #1a1f36 |
| Secondary Text | Medium Gray | #425466 |
| Tertiary Text | Light Gray | #8792a2 |
| Accent (Links) | Purple | #635bff |
| Accent Hover | Darker Purple | #4c47cc |
| Divider Lines | Subtle Gray | #dde3ed |
| Background | Light Blue | #f6f9fc |
| Card Border | Light Gray | #dde3ed |

---

## Spacing & Layout

### Container
- Max width: 760px
- Padding: 2.5rem on sides
- Border radius: 16px
- Shadow: 0 20px 50px rgba(26, 31, 54, 0.08)
- Top margin: 3rem

### Section Dividers (Horizontal Rules)
- **Style**: Subtle 1px solid line
- **Color**: #dde3ed
- **Margin**: 3rem above and below
- **Usage**: Use `---` in markdown to automatically insert these

### Spacing Rules
- Between sections (H2): 2.5rem top, 1rem bottom
- Between paragraphs: 1.25rem
- Between list items: 0.75rem
- Footer separator: 4rem top margin

---

## Post Structure

Every blog post should follow this structure:

```markdown
---
title: "Your Post Title"
description: "Brief description for previews"
author: "Your Name"
date: YYYY-MM-DD
series: "Series Name (optional)"
image: "https://example.com/hero-image.jpg"
tags:
  - tag1
  - tag2
canonical_url: https://founderfirst.one/blog/your-post-slug
---

## Introduction Section

Start with engaging intro content.

---

## Main Section 1

Content here. Use `---` to create subtle dividing lines between major sections.

---

## Main Section 2

More content...

---

## Conclusion

Final thoughts.
```

---

## Special Elements

### Blockquotes
- Border left: 4px solid #635bff
- Background: #f6f9fc
- Padding: 0.5rem 1.5rem
- Font style: italic
- Color: #425466
- Border radius: 8px

**Markdown**: Use `>` syntax
```markdown
> This is a blockquote with styling automatically applied.
```

### Lists
- **Unordered lists**: Left margin 1.75rem, #425466 color
- **Ordered lists**: Left margin 1.75rem, #425466 color
- **List items**: 0.75rem margin bottom, 1.75 line height

### Article Cards (Homepage)
- Border: 1px solid #dde3ed
- Hover: Border changes to #c8d0e0, shadow appears
- Border radius: 14px

---

## Mobile Responsiveness

All styles automatically adapt to mobile (max-width: 640px):
- Container margin: 1.5rem auto 3rem
- Container padding: 2rem 1.25rem
- Container border radius: 12px
- H1/Post title: 2rem (down from 2.6rem)
- Hero image height: 220px (down from 320px)

---

## What NOT to Do

❌ Don't use custom inline styles  
❌ Don't add separate CSS files  
❌ Don't use colors outside the palette  
❌ Don't change font families  
❌ Don't use multiple font sizes not listed above

---

## Writing Tips for Stripe-Style Posts

1. **Use clear section breaks** with `---` markdown
2. **Bold key phrases** to guide readers
3. **Use blockquotes** for emphasis or testimonials
4. **Keep paragraphs 2-3 sentences max**
5. **Use lists** to break up dense information
6. **Add a hero image** (1200x640px recommended)
7. **Include author info** in frontmatter
8. **Tag your posts** for categorization

---

## Examples

**Bold text**: `**This is bold**` → **This is bold**

**Link**: `[Text](url)` → Gets purple color #635bff with underline

**Blockquote**:
```markdown
> "Great companies solve real problems efficiently."
```

**Horizontal divider**: 
```markdown
---
```

**List**:
```markdown
- Item 1
- Item 2
- Item 3
```

---

## Need to Update Styling?

All CSS is centralized in [`assets/styles.css`](assets/styles.css).

To modify:
1. Edit the relevant CSS rule
2. Change persists across all blog posts automatically
3. No need to update individual post files

---

Last updated: February 12, 2026
