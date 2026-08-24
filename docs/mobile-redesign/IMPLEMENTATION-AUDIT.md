# Ghost Mobile App — Implementation Audit

## A. Current Screen Inventory

### 1. Chat Screen (`app/(tabs)/index.tsx` — 3,644 lines)

**Purpose:** Primary AI conversation interface
**Sections:** Session switcher, message list, search panel, input area, modals (action, session, model, inbox, canvas, clarify, approval)
**Components:** FlatList (inverted), Markdown renderer, SkeletonLoader, voice recorder, image/file pickers, slash command autocomplete, ConnectionPill, ErrorCard
**Data source:** `fetchHistory()`, `fetchSessions()`, `fetchAvailableTools()`, `fetchModelInfo()`, `searchMessages()`, `sendMessage()` (SSE streaming)
**API calls:** GET /v1/history, GET /v1/sessions, GET /v1/tools, GET /v1/model, POST /v1/chat, POST /v1/steering, POST /v1/clarify/respond, POST /v1/transcribe, DELETE /v1/message, DELETE /v1/session, POST /v1/session/rename
**Navigation entry:** Tab 1 ("Ghost"), deep links
**Reusable components:** ConnectionPill, GhostButton, ErrorCard

**Technical/developer UI currently exposed:**
- Terminal icon (`Terminal` from lucide)
- "THINKING..." status text
- Tool activity strip ("Searching...", "Running...")
- Slash commands (`/doctor`, `/tools`, `/skills`, `/help`)
- Session keys in session switcher
- Model provider:model format
- Canvas sheet (WebView HTML output)
- Green border indicators
- Giant "GHOST HAS A QUESTION" text
- "RESPONSE SANITIZED" indicators
- Lifecycle traces

**What should be retained:**
- Core chat functionality (send, receive, stream)
- Message history
- Session management (but not exposed as technical concept)
- Voice recording
- Image/file attachments
- Search within conversation
- Clarify/approval cards (but redesigned)
- Error handling

**What should be removed:**
- Terminal aesthetic elements
- Developer-facing status indicators
- Slash command autocomplete (move to advanced)
- Raw session keys
- Model picker in main chat
- Canvas sheet (move to advanced)
- Tool activity strip (replace with subtle indicator)

**What should be redesigned:**
- Message bubbles (cleaner typography, better spacing)
- Input area (simpler, less chrome)
- Session switcher → Conversations list
- Header (remove connection pill from chat, add to Home)

---

### 2. Memory Screen (`app/(tabs)/memory.tsx` — 678 lines)

**Purpose:** Workspace file browser
**Sections:** File tree, file preview
**Components:** FlatList, tree view (expandable folders), Markdown renderer, image preview
**Data source:** `fetchWorkspaceFiles()`, `fetchWorkspaceFilePreview()`
**API calls:** GET /v1/workspace/files, GET /v1/workspace/file
**Navigation entry:** Tab 2 ("Memory")

**Technical/developer UI currently exposed:**
- Raw file paths
- Folder/file tree structure
- File sizes and modification timestamps
- "previewable"/"blocked" meta pills
- "truncated" indicator
- Binary file handling

**What should be retained:**
- Ability to browse what Ghost remembers
- File preview for text/images

**What should be removed:**
- Raw file tree structure
- File sizes and timestamps in main view
- Technical meta pills

**What should be redesigned:**
- Complete redesign around "What does Ghost remember about me?" not "How is memory stored?"
- Organize by meaning (People, Projects, Preferences) not by filesystem

---

### 3. Activity/Cron Screen (`app/(tabs)/cron.tsx` — 1,166 lines)

**Purpose:** Scheduled task management
**Sections:** Job cards list, create/edit form modal
**Components:** FlatList, JobCard, TaskFormModal, TaskModal
**Data source:** `fetchCronJobs()`, `createCronJob()`, `updateCronJob()`, `deleteCronJob()`, `pauseCronJob()`, `resumeCronJob()`, `runCronJobNow()`
**API calls:** GET /v1/cron/jobs, POST /v1/cron/jobs, PATCH /v1/cron/jobs, DELETE /v1/cron/jobs/:id, POST /v1/cron/jobs/:id/pause, POST /v1/cron/jobs/:id/resume, POST /v1/cron/jobs/:id/run
**Navigation entry:** Tab 3 ("Activity")

**Technical/developer UI currently exposed:**
- Cron expressions
- Run counts
- "EVERY 86400 SECONDS" style displays
- Shell command fields
- "ADVANCED" toggle
- Raw job state (ACTIVE/PAUSED)
- Error traces

**What should be retained:**
- Core scheduling functionality
- Create/edit/delete/pause/resume
- Human-readable schedule display

**What should be removed:**
- Cron expression input (move to advanced)
- Shell command field (move to advanced)
- Raw run counts
- Technical status badges

