# 👻 Ghost Mobile

A React Native Expo app + Go HTTP bridge that gives your Ghost Pi a fully native mobile interface. Streaming AI chat, real Whisper voice transcription, image/file attachments, Pi remote control, push notifications, history browser, and episodic memory viewer — all over your local Wi-Fi.

---

## Architecture

```
┌──────────────────────────────┐         HTTP / WebSocket
│      Ghost Mobile            │ ◄──────────────────────────► Raspberry Pi
│      React Native (Expo)     │         Local Wi-Fi           ghost-bridge :8765
│                              │                               ghost (original)
│  👻 Chat    — streaming AI   │                               ghost.db (SQLite)
│  🖥️ Remote  — Pi control     │                               workspace/memory/
│  📜 Log     — history        │
│  🧠 Mem     — memory files   │
│  ⚙️ Config  — connection     │
└──────────────────────────────┘
```

`ghost-bridge` is a lightweight Go HTTP server that runs alongside your existing Ghost process. It never interferes with Ghost's core logic — it reads the same SQLite database and proxies to the same Kimi API.

---

## Project Layout

```
ghost-app/
├── bridge/                    ← Runs on your Raspberry Pi
│   ├── main.go                  HTTP + WebSocket server
│   ├── go.mod
│   ├── Makefile                 Build / cross-compile / deploy
│   └── ghost-bridge.service     systemd unit file
│
└── app/                       ← React Native Expo app
    ├── app/
    │   ├── _layout.tsx          Root layout, init, notifications
    │   └── (tabs)/
    │       ├── _layout.tsx      Tab bar (5 tabs)
    │       ├── index.tsx        👻 Chat — streaming, voice, attachments
    │       ├── remote.tsx       🖥️ Remote — browser, apps, shell, screenshot
    │       ├── history.tsx      📜 Log — searchable conversation history
    │       ├── memory.tsx       🧠 Mem — episodic memory file browser
    │       └── settings.tsx     ⚙️ Config — Pi connection, notifications
    ├── lib/
    │   ├── ghostApi.ts          Full API client (all endpoints)
    │   └── store.ts             Zustand global state
    ├── babel.config.js
    ├── tsconfig.json
    ├── metro.config.js
    └── package.json
```

---

## Part 1 — Pi Setup (ghost-bridge)

### 1. Copy bridge to your Pi

```bash
# From your dev machine:
scp -r bridge/ pi@192.168.1.42:~/ghost-bridge/
```

Or use the Makefile to cross-compile and deploy in one step:

```bash
cd bridge
make deploy PI_HOST=pi@192.168.1.42
```

### 2. Add to Ghost's .env

```env
# ── ghost-bridge settings (add to existing Ghost .env) ──────────────────

BRIDGE_PORT=8765
BRIDGE_SECRET=pick_a_strong_secret_here

# Absolute paths (adjust username if not 'pi')
GHOST_DB_PATH=/home/pi/ghost/ghost.db
MEMORY_DIR=/home/pi/ghost/workspace/memory

# Optional: system prompt prepended to every request
GHOST_SYSTEM_PROMPT=You are Ghost, a sovereign AI on a Raspberry Pi. Be concise.

# Optional: comma-separated command prefixes to allow beyond the safe defaults
# ALLOWED_CMDS=python3,ollama,curl

# Optional: override screenshot command
# SCREENSHOT_CMD=scrot /tmp/ghost-bridge-screen.png
```

### 3. Build and run manually (first test)

```bash
cd ~/ghost-bridge
go mod tidy
go build -o ghost-bridge .
./ghost-bridge
# 👻 Ghost Bridge running on 0.0.0.0:8765
```

### 4. Install as a systemd service

```bash
# Edit the service file if your username isn't 'pi'
nano ghost-bridge.service

sudo cp ghost-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ghost-bridge
sudo systemctl start ghost-bridge

# Check it's running
sudo journalctl -u ghost-bridge -f
```

### 5. Firewall (local network only)

```bash
# Allow only your home network range
sudo ufw allow from 192.168.0.0/16 to any port 8765
sudo ufw reload
```

### 6. Install scrot for screenshots (optional)

```bash
sudo apt install scrot
```

---

