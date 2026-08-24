# Ghost Mobile — Implementation Map

## Backend Reality Check

### What the backend actually provides:

| Endpoint | Data | Mobile Use |
|---|---|---|
| `GET /v1/health` | `{status, version, uptime_s}` | Ghost Pod status |
| `GET /v1/sessions` | `{sessions: [{id, title, message_count, last_activity}]}` | Chats list |
| `GET /v1/history?session=X&limit=50` | `{messages: [{id, role, content, timestamp}]}` | Conversation |
| `POST /v1/chat` (SSE) | Streaming text chunks + tool_status + lifecycle | Sending messages |
| `GET /v1/cron/jobs` | `{jobs: [CronJob]}` | Activity (scheduled work) |
| `POST /v1/cron/jobs/{id}/pause\|resume\|run` | Job control | Activity actions |
| `GET /v1/memory/files` | `[{name, modified, size}]` | Memory file list |
| `GET /v1/memory/file?name=X` | `{content}` | Read MEMORY.md, curated-memory.md, user-profile.md |
| `GET /v1/tools` | `{tools: [{name}]}` | Capability list |
| `GET /v1/doctor` | Health checks with per-check status | Advanced diagnostics |
| `GET /v1/stats` | CPU, memory, disk, IP, hostname | Advanced diagnostics |
| `GET /v1/model` | Active model + presets | Settings |
| `WS /v1/ws` | Real-time push messages | Notifications, inbox items |

### What does NOT exist (gaps):

| Needed | Status | Workaround |
|---|---|---|
| `GET /v1/home` (aggregated feed) | **MISSING** | Use inbox WS items + cron job names |
| `GET /v1/memory/entries` (structured personal context) | **MISSING** | Read curated-memory.md + user-profile.md via file API |
| `GET /v1/device/status` (clean device info) | **MISSING** | Use `GET /v1/health` for version + `GET /v1/doctor` for checks |
| Auto-generated chat titles | **MISSING** | Use session.title if set, else calm generic title |
| Activity history (beyond cron) | **MISSING** | Only cron jobs available |

---

## What to RETAIN

- Warm light-first color palette
- All API client functions (map 1:1 to real endpoints)
- Zustand store (mostly)
- QR pairing flow (parseConnectURL / buildConnectURL)
- SSE streaming chat
- Markdown rendering
- Platform-native fonts
- ErrorCard component (refine voice)
- QrPairingScanner

## What to REDESIGN

1. **Design tokens** — less green, more restraint, add Ghost mark color
2. **Home** — presence, not inbox dashboard
3. **Chats** — temporal grouping, clean rows, no cards
4. **Conversation** — editorial transcript, not chatbot bubbles
5. **Activity** — Ghost's work timeline, not cron manager
6. **Memory** — human knowledge browser, read real files
7. **More/Settings** — product config, not server admin
8. **Ghost Pod** — physical presence, not diagnostics
9. **Error states** — Ghost's voice
10. **All empty states** — Ghost's voice

## What to REMOVE

- ConnectionPill from every screen (show only when problematic)
- "G in circle" avatar → Ghost mark
- "Ghost is thinking..." → remove entirely
- Excessive rounded cards → rows + dividers + whitespace
- Session IDs / technical metadata in UI
- Raw cron expressions
- Developer jargon

## What to ADD

- Ghost visual mark (refined from existing SVG blob)
- Ghost voice (consistent tone throughout)
- Temporal grouping (Today/Yesterday/Earlier)
- Memory file reading (curated-memory.md, user-profile.md)
- Offline/connection-error states per screen
- Subtle motion (content appearing, state transitions)

---

## Implementation Order

### Phase 1: Foundation
1. Fix tab layout bug (`more` → `settings`)
2. Refine design tokens
3. Create Ghost mark component
4. Establish Ghost voice strings
5. Refactor component library (reduce cards)

### Phase 2: Core Screens
6. Redesign Home
7. Redesign Chats
8. Redesign Conversation
9. Redesign Activity
10. Redesign Memory (with real data)
11. Redesign More/Settings

### Phase 3: Polish
12. Error states
13. Empty states
14. Connection UX
15. TypeScript check
16. Verification
