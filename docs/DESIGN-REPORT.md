# Ghost Mobile — Design Report

> Comprehensive design documentation for the Ghost mobile app. Updated after the product-level redesign (commit `e03b3cf`).

---

## Table of Contents

1. [Product Thesis](#product-thesis)
2. [Design Principles](#design-principles)
3. [Ghost Voice](#ghost-voice)
4. [Visual Identity](#visual-identity)
5. [Color System](#color-system)
6. [Typography](#typography)
7. [Spacing & Layout](#spacing--layout)
8. [Component Library](#component-library)
9. [Tab Navigator](#tab-navigator)
10. [Screen: Home](#screen-home)
11. [Screen: Chats](#screen-chats)
12. [Screen: Conversation](#screen-conversation)
13. [Screen: Activity](#screen-activity)
14. [Screen: Memory](#screen-memory)
15. [Screen: More](#screen-more)
16. [Error Handling](#error-handling)
17. [Backend Architecture](#backend-architecture)
18. [What Was Removed](#what-was-removed)

---

## 1. Product Thesis

> Do not design an app that lets someone use Ghost.
> Design the interface through which Ghost exists in someone's life.

Ghost is a **persistent personal AI**. It remembers, notices, works, communicates, and persists over time. The mobile app is the user's window into that entity.

Ghost is **not**:
- A chatbot
- ChatGPT clone
- Developer console
- Home assistant dashboard
- Productivity SaaS
- Raspberry Pi management app
- Futuristic/sci-fi AI interface

The interface should communicate: **"Ghost is here."**

Not: "Here is an app containing features for Ghost."

---

## 2. Design Principles

### Quiet over decorative

No glowing effects, gradients for decoration, AI particles, futuristic animations, excessive icons, badges, pills, illustrations, giant status indicators, or animated "AI" effects.

Whitespace is a design element. Typography is a design element. Timing and motion are a design element. Language is a design element.

### Cards — use much less

The hierarchy is:

- **Primary content:** open space, typography, grouping, dividers, rhythm
- **Secondary content:** subtle tinted surfaces
- **Interactive controls:** restrained rounded surfaces
- **Modals/sheets:** stronger surfaces where appropriate

Cards should represent independent objects (a morning briefing, a meaningful observation). Not list items, not settings rows, not memory categories.

Rows should be rows. Lists should breathe. Use dividers and whitespace instead of containers.

### Ghost's identity

Ghost's identity comes from:
- Typography
- Spacing
- Composition
- Language
- Motion
- Surfaces
- Restraint
- The Ghost mark

The accent supports the identity. It does not define it.

### Distinct screen compositions

Do not apply one template to every screen. Each screen has its own composition:

- **Home:** spacious, editorial, presence-oriented
- **Chats:** quiet chronological list
- **Conversation:** editorial transcript
- **Activity:** timeline / chronological work history
- **Memory:** human knowledge browser
- **More:** restrained configuration list

The design system unifies these screens. It does not flatten them into the same template.

---

## 3. Ghost Voice

Ghost speaks in a consistent voice throughout the app. The voice is: calm, concise, matter-of-fact, intelligent, understated.

| Context | Ghost Voice |
|---|---|
| Empty home | "It's quiet today." |
| Empty chats | "Start talking to Ghost." |
| Empty activity | "Nothing to report." |
| Empty memory | "Ghost is still getting to know you." |
| Connection error | "I can't reach your Ghost Pod right now." |
| Ghost offline | "Ghost is offline." |
| Reconnecting | "Reconnecting…" |
| Task done | "Done." |
| Error | "Ghost couldn't finish that." |
| No response | "Ghost didn't get a response." |

Never used:
- "Absolutely!" / excessive enthusiasm
- Motivational language
- Corporate language
- Robotic status language
- "No activity yet." / "No conversations yet." / "Connection failed."

---

## 4. Visual Identity

### Ghost Mark

A simple, restrained ghost silhouette. Derived from the existing ghost blob asset. Works at 16–64px. Quiet, editorial, timeless.

Used beside Ghost responses, on Home, during onboarding, in notifications, on the Ghost Pod screen.

Not a G-in-circle. Not a robot. Not a sparkle. Not a glowing orb.

### Colors

The warm light-first palette is unchanged. The muted sage green (`#3D7A5F`) serves as a restrained accent — used for primary actions, active states, and links. It does not dominate the interface.

Identity comes from typography, spacing, and restraint — not from green.

---

## 5. Color System

All colors live in `constants/theme.ts`. Two-tier system: raw `Colors` (platform compat) and semantic `Ghost` tokens (canonical).

### Background Stack

Three elevation levels. No shadows — hierarchy through color alone.

| Token | Hex | Usage |
|---|---|---|
| `Ghost.bg.base` | `#FAFAF7` | Screen backgrounds, tab bar |
| `Ghost.bg.raised` | `#F5F3EE` | Cards, input fields |
| `Ghost.bg.sunken` | `#EDEBE6` | Disabled states, icon containers |

### Text Stack

| Token | Hex | Usage |
|---|---|---|
| `Ghost.text.primary` | `#1A1611` | Headings, primary content |
| `Ghost.text.secondary` | `#6B6560` | Descriptions, subtitles |
| `Ghost.text.tertiary` | `#9C9590` | Timestamps, labels, inactive |
| `Ghost.text.inverse` | `#FAFAF7` | Text on colored backgrounds |

### Accent

| Token | Value | Usage |
|---|---|---|
| `Ghost.accent.primary` | `#3D7A5F` | Primary actions, links |
| `Ghost.accent.soft` | `rgba(61,122,95,0.08)` | Subtle tints |
| `Ghost.accent.medium` | `rgba(61,122,95,0.15)` | Toggle track (on) |

### Status

| Token | Hex | Usage |
|---|---|---|
| `Ghost.status.success` | `#3D7A5F` | Connected, success |
| `Ghost.status.warning` | `#B07C2E` | Rate limits, degraded |
| `Ghost.status.error` | `#C24B3C` | Failures |
| `Ghost.status.info` | `#5A7A9A` | Informational |

### Borders

| Token | Value | Usage |
|---|---|---|
| `Ghost.border.subtle` | `rgba(26,22,17,0.06)` | Dividers |
| `Ghost.border.default` | `rgba(26,22,17,0.12)` | Input borders |
| `Ghost.border.strong` | `rgba(26,22,17,0.20)` | Focused states |

---

## 6. Typography

Platform-native fonts. SF Pro family on iOS, system sans-serif on Android.

| Font Key | iOS | Android |
|---|---|---|
| `Fonts.sans` | SF Pro Text | sans-serif |
| `Fonts.display` | SF Pro Display | sans-serif-medium |
| `Fonts.serif` | Georgia | serif |
| `Fonts.mono` | SF Mono | monospace |

### Type Scale

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

Editorial hierarchy. No ALL CAPS except section labels (used sparingly).

---

## 7. Spacing & Layout

### Spacing Scale

4px base increment. Screen horizontal padding: 20px.

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

### Border Radius

| Token | Value | Usage |
|---|---|---|
| `Radius.sm` | 6 | Small elements |
| `Radius.md` | 10 | Input fields |
| `Radius.lg` | 14 | Cards (sparingly) |
| `Radius.xl` | 18 | Chat bubbles, input bars |
| `Radius.full` | 999 | Pills, capsule buttons |

### Shadows

**None.** Zero elevation, zero shadow. Hierarchy through background color layering alone.

---

## 8. Component Library

All shared primitives in `components/ghost.tsx`. Plus `ghost-mark.tsx` and `ErrorCard.tsx`.

### GhostButton

Four variants: `primary`, `secondary`, `ghost`, `disabled`. Full pill shape (`borderRadius: 999`), `minHeight: 48`. Loading state with `ActivityIndicator`.

### GhostSheet

Bottom sheet modal. Transparent backdrop. Grabber bar, title row with "Done", ScrollView content.

### SectionHeader

Quiet caption-style section label. Tertiary color, small font. No uppercase.

### GhostList / GhostRow

Grouped list container with dividers. Clean rows — no icon containers, no avatar circles. Just text + optional trailing chevron.

### GhostToggle

Wraps `Switch` with Ghost colors.

### GhostInput

Text input with sunken background, subtle border. Supports multiline, secure entry.

### EmptyState

Centered placeholder. Ghost voice text. Optional action button.

### StatusDot

Simple colored circle for online/offline/warning states.

### Divider

0.5px line for visual separation.

### Screen

Safe area wrapper with proper padding.

### GhostMark (`components/ghost-mark.tsx`)

Simple ghost silhouette SVG. Works at 16–64px. Used throughout the app as Ghost's visual identity.

### ErrorCard (`components/ErrorCard.tsx`)

Typed error display with tone-colored backgrounds. 7 error kinds mapped to icons and Ghost-voice titles.

---

## 9. Tab Navigator

Five tabs. Defined in `app/(tabs)/_layout.tsx`.

| Tab | File | Icon | Label |
|---|---|---|---|
| Home | `index.tsx` | House | Home |
| Chats | `chats.tsx` | MessageCircle | Chats |
| Activity | `activity.tsx` | Clock | Activity |
| Memory | `memory.tsx` | Bookmark | Memory |
| More | `more.tsx` | MoreHorizontal | More |

Tab bar:
- Background: `Ghost.bg.base`
- Top border: `border.subtle`, 0.5px iOS / 1px Android
- Height: 84px iOS / 64px Android
- No shadows, no elevation
- Active tab: `text.primary` color, weight 600
- Inactive tab: `text.tertiary` color, weight 400
- Haptic feedback on every tab switch

---

## 10. Screen: Home

**File:** `app/(tabs)/index.tsx`

The most important screen. Ghost's daily presence. NOT an inbox dashboard.

### Composition

Spacious, editorial, presence-oriented.

```
Good morning, Ian.

[only if offline: Ghost is offline.]


[content area — empty or items]


Ask Ghost
```

### When content exists

Inbox items from the Zustand store (populated via WebSocket push). Grouped by temporal context:

- **TODAY**
- **YESTERDAY**
- **EARLIER THIS WEEK**
- Individual days for older items

Each item: title (headline) + preview (body, secondary) + time (footnote, tertiary). Clean rows with dividers. No cards.

### When empty

"It's quiet today." — centered, body style, tertiary color.

### Input

Simple text prompt at bottom: "Ask Ghost". Tap navigates to `/chats`. No send button visible. Subtle, recedes when not focused.

### Data source

- `inbox` from Zustand store (WebSocket push items)
- `connectionState` for offline status
- No API calls — purely reactive to store state

### Backend gap

No `GET /v1/home` aggregation endpoint exists. Currently proxies inbox items from WebSocket. A proper endpoint would aggregate inbox, recent activity, and pending reminders.

---

## 11. Screen: Chats

**File:** `app/(tabs)/chats.tsx`

How I talk to Ghost. Not a session manager.

### Composition

Quiet chronological list.

```
Chats

TODAY
[Session title]           3 messages    2h ago
[Session title]           1 message     5m ago

YESTERDAY
[Session title]           12 messages   Yesterday

EARLIER THIS WEEK
[Session title]           8 messages    Jan 15

EARLIER
[Session title]           24 messages   Jan 3
```

### Each row

- Title (headline) — uses `session.title` if set and different from key, else "Conversation"
- Message count: "{n} messages" (footnote, secondary)
- Time: relative (footnote, tertiary) — right-aligned
- No icons, no avatar circles, no card backgrounds
- Dividers between rows

### Temporal grouping

Sessions grouped by: Today, Yesterday, Earlier This Week, Earlier.

### Empty state

"Start talking to Ghost." with "New Conversation" button.

### New conversation

Sets `currentSession` to `"mobile:default"` and navigates to `/conversation`.

### Data source

`fetchSessions(config)` → `GET /v1/sessions` → `{sessions: [{id, title, message_count, last_activity}]}`

---

## 12. Screen: Conversation

**File:** `app/conversation.tsx`

An editorial transcript. Not chatbot bubbles.

### Composition

```
[←]                    Ghost                    [spacer]
──────────────────────────────────────────────────────

USER

Can you find three motorcycle suppliers in Bangkok?

──────────────────────────────────────────────────────

Ghost

I found three that look worth contacting.

[Content with markdown]

──────────────────────────────────────────────────────
```

### Key design decisions

- **No colored user bubbles.** User messages: "USER" label (caption, tertiary, uppercase) above text (body).
- **No assistant bubble background.** "GHOST" label (caption, secondary) above text (body).
- **No avatar circles.** Removed entirely.
- **No timestamps on every message.** Removed visual noise.
- **Dividers** between messages (0.5px, `border.subtle`).
- **Ghost's response breathes** — generous vertical padding.
- **No "Ghost is thinking..."** — removed entirely. When streaming, the response appears naturally.

### Input

"Message Ghost..." placeholder. Clean, no border initially. Border appears on focus. Max 2000 characters.

### Markdown rendering

Quiet markdown styles. Code blocks use `bg.sunken`. Links in accent color. Blockquotes with left border.

### Data source

- `fetchHistory(config, 50, 0)` → `GET /v1/history?session=X&limit=50`
- `sendMessage(config, opts)` → `POST /v1/chat` (SSE streaming)
- Streaming: `onChunk` → `appendStream`, `onDone` → `commitStream`

---

## 13. Screen: Activity

**File:** `app/(tabs)/activity.tsx`

What has Ghost been doing for me? Not a cron manager.

### Composition

Timeline / chronological work history.

```
Activity

TODAY
Morning briefing          Daily · 8:00 AM
Delivered · 8:02 AM

Researched suppliers      Completed · 10:42 AM

UPCOMING
Morning briefing          Daily at 8:00 AM
Next: Tomorrow · 8:00 AM

PAUSED
Weekly summary            Paused
```

### Each row

- Title (headline) — the job name
- Status line: "Delivered · 8:02 AM" or "Completed · 10:42 AM" (footnote, secondary)
- For upcoming: "Next: Tomorrow · 8:00 AM"
- For paused: "Paused" (footnote, tertiary)
- No play/pause/run buttons in the main list (management actions deferred to detail view)

### Schedule conversion

Cron expressions converted to human text:
- `every` with 86400000ms → "Daily"
- `every` with 3600000ms → "Every hour"
- `cron` with "0 8 * * *" → "Daily at 8:00 AM"
- `at` kind → "Once · Jan 15"

### Sections

- **TODAY** — jobs that ran today
- **UPCOMING** — active jobs with future next run
- **PAUSED** — paused jobs

### Empty state

"Nothing to report."

### Data source

`fetchCronJobs(config)` → `GET /v1/cron/jobs` → `{jobs: [CronJob]}`

CronJob fields: `id`, `name`, `enabled`, `lifecycle_state` ("active"|"paused"|"running"), `schedule` (kind, atMs, everyMs, expr), `payload` (message, deliver, channel), `state` (nextRunAtMs, lastRunAtMs), `run_count`.

---

## 14. Screen: Memory

**File:** `app/(tabs)/memory.tsx`

What does Ghost know about me? Not a database browser.

### Composition

Human knowledge browser.

```
Memory

What Ghost remembers about you.


People
Ian's wife is Maria. She works at the hospital.

Things you're working on
Building a motorcycle workshop in Bangkok.

How you like things
Prefers concise communication. Morning person.
```

### Each row

- Category title (headline)
- Preview of content (body, secondary, 2 lines max)
- No count badges, no icon containers, no chevrons
- Clean rows with dividers

### Data source

Reads real backend files:
- `fetchMemoryFile(config, "user-profile.md")` → user profile info
- `fetchMemoryFile(config, "curated-memory.md")` → Ghost's curated notes

Parses markdown headings into sections with content previews.

### Backend reality

The Ghost backend has three memory layers:
1. **File-based:** `workspace/memory/MEMORY.md` + daily notes
2. **RAG:** SQLite + HNSW vector index (via `remember` tool)
3. **Curated:** `curated-memory.md` + `user-profile.md` (char-limited, injected into system prompt)

The mobile app reads layer 3 (curated). No `GET /v1/memory/entries` endpoint exists for structured entry access.

### Empty state

"Ghost is still getting to know you."

---

## 15. Screen: More

**File:** `app/(tabs)/more.tsx`

Ghost Pod, capabilities, settings, about. Not a settings page.

### Composition

Restrained configuration list.

```
More

[GhostMark 48px]
Ghost
Online


────────────────────────────────

Ghost Pod
Online · Ghost 2.0.0

────────────────────────────────

Capabilities
What Ghost can do

Settings
Connection, preferences

About
Version info

────────────────────────────────
```

### Profile section

- GhostMark icon (not G-in-circle)
- Name: "Ghost"
- Status: "Online" / "Offline" (with StatusDot)

### Capabilities (human concepts)

- Research — web search and browsing
- Remember — saves what matters
- Read — files, documents, images
- Organize — notes, lists, tasks
- Monitor — scheduled checks
- Notify — reaches you when it matters

Not: `web_search`, `shell`, `memory_search`, etc.

### Settings sub-navigation

- Connection: QR scan, reconnect
- Advanced: host/port/secret (hidden behind "Advanced")
- Permissions: location toggle

### Ghost Pod

- Status (Online/Offline)
- Version
- "Reconnect" action

Not: CPU temperature, load, IP address, hostname, process list.

### Data source

- `checkHealth(config)` → version, status
- `fetchSkills(config)` → capability list
- `fetchAvailableTools(config)` → tool list

---

## 16. Error Handling

**File:** `components/ErrorCard.tsx`

Errors sound like Ghost.

| Error Kind | Icon | Ghost Voice Title |
|---|---|---|
| `auth` | Lock | "Connection rejected" |
| `rate_limit` | Clock | "Ghost is busy" |
| `provider` | AlertTriangle | "Something went wrong" |
| `network` | WifiOff | "Can't reach your Ghost Pod" |
| `empty_stream` | MessageCircleOff | "No response" |
| `interrupted` | ZapOff | "Interrupted" |
| `timeout` | TimerOff | "Took too long" |

Tone colors:
- **Error** (auth, provider, network): `#C24B3C` with 10% bg, 30% border
- **Warning** (rate_limit, empty_stream, interrupted, timeout): `#B07C2E` with 10% bg, 30% border

Card layout: icon wrapper + content card with header, partial content, and action buttons.

---

## 17. Backend Architecture

### API Endpoints Used by Mobile App

| Endpoint | Method | Used By | Returns |
|---|---|---|---|
| `/v1/health` | GET | Root layout, More | `{status, version, uptime_s}` |
| `/v1/sessions` | GET | Chats | `{sessions: [{id, title, message_count, last_activity}]}` |
| `/v1/history` | GET | Conversation | `{messages: [{id, role, content, timestamp}], total}` |
| `/v1/chat` | POST | Conversation | SSE stream (text chunks, tool_status, lifecycle) |
| `/v1/cron/jobs` | GET | Activity | `{jobs: [CronJob]}` |
| `/v1/cron/jobs/{id}/pause` | POST | Activity | Pause job |
| `/v1/cron/jobs/{id}/resume` | POST | Activity | Resume job |
| `/v1/cron/jobs/{id}/run` | POST | Activity | Run job now |
| `/v1/memory/files` | GET | Memory | `[{name, modified, size}]` |
| `/v1/memory/file` | GET | Memory | `{content}` |
| `/v1/tools` | GET | More | `{tools: [{name}]}` |
| `/v1/skills` | GET | More | `{skills: [{name, description, enabled}]}` |
| `/v1/model` | GET | Settings | `{active, provider, presets}` |
| `/v1/ws` | WS | Root layout | Real-time push messages |

### WebSocket Events

The mobile app receives these via WebSocket:
- `assistant_message` → triggers local notification
- `clarify_request` → triggers local notification
- `canvas_update` → updates canvas HTML
- `cron_update` → refreshes activity
- `progress_event` → updates tool status

### Session Architecture

- Session keys: `mobile:default`, `telegram:123456`, `cron-{jobID}`
- Messages stored in SQLite with FTS5 search
- Session titles may just be the key — mobile app falls back to "Conversation"

### Pairing

QR codes contain: `ghost://connect?host=...&port=...&secret=...` (LAN) or `ghost://connect?transport=relay&relay=...&ghost=...&token=...` (relay).

### Backend Gaps

| Gap | Status | Mobile Workaround |
|---|---|---|
| `GET /v1/home` (aggregated feed) | **Missing** | Use inbox WS items |
| `GET /v1/memory/entries` (structured) | **Missing** | Read curated-memory.md, user-profile.md |
| `GET /v1/device/status` (clean) | **Missing** | Use health + doctor |
| Auto-generated chat titles | **Missing** | Client fallback: "Conversation" |
| Activity history (beyond cron) | **Missing** | Only cron jobs available |

---

## 18. What Was Removed

| Removed | Why |
|---|---|
| ConnectionPill on every screen | Makes Ghost feel like device management |
| "Ghost is thinking..." | Chatbot pattern — Ghost is not a chatbot |
| G-in-circle avatar | Generic AI assistant look |
| Excessive rounded cards | Cards for every list item creates visual sameness |
| Developer jargon | Session IDs, cron expressions, tool names |
| Raw cron expressions | "EVERY 86400 SECONDS" → "Daily" |
| Technical connection fields | Host/port/secret in normal settings |
| Terminal aesthetic | Green borders, glowing indicators |
| Dashboard metrics | CPU, memory, disk on home screen |
| "No activity yet." / "No conversations yet." | Replaced with Ghost voice |

---

## Summary

The Ghost mobile app is a **quiet, warm, premium personal AI interface**. It avoids every trope of developer tools and chatbot UIs in favor of something that feels like a well-designed personal journal — calm paper tones, generous spacing, editorial typography, and zero visual noise.

Every design decision serves one goal: **make Ghost feel like a person, not a product.**