## Part 2 — Mobile App Setup

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
```

Scan the QR code with Expo Go. Make sure your phone is on the **same Wi-Fi network** as the Pi.

### First-time config

1. Tap **⚙️ CFG** tab
2. Enter Pi's local IP (e.g. `192.168.1.42`)
3. Port: `8765`
4. Secret: your `BRIDGE_SECRET` value
5. Tap **TEST** — should show `✓ Connected`
6. Tap **SAVE & CONNECT**

---

## Feature Reference

### 👻 Chat

| Feature             | How it works                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Streaming responses | SSE from ghost-bridge → Kimi API, token-by-token                                                              |
| Voice input 🎤      | Records m4a via `expo-av` → uploads to `/transcribe` → Whisper (Moonshot API) → inserts transcript into input |
| Image attachment 🖼 | `expo-image-picker` → base64 → sent with message, displayed inline                                            |
| File attachment 📄  | `expo-document-picker` → multipart upload to `/upload` → base64 forwarded to Kimi                             |
| Markdown rendering  | `react-native-markdown-display` — code blocks, bold, links, headings                                          |
| Proactive messages  | WebSocket `/ws` — Ghost push messages appear as new bubbles + local notification                              |
| Connection badge    | Live ONLINE/OFFLINE indicator in header                                                                       |

### 🖥️ Remote

| Feature        | How it works                                                                     |
| -------------- | -------------------------------------------------------------------------------- |
| System stats   | `/stats` — hostname, IP, uptime, CPU temp, RAM, disk, load, Ghost service status |
| Open URL       | `/open` → `xdg-open <url>` on Pi desktop (DISPLAY=:0)                            |
| Launch app     | `/open` with known app names: firefox, chromium, terminal, files, spotify, vlc   |
| Screenshot     | `/screenshot` → `scrot` capture → base64 PNG → displayed inline                  |
| Shell exec     | `/exec` — runs allowlisted commands with stdout/stderr/exit-code output          |
| Quick commands | One-tap: Ghost status, disk, memory, processes, network, uptime                  |

### 📜 Log

- Paginated SQLite history (load more on scroll)
- Full-text search via `/search` endpoint (server-side SQLite LIKE query)
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

## Bridge API Reference

All endpoints require header `X-Ghost-Secret: <your_secret>` (unless `BRIDGE_SECRET` is empty).

| Method | Endpoint                     | Description                                                       |
| ------ | ---------------------------- | ----------------------------------------------------------------- |
| GET    | `/health`                    | Connection test → `{status, timestamp, version}`                  |
| GET    | `/history?limit=50&offset=0` | Paginated messages from SQLite                                    |
| GET    | `/search?q=text&limit=20`    | Full-text search in messages                                      |
| POST   | `/send`                      | `{content, media_b64?, media_type?}` → SSE stream                 |
| POST   | `/upload`                    | Multipart `file` field → `{b64, mime_type, filename}`             |
| POST   | `/transcribe`                | Multipart `audio` field → `{text}` via Whisper                    |
| GET    | `/stats`                     | System stats (CPU temp, RAM, disk, etc.)                          |
| POST   | `/exec`                      | `{command, timeout}` → `{stdout, stderr, exit_code, duration_ms}` |
| POST   | `/open`                      | `{target}` → open URL or app on Pi desktop                        |
| GET    | `/screenshot`                | Capture Pi screen → `{image (base64), mime_type}`                 |
| GET    | `/memory/files`              | List episodic memory `.md` files                                  |
| GET    | `/memory/file?name=x.md`     | Read a memory file                                                |
| DELETE | `/message?id=123`            | Delete a message from SQLite                                      |
| WS     | `/ws`                        | WebSocket — Ghost push messages to phone                          |

### Default-allowed shell commands (no config needed)

`xdg-open`, `systemctl status`, `df`, `free`, `uptime`, `hostname`, `date`, `ls`, `cat /proc/`, `journalctl -u ghost`, `ping -c`

Add more via `ALLOWED_CMDS=python3,ollama,curl` in `.env`.

---

## Security Notes

- `ghost-bridge` binds to `0.0.0.0` — it's designed for local network use only
- Always set a strong `BRIDGE_SECRET` — it's your only auth layer over HTTP
- Never port-forward 8765 to the public internet without TLS
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

---

## Updating ghost-bridge After Code Changes

```bash
# On your dev machine:
cd bridge
make deploy PI_HOST=pi@192.168.1.42

# Or manually on the Pi:
go build -o ghost-bridge . && sudo systemctl restart ghost-bridge
```
