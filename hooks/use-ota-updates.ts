import { useEffect } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";

/** How soon after opening an update may still restart the app unnoticed. */
const AT_LAUNCH_MS = 8000;

/**
 * Updates sent over the air arrive and take effect. By default expo-updates
 * only downloads an update at launch and applies it at the next cold start,
 * which on Android (where the app stays alive in the background) can be days
 * away. So: look on opening and on every return to the app; an update found
 * in the first moments after opening is applied at once, before anything is
 * in use; one found later is applied the next time the app comes back, never
 * while the owner is in the middle of something.
 */
export function useOtaUpdates() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    const opened = Date.now();
    let ready = false; // an update is downloaded and waiting
    let busy = false;

    const look = async () => {
      if (busy) return;
      busy = true;
      try {
        if (!ready) {
          const found = await Updates.checkForUpdateAsync();
          if (found.isAvailable) {
            const got = await Updates.fetchUpdateAsync();
            ready = got.isNew;
          }
        }
        if (ready && Date.now() - opened < AT_LAUNCH_MS) await Updates.reloadAsync();
      } catch {
        // Offline or the update server is unreachable: look again next time.
      } finally {
        busy = false;
      }
    };

    void look();
    let last = AppState.currentState;
    const sub = AppState.addEventListener("change", (state) => {
      const back = last !== "active" && state === "active";
      last = state;
      if (!back) return;
      if (ready) {
        // Coming back to the app is the moment to start on the new version.
        Updates.reloadAsync().catch(() => {});
        return;
      }
      void look();
    });
    return () => sub.remove();
  }, []);
}

/** Which update is running, for About: "Oct 10, 14:02", or null for the build's own. */
export function runningUpdate(): string | null {
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return null;
  return Updates.createdAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
