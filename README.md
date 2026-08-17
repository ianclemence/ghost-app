# 👻 Ghost Mobile

A React Native (Expo) app that gives your Ghost AI running on a Raspberry Pi a fully native mobile interface. Chat with Ghost using streaming AI responses, real Whisper voice transcription, image and file attachments, browse conversation history and episodic memory, remotely control your Pi, and receive proactive notifications over your local network.

---

## Architecture

```text
┌──────────────────────────────┐         HTTP / WebSocket
│       Ghost Mobile           │ ◄────────────────────────────► Raspberry Pi
│    React Native (Expo)       │           Local Wi-Fi
│                              │
│ 👻 Chat      Streaming AI    │         internal-api :8766
│ 🖥️ Remote    Pi control      │         ghost
│ 📜 History   Conversations   │         ghost.db (SQLite)
│ 🧠 Memory    Episodic memory  │         workspace/memory/
│ ⚙️ Settings  Connection       │
└──────────────────────────────┘
```

`ghost-bridge` is a lightweight remote control server. The Ghost agent (`internal-api`) handles all AI chat, memory, history, and transcription endpoints directly.

---

# Project Layout

```text
ghost-mobile/
├── app/
│   ├── _layout.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx        # 👻 Chat
│   │   ├── remote.tsx       # 🖥️ Remote
│   │   ├── cron.tsx         # 🕒 Tasks
│   │   ├── memory.tsx       # 🧠 Data (workspace)
│   │   └── settings.tsx     # ⚙️ Settings
│   │
│   └── ...
│
├── lib/
│   ├── ghostApi.ts          # API client
│   └── store.ts             # Zustand state
│
├── components/
├── hooks/
├── constants/theme.ts       # Design tokens
├── assets/
├── package.json
├── tsconfig.json
└── eas.json
```

---

# Tech Stack

- React Native
- Expo
- TypeScript
- Zustand
- Server-Sent Events (SSE)
- WebSockets
- SQLite
- Whisper (Moonshot API)
- Kimi API
- Go HTTP Bridge

---

# Getting Started

## Prerequisites

- Node.js 18+
- Bun
- Expo Go (Android/iOS)

For standalone builds:

- Android Studio
- Xcode (macOS)

---

## Install

```bash
cd app
bun install
bunx expo start
```

Scan the QR code using Expo Go.

Your phone and Raspberry Pi must be connected to the same Wi-Fi network.

---

## First-time Configuration

1. Open **⚙️ Settings**
2. Enter your Pi IP address (example: `192.168.1.42`)
3. Port: `8766`
4. Enter your `BRIDGE_SECRET`
5. Tap **Test**
6. When connected, tap **Save & Connect**

---

# Features

## 👻 Chat

| Feature | Description |
|---------|-------------|
| Streaming AI | Token-by-token responses using SSE |
| Live tool progress | Shows "Searching… / Running…" while Ghost works |
| Voice input | Records audio with Expo Audio and transcribes using Whisper |
| Image attachments | Pick images and send directly with messages |
| File attachments | Upload documents to Ghost |
| Markdown rendering | Code blocks, headings, links and formatting |
| Search history | Full-text search across sessions (tap a result to copy) |
| Cancel generation | Stop a long response mid-stream |
| Delete messages | Remove individual messages from the session |
| Offline queue | Messages are queued and delivered when back online |
| Push messages | Receive proactive Ghost messages over WebSocket |
| Live connection status | Online/offline indicator |

---

## 🖥️ Remote

| Feature | Description |
|---------|-------------|
| System stats | CPU, RAM, disk, uptime and Ghost status |
| Open URLs | Opens websites on the Pi desktop |
| Launch apps | Firefox, Chromium, Terminal, VLC, Spotify and more |
| Screenshot | Capture the Pi display |
| Shell commands | Execute allowlisted commands |
| Quick actions | Disk usage, memory, uptime, network, Ghost status |

---

## 🕒 Tasks

- List scheduled jobs (interval, cron expression, or one-time)
- Run now, pause, resume, edit, and delete jobs
- Create reminders and briefings that deliver results back to the app

---

## 🧠 Data

- Browse the Ghost workspace as a file tree or radial map
- Preview text and image files
- Displays modification date and file size

---

## ⚙️ Settings

- Configure Pi address (with `ghost.local` quick-fill) and secure secret
- Store credentials securely (bridge secret in SecureStore)
- Test connection and run diagnostics
- Enable or disable notifications
- Manage skills: list, enable/disable, inspect, and install from GitHub
- Pair over a deep link (`ghost://connect?host=…&port=8766&secret=…`)

---

# API Reference

Every request requires:

```
X-Ghost-Secret: <your_secret>
```

unless authentication is disabled.

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/v1/health` | Connection test |
| GET | `/v1/history` | Conversation history |
| GET | `/v1/search` | Search messages |
| POST | `/v1/chat` | Streaming AI chat |
| POST | `/v1/upload` | Upload files |
| POST | `/v1/transcribe` | Whisper transcription |
| GET | `/v1/memory/files` | List memory files |
| GET | `/v1/memory/file` | Read memory file |
| GET | `/v1/workspace/files` | List workspace files |
| GET | `/v1/workspace/file` | Preview workspace file |
| DELETE | `/v1/message` | Delete message |
| GET | `/v1/cron/jobs` | List scheduled jobs |
| POST | `/v1/cron/jobs` | Create a scheduled job |
| PATCH | `/v1/cron/jobs` | Update a scheduled job |
| DELETE | `/v1/cron/jobs/:id` | Delete a scheduled job |
| POST | `/v1/cron/jobs/:id/pause` `resume` `run` | Control a job |
| GET | `/v1/skills` | List installed skills |
| GET | `/v1/skills/read` | Read a skill's files |
| POST | `/v1/skills/toggle` | Enable/disable a skill |
| POST | `/v1/skills/install` | Install a skill from GitHub |
| GET | `/v1/stats` | System statistics |
| POST | `/v1/exec` | Execute allowlisted shell command |
| POST | `/v1/open` | Open app or URL |
| GET | `/v1/screenshot` | Capture Raspberry Pi display |
| WS | `/v1/ws` | Push notifications |

---

# Allowed Commands

By default Ghost allows:

```
xdg-open
systemctl status
df
free
uptime
hostname
date
ls
cat /proc/
journalctl -u ghost
ping -c
```

Additional commands can be enabled using:

```env
ALLOWED_CMDS=python3,ollama,curl
```

---

# Security

- The bridge listens on `0.0.0.0` and is intended for trusted local networks.
- Always configure a strong `BRIDGE_SECRET`.
- Never expose port `8766` directly to the internet.
- For secure remote access, use **Tailscale** and connect using your Pi's Tailscale IP address.

---

# Standalone Builds

Android

```bash
bunx expo run:android
```

iOS

```bash
bunx expo run:ios
```

Cloud build using EAS

```bash
bun add -g eas-cli

eas build --platform android --profile preview
```
