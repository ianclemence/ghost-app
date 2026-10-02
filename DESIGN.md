# Design System

## Theme

Warm paper by day, warm midnight by night: the same two worlds as the web console. The palette is chosen once, when the app starts (the root layout reloads if the phone's setting changes). Deep indigo for structure and the primary action; ember (amber) is the single warm signal and means "Ghost is here": the presence light, an out-of-turn message, an approval asking.

## Colors

Light (`constants/theme.ts`):
- bg: base `#F8F6F1`, raised `#FFFEFB`, sunken `#F0ECE3`
- text: primary `#1A1611`, secondary `#5B554C`, tertiary `#6F6A63`, inverse `#FFFFFF`
- accent `#3D3B5C`; status success `#2D7A4A`, warning `#8A5A00`, error `#C24B3C`, info `#34688F`
- ember `#FFB45C` (bright `#FFCB8A`, deep `#A8620A`); user bubble `#EAE5DA`

Dark ("midnight"):
- bg: base `#14110D`, raised `#1C1813`, sunken `#0F0C09`
- text: primary `#F1E9DC`, secondary `#CDBFAC`, tertiary `#A3927F`, inverse `#14110D`
- accent `#B9B6F2`; status success `#6FCB93`, warning `#F0C25A`, error `#FF8576`, info `#86B8E0`
- user bubble `#26211A`

Camera and live overlays use `Midnight` (always dark, warm). Shadows are cast in warm brown-black in light, pure black in dark.

## Typography

- Display: Instrument Serif (bundled, loaded behind the splash screen) for titles that should read as written: the empty conversation, big numbers. Never for anything you act on.
- Interface: the system face (SF Pro on iOS, the platform sans on Android). Monospace only for technical values.
- Scale: display 30, largeTitle 24, title 19, headline 16, body 15.5/22, callout 14.5, subhead 13, footnote/caption 12
- Tabular numerals for timers.

## Background

`ScreenBackground` is three fields of soft light (indigo upper left, ember upper right, rose below; teal at night) built from stacked translucent discs so there is no edge to see. They drift very slowly and stop under reduced motion. It is always the first child of a screen.

## Spacing

- Scale: 2, 4, 8, 12, 16, 20, 24, 32, 48, 64; edge rhythm 52
- Radii: sm 6, md 10, lg 14, xl 18, xxl 24, full 999
- Sheet offsets: `UI.modal.top` 100, `UI.modal.bottom` 80 (centered screens above the home indicator)
- List clearance above the FAB: `Space.huge + Space.edge` (button height + edge distance)

## Components

- Primary action: full radius pill, accent fill, 16/700 label, 44px minimum height
- Secondary: raised pill with hairline border
- Chips: 44px minimum touch row, selected is accent fill with inverse label
- Conversation: one thread and it is home. Owner messages are soft bubbles (#E4E2DC) on the right; Ghost writes full-width prose (rich answers need the width). No nested cards
- Presence: Ghost's mark with a status light (success idle, ember working or asking, grey offline) and one live line under the name. Tapping Ghost opens its panel
- Time: day separators always; a timestamp only where it carries meaning: when Ghost spoke out of turn (ember dot + time) or the conversation resumed after 30+ minutes
- Ember means Ghost: the presence light, an out-of-turn message, an approval asking. Never decoration
- Where it ran: stated by the Pod's runtime (served_by), one quiet line under a live reply; unknown stays unknown
- Every non-conversation screen: back (or close for the panel) + large title + one-line subtitle; no floating menus
- Status: inline honest text, error in status error, never a modal first. One offline language: `OfflineBadge` (Reconnecting/Offline) on every Pod screen
- Inputs: `GhostInput` everywhere (sunken fill, 48px minimum, tertiary placeholder). No one-off TextInput styles
- Message bar: one pill; its placeholder follows the time of day and changes daily (`lib/placeholder.ts`), says so when Ghost is busy or the Pod is away, and always fits one row
- Attachments: before sending, photos are tiles and files are `FileCard`s (badge tinted by kind, name, type and size) with one line of total size; after sending they sit flush with the bubble: photos in a mosaic that opens a swipeable viewer, files as the same cards
- Approvals: the safest yes (once) is the primary button, a yes for the task is outlined, "always" is the quietest, no is soft red (`lib/approval-variant.ts`)
- Toggles: a green track means on
- Copy: every word earns its place. No em dashes in user-facing strings; commas, colons, or periods instead
- Motion: 150 to 250ms, ease out exponential, no bounce, reduced motion respected
