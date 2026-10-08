import { create } from "zustand";
import { GhostConfig, Message, type ServedBy } from "./ghostApi";
import type { QueuedMessage } from "./queue";
import type { RunStep } from "./runSteps";

export type ConnectionState = "online" | "syncing" | "offline";
export type MessageStatus =
  | "sending"
  | "streaming"
  | "completed"
  | "failed"
  | "retrying"
  | "queued";

export interface ExtendedMessage extends Message {
  status?: MessageStatus;
  // Where this reply ran, as the Pod's runtime stated it (served_by).
  // History rows carry none and render nothing: unknown stays unknown.
  servedBy?: ServedBy;
  // The stream ended without the runtime's closing marker, so this reply may
  // be only the start of what Ghost wrote. History reconciliation replaces it
  // with the Pod's full copy as soon as that is available.
  incomplete?: boolean;
  // The row's identity in the list, fixed when it is created. Ids change when
  // a reply is saved (a temp id becomes a real one); a key that changed with
  // them would rebuild the row and replay its entrance as the reply finishes.
  key?: string;
  // What Ghost did while writing this reply: each tool call, in order.
  steps?: RunStep[];
}

interface GhostStore {
  // Config
  config: GhostConfig | null;
  setConfig: (cfg: GhostConfig) => void;

  // Connection (3-state)
  connectionState: ConnectionState;
  setConnectionState: (v: ConnectionState) => void;
  // Identity of the paired Ghost (from the pairing response)
  ghostName: string | null;
  setGhostName: (name: string | null) => void;
  // Gateway uptime in seconds (from /v1/health), null when unknown
  uptimeSeconds: number | null;
  setUptimeSeconds: (s: number | null) => void;
  currentSession: string;
  setCurrentSession: (session: string) => void;
  seenMessageIds: Set<string>;

  // Messages
  messages: ExtendedMessage[];
  setMessages: (msgs: ExtendedMessage[]) => void;
  appendMessage: (msg: ExtendedMessage) => void;
  removeMessage: (id: string) => void;
  updateMessage: (id: string, patch: Partial<ExtendedMessage>) => void;

  // Streaming state
  isStreaming: boolean;
  streamBuffer: string;
  setStreaming: (v: boolean) => void;
  clearStreamBuffer: () => void;
  appendStream: (chunk: string) => void;
  commitStream: () => void;

  // Messages sent while Ghost works, until each is part of the conversation.
  queued: QueuedMessage[];
  setQueued: (next: QueuedMessage[] | ((prev: QueuedMessage[]) => QueuedMessage[])) => void;

  // Live status line ("Thinking", "Searching the web" from tool_status events)
  toolActivity: string | null;
  setToolActivity: (label: string | null) => void;
}

export interface ClarifyRequest {
  questionId: string;
  question: string;
  choices: string[];
}

/**
 * One persistent Ghost conversation. The frozen contract selects
 * main when the client never sets a session; we pin it
 * explicitly so history, chat, and voice share one relationship.
 */
export const MAIN_SESSION_ID = "main";

let nextMessageId = 1;

const isTempId = (id: string) => id.startsWith("temp-");
const makeMessageId = () => `msg-${Date.now()}-${nextMessageId++}`;

export const useGhostStore = create<GhostStore>((set) => ({
  config: null,
  setConfig: (cfg) =>
    set({
      config: cfg,
      currentSession: MAIN_SESSION_ID,
    }),

  connectionState: "offline",
  setConnectionState: (v) => set({ connectionState: v }),


  ghostName: null,
  setGhostName: (name) => set({ ghostName: name }),
  uptimeSeconds: null,
  setUptimeSeconds: (s) => set({ uptimeSeconds: s }),

  currentSession: MAIN_SESSION_ID,
  setCurrentSession: (session: string) => set({ currentSession: session }),
  seenMessageIds: new Set<string>(),

  messages: [],
  setMessages: (msgs) =>
    set(() => {
      const deduped = msgs.filter(
        (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
      );
      const seen = new Set<string>();
      deduped.forEach((m) => {
        if (m.id) seen.add(m.id);
      });
      return { messages: deduped, seenMessageIds: seen };
    }),
  appendMessage: (msg) =>
    set((s) => {
      if (msg.id && s.seenMessageIds.has(msg.id)) {
        return { messages: s.messages };
      }
      const exists = s.messages.some(
        (m) =>
          m.id === msg.id ||
          (m.content === msg.content &&
            m.role === msg.role &&
            Math.abs(m.timestamp - msg.timestamp) < 2000), // ms + s tolerant
      );
      if (exists) {
        // If content matches but ID is different (e.g. temp ID vs server ID),
        // we should ideally update the ID to the server one.
        // For now, we just return to avoid duplication.
        return { messages: s.messages };
      }
      const next = new Set(s.seenMessageIds);
      if (msg.id) next.add(msg.id);
      return {
        messages: [...s.messages, msg],
        seenMessageIds: next,
      };
    }),
  removeMessage: (id) =>
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== id),
    })),
  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  isStreaming: false,
  streamBuffer: "",
  setStreaming: (v) => set({ isStreaming: v }),
  clearStreamBuffer: () => set({ streamBuffer: "", isStreaming: false }),
  appendStream: (chunk) =>
    set((s) => {
      const newBuffer = s.streamBuffer + chunk;
      // The reply being written, wherever it is in the list: something sent
      // while it streams must not take the words away from it.
      let idx = -1;
      for (let i = s.messages.length - 1; i >= 0; i--) {
        const m = s.messages[i];
        if (m.role === "assistant" && isTempId(m.id) && m.status === "streaming") {
          idx = i;
          break;
        }
      }
      if (idx < 0) return { streamBuffer: newBuffer };
      const msgs = s.messages.slice();
      msgs[idx] = { ...msgs[idx], content: newBuffer, status: "streaming" };
      return { streamBuffer: newBuffer, messages: msgs };
    }),
  queued: [],
  setQueued: (next) => set((s) => ({ queued: typeof next === "function" ? next(s.queued) : next })),
  toolActivity: null,
  setToolActivity: (label) => set({ toolActivity: label }),
  commitStream: () =>
    set((s) => {
      const msgs = s.messages
        .map((m) =>
          // A message still waiting in the outbox is not part of this turn: it
          // keeps its id (the outbox removes it by that id once delivered) and
          // its "waiting" label. Committing it orphaned the bubble, and the
          // delivered copy then appeared beside it.
          isTempId(m.id) && m.status !== "queued"
            ? {
                ...m,
                key: m.key ?? m.id,
                id: makeMessageId(),
                status: "completed" as MessageStatus,
              }
            : m,
        )
        // A reply with no words is dropped, unless Ghost did something on the
        // way: the record of what it tried is worth keeping when it failed.
        .filter((m) => !(m.role === "assistant" && m.content.trim() === "" && !(m.steps && m.steps.length > 0)));
      return {
        streamBuffer: "",
        isStreaming: false,
        messages: msgs,
        seenMessageIds: new Set(msgs.map((m) => m.id)),
      };
    }),
}));
