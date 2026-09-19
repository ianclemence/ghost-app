# 👻 Ghost Mobile

The daily-driver companion app for your self-hosted Ghost — a personal AI that lives on your own hardware. Pair your phone with your Ghost Pod over a secure QR flow, chat with streaming responses, browse memory and history, manage automations, and receive proactive notifications.

---

# Features

## 👻 Home

| Feature | Description |
|---------|-------------|
| Greeting | Owner name from Pod identity, date header |
| Approval nudge | Pending permission requests needing you |
| Plus menu | Entry to every screen |

## 💬 Chats

| Feature | Description |
|---------|-------------|
| Streaming AI | Token-by-token responses (Pod SSE, or on-device Mini when offline) |
| Routing label | Every answer says where it ran: phone vs home Pod |
| Live tool progress | Shows "Searching… / Running…" while Ghost works |
| Voice input | Record and transcribe via the Pod (`POST /v1/voice/turn`); disabled offline with an honest label |
| Markdown rendering | Code blocks, headings, links, formatting |
| Conversation history | Latest 50 messages, reconciled against the server after every turn; on-device thread cache when there is no Pod |
| Cancel generation | Stop a long response mid-stream |
| Offline outbox | Messages typed while unreachable are queued on-device (persisted FIFO, network/timeout failures only) and sent in order when connectivity returns |

Media attachments are not wired in the chat UI. The send path supports them;
the Composer exposes no attach buttons on the conversation screen.

## 🔀 Plus menu

- Conversation — jump straight into a chat
- **Things Ghost does** — everything Ghost runs for you, in one list
- Intelligence — which AI Ghost runs on
- Ghost Local — on-device Mini model, storage, privacy
- Connected Apps — status of connected services
- Goals — standing intents Ghost keeps working on
- Ghost Pod — device health, attention items, offline-phone metrics
- About — what Ghost is and how it works

### Things Ghost does

One destination for anything Ghost does on its own: recurring briefs,
reminders, and scheduled actions. You never file your intent as a “routine”
or an “automation” — say what you want in a chat, and Ghost infers the shape
and shows it here. The Pod merges both backing models at `/v1/things`; the
app renders one list with one vocabulary. Pause, resume, or stop anything
from the same screen.

## 📴 Offline (travel cache)

With Ghost Mini downloaded, the phone answers and collects offline: chat plus
`remember ...` notes, queued for sync. Routines, home control, and full memory
stay on the Pod. The phone never executes actions offline — it answers,
collects, and syncs.

---

## Tech Stack

- React Native + Expo (expo-router)
- TypeScript
- Zustand
- Server-Sent Events (SSE) for streaming chat
- WebSockets for proactive push
- expo-secure-store for credential storage

---

# 🚀 Getting Started

## Prerequisites

