# 👻 Ghost Mobile

A React Native Expo app + Go HTTP bridge that gives your Ghost Pi a fully native mobile interface. Streaming AI chat, real Whisper voice transcription, image/file attachments, Pi remote control, push notifications, history browser, and episodic memory viewer — all over your local Wi-Fi.

---

## Architecture

```
┌──────────────────────────────┐         HTTP / WebSocket
│      Ghost Mobile            │ ◄──────────────────────────► Raspberry Pi
│      React Native (Expo)     │         Local Wi-Fi           internal-api :8765 (Chat)
│                              │                               ghost-bridge :8766 (Remote)
│  👻 Chat    — streaming AI   │                               ghost (original)
│  🖥️ Remote  — Pi control     │                               ghost.db (SQLite)
│  📜 Log     — history        │                               workspace/memory/
│  🧠 Mem     — memory files   │
│  ⚙️ Config  — connection     │
└──────────────────────────────┘

`ghost-bridge` is now a lightweight remote control server. The Ghost agent itself (`internal-api`) handles all chat and memory operations directly.

---

## Project Layout

```

ghost-app/
└── app/ ← React Native Expo app
├── app/
│ ├── \_layout.tsx Root layout, init, notifications
│ └── (tabs)/
│ ├── \_layout.tsx Tab bar (5 tabs)
│ ├── index.tsx 👻 Chat — streaming, voice, attachments
│ ├── remote.tsx 🖥️ Remote — browser, apps, shell, screenshot
│ ├── history.tsx 📜 Log — searchable conversation history
│ ├── memory.tsx 🧠 Mem — episodic memory file browser
│ └── settings.tsx ⚙️ Config — Pi connection, notifications
├── lib/
│ ├── ghostApi.ts Full API client (all endpoints)
│ └── store.ts Zustand global state
├── babel.config.js
├── tsconfig.json
├── metro.config.js
└── package.json

````

---

## Part 1 — Mobile App Setup

### Prerequisites

- Node.js 18+
- Install Expo CLI: `bun add -g expo-cli`
- **Expo Go** app on your phone (iOS / Android) for development
- Or: Xcode (iOS) / Android Studio (Android) for a standalone build

### Install and run

