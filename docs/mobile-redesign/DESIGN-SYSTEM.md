# Ghost Mobile Design System

## Visual Direction

Ghost should feel:
- Quiet, warm, intelligent, premium, restrained, human

Ghost should NOT feel:
- Terminal-like, cyberpunk, dashboard-like, developer-oriented, overly animated, like a ChatGPT clone

---

## Color System

### Primary Canvas
- base: `#FAFAF7` (warm off-white)
- raised: `#F5F3EE` (cards, surfaces)
- sunken: `#EDEBE6` (inset areas, inputs)

### Text
- primary: `#1A1611` (near-black, warm-tinted)
- secondary: `#6B6560` (calm gray)
- tertiary: `#9C9590` (placeholders, metadata)
- inverse: `#FAFAF7` (text on accent)

### Accent
- primary: `#3D7A5F` (Ghost green, muted)
- soft: `rgba(61,122,95,0.08)` (subtle tint)
- medium: `rgba(61,122,95,0.15)` (toggles, active)

### Status
- success: `#3D7A5F`
- warning: `#B07C2E`
- error: `#C24B3C`
- info: `#5A7A9A`

### Borders
- subtle: `rgba(26,22,17,0.06)`
- default: `rgba(26,22,17,0.12)`
- strong: `rgba(26,22,17,0.20)`

---

## Typography

### Type Scale
- display: 34/41, weight 600, letterSpacing -0.5
- largeTitle: 28/34, weight 600, letterSpacing -0.3
- title: 22/28, weight 600
- headline: 17/22, weight 600
- body: 16/24, weight 400
- callout: 15/21, weight 400
- subhead: 13/18, weight 400
- footnote: 12/16, weight 400
- caption: 11/14, weight 500, letterSpacing 0.2

### Rules
1. Headings use display/largeTitle for greetings
2. Section labels use caption with subtle color
3. Body text minimum 16px
4. Metadata uses footnote/subhead with tertiary color
5. Monospace ONLY for technical values
6. No ALL CAPS except rare emphasis

---

## Spacing

- xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48, section: 64

---

## Corner Radius

- sm: 6, md: 10, lg: 14, xl: 18, xxl: 24, full: 999

---

## Shadows

Use CSS boxShadow, never legacy elevation.

- sm: `0 1px 2px rgba(26,22,17,0.04)`
- md: `0 2px 8px rgba(26,22,17,0.06)`
- lg: `0 4px 16px rgba(26,22,17,0.08)`

---

## Buttons

### Primary
- Background: accent.primary
- Text: inverse
- Radius: full (pill)
- Padding: 14 horizontal, 12 vertical

### Secondary
- Background: transparent
- Border: border.default
- Text: primary
- Radius: full

### Ghost
- Background: transparent
- Text: secondary
- No border

---

## Inputs

- Background: sunken
- Border: border.default (1px)
- Border focus: accent.primary
- Radius: md (10)
- Padding: 14 horizontal, 12 vertical
- Text: primary
- Placeholder: tertiary

---

## Cards

- Background: raised
- Border: border.subtle (1px)
- Radius: lg (14)
- Padding: lg (16)

---

## List Rows

- Min height: 52
- Padding: lg horizontal, md vertical
- Divider: border.subtle (1px, inset from leading icon)
- Active state: accent.soft background

---

## Status Indicators

- Small dot (6px) + label text
- No badges with uppercase text
- Subtle background tint, not bold borders

---

## Empty States

- Centered vertically
- Subtle icon (40px, tertiary color)
- Title: headline weight
- Subtitle: body, secondary color
- Generous spacing (xxxl)

---

## Motion

- Transitions: ease-out with 200ms duration
- Screen transitions: slide from right (280ms)
- Modal presentations: slide from bottom (320ms)
- List item appearance: fade in + subtle upward movement (150ms stagger)
- No bouncing, no elastic, no spring physics
- No pulsing, no glowing, no particle effects

---

## Icons

- Use lucide-react-native
- Size: 20 for headers, 18 for rows, 16 for small elements
- Weight: regular (not bold)
- Color: secondary (not primary) unless on accent background
- Do not use emojis as primary visual language

---

## Navigation (Bottom Tab Bar)

- Background: base canvas
- Border top: border.subtle (1px)
- Height: 84 (iOS with safe area), 64 (Android)
- Active: accent.primary color for icon + label
- Inactive: tertiary color
- Label: caption size (11px), medium weight
- Icon: 22px
- No badges on tabs
- Selection indicator: subtle color change only
