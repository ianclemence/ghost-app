# 👻 Ghost Mobile

The daily-driver companion app for your self-hosted Ghost — a personal AI that lives on your own hardware. Pair your phone with your Ghost Pod over a secure QR flow, chat with streaming responses, browse memory and history, manage automations, and receive proactive notifications.

---

# Features

Ghost Mobile is one conversation with your Ghost, the way you'd talk to a
person. Everything else is a short trip away from it and back.

## 💬 The conversation (home)

| Feature | Description |
|---------|-------------|
| Presence | Ghost's name, a status light, and one live line of what it is doing right now (thinking, working in the background, waiting for your OK, keeping an eye on things, offline) |
| Streaming | Token-by-token replies from your Pod; runtime phases ("Checking memory") fill the silence before the first word |
| Where it ran | A quiet line under each live reply, stated by the Pod's runtime (`served_by`): on your Pod, or which cloud model |
| Days and time | Day separators; time appears only where it means something: when Ghost reached out on its own (ember dot) or the conversation resumed after a pause |
| Your messages | Soft bubbles; long-press any message to copy |
| Approvals | Ghost's pending decisions docked above the composer, one at a time with "1 of n"; the stakes come from the broker's risk class, never from model prose |
| Artifacts | Documents and plans Ghost made appear in the thread where they were made |
| Photos | Attach a photo for the Pod's vision model |
| Voice | Dictate (transcribed on the Pod) or open live voice from the header |
| Send while working | Type a follow-up while Ghost works; it joins the running turn. Stop at any time |
| History | Scroll back through the whole conversation (paged from the Pod); opens instantly from an on-device copy |
| Offline outbox | Messages typed while the Pod is unreachable wait on the phone and go out in order when it's back |
| Markdown | Headings, lists, tables, quotes, links, code with copy, Mermaid diagrams (sandboxed); only `http(s)` links open |

## 👻 Ghost, opened up (tap Ghost in the header)

- **Right now**: what needs your OK
- **Coming up**: the next things Ghost will do (routines, reminders, watches)
- **What Ghost did**: the latest actions, each with its outcome and why
- **Memory**: everything Ghost remembers, readable and forgettable
- **Settings**: Intelligence, Connected apps, Your Pod, About

### Activity

The audit trail: every action Ghost took, by day, with the outcome the
runtime recorded and why Ghost acted.

### Memory

What Ghost remembers, grouped by area, with when it was learned and how
often it was confirmed. Forget anything; it's removed on your Pod.

### Routines

Anything Ghost does on its own: recurring briefs, reminders, scheduled
actions, watches, and standing goals, from `/v1/routinefeed`. Pause, resume,
or stop anything.

### Your Pod

Health (version, uptime, load, memory, storage), anything that needs
attention, and the AI models installed on the Pod (Ollama). Models on the Pod
answer without anything leaving it.

## Where Ghost runs

Ghost lives on your Pod: memory, permissions, tools, and routines stay on
hardware you own, and local models run there. The phone is how you reach
it. There is no second, smaller Ghost on the phone: a model small enough
for a phone can't do what Ghost does (governed tools, durable memory,
watches, approvals), so offline the app is honest instead: your last
conversation stays readable and new messages wait until the Pod is back.

Notifications carry fixed product copy only (never message content); taps
open the conversation.

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
│   ├── (tabs)/index.tsx      # 💬 The conversation (home)
│   ├── conversation.tsx      # Redirect → / (old links, notification taps)
│   ├── panel.tsx             # Ghost, opened up (tap Ghost in the header)
│   ├── activity.tsx          # Everything Ghost did, and why
│   ├── memory.tsx            # What Ghost remembers (forgettable)
│   ├── routines.tsx          # Routines, reminders, watches, standing goals
│   ├── intelligence.tsx      # Which AI Ghost thinks with
│   ├── connections.tsx       # Connected apps
│   ├── ghost.tsx             # Your Pod: health, attention, Pod models
│   ├── live.tsx              # Live voice
│   ├── about.tsx             # About Ghost
│   ├── goals.tsx / device.tsx  # Redirects (deep-link compat)
│   ├── onboarding.tsx        # First launch: connect or set up a Pod
│   ├── connect.tsx, scan.tsx, confirm.tsx, manual.tsx, setup-pod.tsx
│   ├── pairing-success.tsx, auth-failure.tsx, revoked.tsx
├── components/
│   ├── presence-header.tsx   # Ghost + live status line
│   ├── thread.tsx            # Day separators, bubbles, Ghost messages, thinking
│   ├── permission-card.tsx   # Approval card
│   └── screen-header.tsx     # Back/close header for every other screen
├── lib/
│   ├── ghostApi.ts           # API client (REST + SSE + WS)
│   ├── thread.ts             # Thread model: days, out-of-turn, time
│   ├── presence.ts           # The one-line status
│   ├── threadCache.ts        # On-device copy of the thread (instant open)
│   ├── outbox.ts             # Offline message queue (FIFO, persisted)
│   ├── reconcile.ts          # Streamed ↔ server history reconciliation
│   ├── connection.ts         # Connection state machine
│   ├── credentials.ts        # SecureStore/AsyncStorage credential layer
│   ├── pairing.ts            # Pairing URI parser
│   └── store.ts              # Zustand state
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
| GET | `/v1/routinefeed` | Unified Routines feed (routines + scheduled) |
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
| GET | `/v1/doctor` | Diagnostics and service health checks |
| GET | `/v1/activity` | What Ghost did, with outcome and why |
| GET | `/v1/routinefeed` | Routines, reminders, watches |
| GET | `/v1/live/surfaces` | Live surfaces |
| GET | `/v1/artifacts` | Artifacts |
| GET/POST | `/v1/memory/self` (+ `/forget`) | What Ghost remembers; forget an item |
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
