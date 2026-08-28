# 👻 Ghost Mobile

The daily-driver companion app for your self-hosted Ghost — a personal AI that lives on your own hardware. Pair your phone with your Ghost Pod over a secure QR flow, chat with streaming responses, browse memory and history, manage automations, and receive proactive notifications.

---

## Architecture

```text
┌──────────────────────┐   HTTPS + WebSocket   ┌───────────────┐   tunnel    ┌─────────────────────┐
│     Ghost Mobile     │ ◄───────────────────► │  Relay server │ ◄─────────► │ Ghost Pod (gateway) │
│   React Native/Expo  │  client token auth    │    (cloud)    │  localhost  │   127.0.0.1:8766    │
└──────────────────────┘                       └───────────────┘             └─────────────────────┘
```

- The Ghost Pod gateway binds to **localhost only**. The phone reaches it through the **relay server**, which tunnels traffic over an outbound WebSocket from the Pod.
- Relay connections authenticate with `X-Ghost-Client-Id` + `X-Ghost-Client-Token` headers.
- Paired devices additionally authenticate to the gateway with `X-Ghost-Device-ID` + `X-Ghost-Credential` headers.
- There is no shared secret. Each device gets its own credential at pairing time; tokens are never placed in URLs.

---

## Project Layout

```text
ghost-app/
├── app/
│   ├── _layout.tsx           # Root stack, deep links, WS notifications
│   ├── (tabs)/
│   │   ├── index.tsx         # 👻 Home — inbox + presence
│   │   ├── chats.tsx         # 💬 Chats — session list
│   │   ├── activity.tsx      # 🕒 Activity — cron timeline
│   │   ├── memory.tsx        # 🧠 Memory — profile + curated memory
│   │   └── more.tsx          # ⚙️ More — settings hub
│   ├── conversation.tsx      # Streaming chat (SSE)
│   ├── onboarding.tsx        # First-launch flow
│   ├── connect.tsx           # Scan QR / enter manually
│   ├── scan.tsx              # QR scanner
│   ├── confirm.tsx           # Pairing progress
│   ├── manual.tsx            # Manual pairing entry
│   ├── pairing-success.tsx   # Connected state
│   ├── auth-failure.tsx      # Credential rejected
│   ├── revoked.tsx           # Device disconnected
│   ├── connection.tsx        # Connection settings
│   ├── ghost-pod.tsx         # Device management
│   ├── advanced.tsx          # Diagnostics
│   ├── permissions.tsx
│   └── about.tsx
├── lib/
│   ├── ghostApi.ts           # API client (REST + SSE + WS)
│   ├── connection.ts         # Connection state machine
│   ├── credentials.ts        # SecureStore/AsyncStorage credential layer
│   ├── pairing.ts            # Pairing URI parser
│   ├── store.ts              # Zustand state
│   └── format.ts             # Formatting helpers
├── components/
├── constants/theme.ts        # Design tokens
└── docs/
```

---

## Tech Stack

- React Native + Expo (expo-router)
- TypeScript
- Zustand
- Server-Sent Events (SSE) for streaming chat
- WebSockets for proactive push
- expo-secure-store for credential storage

---

# Getting Started

## Prerequisites

- Node.js 18+
- Bun
- A running Ghost Pod with the web console reachable on your network
- (For remote access) `ghost relay run` connected to your relay server

## Install

```bash
bun install
bunx expo start
```

---

## Pairing Your Phone

1. On the Ghost Pod web console, open **Devices → Connect another device**
2. A QR code appears (`ghost://pair?v=1&pod=…&transport=…&host=…&port=…&token=…`), valid for 5 minutes, single-use
3. In the app: **Pair your Ghost → Scan your Ghost**, or enter the token manually
4. The app redeems the token against `POST /v1/pairing/complete` and receives a `device_id` + `credential`
5. The credential is stored in SecureStore and used for all future requests

Remote pairing uses a relay deep link from `ghost relay pair`:

```text
ghost://connect?transport=relay&relay=<server>&ghost=<ghostId>&token=<clientToken>
```

