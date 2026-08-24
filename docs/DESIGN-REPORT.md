# Ghost Mobile App — Design Report

> A comprehensive review of every screen, component, token, and design decision in the Ghost mobile app as of commit `238a4d7`.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Component Library](#component-library)
6. [Tab Navigator](#tab-navigator)
7. [Screen: Home](#screen-home)
8. [Screen: Chat](#screen-chat)
9. [Screen: Conversation](#screen-conversation)
10. [Screen: Activity](#screen-activity)
11. [Screen: Memory](#screen-memory)
12. [Screen: Settings](#screen-settings)
13. [Error Handling](#error-handling)
14. [Backend Gaps & TODOs](#backend-gaps--todos)
15. [What We Are NOT Building](#what-we-are-not-building)

---

## Design Philosophy

Ghost is a **personal AI** — not a chatbot, not a developer tool, not a home assistant. The mobile app is the window into that relationship.

Three words guide every decision: **warm, quiet, premium.**

- **Light-first.** The app opens on warm paper tones, not dark panels. Dark mode is defined but secondary.
- **No terminal aesthetic.** Killed green borders, glowing indicators, "THINKING..." labels, developer jargon. Monospace is reserved exclusively for actual technical values (code blocks, version strings).
- **No dashboard.** No metric cards, no gauge charts, no system stats on the home screen. This is a personal interface, not an admin panel.
- **No ChatGPT clone.** Ghost is not a blank text box with a send button. It has structure: a home feed, conversation history, activity log, memory browser, settings.

---

## Color System

All colors live in `constants/theme.ts` as a two-tier system: raw `Colors` (platform compat) and semantic `Ghost` tokens (canonical).

### Background Stack

Three elevation levels, each slightly darker/warmer than the last. No shadows — hierarchy is communicated through color alone.

| Token | Hex | Usage |
|---|---|---|
| `Ghost.bg.base` | `#FAFAF7` | Screen backgrounds, tab bar |
| `Ghost.bg.raised` | `#F5F3EE` | Cards, list rows, input fields |
| `Ghost.bg.sunken` | `#EDEBE6` | Disabled states, icon containers, toggle track |

### Text Stack

Four levels of text emphasis. The warm near-black (`#1A1611`) avoids the harshness of pure black.

| Token | Hex | Usage |
|---|---|---|
| `Ghost.text.primary` | `#1A1611` | Headings, primary content |
| `Ghost.text.secondary` | `#6B6560` | Descriptions, subtitles, placeholders |
| `Ghost.text.tertiary` | `#9C9590` | Timestamps, labels, inactive states |
| `Ghost.text.inverse` | `#FAFAF7` | Text on accent/colored backgrounds |

### Accent

A single, muted sage green. Used sparingly — buttons, links, active states, toggles, the connection dot.

| Token | Value | Usage |
|---|---|---|
| `Ghost.accent.primary` | `#3D7A5F` | Primary actions, active tab, links |
| `Ghost.accent.soft` | `rgba(61,122,95,0.08)` | Avatar backgrounds, icon tints |
| `Ghost.accent.medium` | `rgba(61,122,95,0.15)` | Toggle track (on state) |

### Status

| Token | Hex | Usage |
|---|---|---|
| `Ghost.status.success` | `#3D7A5F` | Connected, success messages |
| `Ghost.status.warning` | `#B07C2E` | Rate limits, degraded state |
| `Ghost.status.error` | `#C24B3C` | Failures, connection errors |
| `Ghost.status.info` | `#5A7A9A` | Informational |

### Borders

Three opacity levels of the warm near-black, applied as rgba. No hard border colors.

| Token | Value | Usage |
|---|---|---|
| `Ghost.border.subtle` | `rgba(26,22,17,0.06)` | List dividers, subtle separation |
| `Ghost.border.default` | `rgba(26,22,17,0.12)` | Input borders, card borders |
| `Ghost.border.strong` | `rgba(26,22,17,0.20)` | Focused states, emphasis borders |

---

## Typography

Platform-native fonts. SF Pro family on iOS, system sans-serif on Android.

| Font Key | iOS | Android |
|---|---|---|
| `Fonts.sans` | SF Pro Text | sans-serif |
| `Fonts.display` | SF Pro Display | sans-serif-medium |
| `Fonts.serif` | Georgia | serif |
| `Fonts.rounded` | SF Pro Rounded | sans-serif-medium |
| `Fonts.mono` | SF Mono | monospace |

### Type Scale

Editorial hierarchy. Display at 34pt down to caption at 11pt. No ALL CAPS except section headers.

| Name | Size | Line Height | Weight | Letter Spacing |
|---|---|---|---|---|
| `Type.display` | 34 | 41 | 600 | -0.5 |
| `Type.largeTitle` | 28 | 34 | 600 | -0.3 |
| `Type.title` | 22 | 28 | 600 | — |
| `Type.headline` | 17 | 22 | 600 | — |
| `Type.body` | 16 | 24 | 400 | — |
| `Type.callout` | 15 | 21 | 400 | — |
| `Type.subhead` | 13 | 18 | 400 | — |
| `Type.footnote` | 12 | 16 | 400 | — |
| `Type.caption` | 11 | 14 | 500 | 0.2 |

### ThemedText Component

`components/themed-text.tsx` exports a `GhostText` component that maps a `type` prop to the correct type scale entry. Supports `display`, `largeTitle`, `title`, `headline`, `body`, `callout`, `subhead`, `footnote`, `caption`, `link`, and `mono`.

---

## Spacing & Layout

### Spacing Scale

Consistent 4px base increment. The screen horizontal padding is always 20px (`Space.xl`).

| Token | Value |
|---|---|
| `Space.xxs` | 2 |
| `Space.xs` | 4 |
| `Space.sm` | 8 |
| `Space.md` | 12 |
| `Space.lg` | 16 |
| `Space.xl` | 20 |
| `Space.xxl` | 24 |
| `Space.xxxl` | 32 |
| `Space.huge` | 48 |
| `Space.section` | 64 |

### Border Radius

Rounded corners everywhere. Cards at 14px, bubbles at 18px, pills at 999px.

| Token | Value | Usage |
|---|---|---|
| `Radius.sm` | 6 | Small buttons |
| `Radius.md` | 10 | Input fields, icon containers |
| `Radius.lg` | 14 | Cards, list rows |
| `Radius.xl` | 18 | Chat bubbles, input bars |
| `Radius.xxl` | 24 | Bottom sheet top corners |
| `Radius.full` | 999 | Pills, capsule buttons |

### Shadows

**None.** Zero elevation, zero shadow, zero drop-shadow. Visual hierarchy is achieved entirely through background color layering (`base` → `raised` → `sunken`).

---

## Component Library

All shared primitives live in `components/ghost.tsx`. Nine components total.

### GhostButton

Four variants: `primary`, `secondary`, `ghost`, `danger`. All use `borderRadius: 999` (full pill), `minHeight: 48`, `paddingVertical: 14`, `paddingHorizontal: 20`. Disabled state uses `bg.sunken` background and 0.5 opacity. Loading state shows an `ActivityIndicator`.

### GhostSheet

Bottom sheet modal. Transparent backdrop at `rgba(26,22,17,0.4)`. Sheet background is `bg.base` with `borderTopLeftRadius: 24` and `borderTopRightRadius: 24`. Contains a grabber bar (36×4, `borderRadius: 2`, `border.default` color), a title row with "Done" button, and a ScrollView content area.

### SectionHeader

Uppercase section label with optional subtitle and action. Uses `caption` type, `tertiary` color, `textTransform: uppercase`, `letterSpacing: 0.5`. Horizontal padding 20px, top padding 32px.

### GhostList / GhostRow

A grouped list container with 14px border radius and 0.5px dividers indented 56px from the left. Each row has an optional leading icon (24px), title (`body`/primary), subtitle (`subhead`/secondary), and trailing chevron (`›` character in `callout`/tertiary). Rows become `TouchableOpacity` when `onPress` is provided.

### GhostToggle

Wraps React Native `Switch` with Ghost colors. Track: `bg.sunken` (off), `accent.medium` (on). Thumb: `accent.primary` (on), `tertiary` (off). Scaled to 85%.

### GhostInput

Text input with `bg.sunken` background, 1px `border.default` border, 10px border radius. Supports `multiline` (minHeight 96), `secureTextEntry`, and `keyboardType`. Font: 16px system sans.

### ConnectionPill

A small status indicator: 6px dot + label text. States: online (accent.primary dot, "Connected"), syncing (warning dot, "Available"), offline (tertiary dot, "Offline").

### EmptyState

Centered placeholder for empty screens. Icon at 40% opacity, headline title (`body`/primary, centered), subtitle (`body`/secondary, centered), optional action button. Horizontal padding 48px.

### StatusDot

A simple 6px colored circle. States: `online` (accent.primary), `warning` (warning), `offline` (tertiary).

### Card

Basic container: `bg.raised`, `borderRadius: 14`, `padding: 16`.

---

## Tab Navigator

Five tabs. Defined in `app/(tabs)/_layout.tsx`.

| Tab | File | Icon (lucide) | Label |
|---|---|---|---|
| Home | `index.tsx` | `House` | Home |
| Chat | `chat.tsx` | `MessageCircle` | Chat |
| Activity | `activity.tsx` | `Clock` | Activity |
| Memory | `memory.tsx` | `Bookmark` | Memory |
| Settings | `settings.tsx` | `Settings` | Settings |

### Tab Bar Style

- Background: `Ghost.bg.base`
- Top border: `border.subtle`, 0.5px on iOS, 1px on Android
- Height: 84px on iOS (includes safe area), 64px on Android
- No shadows, no elevation
- Icons: 22px, `strokeWidth` 2 (focused) / 1.5 (unfocused)
- Labels: 10px, weight 600 (focused) / 400 (unfocused)
- Haptic feedback on every tab switch (`Haptics.selectionAsync`)

---

## Screen: Home

**File:** `app/(tabs)/index.tsx`

The landing screen. What Ghost wants you to know right now.

### Layout

1. **Greeting header.** Time-of-day greeting ("Good morning", "Good afternoon", "Good evening") in `display` type (34pt). Below: status line in `body`/secondary ("Ghost is connected" or "Ghost is offline"). Top-right: `ConnectionPill`.

2. **Inbox feed.** A `FlatList` of `HomeItem` cards. Each card:
   - Background: `raised`, `borderRadius: 14`, padding 16, gap 8
   - Header row: timestamp (`footnote`/tertiary, HH:MM format) + kind label (`caption`/accent, lowercase — "briefing", "reminder", "noticed", "activity")
   - Title: `headline`/primary, 1 line
   - Preview: `callout`/secondary, 2 lines, lineHeight 20

3. **Empty state.** When no inbox items: "Ghost is quiet today." with subtitle "Ask me anything, and I will start working for you."

4. **Input bar (fixed bottom).** Touchable bar that navigates to `/chat`. Background: `raised`, `borderRadius: 18`, padding 16/12, border `subtle`. Placeholder text in `body`/tertiary. Send button: 32×32 circle, `accent.primary` background, white ArrowUp icon.

### Backend Dependency

Currently proxies `inbox` from the Zustand store. A proper `GET /v1/home` endpoint would aggregate inbox, recent activity, and pending reminders.

---

## Screen: Chat

**File:** `app/(tabs)/chat.tsx`

Session list. Browse and create conversations.

### Layout

1. **Header.** "Conversations" (`largeTitle`), `ConnectionPill`, new-conversation button (36×36 circle, `accent.primary` bg, white Plus icon).

2. **Session list.** `FlatList` of sessions fetched via `fetchSessions(config)`. Each row:
   - Background: `raised`, `borderRadius: 14`
   - Leading icon: 40×40 circle, `bg.sunken`, `MessageCircle` icon (`tertiary`)
   - Title: `headline`/primary, 1 line
   - Timestamp: `caption`/tertiary, relative time ("Just now", "5m ago", "2h ago", "Yesterday", "3d ago", or "Jan 5")
   - Preview: `callout`/secondary, "{n} messages"

3. **Empty states.**
   - Not connected: "Connect to your Ghost to start conversations."
   - No sessions: "No conversations yet" with "New Conversation" button (`accent.primary`, `borderRadius: full`)
   - Loading: `ActivityIndicator` (accent.primary, large)

### Session Title Logic

Uses `session.title` if it exists and differs from the session ID. Falls back to the ID, splitting on `:` and taking the last segment.

### Navigation

Tapping a session sets `currentSession` in the store and pushes `/conversation`.

---

## Screen: Conversation

**File:** `app/conversation.tsx`

Full chat interface. Message bubbles, markdown rendering, streaming.

### Layout

1. **Header.** Back button (ArrowLeft, accent.primary, 24px), centered title "Ghost" (`headline`), spacer.

2. **Message list.** `FlatList` with inverted orientation.
   - **User bubbles:** `alignSelf: flex-end`, maxWidth 85%, `bg.accent.primary`, `borderRadius: 18`, padding 16/12. Text: `body`/inverse.
   - **Assistant bubbles:** `alignSelf: flex-start`, maxWidth 85%, `bg.raised`, `borderRadius: 18`, padding 12/16. Includes avatar: 28×28 circle, `bg.accent.soft`, "G" letter (`caption`/accent, weight 600). Content rendered via `react-native-markdown-display`.
   - **Timestamps:** `caption`/tertiary, marginTop 4.

3. **Streaming indicator.** `ActivityIndicator` + "Ghost is thinking..." (`footnote`/tertiary).

4. **Input bar.** `TextInput` (flex 1, `bg.raised`, `borderRadius: 18`, 1px `border.default`, maxHeight 120, fontSize 16, lineHeight 24, placeholder "Ask Ghost...") + Send button (40×40 circle, `accent.primary`, white Send icon). Disabled at opacity 0.4. Max 2000 characters.

### Markdown Styles

| Element | Rendering |
|---|---|
| `body` | primary, 16/24, sans |
| `heading1` | primary, 700, 22, marginBottom 8 |
| `heading2` | primary, 600, 18, marginBottom 6 |
| `code_inline` | bg.sunken, primary, mono, borderRadius 6, px 5, fontSize 14 |
| `fence` | bg.sunken, borderRadius 10, padding 12 |
| `link` | accent.primary |
| `strong` | primary, 600 |
| `blockquote` | borderLeft 3px accent.primary, paddingLeft 12, opacity 0.85 |
| `hr` | bg.border.subtle, height 1 |

### Send Flow

1. Creates temp user message with `status: "sending"`
2. Appends to store, clears input, sets `streaming = true`
3. Calls `sendMessage` with:
   - `onChunk` → `appendStream` (accumulates tokens)
   - `onDone` → `commitStream` (finalizes message)
   - `onError` → `setStreaming(false)`

---

## Screen: Activity

**File:** `app/(tabs)/activity.tsx`

Scheduled background tasks. Cron jobs presented as human-readable actions.

### Layout

1. **Header.** "Activity" (`largeTitle`), `ConnectionPill`.

2. **Job cards.** Each cron job rendered as a card:
   - Background: `raised`, `borderRadius: 14`, padding 16, gap 8
   - Header row: Name (`headline`/primary) + Schedule (`subhead`/secondary)
   - Toggle button: 32×32 circle, Play/Pause icon. `accent.soft` bg when active, `bg.sunken` when paused.
   - Meta rows: Clock/CheckCircle icon (12px, tertiary) + text (`footnote`/tertiary)
     - "Next: Today · 3:00 PM" or "Next: Wed, Jan 8, 3:00 PM"
     - "Ran 5 times · Last: 2h ago"
   - Error row: AlertCircle (12px, error) + error text (`footnote`/error, 2 lines max)
   - Run now button: Play icon + "Run now" (`footnote`/accent.primary)

3. **Empty states.** Not connected / Loading / "No activity yet"

### Schedule Parsing

- `every` kind: Converts milliseconds to human — "Every day", "Every 2 hours", "Every 30 min", "Every 15s"
- `at` kind: "Once · Jan 5, 3:00 PM"
- Fallback: "Custom schedule"

### Optimistic Toggle

Immediately flips `lifecycle_state` in local state for instant UI feedback. Calls API in background. Reverts on error.

---

## Screen: Memory

**File:** `app/(tabs)/memory.tsx`

Browse what Ghost knows about you. Currently displays category structure with placeholder counts.

### Layout

1. **Header.** "Memory" (`largeTitle`), `ConnectionPill`.

2. **Subtitle.** "What Ghost remembers about you" (`body`/secondary).

3. **Category list.** `FlatList` of memory categories. Each row:
   - Background: `raised`, `borderRadius: 14`, padding 16, gap 12
   - Icon container: 40×40, `borderRadius: 10`, `bg.accent.soft`, icon colored `accent.primary`
   - Title: `headline`/primary
   - Description: `subhead`/secondary
   - Count badge: minWidth 24, height 24, `borderRadius: 12`, `bg.sunken`, `caption`/tertiary
   - Trailing chevron: `ChevronRight` (16px, tertiary)

### Categories

| ID | Title | Icon | Description |
|---|---|---|---|
| `people` | People | Users | People Ghost knows about |
| `projects` | Projects | Folder | Things you are working on |
| `preferences` | Preferences | Heart | How you like things |
| `places` | Places | MapPin | Locations that matter |
| `goals` | Goals | Flag | What you are working toward |
| `facts` | Facts | Info | Important things to remember |
| `decisions` | Decisions | GitBranch | Choices you have made |

### Backend Gap

Categories are hardcoded with `count: 0`. A `GET /v1/memory/entries` endpoint is needed to populate real counts and entry lists.

---

## Screen: Settings

**File:** `app/(tabs)/settings.tsx`

Unified settings screen. Profile, connection, permissions, about — all in one scrollable view.

### Layout

1. **Header.** "Settings" (`largeTitle`), `ConnectionPill`.

2. **Profile card.** Background `raised`, `borderRadius: 14`, padding 16, marginHorizontal 20, marginBottom 24.
   - Avatar: 48×48 circle, `bg.accent.soft`, `User` icon (accent.primary, 24px)
   - Name: `headline`/primary ("Ghost Owner")
   - Status: `StatusDot` + `subhead`/secondary text (Connected / Syncing / Offline)

3. **CONNECTION section.** Uppercase section header (`caption`/tertiary, letterSpacing 0.5).
   - Card: `raised`, `borderRadius: 14`, padding 16, gap 16
   - Host field: `GhostInput`, placeholder "192.168.1.100"
   - Port field: `GhostInput`, numeric, placeholder "8766"
   - Secret Key field: `GhostInput`, `secureTextEntry`
   - QR Scan button: `border.default`, `borderRadius: 10`, QrCode icon + "Scan QR Code" (`headline`/accent.primary, fontSize 15)
   - Button row: "Test" (secondary) + "Save & Connect" (primary, `borderRadius: full`)
   - Feedback text: "Connected successfully" (success) / "Connection failed" (error)

4. **PERMISSIONS section.** Uppercase header.
   - Card with single toggle row:
     - Location: Switch (Ghost-styled) + "Share location for weather and context"

5. **ABOUT section.** Uppercase header.
   - Card with:
     - Version: "1.0.0" (`headline`/tertiary)
     - Capabilities: Zap icon + chevron
     - About Ghost: Info icon + chevron

### QR Pairing Flow

Opens `QrPairingScanner` modal (camera-based QR scanner). On successful scan: fills host/port/secret fields, saves config, connects.

---

## Error Handling

**File:** `components/ErrorCard.tsx`

Typed error cards with tone-colored backgrounds.

### Error Kinds → Icons

| Kind | Icon | Title |
|---|---|---|
| `auth` | Lock | Connection Rejected |
| `rate_limit` | Clock | Ghost is Busy |
| `provider` | AlertTriangle | Response Failed |
| `network` | WifiOff | Can't Reach Ghost |
| `empty_stream` | MessageCircleOff | No Response |
| `interrupted` | ZapOff | Response Interrupted |
| `timeout` | TimerOff | Request Timed Out |

### Tone Colors

- **Error** (auth, provider, network): fg `#C24B3C`, bg `rgba(194,75,60,0.10)`, border `rgba(194,75,60,0.30)`
- **Warning** (rate_limit, empty_stream, interrupted, timeout): fg `#B07C2E`, bg `rgba(176,124,46,0.10)`, border `rgba(176,124,46,0.30)`

### Card Layout

- Row: icon wrapper (28×28, `borderRadius: 14`, `bg.sunken`) + content card (flex 1, `borderRadius: 14`, 1px border, padding 12)
- Partial content area with bottom border
- Header row: colored dot (8×8) + error title
- Action buttons: "Retry" (`borderRadius: full`, 1px border) + "Dismiss" (text only)
- Auth hint: "Check Settings → Shared Secret" (`caption`/tertiary, right-aligned)

---

## Backend Gaps & TODOs

These features are designed but cannot be fully implemented without backend endpoints.

### P0 — Required for MVP

| Gap | Screen | Current State | Needed Endpoint |
|---|---|---|---|
| Home feed aggregation | Home | Proxies inbox items from store | `GET /v1/home` — returns inbox, pending reminders, recent activity |
| Memory entries | Memory | Hardcoded categories with count=0 | `GET /v1/memory/entries` — returns entries grouped by kind |
| Device status | Settings (About) | Shows hardcoded "1.0.0" | `GET /v1/device/status` — returns version, uptime, health |

### P1 — Important for Polish

| Gap | Screen | Needed |
|---|---|---|
| Session titles | Chat | Auto-generated conversation titles from first message |
| Profile data | Settings | `GET /v1/profile` — returns user name, preferences |
| Capabilities list | Settings | `GET /v1/capabilities` — returns available tools as human-readable categories |

### P2 — Nice to Have

| Gap | Screen | Needed |
|---|---|---|
| Memory CRUD | Memory | Create, edit, delete personal context entries |
| Activity history | Activity | Historical run log beyond current cron jobs |
| Notification preferences | Settings | Per-notification-type toggle controls |

---

## What We Are NOT Building

Explicitly excluded from the mobile app:

- **Technical diagnostics** (CPU, memory, disk, temperature) — belongs on the Ghost Pod web console
- **Raw tool names** (~30 backend tools) — translated to human capabilities (Research, Remember, Browse, etc.)
- **Developer jargon** (WebSocket status, bridge secrets, relay logs, cron expressions)
- **Dashboard metrics** (request counts, latency charts, token usage)
- **Multi-user management** — Ghost is personal, one user per device
- **Theme customization** — one warm, quiet theme. Done.
- **Tablet-optimized layouts** — phone-first, `supportsTablet: false`

---

## Summary

The Ghost mobile app is a **quiet, warm, premium personal AI interface**. It avoids every trope of developer tools and chatbot UIs in favor of something that feels like a well-designed personal journal — calm paper tones, generous spacing, editorial typography, and zero visual noise.

Every design decision serves one goal: **make Ghost feel like a person, not a product.**
