/**
 * Following a reply that another surface started.
 *
 * Ghost writes a reply on the Pod whether or not this phone asked for it. When
 * a message is sent from the terminal (or another phone) the Pod streams the
 * reply to every connected surface, and this module turns those frames into
 * changes to the thread: the question appears, the answer grows as it is
 * written, and when it ends the live text is replaced by the saved message.
 * A phone opened halfway through gets a snapshot of what has been written so
 * far, then the rest.
 */
import type { ExtendedMessage } from "./store";

export interface LiveContext {
  session: string;
  /** The request this device sent itself; it already streams that one. */
  ownRequestId: string | null;
}

export type LiveEffect =
  | { kind: "show"; requestId: string; userText: string | null; text: string; tool: string | null }
  | { kind: "delta"; requestId: string; delta: string }
  | { kind: "tool"; requestId: string; tool: string | null }
  | { kind: "end"; requestId: string; text: string; outcome: string };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Reads one WebSocket frame. Returns null for anything that is not for us. */
export function liveEffect(frame: unknown, ctx: LiveContext): LiveEffect | null {
  if (!frame || typeof frame !== "object") return null;
  const f = frame as Record<string, unknown>;
  const type = str(f.type);
  if (!type.startsWith("stream_")) return null;
  if (str(f.session_id) !== ctx.session) return null;
  const requestId = str(f.request_id);
  if (!requestId || requestId === ctx.ownRequestId) return null;
  switch (type) {
    case "stream_start":
    case "stream_snapshot":
      return {
        kind: "show",
        requestId,
        userText: str(f.user_content) || null,
        text: str(f.text),
        tool: str(f.tool) || null,
      };
    case "stream_delta":
      return str(f.delta) ? { kind: "delta", requestId, delta: str(f.delta) } : null;
    case "stream_tool":
      return { kind: "tool", requestId, tool: str(f.tool) || null };
    case "stream_end":
      return { kind: "end", requestId, text: str(f.text), outcome: str(f.outcome) || "success" };
    default:
      return null;
  }
}

/** The pieces of the store a live reply changes. */
export interface LiveStore {
  messages: () => ExtendedMessage[];
  appendMessage: (m: ExtendedMessage) => void;
  updateMessage: (id: string, patch: Partial<ExtendedMessage>) => void;
  removeMessage: (id: string) => void;
  setToolActivity: (label: string | null) => void;
}

export const liveUserId = (requestId: string) => `live-u-${requestId}`;
export const liveReplyId = (requestId: string) => `live-a-${requestId}`;

/**
 * Applies an effect. Returns true when the reply has ended and the caller
 * should reconcile with the saved history.
 */
export function applyLiveEffect(e: LiveEffect, store: LiveStore, now: number = Date.now()): boolean {
  const replyId = liveReplyId(e.requestId);
  const existing = () => store.messages().find((m) => m.id === replyId);
  switch (e.kind) {
    case "show": {
      if (e.userText && !store.messages().some((m) => m.id === liveUserId(e.requestId))) {
        store.appendMessage({ id: liveUserId(e.requestId), role: "user", content: e.userText, timestamp: now });
      }
      if (existing()) store.updateMessage(replyId, { content: e.text, status: "streaming" });
      else store.appendMessage({ id: replyId, role: "assistant", content: e.text, timestamp: now, status: "streaming" });
      store.setToolActivity(e.tool);
      return false;
    }
    case "delta": {
      const cur = existing();
      if (cur) store.updateMessage(replyId, { content: cur.content + e.delta, status: "streaming" });
      else store.appendMessage({ id: replyId, role: "assistant", content: e.delta, timestamp: now, status: "streaming" });
      return false;
    }
    case "tool":
      store.setToolActivity(e.tool);
      return false;
    case "end": {
      store.setToolActivity(null);
      if (!e.text.trim() || e.outcome === "failed") {
        if (existing()) store.removeMessage(replyId);
        return true;
      }
      if (existing()) store.updateMessage(replyId, { content: e.text, status: "completed" });
      else store.appendMessage({ id: replyId, role: "assistant", content: e.text, timestamp: now, status: "completed" });
      return true;
    }
  }
}