Opening this URI adopts the relay connection through the app's credential system.

---

# Features

## 👻 Home

| Feature | Description |
|---------|-------------|
| Inbox | Proactive Ghost messages grouped by day |
| Presence | Live connection status and gateway uptime |
| Ask Ghost | Jump straight into a conversation |

## 💬 Chats

| Feature | Description |
|---------|-------------|
| Streaming AI | Token-by-token responses using SSE |
| Live tool progress | Shows "Searching… / Running…" while Ghost works |
| Voice input | Record and transcribe audio |
| Image and file attachments | Send media with messages |
| Markdown rendering | Code blocks, headings, links, formatting |
| Search history | Full-text search across sessions |
| Cancel generation | Stop a long response mid-stream |
| Offline queue | Messages are queued and delivered when back online |

## 🕒 Activity

- Scheduled jobs on a TODAY / UPCOMING / PAUSED timeline
- Humanized schedules and run status

## 🧠 Memory

- Read Ghost's memory files (user profile, curated memory)

## ⚙️ More

- Connection status, reconnect, pair another Ghost
- Ghost Pod device management: list paired devices, see who's connected now, disconnect devices
- Advanced diagnostics and credential reset

---

# Authentication

| Mechanism | Headers | Used by |
|-----------|---------|---------|
| Relay client token | `X-Ghost-Client-Id` + `X-Ghost-Client-Token` | App ↔ relay server |
| Device credential | `X-Ghost-Device-ID` + `X-Ghost-Credential` | App ↔ Ghost gateway (paired devices) |

Message endpoints also send `X-Ghost-Session`. Pairing redemption (`POST /v1/pairing/complete`) is a public endpoint — the short-lived pairing token is the authorization.

### Structured errors

Pairing and auth errors return `{ "error": { "code", "message" } }`:

- `pairing_invalid`, `pairing_expired`, `pairing_consumed`, `pairing_rejected` — pairing problems
- `device_revoked` — routes the app to the revoked screen
- 401/403 on any authenticated request — routes the app to the auth-failure screen and clears credentials

---

# API Reference

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/v1/health` | Connection test (`uptime_s` included) |
| POST | `/v1/pairing/invitations` | Create pairing invitation (Pod side) |
| POST | `/v1/pairing/complete` | Redeem pairing token (public) |
| GET | `/v1/pairing/devices` | List paired devices |
| POST | `/v1/pairing/revoke` | Disconnect a device |
| POST | `/v1/pairing/cancel` | Cancel a pending invitation |
| POST | `/v1/chat` | Streaming AI chat (SSE) |
| GET | `/v1/history` | Conversation history |
| GET | `/v1/search` | Search messages |
| GET | `/v1/sessions` | Session list |
| POST | `/v1/upload` | Upload files |
| POST | `/v1/transcribe` | Audio transcription |
| GET | `/v1/memory/files` / `/v1/memory/file` | Memory files |
| GET | `/v1/workspace/files` / `/v1/workspace/file` | Workspace files |
| GET/POST/PATCH/DELETE | `/v1/cron/jobs` | Scheduled jobs |
| GET | `/v1/skills` | List installed skills |
| GET | `/v1/skills/read` | Read a skill's files |
| POST | `/v1/skills/toggle` | Enable/disable a skill |
| POST | `/v1/skills/install` | Install a skill from GitHub |
| POST | `/v1/steering` | Mid-turn steering |
| POST | `/v1/clarify/respond` | Answer a clarify request |
| GET/POST | `/v1/model` | Model presets and switching |
| WS | `/v1/ws` | Proactive push (`assistant_message`, `clarify_request`, `cron_update`, `progress_event`) |

---

# Security

- Credentials live only in platform secure storage (iOS Keychain / Android Keystore via expo-secure-store)
- No shared secret exists — each device authenticates individually and can be disconnected independently from the Pod
- Credentials are never placed in URLs, including WebSocket connections
- The gateway is never exposed to the internet; remote access goes through the relay with per-client tokens

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