**What should be redesigned:**
- Transform "cron jobs" into "things Ghost does for you"
- Group by time (Upcoming, Recently, Scheduled)
- Human-friendly descriptions

---

### 4. Settings Screen (`app/(tabs)/settings.tsx` — 1,365 lines)

**Purpose:** Connection, model, skills, diagnostics, permissions
**Sections:** Connection, model, permissions, skills, advanced diagnostics, help
**Components:** GhostInput, GhostToggle, GhostButton, GhostList, GhostRow, QrPairingScanner, model sheet, skill detail modal, install skill modal
**Data source:** `checkHealth()`, `fetchDoctor()`, `fetchModelInfo()`, `fetchSkills()`, `fetchAvailableTools()`, etc.
**API calls:** Multiple health, doctor, model, skill endpoints
**Navigation entry:** Tab 4 ("Settings")

**Technical/developer UI currently exposed:**
- Host/Port/Secret connection fields
- Raw diagnostic data (latency, uptime, version)
- Doctor check results
- Channel health details
- Session inspector
- Delivery trace
- Skill file contents
- Technical skill configuration

**What should be retained:**
- Connection management (but simplified)
- Model selection (but simplified)
- Permissions
- Skills (but redesigned as "Capabilities")

**What should be removed:**
- Raw connection fields in main view
- Technical diagnostics in main view
- Channel health details
- Session inspector
- Delivery trace
- Skill file contents

**What should be redesigned:**
- Settings → "More" section with Ghost Pod, Capabilities, Settings, About
- Connection → simplified "Connect your Ghost" flow
- Skills → "Capabilities" (human-readable)
- Diagnostics → "Advanced" section

---

## B. Current Design System

### Colors
- **Background:** `#0E0C09` (dark), `#F4EFE6` (light)
- **Surface:** `#17130E` (cards)
- **Surface2:** `#1F1A14` (inputs, secondary)
- **Text primary:** `#EFE9DF`
- **Text secondary:** `#A79C8C`
- **Text tertiary:** `#6E665A`
- **Accent:** `#6FBE8E` (green)
- **Accent soft:** `rgba(111,190,142,0.14)`
- **Warn:** `#D6A05A`
- **Danger:** `#D4685A`
- **Hairline:** `rgba(237,228,212,0.09)`

### Typography
- **Display:** 28/34, weight 700
- **Title:** 20/26, weight 600
- **Subtitle:** 17/22, weight 600
- **Body:** 16/24, weight 400
- **BodyStrong:** 16/24, weight 600
- **Secondary:** 14/21, weight 400
- **Caption:** 13/18, weight 500
- **Micro:** 11/14, weight 700, letterSpacing 0.8

### Spacing
- xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40, section: 56, screen: 72

### Radius
- sm: 8, md: 12, lg: 16, xl: 20, pill: 999, bubble: 18

### Fonts
- sans: system-ui, serif: ui-serif, rounded: ui-rounded, mono: Menlo

---

## C. Current Architecture

### Navigation
- Tab-based with 4 tabs: Ghost (Chat), Memory, Activity, Settings
- Expo Router file-based routing
- Single root Stack wrapping tabs

### State Management
- Zustand single store
- Config, connection, messages, streaming, inbox, UI state

### API Layer
- `ghostApi.ts` — 1,640 lines
- Dual transport: HTTP REST + WebSocket
- LAN mode: direct HTTP to Pi
- Relay mode: HTTP through relay server
- SSE streaming for chat responses
- Secure credential storage (SecureStore)

### Pairing
- QR code deep-link parsing
- `ghost://connect?host=...&port=8766&secret=...`
- QrPairingScanner component (camera-based)

### Persistence
- AsyncStorage for config
- SecureStore for secrets
- Server-side session storage

---

## D. Design Debt

### Technical / Developer-Oriented
- Terminal aesthetic throughout (green borders, monospace text, "THINKING...")
- Raw technical values exposed (IP, port, cron expressions, run counts)
- Developer tools visible in main UI (slash commands, tool activity, canvas)
- Status indicators that look like system monitors

### Visually Noisy
- Green borders on everything (cards, modals, buttons, inputs)
- Badges everywhere (ACTIVE, PAUSED, CONNECTED, OFFLINE)
- Multiple status indicators competing for attention
- Dense information architecture

### Gimmicky
- "GHOST HAS A QUESTION" in giant text
- Glowing green activity indicators
- Terminal-style status text
- Animated thinking indicators

### Dashboard-Like
- Settings screen reads like a server admin panel
- Memory screen reads like a file browser
- Activity screen reads like a cron dashboard
- Connection fields exposed as raw inputs

### Missing Product Feel
- No greeting or personal touch
- No sense of Ghost as an entity
- No quiet moments (everything is always "active")
- No editorial typography
- No generous whitespace
- No warm, human feeling
