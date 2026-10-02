# Developing the app

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
| `bun test` | The unit tests: threads, outbox, reconcile, live turns, approvals, pairing, credentials, browser steering |

Push notifications and the camera need a development build, not Expo Go
(`bunx expo run:android` or `run:ios`).

## Layout

```text
app/                       screens (expo-router)
  (tabs)/index.tsx         the conversation
  panel.tsx                Ghost, opened up
  browser.tsx              steer Ghost's browser
  activity.tsx memory.tsx files.tsx file.tsx routines.tsx
  intelligence.tsx connections.tsx ghost.tsx (Your Pod) about.tsx
  onboarding.tsx connect.tsx scan.tsx confirm.tsx manual.tsx setup-pod.tsx
  pairing-success.tsx auth-failure.tsx revoked.tsx
components/                thread, approval card, composer, presence header, live surface card
lib/
  ghostApi.ts              REST, SSE and the live connection
  liveTurn.ts              following a reply from another device; Ghost speaking first
  reconcile.ts             streamed text against saved history, so nothing doubles
  browserInput.ts          taps and typing into the browser's input messages
  outbox.ts                the offline queue (ordered, persisted)
  connection.ts credentials.ts pairing.ts push.ts notify.ts
constants/theme.ts         the light and dark palettes, spacing, type
docs/POD-TEST-GUIDE.md     the acceptance script for a real Pod and phone
```

## Build and release

Builds use [EAS](https://docs.expo.dev/build/introduction/):

```bash
bunx eas build --platform android --profile preview      # a test build
bunx eas build --platform android --profile production
bunx eas update --channel production --message "..."     # an over-the-air fix
```

Releases are tagged (`v1.6.0`) and published on GitHub, and are marked
**pre-release** until a build has been run on a physical phone. There is no CI
workflow in this repository yet; one that runs `typecheck`, `lint` and `test` is
the next thing to add.
