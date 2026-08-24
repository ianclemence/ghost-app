# Ghost Mobile — Backend Gaps

## P0 — Required for Redesign

### 1. Home Feed Endpoint

**Endpoint:** `GET /v1/home`
**Purpose:** Aggregate proactive items for the Home screen
**Request:** None (uses session context)
**Response:**
```json
{
  "greeting": "Good morning",
  "items": [
    {
      "id": "string",
      "kind": "briefing | reminder | noticed | activity",
      "title": "Morning briefing",
      "preview": "Three things worth knowing today...",
      "timestamp": "2026-08-22T09:00:00Z",
      "session_id": "optional"
    }
  ]
}
```
**Why existing APIs are insufficient:** Currently requires combining inbox, cron deliveries, and chat history. No single endpoint provides a curated home feed.
**Required for v1:** Yes

### 2. Memory Entries Endpoint

**Endpoint:** `GET /v1/memory/entries`
**Purpose:** List personal context entries grouped by kind
**Request:** `?kind=identity|fact|preference|relationship|goal|decision|routine`
**Response:**
```json
{
  "entries": [
    {
      "id": "string",
      "kind": "relationship",
      "subject": "Maria",
      "predicate": "is a parts supplier contact",
      "value": "...",
      "confidence": 0.9,
      "created_at": "2026-08-20T10:00:00Z"
    }
  ],
  "counts": {
    "identity": 2,
    "fact": 15,
    "preference": 8,
    "relationship": 5,
    "goal": 3,
    "decision": 4,
    "routine": 2
  }
}
```
**Why existing APIs are insufficient:** Personal context is only accessible via `context_get` tool during conversations. No HTTP endpoint exists to list all entries.
**Required for v1:** Yes (for Memory screen)

### 3. Device Status Endpoint

**Endpoint:** `GET /v1/device/status`
**Purpose:** Clean device status for Ghost Pod screen
**Request:** None
**Response:**
```json
{
  "status": "online",
  "name": "Ghost Pod",
  "ghost_version": "0.12.0",
  "storage_total_gb": 128,
  "storage_used_gb": 34,
  "last_active": "2026-08-22T10:30:00Z",
  "uptime_seconds": 276400
}
```
**Why existing APIs are insufficient:** Current `/v1/stats` returns Raspberry Pi diagnostics (CPU temp, load, hostname). `/v1/doctor` returns uptime and version but mixed with technical checks. No single clean device status object.
**Required for v1:** Yes (for Ghost Pod screen)

---

## P1 — Useful But Can Wait

### 4. Auto-Generated Conversation Titles

**Endpoint:** `POST /v1/session/rename` (already exists)
**Purpose:** Server generates title from conversation content
**Request:** Session ID
**Response:** `{ "title": "string" }`
**Implementation:** After first few messages, LLM generates a short title. Falls back to first user message snippet.
**Can wait:** Yes — manual naming works for v1

### 5. Activity Log

**Endpoint:** `GET /v1/activity`
**Purpose:** Log of completed agent actions across sessions
**Request:** `?limit=20&offset=0`
**Response:**
```json
{
  "activities": [
    {
      "id": "string",
      "kind": "research | reminder | scheduled | noticed",
      "title": "Researched motorcycle suppliers",
      "summary": "Found 3 options in Bangkok...",
      "timestamp": "2026-08-22T14:30:00Z",
      "session_id": "string"
    }
  ]
}
```
**Can wait:** Yes — cron jobs + inbox provide partial activity data for v1

---

## P2 — Future

### 6. Capability Grouping Metadata
### 7. Memory Entry CRUD (edit/delete)
### 8. Proactive Notification Preferences
### 9. Device Remote Management
