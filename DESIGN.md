# Design System

## Theme

Light-first warm paper. Midnight warm dark is reserved for the conversation world and speaking states.

## Colors

- `--bg-base`: #FAFAF7 (warm paper)
- `--bg-raised`: #F5F3EE
- `--bg-sunken`: #EDEBE6
- `--text-primary`: #1A1611
- `--text-secondary`: #6B6560
- `--text-tertiary`: #6F6A63
- `--accent-primary`: #3D3B5C
- `--accent-soft`: rgba(61,59,92,0.10)
- `--status-success`: #2D7A4A
- `--status-warning`: #B07C2E
- `--status-error`: #C24B3C
- `--ember`: #FFB45C (presence light, speaking only)

Dark conversation tokens (`Midnight`): bg #17130F, surface #241E17, ink #F1E9DC, muted #A3927F, line rgba(240,233,223,0.07).

## Typography

- iOS: SF Pro Text / Display, Georgia serif, SF Mono for values only
- Android: sans-serif stacks
- Scale: display 34, largeTitle 28, title 22, headline 17, body 16/24, callout 15, subhead 13, footnote/caption 12
- Body line length 65ch max. Tabular numerals for timers.

## Spacing

- Scale: 2, 4, 8, 12, 16, 20, 24, 32, 48, 64; edge rhythm 52
- Radii: sm 6, md 10, lg 14, xl 18, xxl 24, full 999

## Components

- Primary action: full radius pill, accent fill, 16/700 label, 44px minimum height
- Secondary: raised pill with hairline border
- Chips: 44px minimum touch row, selected is accent fill with inverse label
- Bubbles: user #E4E2DC right, Ghost raised with subtle border; no nested cards
- Status: inline honest text, error in status error, never a modal first
- Motion: 150 to 250ms, ease out exponential, no bounce, reduced motion respected
