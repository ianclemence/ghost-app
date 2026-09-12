import { create } from "zustand";
import { GhostConfig, Message } from "./ghostApi";

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

  // Live tool activity ("Searching: …", "Running: …" from tool_status events)
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
 * mobile:default when the client never sets a session; we pin it
 * explicitly so history, chat, and voice share one relationship.
 */
export const MAIN_SESSION_ID = "mobile:default";

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
      const msgs = [...s.messages];
      const lastIdx = msgs.length - 1;
      if (
        lastIdx >= 0 &&
        msgs[lastIdx].role === "assistant" &&
        isTempId(msgs[lastIdx].id)
      ) {
        msgs[lastIdx] = {
          ...msgs[lastIdx],
          content: newBuffer,
          status: "streaming",
        };
      }
      return { streamBuffer: newBuffer, messages: msgs };
    }),
  toolActivity: null,
  setToolActivity: (label) => set({ toolActivity: label }),
  commitStream: () =>
    set((s) => {
      const msgs = s.messages
        .map((m) =>
          isTempId(m.id)
            ? {
                ...m,
                id: makeMessageId(),
                status: "completed" as MessageStatus,
              }
            : m,
        )
        .filter((m) => !(m.role === "assistant" && m.content.trim() === ""));
      return {
        streamBuffer: "",
        isStreaming: false,
        messages: msgs,
        seenMessageIds: new Set(msgs.map((m) => m.id)),
      };
    }),
}));
