# Design System

## Theme

Pure black with one aurora of light. No light theme. All colour comes from the aurora; controls are glass (a faint white fill with a hairline edge). The same identity runs across the app, the web console and the terminal.

## Colors (`constants/theme.ts`)

- bg: base `#000000`, raised `#0E0E12`, sunken `#07070A`
- text: primary `#FFFFFF`, secondary `#B3B1BD`, tertiary `#7C7A88`
- glass: fill `rgba(255,255,255,0.06)`, strong `rgba(255,255,255,0.11)`, border `rgba(255,255,255,0.14)`
- accent (indigo glow) `#9C95FF`; status success `#6FE3A0`, warning `#FFC24D`, error `#FF7A7A`, info `#8FB8FF`
- aurora: amber `#FF9A1A`, magenta `#C23DEB`, violet `#7A3CF0`, blue `#3A2EF0`

## Typography

- Display: Instrument Serif, tight (-1 tracking), for greetings and screen titles.
- Interface: Inter (bundled, 300/400/500/600). Light and large (`Type.prose`) where Ghost speaks; regular where you act. `components/text.tsx` picks the file for the weight; never set `fontFamily` to the system face.

## Background

`ScreenBackground` is one SVG of four radial gradients (amber top, magenta right, violet and blue below) in two layers that drift slowly, with a fade to black below mid-screen. `hero` is full strength (empty conversation, front page, first run); `calm` is turned down for reading.

## Components

- Glass pill buttons, 44px minimum; the action button in the composer is a glowing indigo pill
- Composer: one large glass card, text on top, controls beneath (plus, optional suggestion chip, action)
- Presence: a small glass pill with a status light and one live line; opens the panel
- Panel: serif greeting, light sentences with inline icon chips, a floating icon dock
- Tables never scroll sideways: columns share the width and wrap, wide ones stack as records
- Code in replies is coloured like an editor (highlight.js, common languages only, `lib/highlight.ts`) in the app's palette (`lib/syntax-theme.ts`), with line numbers from 5 lines. Only labelled fences are coloured: guessing paints plain output as code. Highlighting never changes the code (tokens always join back to it)
- What Ghost starts by itself (reminder, noticed, needs you, routine) is a card (`components/notice-card.tsx`, shaped by `lib/notice.ts`): indigo, blue, amber with a glow, green; a short one is a serif headline, a long one keeps its formatting
- Dynamic cards (`components/present-card.tsx`, `card-blocks.tsx`, `lib/blocks.ts`): Ghost presents an answer as a card built only from a fixed set of blocks (metric, facts, list, timeline, progress, note, text, code) that the Pod validates. Choices are only a reply or a dismissal; a resolved card puts itself away into one line. The Pod and the phone are pinned together by `lib/cards-contract.json`, the same file the Pod tests
- Alive, not busy: the aurora breathes while Ghost works, the mark's light shows presence, the step you are at on a timeline glows, a progress bar fills once, starter chips arrive in turn, and a short veil blooms the aurora in at cold start. Each runs once or while something is happening, and every one respects reduced motion
- What Ghost did is one quiet line above its reply (`components/run-activity.tsx`, `lib/runSteps.ts`): "Searching the web · 12s" while it works, "Searched the web, ran 2 commands (1 failed)" after. A fixed-height row, so it never moves the thread; tapping it opens the run in a sheet, step by step (what, about what, how long, why it failed). A reply that needed no tools has no line
- Typing while Ghost works queues (`components/queue-tray.tsx`, `lib/queue.ts`): the bar says "Queue a message…", and each message is a line above it that says what became of it: Queued, Picked up, or Up next. Only a message nothing has seen yet can be taken back
- Ghost's browser stays: finished work keeps its card with the last picture and how long it took, and folds into one line only when it is no longer the latest work (after a few seconds) or when you fold it; your choice always wins
- The thread follows the end by one rule (`lib/follow.ts`): only your finger leaving the end stops it, growth never does, and growth is answered with one snap per frame. A time or "Copied" is drawn outside the row's layout, so tapping a message never moves the thread
- Scrolled content dims into the header (`TopEdge`) instead of being cut off
- No light theme, no header bars, no blur strips

## Motion

Press feedback scale 0.95 in 100ms, ease-out `cubic-bezier(0.23, 1, 0.32, 1)`; small state changes 150 to 200ms; no bounce; reduced motion respected.
