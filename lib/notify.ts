import type { WSMessage } from "./ghostApi";

export interface NotificationCopy {
  title: string;
  body: string;
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
    return { title: "Ghost", body: "Ghost needs your attention." };
  }
  if (type === "clarify_request") {
    return { title: "Ghost", body: "Ghost has a question for you." };
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
