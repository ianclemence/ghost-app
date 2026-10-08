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
- Code in replies is coloured like an editor (highlight.js, common languages only, `lib/highlight.ts`) in a GitHub Dark / One Dark family palette tuned to Ghost (`lib/syntax-theme.ts`, every colour checked for contrast on the block), with line numbers from 5 lines, long lines wrapping inside their row, and added and removed diff lines tinted green and red. A block with no label is never read as code: it is output, and only what is literal in it is coloured (quoted text, paths, links, numbers, errors, success). Highlighting never changes the code (tokens always join back to it). A file preview shows a file as itself (`lib/fileKinds.ts`): Markdown only for Markdown, everything else as code
- What Ghost starts by itself (reminder, noticed, needs you, routine) is a card (`components/notice-card.tsx`, shaped by `lib/notice.ts`): indigo, blue, amber with a glow, green; a short one is a serif headline, a long one keeps its formatting
- Dynamic cards (`components/present-card.tsx`, `card-blocks.tsx`, `lib/blocks.ts`): Ghost presents an answer as a card built only from a fixed set of blocks (metric, facts, list, timeline, progress, note, text, code) that the Pod validates. Choices are only a reply or a dismissal; a resolved card puts itself away into one line. The Pod and the phone are pinned together by `lib/cards-contract.json`, the same file the Pod tests
- Alive, not busy: the aurora breathes while Ghost works, the mark's light shows presence, the step you are at on a timeline glows, a progress bar fills once, starter chips arrive in turn, and a short veil blooms the aurora in at cold start. Each runs once or while something is happening, and every one respects reduced motion
- What Ghost did is one quiet line above its reply (`components/run-activity.tsx`, `lib/runSteps.ts`): "Searching the web · 12s" while it works, "Searched the web, ran 2 commands (1 failed)" after. A fixed-height row, so it never moves the thread; tapping it opens the run in a sheet, step by step (what, about what, how long, why it failed). A reply that needed no tools has no line
- Typing while Ghost works queues (`components/queue-tray.tsx`, `lib/queue.ts`): the bar says "Queue a message…", and each message is a line above it that says what became of it: Queued, Picked up, or Up next. Only a message nothing has seen yet can be taken back
- Ghost's browser stays: finished work keeps its card with the last picture and how long it took, and folds into one line only when it is no longer the latest work (after a few seconds) or when you fold it; your choice always wins
- The thread follows the end by one rule (`lib/follow.ts`): only your finger leaving the end stops it, growth never does, and growth is answered with one snap per frame. A time or "Copied" is drawn outside the row's layout, so tapping a message never moves the thread
- Things Ghost builds run in the conversation (`components/canvas-card.tsx`, `app/canvas.tsx`, `lib/canvas.ts`) as a window: the page runs at its own height (up to 520) in a 24-radius frame the width of the thread, on its own ground (the frame takes the colour the page paints; a long page melts into it). The window's floor is its bar, part of the frame and never a loose line under it: an indigo window badge, the title, a quiet line (version, "Interactive" or "More inside"), and one glass Open pill for the full-screen sheet (Change it, Copy code, Share, versions). An error sits in the window above the bar with a "Fix it" pill. The newest canvas runs where it is; earlier ones fold to the bar alone. Pages are sandboxed (no network, no storage, no navigation, CDN scripts from a short list); the Pod tells the model the page is the window (full width, no outer card, no 100vh centring). An html or svg code block in a reply has a Run button
- What Ghost hands over (`components/artifact-card.tsx`) looks like the same thing anywhere in the app: a file is the attachment row (a badge tinted by its kind, the name, kind and what it is), opens in place on a tap and saves from a round button; a link is the same row with an arrow out; a written result is a serif heading and a few light lines until "Show all"; a picture is shown with its name under it
- Every card in the thread sits one message gap (16) below what came before it; a card never adds margins of its own. Of a card's choices, one glows (the first that goes ahead); the rest are glass and danger stays soft
- Inline code is a rounded gold pill that takes its size from its own text. A paragraph with inline code is laid out as a wrapping row of its words and pills (`lib/inlineFlow.ts`) instead of a pill drawn inside a line of text, which the platform laid over its neighbours; a snippet longer than a line wraps inside its own box, and punctuation stays against the code it follows
- A message's time sits the same distance under it whoever wrote it: 12px below the bubble's edge for you, and below the last line for Ghost (its paragraph margin plus line slack), in a gap the thread reserves, so tapping never moves anything
- Scrolled content dims into the header (`TopEdge`) instead of being cut off
- No light theme, no header bars, no blur strips

## Motion

Press feedback scale 0.95 in 100ms, ease-out `cubic-bezier(0.23, 1, 0.32, 1)`; small state changes 150 to 200ms; no bounce; reduced motion respected.