- [Bun](https://bun.sh/) (Preferred) or [Node.js](https://nodejs.org/) (v20+ or v22+ recommended)
- [Expo CLI](https://docs.expo.dev/)
- [Android Studio](https://developer.android.com/studio) _(for Android emulator)_
- [Xcode](https://developer.apple.com/xcode/) _(for iOS simulator, macOS only)_
- A running Ghost Pod with the web console reachable on your network
- (For remote access) `ghost relay run` connected to your relay server

## Local Development

1. **Clone the repository:**
    ```bash
    git clone https://github.com/ianclemence/ghost-app.git
    cd ghost-app
    ```

2. **Install dependencies:**
    ```bash
    bun install
    # or
    npm install
    ```

3. **Start the development server:**
    ```bash
    bunx expo start
    # or
    npx expo start
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

## Architecture

```text
┌──────────────────────┐   HTTPS + WebSocket   ┌───────────────┐   tunnel    ┌─────────────────────┐
│     Ghost Mobile     │ ◄───────────────────► │  Relay server │ ◄─────────► │ Ghost Pod (gateway) │
│   React Native/Expo  │  client token auth    │    (cloud)    │  localhost  │   0.0.0.0:8766      │
└──────────────────────┘                       └───────────────┘             └─────────────────────┘
        │ direct LAN (same Wi-Fi / Tailscale)                              ▲
        └──────────────────────────────────────────────────────────────────┘
```

- The gateway listens on the LAN (`0.0.0.0:8766`). Same-network and Tailscale
  connections reach it directly with device credentials; the **relay server**
  (outbound WebSocket tunnel from the Pod) is for off-network access, and is
  the app's default transport.
- Relay connections authenticate with `X-Ghost-Client-Id` + `X-Ghost-Client-Token` headers.
- Paired devices authenticate to the gateway with `X-Ghost-Device-ID` + `X-Ghost-Credential` headers (loopback callers need none).
- There is no shared secret. Each device gets its own credential at pairing time; device credentials and client tokens are never placed in URLs (the short-lived **pairing token** is — it lives in the QR code by design).

---

## Project Layout

```text
ghost-app/
├── app/
│   ├── _layout.tsx           # Root stack, deep links, WS notifications
│   ├── (tabs)/
│   │   └── index.tsx         # 👻 Home — greeting + approval nudge + Plus menu
│   │   │   # (no chats list: one thread, see conversation.tsx below)
│   ├── conversation.tsx      # Chat (Pod SSE or on-device Mini via runLocalTurn)
│   ├── intelligence.tsx      # Intelligence — default model + AI health (Plus menu)
│   ├── local-models.tsx      # Ghost Local — Mini download, storage, privacy (Plus menu)
│   ├── goals.tsx             # Goals CRUD (Plus menu)
│   ├── things.tsx            # Things Ghost does — unified routines + automations
│   ├── connections.tsx       # Connected Apps — service status (Plus menu)
│   ├── device.tsx            # Ghost Pod — health, diagnostics, offline-phone metrics
│   ├── about.tsx             # About Ghost (Plus menu)
│   ├── onboarding.tsx        # First-launch flow
│   ├── connect.tsx           # Scan QR / enter manually
│   ├── scan.tsx              # QR scanner
│   ├── confirm.tsx           # Pairing progress
│   ├── manual.tsx            # Manual pairing entry (LAN only)
│   ├── pairing-success.tsx   # Connected state
│   ├── auth-failure.tsx      # Credential rejected
│   ├── revoked.tsx           # Device disconnected
├── lib/
│   ├── ghostApi.ts           # API client (REST + SSE + WS)
│   ├── localTurn.ts          # Execution-planned send (phone/Pod/cloud)
│   ├── local/                # Travel cache: pipeline, planner, Mini catalog,
│   │                         # modelManager, memsync, metrics, threadCache
│   ├── connection.ts         # Connection state machine
│   ├── credentials.ts        # SecureStore/AsyncStorage credential layer
│   ├── pairing.ts            # Pairing URI parser (ghost://pair + legacy connect)
│   ├── outbox.ts             # Offline message queue (FIFO, persisted)
│   ├── store.ts              # Zustand state
│   └── format.ts             # Formatting helpers
├── modules/ghost-local-inference/  # On-device runtime (llama.cpp, Mini only)
├── components/
├── constants/theme.ts        # Design tokens
└── docs/
```

---

# Authentication

| Mechanism | Headers | Used by |
|-----------|---------|---------|
| Relay client token | `X-Ghost-Client-Id` + `X-Ghost-Client-Token` | App ↔ relay server |
| Device credential | `X-Ghost-Device-ID` + `X-Ghost-Credential` | App ↔ Ghost gateway (paired devices) |

Message endpoints also send `X-Ghost-Session`. Pairing redemption (`POST /v1/pairing/complete`) is a public endpoint — the short-lived pairing token is the authorization. Gateway auth failures return `401` only (never `403` for device credentials); the app routes `device_revoked` to the revoked screen. `/v1/ws` is opened without auth headers (React Native WebSockets can't set them).

### Structured errors

Pairing and auth errors return `{ "error": { "code", "message" } }`:

- `pairing_invalid`, `pairing_expired`, `pairing_consumed`, `pairing_rejected` — pairing problems
- `device_revoked` — routes the app to the revoked screen
- 401/403 on any authenticated request — routes the app to the auth-failure screen and clears credentials

---

# API Reference

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/v1/health` | Connection test (`uptime_s` included; authed, loopback bypass) |
| POST | `/v1/pairing/complete` | Redeem pairing token (public) |
| POST | `/v1/chat` | Streaming AI chat (SSE) |
| GET | `/v1/history` | Conversation history |
| GET | `/v1/identity` | Owner/Ghost identity |
| GET | `/v1/activity` | User-safe activity |
| GET/POST | `/v1/permissions/requests` + `/v1/permissions/resolve` | Pending approvals |
| GET | `/v1/things` | Unified “things Ghost does for you” feed (routines + scheduled) |
| GET/POST | `/v1/routines` | Routines |
| GET/POST | `/v1/goals` | Goals |
| GET | `/v1/cards` | Rich cards |
| GET/POST | `/v1/connected-apps` | Connected services |
| POST | `/v1/voice/turn` | Voice message transcription + reply |
| POST | `/v1/steering` | Mid-turn steering (incl. abort) |
| GET/POST | `/v1/model` | Model presets and switching |
| GET | `/v1/providers` | Provider directory (configured flags, recommended models) |
| POST | `/v1/providers/test` | Test a provider connection (key never persisted) |
| GET/POST | `/v1/intelligence/config` | Owner AI config: masked keys, routing, Ollama URL |
| GET | `/v1/ollama/models` | Installed local models |
| POST | `/v1/ollama/pull` | Start a local model download |
| GET | `/v1/models/catalog` | Phone-local model catalog (Mini only) |
| GET/POST | `/v1/sync/ops` | Memory-sync op push/pull |
| GET | `/v1/doctor` (+ `/v1/doctor/local`) | Diagnostics and service health checks |
| GET | `/v1/live/surfaces` | Live surfaces |
| GET | `/v1/artifacts` | Artifacts |
| GET | `/v1/memory/self` | Phone-visible memory fact |
| GET | `/v1/stats` | Pod stats (version, CPU, memory, disk) |
| WS | `/v1/ws` | Proactive push (`assistant_message`, `clarify_request`, `cron_update`, `progress_event`) |

Not called by the app: `/v1/upload`, `/v1/transcribe`, `/v1/search`,
`/v1/sessions`, `/v1/cron/jobs`, `/v1/skills*`, `/v1/memory/files`,
`/v1/workspace/files`.

---

# Security

- Credentials live only in platform secure storage (iOS Keychain / Android Keystore via expo-secure-store); connection metadata (host, transport) lives in AsyncStorage
- No shared secret exists — each device authenticates individually and can be disconnected independently from the Pod
- Device credentials and client tokens are never placed in URLs, including WebSocket connections (the short-lived pairing token is, by design, in the QR code)
- The gateway listens on the LAN with device-credential auth; remote access goes through the relay with per-client tokens

---

# 📦 Build & Deployment

Build for production using **Expo Application Services (EAS)**:

1. **Configure EAS Builds:**
    ```bash
    bunx eas build:configure

    # Android
    bunx eas build --platform android

    # iOS
    bunx eas build --platform ios
    ```

2. **Build for Preview:**
    ```bash
    # Android
    eas build --platform android --profile preview

    # iOS
    eas build --platform ios --profile preview
    ```

3. **Build for Production:**
    ```bash
    # Android
    eas build --platform android --profile production

    # iOS
    eas build --platform ios --profile production
    ```

4. **OTA Updates:**
    ```bash
    # Push OTA update to staging channel
    eas update --channel staging --message "Testing new feature"

    # Or target a specific branch
    eas update --branch preview --message "Update memory and activity screens"

    # Channel can be: development, preview, or production
    # depending on the build type of the app
    eas update --channel production --message "Bug fix release"
    ```

## GitHub Actions CI/CD

Ghost Mobile uses `eas build --local` on GitHub-hosted runners — this does **not** consume EAS cloud build quota.

| Workflow | Trigger | Output |
|---|---|---|
| `android-ci.yml` | Push / PR to `master` | APK artifact (14-day retention) |
| `android-release.yml` | Push tag `v*.*.*` | APK published to **GitHub Releases tab** |

> ⚠️ The `android-ci.yml` / `android-release.yml` workflows do not exist in this repo yet — add them (same shape as the Nairobi Unwind repo) before the table above applies.

### Required GitHub secret

Set this secret in your repository under **Settings → Secrets and variables → Actions**:

| Secret | Required | Description |
|---|---|---|
| `EXPO_TOKEN` | ✅ Yes | Authenticates EAS CLI for signing credential download |

Generate a token at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens).

### Shipping a release

```bash
git tag v1.0.0
git push origin v1.0.0
# → android-release.yml builds the APK on the GitHub runner
# → APK appears on the Releases tab with auto-generated changelog
```

Beta / pre-release tags (`-beta`, `-alpha`, `-rc`) are automatically marked as pre-release on GitHub:

```bash
git tag v1.0.0-beta
git push origin v1.0.0-beta
```