```bash
cd app
bun install
bunx expo start
````

Scan the QR code with Expo Go. Make sure your phone is on the **same Wi-Fi network** as the Pi.

### First-time config

1. Tap **⚙️ CFG** tab
2. Enter Pi's local IP (e.g. `192.168.1.42`)
3. Port: `8765` (Internal API)
4. Remote Port: `8766` (Remote Bridge)
5. Secret: your `BRIDGE_SECRET` value
6. Tap **TEST** — should show `✓ Connected`
7. Tap **SAVE & CONNECT**

---

## Feature Reference

### 👻 Chat

| Feature             | How it works                                                                         |
| ------------------- | ------------------------------------------------------------------------------------ |
| Streaming responses | SSE from Ghost Internal API `/v1/chat` → Ghost runtime → Kimi API, token-by-token    |
| Voice input 🎤      | Records m4a via `expo-av` → uploads to `/v1/transcribe` → Whisper (Moonshot API)     |
| Image attachment 🖼 | `expo-image-picker` → base64 → sent with message, displayed inline                   |
| File attachment 📄  | `expo-document-picker` → multipart upload to `/v1/upload` → base64 forwarded to Kimi |
| Markdown rendering  | `react-native-markdown-display` — code blocks, bold, links, headings                 |
| Proactive messages  | WebSocket `/v1/ws` — Ghost push messages appear as new bubbles + local notification  |
| Connection badge    | Live ONLINE/OFFLINE indicator in header                                              |

### 🖥️ Remote

| Feature        | How it works                                                                        |
| -------------- | ----------------------------------------------------------------------------------- |
| System stats   | `/v1/stats` — hostname, IP, uptime, CPU temp, RAM, disk, load, Ghost service status |
| Open URL       | `/v1/open` → `xdg-open <url>` on Pi desktop (DISPLAY=:0)                            |
| Launch app     | `/v1/open` with known app names: firefox, chromium, terminal, files, spotify, vlc   |
| Screenshot     | `/v1/screenshot` → `scrot` capture → base64 PNG → displayed inline                  |
| Shell exec     | `/v1/exec` — runs allowlisted commands with stdout/stderr/exit-code output          |
| Quick commands | One-tap: Ghost status, disk, memory, processes, network, uptime                     |

### 📜 Log

- Paginated SQLite history (load more on scroll)
- Full-text search via `/v1/search` endpoint (server-side SQLite LIKE query)
- Tap any message to expand full content
- Role badges (YOU / GHOST) with timestamps

### 🧠 Mem

- Lists all `.md` files from `workspace/memory/`
- Shows name, last-modified date, file size
- Tap to read full file content inline

### ⚙️ Config

- Pi host / port / secret — saved to AsyncStorage
- Connection test with live feedback
- Push notification toggle (local notifications via WebSocket push)
- In-app Pi setup instructions

---

## API Reference

All endpoints require header `X-Ghost-Secret: <your_secret>` (unless `BRIDGE_SECRET` is empty).

| Method | Endpoint                             | Description                                                       |
| ------ | ------------------------------------ | ----------------------------------------------------------------- |
| GET    | `:8765/v1/health`                    | Internal API connection test                                      |
| GET    | `:8765/v1/history?limit=50&offset=0` | Paginated messages from SQLite                                    |
| GET    | `:8765/v1/search?q=text&limit=20`    | Full-text search in messages                                      |
| POST   | `:8765/v1/chat`                      | `{content, session_key, ...}` → SSE stream                        |
| POST   | `:8765/v1/upload`                    | Multipart `file` field → `{b64, mime_type, filename}`             |
| POST   | `:8765/v1/transcribe`                | Multipart `audio` field → `{text}` via Whisper                    |
| GET    | `:8765/v1/memory/files`              | List episodic memory `.md` files                                  |
| GET    | `:8765/v1/memory/file?name=x.md`     | Read a memory file                                                |
| DELETE | `:8765/v1/message?id=123`            | Delete a message from SQLite                                      |
| WS     | `:8765/v1/ws`                        | WebSocket — Ghost push messages to phone                          |
| GET    | `:8766/v1/health`                    | Remote Bridge connection test                                     |
| GET    | `:8766/v1/stats`                     | System stats (CPU temp, RAM, disk, etc.)                          |
| POST   | `:8766/v1/exec`                      | `{command, timeout}` → `{stdout, stderr, exit_code, duration_ms}` |
| POST   | `:8766/v1/open`                      | `{target}` → open URL or app on Pi desktop                        |
| GET    | `:8766/v1/screenshot`                | Capture Pi screen → `{image (base64), mime_type}`                 |

### Default-allowed shell commands (no config needed)

`xdg-open`, `systemctl status`, `df`, `free`, `uptime`, `hostname`, `date`, `ls`, `cat /proc/`, `journalctl -u ghost`, `ping -c`

Add more via `ALLOWED_CMDS=python3,ollama,curl` in `.env`.

---

## Security Notes

- `ghost-bridge` binds to `0.0.0.0` — it's designed for local network use only
- Always set a strong `BRIDGE_SECRET` — it's your only auth layer over HTTP
- Never port-forward 8765/8766 to the public internet without TLS
- **For remote access away from home:** use [Tailscale](https://tailscale.com) (free, zero-config WireGuard) — just install on both Pi and phone, then use the Tailscale IP instead of your LAN IP

---

## Building a Standalone App (no Expo Go)

```bash
# iOS (requires Mac + Xcode)
bunx expo run:ios

# Android
bunx expo run:android

# Or build with EAS (cloud build):
bun add -g eas-cli
eas build --platform android --profile preview
```
