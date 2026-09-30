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

// ─── Ghost speaking first ──────────────────────────────────────────────────
//
// A reminder that comes due, an alert, a routine's result: Ghost starts these
// itself. They used to reach the phone only as a notification, and appeared in
// the thread the next time the app reloaded its history. They now join the
// thread the moment they happen, labelled for what they are.

export const MESSAGE_KINDS = ["reminder", "notice", "alert", "routine"] as const;

export interface SayEffect {
  id: string;
  text: string;
  kind: (typeof MESSAGE_KINDS)[number] | null;
}

/** Reads a frame for a message Ghost sent unprompted. Null for anything else. */
export function sayEffect(frame: unknown, ctx: { session: string }, now: number = Date.now()): SayEffect | null {
  if (!frame || typeof frame !== "object") return null;
  const f = frame as Record<string, unknown>;
  const meta = (f.metadata && typeof f.metadata === "object" ? f.metadata : {}) as Record<string, unknown>;
  if ((str(f.type) || str(meta.type)) !== "assistant_message") return null;
  const session = str(f.session_id) || str(meta.session_id);
  if (session !== ctx.session) return null;
  const text = str(f.content).trim();
  if (!text) return null;
  const rawKind = str(f.kind) || str(meta.kind);
  const kind = (MESSAGE_KINDS as readonly string[]).includes(rawKind) ? (rawKind as SayEffect["kind"]) : null;
  // Only what Ghost started: a reply to this device's own turn arrives on that turn's stream.
  if (!kind && str(meta.origin) !== "ghost") return null;
  const id = str(f.id) || `say-${now}-${text.length}`;
  return { id, text, kind };
}

/** Adds the message to the thread. Returns true so the caller can reconcile with history. */
export function applySay(e: SayEffect, store: Pick<LiveStore, "appendMessage">, now: number = Date.now()): boolean {
  store.appendMessage({
    id: e.id,
    role: "assistant",
    content: e.text,
    timestamp: now,
    status: "completed",
    ...(e.kind ? { kind: e.kind } : {}),
  });
  return true;
}
