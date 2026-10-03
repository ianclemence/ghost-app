import { Platform } from "react-native";
import { easProjectId } from "./pushConfig";
import { registerPushToken, unregisterPushToken, type GhostConfig } from "./ghostApi";

/**
 * Real push, so Ghost can reach the phone when the app is closed: a reminder
 * that came due, a question, a task that finished. The Pod sends through
 * Expo's push service with fixed product copy only (never message content).
 * Without this the app could only notify while it was already running.
 *
 * Registration is silent: it never asks for permission (the pairing screen
 * does that, once). It only hands the Pod a token when the owner already said
 * yes, and it is safe to run on every launch.
 */

export type PushState = "registered" | "denied" | "unavailable" | "failed";

export async function syncPushToken(cfg: GhostConfig): Promise<PushState> {
  try {
    const { capability } = await import("./capabilities");
    if (!capability("notifications").supported) return "unavailable";
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return "denied";

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Ghost",
        importance: Notifications.AndroidImportance.HIGH,
      }).catch(() => {});
    }

    const Constants = (await import("expo-constants")).default;
    const projectId = easProjectId(Constants as never);
    if (!projectId) return "unavailable";
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return "failed";
    await registerPushToken(cfg, token, Platform.OS);
    return "registered";
  } catch {
    return "failed";
  }
}

/** Stop pushes to this phone (best effort; the Pod also drops dead tokens). */
export async function stopPush(cfg: GhostConfig): Promise<void> {
  try {
    await unregisterPushToken(cfg);
  } catch {
    // Offline: the Pod prunes a token the push service reports as dead.
  }
}

/** What the owner reads about push on this phone. */
export function pushLine(state: PushState | null): string {
  switch (state) {
    case null:
      return "Checking…";
    case "registered":
      return "On. Reminders reach you when Ghost is closed";
    case "denied":
      return "Off on this phone. Tap to turn on";
    default:
      return "Not working yet. Reminders only arrive while Ghost is open";
  }
}
