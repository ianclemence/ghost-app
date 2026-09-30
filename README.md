# Ghost app

The phone half of Ghost: a personal AI that lives on hardware you own. Your Pod
does the thinking, remembering and doing; this is how you reach it, approve what
it wants to do, and see what it has been up to.

> **Status: pre-release.** It has been built, type-checked, linted and tested
> (`bun test`, and a simulated phone against a real Pod), and has not yet been run
> on a physical phone. [`docs/PI-TEST-GUIDE.md`](docs/PI-TEST-GUIDE.md) is the
> script for that first run.

It talks to a [Ghost Pod](https://github.com/ianclemence/ghost). There is no
second, smaller Ghost on the phone: a model small enough for a phone cannot do
what Ghost does (governed tools, durable memory, approvals). Offline the app is
honest instead: your last conversation stays readable and new messages wait until
the Pod is back.

---

## What you get

### One conversation

| | |
|---|---|
| **Presence** | Ghost's name, a status light, and one live line of what it is doing right now: thinking, working in the background, waiting for your OK, offline. |
| **Streaming** | Replies arrive as they are written, with real phases ("Checking memory") in the silence before the first word. |
| **From any device** | Send a message from the terminal and open the app: the question is there and the answer arrives as it is written. Open the app halfway through and you see what has been written so far, then the rest. |
| **Where it ran** | A quiet line under each reply, stated by the Pod: on your Pod, or which cloud model. |
| **When Ghost speaks first** | Reminders, notices, alerts and a routine's results join the thread the moment they happen, each with its own label, and stay labelled in your history. |
| **Approvals** | Decisions dock above the composer, one at a time. Answering one puts it away with a short fade. The stakes come from the broker's risk class, never from the model's wording. |
| **Photos and files** | Attach up to four photos or files (PDF, Word, spreadsheets, text). The Pod reads them by their real type. Everything you sent is under Files, with preview and delete. |
| **Voice** | Dictate (transcribed on the Pod, audio not kept) or open live voice from the header. |
| **Send while working** | Type a follow-up and it joins the running turn. Stop at any time. |
| **Offline outbox** | Messages typed while the Pod is unreachable wait on the phone and go out in order. |
| **Ghost's browser** | Watch a live card of what Ghost is doing in its browser. It stops and asks before anything hard to undo. |

### Ghost, opened up (tap Ghost in the header)

- **Right now** what needs your OK, **Coming up** (routines, reminders, watches), **What Ghost did** (each action with its outcome and why).
- **Memory**: everything Ghost remembers, who each fact is about, whether it lasts or is tied to a date, and your own words as the receipt. Forget anything; it is removed on the Pod.
- **Routines**: pause, resume or stop anything Ghost does on its own.
- **Your Pod**: health, anything needing attention, installed models, updates (install one after confirming), and a one-time code to reset the web console password without a terminal.
- **Connected apps**: keys are checked with the service before Ghost says "connected", and a refusal says why.
- **Website logins**: saved once, sealed on the Pod, never passed through the model.

### Notifications

Real push, with the app closed: reminders, questions from Ghost, finished tasks,
and anything it thinks you should know (a problem with the Pod, something odd on
your network). They carry fixed product copy only, never message content, and a
tap opens the conversation. Turn them on when the app asks.

### Light, dark, and how it looks

Cool neutrals with one ink-blue accent, and amber used only when Ghost is working
or needs you. Dark is true black. The app follows the phone's setting; if it
changes while the app is open, the app restarts into the other one. Every
animation respects the phone's reduced-motion setting.

---

## Run it

Prerequisites: [Bun](https://bun.sh/) (or Node 20+), the
[Expo](https://docs.expo.dev/) toolchain, Android Studio and/or Xcode for
simulators, and a running Ghost Pod on your network.

```bash
git clone https://github.com/ianclemence/ghost-app.git
cd ghost-app
bun install
bunx expo start
```

| Script | |
|---|---|
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | Expo lint (ESLint) |
| `bun test` | The unit tests (threads, outbox, reconcile, live turns, approvals, pairing, credentials) |

Push notifications and the camera need a development build, not Expo Go
(`bunx expo run:android` or `run:ios`).

## Pair your phone

1. On the Pod run `ghost pair`, or open the web console, **Devices**, **Connect another device**.
2. A QR code appears. It works once and expires in five minutes.
3. In the app choose **Pair your Ghost**, then **Scan your Ghost**, or enter the address and code by hand.
4. The app exchanges the code for its own device credential, stored in the phone's secure storage.

To set up a brand-new Pod from the phone, choose **Set up a new Ghost Pod**; it asks
for the address, the setup code, your names, what Ghost should think with, and a
password. Away from home, see the Pod's
[connection guide](https://github.com/ianclemence/ghost/blob/main/docs/CONNECT.md).

---

## How it connects

- **Requests** go to the Pod's gateway with the device's own credential
  (`X-Ghost-Device-ID` and `X-Ghost-Credential`). There is no shared secret; each
  phone can be removed from the Pod independently.
- **The live connection** (`/v1/ws`) carries everything that happens without you
  asking: replies followed from other devices, reminders, alerts, background tasks,
  questions and approvals. It sends the same credentials as connection headers. It
  used to send none, so a phone on the home network would have been refused and
  seen nothing live.
- **Streaming chat** is server-sent events on the request that made it.
- **Credentials** are in the iOS Keychain or Android Keystore. They are never put in
  URLs (the short-lived pairing code is, by design, in the QR code).
- The route list and error shapes are in the Pod's
  [gateway API reference](https://github.com/ianclemence/ghost/blob/main/docs/MOBILE-API.md).

Pairing and auth errors are `{ "error": { "code", "message" } }`:
`pairing_invalid`, `pairing_expired`, `pairing_consumed`, `pairing_rejected`, and
`device_revoked` (which routes to the revoked screen). A 401 on any authenticated
request routes to the auth-failure screen.

---

## Project layout

```text
app/                       screens (expo-router)
  (tabs)/index.tsx         the conversation
  panel.tsx                Ghost, opened up
  activity.tsx memory.tsx files.tsx file.tsx routines.tsx
  intelligence.tsx connections.tsx ghost.tsx (Your Pod) live.tsx about.tsx
  onboarding.tsx connect.tsx scan.tsx confirm.tsx manual.tsx setup-pod.tsx
  pairing-success.tsx auth-failure.tsx revoked.tsx
components/
  thread.tsx               days, bubbles, Ghost messages, the label for what Ghost started
  permission-card.tsx      the approval card
  composer.tsx presence-header.tsx markdown-bubble.tsx
  live-surface-card.tsx    Ghost's browser, live
lib/
  ghostApi.ts              REST, SSE and the live connection
  liveTurn.ts              following a reply from another device; Ghost speaking first
  reconcile.ts             streamed text against saved history, so nothing doubles
  outbox.ts                the offline queue (ordered, persisted)
  thread.ts threadCache.ts presence.ts store.ts
  push.ts notify.ts        push registration and notification copy
  attachments.ts localFiles.ts
  connection.ts credentials.ts pairing.ts
constants/theme.ts         the light and dark palettes, spacing, type
docs/PI-TEST-GUIDE.md      the acceptance script for a real Pod and phone
```

## Build and release

Builds use [EAS](https://docs.expo.dev/build/introduction/):

```bash
bunx eas build --platform android --profile preview      # a test build
bunx eas build --platform android --profile production
bunx eas update --channel production --message "..."     # an over-the-air fix
```

Releases are tagged (`v1.4.0`) and published on GitHub, and are marked
**pre-release** until a build has been run on a physical phone. There is no CI
workflow in this repository yet; one that runs `typecheck`, `lint` and `test` is
the next thing to add.

## Related

- **[ghost](https://github.com/ianclemence/ghost)**: the Pod software this app talks to.
