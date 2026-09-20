import type { WSMessage } from "./ghostApi";

export type NotificationCategory = "approval" | "question" | "update";

export interface NotificationCopy {
  title: string;
  body: string;
  // Urgency triage without content: approval (needs a decision), question
  // (needs an answer), update (needs nothing). The tray still never carries
  // message content — the category only decides the anchor.
  category: NotificationCategory;
  // Where the tap should land inside the conversation.
  anchor: "approvals" | "thread";
}

/**
 * Conservative notification copy for Ghost runtime events.
 *
 * The tray never carries message content, tool arguments, memory, or any
 * other potentially sensitive material. Fixed product copy only; the
 * canonical conversation remains the source of truth when opened.
 */
export function notificationCopyFor(msg: WSMessage): NotificationCopy | null {
  const type =
    typeof msg.type === "string"
      ? msg.type
      : typeof (msg.metadata as Record<string, unknown> | undefined)?.type === "string"
        ? String((msg.metadata as Record<string, unknown>).type)
        : "";
  if (type === "assistant_message") {
    return { title: "Ghost", body: "Ghost needs your attention.", category: "update", anchor: "thread" };
  }
  if (type === "clarify_request") {
    return { title: "Ghost", body: "Ghost has a question for you.", category: "question", anchor: "thread" };
  }
  return null;
}

/** Stable dedup identity for a runtime event. Falls back to null (no notify). */
export function notificationKeyFor(msg: WSMessage): string | null {
  if (typeof msg.id === "string" && msg.id) return msg.id;
  const meta = msg.metadata as Record<string, unknown> | undefined;
  const rid = meta && typeof meta.request_id === "string" ? meta.request_id : "";
  if (rid && typeof msg.timestamp === "number") return `${rid}:${msg.timestamp}`;
  return null;
}

/**
 * The one shared notification-permission ask — used by pairing success and
 * Mini-download setup alike, so both flows behave identically. Only prompts
 * when undecided; otherwise reports the existing state. Needs a dev build;
 * Expo Go (and any runtime without the module) reports unavailable.
 */
export async function ensureNotificationPermission(): Promise<"granted" | "denied" | "unavailable"> {
  const { capability } = await import("./capabilities");
  if (!capability("notifications").supported) return "unavailable";
  try {
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted" || status === "denied") return status;
    const result = await Notifications.requestPermissionsAsync();
    return result.status === "granted" ? "granted" : "denied";
  } catch {
    return "unavailable";
  }
}
