import { create } from "zustand";
import { GhostConfig, Message } from "./ghostApi";

export type ConnectionState = "online" | "syncing" | "offline";
export type MessageStatus =
  | "sending"
  | "streaming"
  | "completed"
  | "failed"
  | "retrying";

export interface ExtendedMessage extends Message {
  status?: MessageStatus;
  errorKind?: string;
}

interface GhostStore {
  // Config
  config: GhostConfig | null;
  setConfig: (cfg: GhostConfig) => void;

  // Connection (3-state)
  connectionState: ConnectionState;
  setConnectionState: (v: ConnectionState) => void;
  // Legacy compat
  isConnected: boolean;
  setConnected: (v: boolean) => void;

  // Messages
  messages: ExtendedMessage[];
  setMessages: (msgs: ExtendedMessage[]) => void;
  appendMessage: (msg: ExtendedMessage) => void;
  updateLastAssistant: (text: string) => void;
  updateMessageStatus: (id: string, status: MessageStatus) => void;
  removeMessage: (id: string) => void;

  // Streaming state
  isStreaming: boolean;
  streamBuffer: string;
  setStreaming: (v: boolean) => void;
  appendStream: (chunk: string) => void;
  commitStream: () => void;

  // Dedup
  _lastCommitTime: number;
  _lastCommitContent: string;

  // Retry
  lastSentMessage: {
    content: string;
    mediaB64?: string;
    mediaType?: string;
  } | null;
  setLastSentMessage: (msg: GhostStore["lastSentMessage"]) => void;

  // Health
  lastHealthCheck: number;
  setLastHealthCheck: (t: number) => void;

  // Offline queue
  messageQueue: { content: string; mediaB64?: string; mediaType?: string }[];
  enqueueMessage: (msg: {
    content: string;
    mediaB64?: string;
    mediaType?: string;
  }) => void;
  dequeueMessages: () => {
    content: string;
    mediaB64?: string;
    mediaType?: string;
  }[];

  // UI state
  activeTab: "chat" | "remote" | "memory" | "settings";
  setActiveTab: (tab: GhostStore["activeTab"]) => void;

  // Canvas state
  canvasHtml: string | null;
  setCanvasHtml: (html: string | null) => void;
}

let nextTempId = -1;
let nextMessageId = 1;

const isTempId = (id: string) => id.startsWith("temp-");
const makeMessageId = () => `msg-${Date.now()}-${nextMessageId++}`;

export const useGhostStore = create<GhostStore>((set, get) => ({
  config: null,
  setConfig: (cfg) => set({ config: cfg }),

  connectionState: "offline",
  setConnectionState: (v) =>
    set({ connectionState: v, isConnected: v === "online" }),

  isConnected: false,
  setConnected: (v) =>
    set({
      isConnected: v,
      connectionState: v ? "online" : "offline",
    }),

  messages: [],
  setMessages: (msgs) => set({ messages: msgs }),
  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastAssistant: (text) =>
    set((s) => {
      const msgs = [...s.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], content: text };
          break;
        }
      }
      return { messages: msgs };
    }),
  updateMessageStatus: (id, status) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, status } : m)),
    })),
  removeMessage: (id) =>
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== id),
    })),

  isStreaming: false,
  streamBuffer: "",
  setStreaming: (v) => set({ isStreaming: v }),
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
  commitStream: () =>
    set((s) => {
      const content = s.streamBuffer;
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
        _lastCommitTime: Date.now(),
        _lastCommitContent: content,
      };
    }),

  // Dedup fields
  _lastCommitTime: 0,
  _lastCommitContent: "",

  // Retry
  lastSentMessage: null,
  setLastSentMessage: (msg) => set({ lastSentMessage: msg }),

  // Health
  lastHealthCheck: 0,
  setLastHealthCheck: (t) => set({ lastHealthCheck: t }),

  // Offline queue
  messageQueue: [],
  enqueueMessage: (msg) =>
    set((s) => ({ messageQueue: [...s.messageQueue, msg] })),
  dequeueMessages: () => {
    const msgs = get().messageQueue;
    set({ messageQueue: [] });
    return msgs;
  },

  activeTab: "chat",
  setActiveTab: (tab) => set({ activeTab: tab }),

  canvasHtml: null,
  setCanvasHtml: (html) => set({ canvasHtml: html }),
}));

export function createStreamingPlaceholder(): ExtendedMessage {
  return {
    id: `temp-${nextTempId--}`,
    role: "assistant",
    content: "",
    timestamp: Date.now() / 1000,
    status: "streaming",
  };
}
